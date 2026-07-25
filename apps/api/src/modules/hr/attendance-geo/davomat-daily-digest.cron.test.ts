import { describe, expect, it, vi } from 'vitest';
import { HrDavomatDailyDigestCron } from './davomat-daily-digest.cron.js';

function makeNotify() {
  return { sendDailyDigest: vi.fn().mockResolvedValue(undefined) };
}

describe('HrDavomatDailyDigestCron.tick', () => {
  it('delegates to AttendanceNotifyService.sendDailyDigest', async () => {
    const notify = makeNotify();
    await new HrDavomatDailyDigestCron(notify as never).tick();
    expect(notify.sendDailyDigest).toHaveBeenCalledTimes(1);
  });

  it('in-process overlap guard — second tick during in-flight first is skipped', async () => {
    const notify = makeNotify();
    let resolveDigest: () => void = () => {};
    notify.sendDailyDigest.mockImplementationOnce(
      () =>
        new Promise<void>((res) => {
          resolveDigest = res;
        }),
    );
    const cron = new HrDavomatDailyDigestCron(notify as never);

    const first = cron.tick();
    await Promise.resolve();
    await cron.tick(); // skipped
    expect(notify.sendDailyDigest).toHaveBeenCalledTimes(1);

    resolveDigest();
    await first;
  });

  it('exception inside sendDailyDigest releases the running flag', async () => {
    const notify = makeNotify();
    notify.sendDailyDigest.mockRejectedValueOnce(new Error('outbox down'));
    const cron = new HrDavomatDailyDigestCron(notify as never);

    await cron.tick();
    notify.sendDailyDigest.mockResolvedValueOnce(undefined);
    await cron.tick();
    expect(notify.sendDailyDigest).toHaveBeenCalledTimes(2);
  });
});
