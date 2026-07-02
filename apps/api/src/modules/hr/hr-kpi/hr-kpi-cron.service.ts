import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HR_TZ } from '../hr-shared/tz.util.js';
import { HrKpiService } from './hr-kpi.service.js';

/**
 * Registers the 23:30 Asia/Tashkent KPI snapshot. Separated from
 * HrKpiService so the service stays cron-free + trivially unit-testable;
 * this thin wrapper only owns the schedule + overlap guard.
 */
@Injectable()
export class HrKpiCron {
  private readonly logger = new Logger(HrKpiCron.name);
  private running = false;

  constructor(@Inject(HrKpiService) private readonly kpi: HrKpiService) {}

  @Cron('30 23 * * *', { timeZone: HR_TZ })
  async nightlySnapshot(): Promise<void> {
    if (this.running) {
      this.logger.warn('KPI snapshot skipped: previous run still in flight');
      return;
    }
    this.running = true;
    try {
      await this.kpi.snapshotAllAccountsToday();
    } catch (e) {
      this.logger.error(`KPI nightly snapshot failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
