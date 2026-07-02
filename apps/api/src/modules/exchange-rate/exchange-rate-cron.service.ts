import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExchangeRateService } from './exchange-rate.service.js';

/**
 * Daily CBRU sync. Runs every morning at 09:00 server time. CBRU
 * publishes the day's rates around 08:00–08:30 Tashkent on weekdays;
 * 09:00 gives a small buffer.
 *
 * Failure is non-fatal — we log and rely on the next tick. Manual
 * `POST /exchange-rates/sync` remains available as escape hatch.
 *
 * Single-server safe: @Cron only fires in one process. The
 * `isRunning` flag prevents tick overlap if the previous fetch is
 * still mid-flight (CBRU sometimes serves slow during morning peak).
 */
@Injectable()
export class ExchangeRateCronService {
  private readonly logger = new Logger(ExchangeRateCronService.name);
  private isRunning = false;

  constructor(@Inject(ExchangeRateService) private readonly exchangeRate: ExchangeRateService) {}

  /** 09:00 every day. Server is expected to run on Tashkent TZ in prod. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async dailySync(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous CBRU sync still running — skipping this tick');
      return;
    }
    this.isRunning = true;
    try {
      const result = await this.exchangeRate.sync();
      this.logger.log(
        `CBRU daily sync OK — ${result.date}: ${result.total} rows (${result.inserted} new, ${result.updated} updated)`,
      );
    } catch (err) {
      this.logger.error(`CBRU daily sync failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
