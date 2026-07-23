import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HR_TZ } from '../hr-shared/tz.util.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 7;

/**
 * Daily ping cleanup. At 04:00 Asia/Tashkent, deletes HrLocationPing rows older
 * than 7 days. Only HrAttendance (keldi/ketdi/late) is permanent — the raw GPS
 * stream is kept just long enough for audit/dispute, then removed (privacy +
 * data-volume, per TZ section 4.5).
 */
@Injectable()
export class HrDavomatPingCleanupCron {
  private readonly logger = new Logger(HrDavomatPingCleanupCron.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *', { timeZone: HR_TZ })
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Ping cleanup skipped: previous run still in flight');
      return;
    }
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error(`Ping cleanup failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Exposed for tests. `now` injectable for determinism. */
  async runOnce(now: Date = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
    const res = await this.prisma.client.hrLocationPing.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (res.count > 0) this.logger.log(`Davomat deleted ${res.count} old ping(s)`);
    return { deleted: res.count };
  }
}
