import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrDeadlineExpireService } from './hr-deadline-expire.service.js';

function makePrisma() {
  return {
    client: {
      hrTaskLog: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  };
}

function makeSend() {
  return { finalize: vi.fn().mockResolvedValue(undefined) };
}

function expiredLog(
  overrides: Partial<{
    id: string;
    accountId: string;
    templateId: string;
    employeeId: string;
    sentAt: Date;
    deadlineMinutes: number | null;
  }> = {},
) {
  // Explicit-key check so callers can pass `null` to override the default 30.
  const deadlineMinutes = 'deadlineMinutes' in overrides ? (overrides.deadlineMinutes ?? null) : 30;
  return {
    id: overrides.id ?? 'log-1',
    accountId: overrides.accountId ?? 'acc1',
    templateId: overrides.templateId ?? 'tpl-1',
    employeeId: overrides.employeeId ?? 'emp-1',
    sentAt: overrides.sentAt ?? new Date(Date.now() - 60 * 60_000), // 60 min ago
    template: { deadlineMinutes },
  };
}

describe('HrDeadlineExpireService.runOnce', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let send: ReturnType<typeof makeSend>;
  let svc: HrDeadlineExpireService;

  beforeEach(() => {
    prisma = makePrisma();
    send = makeSend();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrDeadlineExpireService(prisma as any, send as any);
  });

  it('expires logs whose deadline has passed', async () => {
    prisma.client.hrTaskLog.findMany.mockResolvedValue([expiredLog()]);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 1 });

    const result = await svc.runOnce();

    expect(result.expired).toBe(1);
    expect(prisma.client.hrTaskLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'log-1', status: 'sent' },
      data: expect.objectContaining({
        status: 'answered_no',
        failReason: 'deadline_expired',
      }),
    });
    expect(send.finalize).toHaveBeenCalledWith(
      'acc1',
      'log-1',
      'answered_no',
      'tpl-1',
      'emp-1',
      null,
      'deadline_expire',
    );
  });

  it('skips logs whose deadline has NOT yet passed', async () => {
    prisma.client.hrTaskLog.findMany.mockResolvedValue([
      expiredLog({ sentAt: new Date(Date.now() - 5 * 60_000), deadlineMinutes: 30 }),
    ]);

    const result = await svc.runOnce();

    expect(result.expired).toBe(0);
    expect(prisma.client.hrTaskLog.updateMany).not.toHaveBeenCalled();
    expect(send.finalize).not.toHaveBeenCalled();
  });

  it('skips logs without a deadline (null or 0)', async () => {
    prisma.client.hrTaskLog.findMany.mockResolvedValue([
      expiredLog({ id: 'log-null', deadlineMinutes: null }),
      expiredLog({ id: 'log-zero', deadlineMinutes: 0 }),
    ]);

    const result = await svc.runOnce();

    expect(result.expired).toBe(0);
    expect(prisma.client.hrTaskLog.updateMany).not.toHaveBeenCalled();
  });

  it('atomic race guard: count=0 (already processed) skips finalize', async () => {
    prisma.client.hrTaskLog.findMany.mockResolvedValue([expiredLog()]);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 0 });

    const result = await svc.runOnce();

    expect(result.expired).toBe(0);
    expect(send.finalize).not.toHaveBeenCalled();
  });

  it('processes multiple expired logs in one tick', async () => {
    prisma.client.hrTaskLog.findMany.mockResolvedValue([
      expiredLog({ id: 'log-1' }),
      expiredLog({ id: 'log-2' }),
      expiredLog({ id: 'log-3' }),
    ]);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 1 });

    const result = await svc.runOnce();

    expect(result.expired).toBe(3);
    expect(send.finalize).toHaveBeenCalledTimes(3);
  });

  it('continues past a finalize failure on one log (logs error, processes rest)', async () => {
    prisma.client.hrTaskLog.findMany.mockResolvedValue([
      expiredLog({ id: 'log-bad' }),
      expiredLog({ id: 'log-good' }),
    ]);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 1 });
    send.finalize.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);

    const result = await svc.runOnce();

    // log-bad raised, log-good succeeded → expired = 1
    expect(result.expired).toBe(1);
    expect(send.finalize).toHaveBeenCalledTimes(2);
  });

  it('finalize source is always "deadline_expire" (drives auto_expire_fine + DEADLINE_EXPIRED event)', async () => {
    prisma.client.hrTaskLog.findMany.mockResolvedValue([expiredLog()]);
    prisma.client.hrTaskLog.updateMany.mockResolvedValue({ count: 1 });

    await svc.runOnce();

    expect(send.finalize.mock.calls[0]?.[6]).toBe('deadline_expire');
  });

  // ─── Adversarial QA additions (P3 Phase 2) ───────────────────────────

  it('tick(): in-process overlap guard — second tick during in-flight first skips, no duplicate work', async () => {
    // First tick takes "forever" — never resolve findMany so runOnce hangs.
    let resolveFindMany: (rows: unknown[]) => void = () => {};
    prisma.client.hrTaskLog.findMany.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFindMany = res;
        }),
    );

    const firstTick = svc.tick();
    // Give the first tick a chance to set `running=true`.
    await Promise.resolve();
    // Second tick fires while first is still pending.
    await svc.tick();
    expect(prisma.client.hrTaskLog.findMany).toHaveBeenCalledTimes(1); // second skipped

    // Now let the first tick complete to keep test deterministic.
    resolveFindMany([]);
    await firstTick;
  });

  it('tick(): exception inside runOnce releases the running flag for the next tick', async () => {
    prisma.client.hrTaskLog.findMany.mockRejectedValueOnce(new Error('db down'));
    await svc.tick(); // throws internally, caught
    // Next tick must proceed.
    prisma.client.hrTaskLog.findMany.mockResolvedValueOnce([]);
    await svc.tick();
    expect(prisma.client.hrTaskLog.findMany).toHaveBeenCalledTimes(2);
  });
});
