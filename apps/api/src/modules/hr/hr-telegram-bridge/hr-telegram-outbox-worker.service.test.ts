import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrTelegramOutboxWorker } from './hr-telegram-outbox-worker.service.js';
import { MtprotoFloodError } from './mtproto-adapter.js';

function makePrisma() {
  return {
    client: {
      hrTelegramOutbox: {
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  };
}

function makeAdapter(
  opts: {
    send?: (o: { accountId: string; toPhone: string; text: string }) => Promise<{
      slot: number;
      messageId: string;
    }>;
  } = {},
) {
  return {
    sendMessage: vi.fn(opts.send ?? (async () => ({ slot: 1, messageId: 'm-1' }))),
  };
}

function pendingRow(
  overrides: Partial<{
    id: string;
    accountId: string;
    toPhone: string;
    messageText: string;
    status: string;
    retryCount: number;
  }> = {},
) {
  return {
    id: overrides.id ?? 'r-1',
    accountId: overrides.accountId ?? 'acc1',
    toPhone: overrides.toPhone ?? '+998901234567',
    messageText: overrides.messageText ?? 'Salom',
    status: overrides.status ?? 'pending',
    retryCount: overrides.retryCount ?? 0,
    nextRetryAt: null,
    sentAt: null,
    failReason: null,
    sourceEventType: null,
    sourceDocId: null,
    telegramMessageId: null,
    sentBySlot: null,
    createdAt: new Date(),
    counterpartyId: null,
    employeeId: null,
  };
}

describe('HrTelegramOutboxWorker.runOnce', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let adapter: ReturnType<typeof makeAdapter>;
  let worker: HrTelegramOutboxWorker;

  beforeEach(() => {
    prisma = makePrisma();
    adapter = makeAdapter();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    worker = new HrTelegramOutboxWorker(prisma as any, adapter as any);
    // default: claim succeeds (updateMany count=1)
    prisma.client.hrTelegramOutbox.updateMany.mockResolvedValue({ count: 1 });
  });

  it('empty queue → no-op (no adapter calls)', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([]);
    const result = await worker.runOnce();
    expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(adapter.sendMessage).not.toHaveBeenCalled();
  });

  it('happy path: pending → sent with messageId + slot persisted', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([pendingRow()]);
    adapter.sendMessage.mockResolvedValue({ slot: 2, messageId: 'tg-msg-99' });

    const result = await worker.runOnce();

    expect(result.sent).toBe(1);
    expect(prisma.client.hrTelegramOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r-1' },
        data: expect.objectContaining({
          status: 'sent',
          telegramMessageId: 'tg-msg-99',
          sentBySlot: 2,
          failReason: null,
        }),
      }),
    );
  });

  it('generic failure on first attempt → status=retry, +30s, retryCount=1', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([pendingRow()]);
    adapter.sendMessage.mockRejectedValue(new Error('connection_reset'));

    const result = await worker.runOnce();

    expect(result).toEqual({ sent: 0, retried: 1, failed: 0 });
    const updateArgs = prisma.client.hrTelegramOutbox.update.mock.calls[0]?.[0] as {
      data: { status: string; retryCount: number; nextRetryAt: Date; failReason: string };
    };
    expect(updateArgs.data.status).toBe('retry');
    expect(updateArgs.data.retryCount).toBe(1);
    expect(updateArgs.data.failReason).toMatch(/connection_reset/);
    expect(updateArgs.data.nextRetryAt).toBeInstanceOf(Date);
    // ~30s from now (allow 5s slack)
    const deltaMs = updateArgs.data.nextRetryAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(25_000);
    expect(deltaMs).toBeLessThan(35_000);
  });

  it('second attempt failure (retryCount=1) → +90s', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([
      pendingRow({ retryCount: 1, status: 'retry' }),
    ]);
    adapter.sendMessage.mockRejectedValue(new Error('timeout'));

    await worker.runOnce();

    const updateArgs = prisma.client.hrTelegramOutbox.update.mock.calls[0]?.[0] as {
      data: { nextRetryAt: Date; retryCount: number };
    };
    expect(updateArgs.data.retryCount).toBe(2);
    const deltaMs = updateArgs.data.nextRetryAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(85_000);
    expect(deltaMs).toBeLessThan(95_000);
  });

  it('third attempt failure (retryCount=2) → +270s', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([
      pendingRow({ retryCount: 2, status: 'retry' }),
    ]);
    adapter.sendMessage.mockRejectedValue(new Error('timeout'));

    await worker.runOnce();

    const updateArgs = prisma.client.hrTelegramOutbox.update.mock.calls[0]?.[0] as {
      data: { nextRetryAt: Date; retryCount: number; status: string };
    };
    expect(updateArgs.data.status).toBe('retry');
    expect(updateArgs.data.retryCount).toBe(3);
    const deltaMs = updateArgs.data.nextRetryAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(265_000);
    expect(deltaMs).toBeLessThan(275_000);
  });

  it('after MAX_RETRY_ATTEMPTS exhausted (retryCount=3) → status=failed, no more retries', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([
      pendingRow({ retryCount: 3, status: 'retry' }),
    ]);
    adapter.sendMessage.mockRejectedValue(new Error('permanently_broken'));

    const result = await worker.runOnce();

    expect(result).toEqual({ sent: 0, retried: 0, failed: 1 });
    const updateArgs = prisma.client.hrTelegramOutbox.update.mock.calls[0]?.[0] as {
      data: { status: string; failReason: string };
    };
    expect(updateArgs.data.status).toBe('failed');
    expect(updateArgs.data.failReason).toMatch(/permanently_broken/);
  });

  it('FLOOD_WAIT → status=retry with retryAfter window (NOT regular backoff)', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([pendingRow()]);
    adapter.sendMessage.mockRejectedValue(new MtprotoFloodError(1, 120));

    const result = await worker.runOnce();

    expect(result).toEqual({ sent: 0, retried: 1, failed: 0 });
    const updateArgs = prisma.client.hrTelegramOutbox.update.mock.calls[0]?.[0] as {
      data: { nextRetryAt: Date };
    };
    const deltaMs = updateArgs.data.nextRetryAt.getTime() - Date.now();
    // ~120s window (FLOOD_WAIT honored over the 30s default first-retry)
    expect(deltaMs).toBeGreaterThan(115_000);
    expect(deltaMs).toBeLessThan(125_000);
  });

  it('FLOOD_WAIT does NOT escalate to failed even when retryCount==MAX', async () => {
    // FLOOD_WAIT is not user-fault — never punish with permanent failure.
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([
      pendingRow({ retryCount: 3, status: 'retry' }),
    ]);
    adapter.sendMessage.mockRejectedValue(new MtprotoFloodError(2, 60));

    const result = await worker.runOnce();

    expect(result).toEqual({ sent: 0, retried: 1, failed: 0 });
    const updateArgs = prisma.client.hrTelegramOutbox.update.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(updateArgs.data.status).toBe('retry');
  });

  it('atomic claim guard: updateMany count=0 → skip row (no adapter call)', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([pendingRow()]);
    prisma.client.hrTelegramOutbox.updateMany.mockResolvedValue({ count: 0 });

    const result = await worker.runOnce();

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(adapter.sendMessage).not.toHaveBeenCalled();
    expect(prisma.client.hrTelegramOutbox.update).not.toHaveBeenCalled();
  });

  it('processes multiple rows in one tick (3 mixed outcomes)', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([
      pendingRow({ id: 'r-ok' }),
      pendingRow({ id: 'r-flood' }),
      pendingRow({ id: 'r-final', retryCount: 3, status: 'retry' }),
    ]);
    adapter.sendMessage
      .mockResolvedValueOnce({ slot: 1, messageId: 'tg-1' })
      .mockRejectedValueOnce(new MtprotoFloodError(2, 30))
      .mockRejectedValueOnce(new Error('boom'));

    const result = await worker.runOnce();

    expect(result).toEqual({ sent: 1, retried: 1, failed: 1 });
    expect(adapter.sendMessage).toHaveBeenCalledTimes(3);
    expect(prisma.client.hrTelegramOutbox.update).toHaveBeenCalledTimes(3);
  });

  it('respects MAX_PER_TICK cap in the findMany query (default 10)', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([]);
    await worker.runOnce();
    expect(prisma.client.hrTelegramOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });
});

describe('HrTelegramOutboxWorker.tick', () => {
  it('in-process overlap guard — second tick during in-flight first is skipped', async () => {
    const prisma = makePrisma();
    const adapter = makeAdapter();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const worker = new HrTelegramOutboxWorker(prisma as any, adapter as any);

    let resolveFindMany: (rows: unknown[]) => void = () => {};
    prisma.client.hrTelegramOutbox.findMany.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFindMany = res;
        }),
    );

    const first = worker.tick();
    await Promise.resolve();
    await worker.tick(); // skipped
    expect(prisma.client.hrTelegramOutbox.findMany).toHaveBeenCalledTimes(1);

    resolveFindMany([]);
    await first;
  });

  it('exception inside runOnce releases the running flag', async () => {
    const prisma = makePrisma();
    const adapter = makeAdapter();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const worker = new HrTelegramOutboxWorker(prisma as any, adapter as any);

    prisma.client.hrTelegramOutbox.findMany.mockRejectedValueOnce(new Error('db down'));
    await worker.tick();
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValueOnce([]);
    await worker.tick();
    expect(prisma.client.hrTelegramOutbox.findMany).toHaveBeenCalledTimes(2);
  });
});
