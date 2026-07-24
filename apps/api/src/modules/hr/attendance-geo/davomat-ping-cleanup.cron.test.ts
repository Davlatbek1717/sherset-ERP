import { describe, expect, it, vi } from 'vitest';
import { HrDavomatPingCleanupCron } from './davomat-ping-cleanup.cron.js';

describe('HrDavomatPingCleanupCron.runOnce', () => {
  it('deletes pings older than 7 days (cutoff = now - 7d)', async () => {
    const prisma = {
      client: {
        hrLocationPing: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
      },
    };
    const now = new Date('2026-07-27T04:00:00Z');
    const res = await new HrDavomatPingCleanupCron(prisma as never).runOnce(now);

    expect(res.deleted).toBe(5);
    const arg = prisma.client.hrLocationPing.deleteMany.mock.calls[0]?.[0] as {
      where: { createdAt: { lt: Date } };
    };
    expect(arg.where.createdAt.lt.toISOString()).toBe('2026-07-20T04:00:00.000Z'); // 7 days earlier
  });
});
