import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HR_TZ } from '../hr-shared/tz.util.js';
import { AttendanceNotifyService } from './attendance-notify.service.js';

/**
 * At 10:00 Asia/Tashkent, sends one consolidated davomat digest (who
 * arrived + when/late-minutes, who hasn't yet) to the account's own
 * Telegram Saved Messages. Replaces the earlier per-event (instant
 * KELDI/KETDI) alerts per explicit request (2026-07-25).
 */
@Injectable()
export class HrDavomatDailyDigestCron {
  private readonly logger = new Logger(HrDavomatDailyDigestCron.name);
  private running = false;

  constructor(@Inject(AttendanceNotifyService) private readonly notify: AttendanceNotifyService) {}

  @Cron('0 10 * * *', { timeZone: HR_TZ })
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Daily digest skipped: previous run still in flight');
      return;
    }
    this.running = true;
    try {
      await this.notify.sendDailyDigest();
    } catch (e) {
      this.logger.error(`Daily digest failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
