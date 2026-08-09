import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrTelegramOutboxWorker } from './hr-telegram-outbox-worker.service.js';
import { MtprotoFloodError } from './mtproto-adapter.js';

function makePrisma() {
  return {
    client: {
      hrTelegramOutbox: {
        findMany: vi.fn(),
        // Defaults: no already-delivered twin, and the lease reaper (the first
        // updateMany of every tick) finds nothing to re-queue.
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
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
    toSelf: false,
    viaSlot: null,
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
    // default: no already-delivered twin (dedup lookup misses)
    prisma.client.hrTelegramOutbox.findFirst.mockResolvedValue(null);
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

  it('self-send row passes toSelf + viaSlot (and null toPhone → empty) to the adapter', async () => {
    // A director self-send row: toSelf=true, viaSlot set, toPhone null.
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([
      { ...pendingRow(), toPhone: null, toSelf: true, viaSlot: 3, messageText: '✅ Keldi' },
    ]);
    adapter.sendMessage.mockResolvedValue({ slot: 3, messageId: 'tg-self' });

    await worker.runOnce();

    expect(adapter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ toSelf: true, viaSlot: 3, toPhone: '', text: '✅ Keldi' }),
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

// ---------------------------------------------------------------------------
// Faza 28 — INT-08 / HR-4 / INT-09: exclusive claim, lease reaper, dedup
// ---------------------------------------------------------------------------

type Row = Omit<ReturnType<typeof pendingRow>, 'nextRetryAt' | 'sentAt'> & {
  nextRetryAt: Date | null;
  sentAt: Date | null;
  attachmentPath?: string | null;
};
type Where = {
  id?: string | { not: string };
  status?: string | { in: string[] };
  nextRetryAt?: { lte: Date } | Date | null;
};
type Data = Record<string, unknown>;

function applyData(row: Row, data: Data): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as Record<string, unknown>)) {
      const cur = (row as unknown as Record<string, number>)[k] ?? 0;
      (row as unknown as Record<string, number>)[k] =
        cur + Number((v as { increment: number }).increment);
    } else {
      (row as unknown as Record<string, unknown>)[k] = v;
    }
  }
}

function statusMatches(row: Row, s: Where['status']): boolean {
  if (s === undefined) return true;
  return typeof s === 'string' ? row.status === s : s.in.includes(row.status);
}

/**
 * In-memory stand-in for the `hr_telegram_outbox` table with the ONE property
 * the fix depends on: `updateMany` evaluates its predicate and writes with no
 * suspension point in between — i.e. Postgres row-lock semantics under
 * ReadCommitted. Two workers sharing this store is our cluster simulation.
 */
function makeSharedTable(rows: Row[]) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  return {
    store,
    client: {
      hrTelegramOutbox: {
        findMany: vi.fn(async (args: { take: number }) =>
          [...store.values()]
            .filter((r) => r.status === 'pending' || r.status === 'retry')
            .slice(0, args.take)
            .map((r) => ({ ...r })),
        ),
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(async (args: { where: Where; data: Data }) => {
          let count = 0;
          for (const row of store.values()) {
            const idWhere = args.where.id;
            if (typeof idWhere === 'string' && row.id !== idWhere) continue;
            if (!statusMatches(row, args.where.status)) continue;
            const nra = args.where.nextRetryAt;
            if (nra && typeof nra === 'object' && 'lte' in nra) {
              if (!row.nextRetryAt || row.nextRetryAt > nra.lte) continue;
            }
            applyData(row, args.data);
            count++;
          }
          return { count };
        }),
        update: vi.fn(async (args: { where: { id: string }; data: Data }) => {
          const row = store.get(args.where.id);
          if (row) applyData(row, args.data);
          return row;
        }),
      },
    },
  };
}

describe('HrTelegramOutboxWorker — exclusive claim (INT-08 / HR-4)', () => {
  it('claim moves the row OUT of the sendable set (pending → sending + lease)', async () => {
    const prisma = makePrisma();
    const adapter = makeAdapter();
    prisma.client.hrTelegramOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.hrTelegramOutbox.findFirst.mockResolvedValue(null);
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([pendingRow()]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const worker = new HrTelegramOutboxWorker(prisma as any, adapter as any);

    await worker.runOnce();

    // call 0 = lease reaper, call 1 = the claim
    const claimArgs = prisma.client.hrTelegramOutbox.updateMany.mock.calls[1]?.[0] as {
      where: { id: string; status: { in: string[] } };
      data: { status: string; nextRetryAt: Date };
    };
    expect(claimArgs.where).toEqual({ id: 'r-1', status: { in: ['pending', 'retry'] } });
    // The old guard wrote `pending → pending`, which locked nothing.
    expect(claimArgs.data.status).toBe('sending');
    expect(claimArgs.data.nextRetryAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  it('two parallel workers on the same row → EXACTLY ONE send', async () => {
    const shared = makeSharedTable([pendingRow({ id: 'race-1' })]);
    const adapterA = makeAdapter();
    const adapterB = makeAdapter();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const a = new HrTelegramOutboxWorker(shared as any, adapterA as any);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const b = new HrTelegramOutboxWorker(shared as any, adapterB as any);

    const [ra, rb] = await Promise.all([a.runOnce(), b.runOnce()]);

    const sends = adapterA.sendMessage.mock.calls.length + adapterB.sendMessage.mock.calls.length;
    expect(sends).toBe(1);
    expect(ra.sent + rb.sent).toBe(1);
    expect(shared.store.get('race-1')?.status).toBe('sent');
  });

  it('a row parked in `sending` is invisible to the queue query', async () => {
    const shared = makeSharedTable([pendingRow({ id: 'inflight', status: 'sending' })]);
    const adapter = makeAdapter();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const worker = new HrTelegramOutboxWorker(shared as any, adapter as any);

    const result = await worker.runOnce();

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(adapter.sendMessage).not.toHaveBeenCalled();
  });
});

describe('HrTelegramOutboxWorker — lease reaper', () => {
  it('re-queues a `sending` row whose lease expired, bumping retryCount', async () => {
    const stale: Row = {
      ...pendingRow({ id: 'stale', status: 'sending' }),
      nextRetryAt: new Date(Date.now() - 60_000), // lease already gone
    };
    const shared = makeSharedTable([stale]);
    const adapter = makeAdapter();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const worker = new HrTelegramOutboxWorker(shared as any, adapter as any);

    await worker.runOnce();

    const row = shared.store.get('stale');
    // Reaped → retry (retryCount 0→1), then claimed + sent in the same tick.
    expect(row?.retryCount).toBe(1);
    expect(row?.status).toBe('sent');
    expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('leaves a `sending` row alone while its lease is still valid', async () => {
    const fresh: Row = {
      ...pendingRow({ id: 'fresh', status: 'sending' }),
      nextRetryAt: new Date(Date.now() + 5 * 60_000),
    };
    const shared = makeSharedTable([fresh]);
    const adapter = makeAdapter();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const worker = new HrTelegramOutboxWorker(shared as any, adapter as any);

    await worker.runOnce();

    expect(shared.store.get('fresh')?.status).toBe('sending');
    expect(adapter.sendMessage).not.toHaveBeenCalled();
  });
});

describe('HrTelegramOutboxWorker — re-attempt dedup (INT-09)', () => {
  it('skips the send when an identical message was already delivered', async () => {
    const prisma = makePrisma();
    const adapter = makeAdapter();
    prisma.client.hrTelegramOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([
      pendingRow({ retryCount: 1, status: 'retry' }),
    ]);
    const twinSentAt = new Date('2026-08-09T09:00:00.000Z');
    prisma.client.hrTelegramOutbox.findFirst.mockResolvedValue({ sentAt: twinSentAt });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const worker = new HrTelegramOutboxWorker(prisma as any, adapter as any);

    const result = await worker.runOnce();

    expect(adapter.sendMessage).not.toHaveBeenCalled();
    expect(result.sent).toBe(1);
    const args = prisma.client.hrTelegramOutbox.update.mock.calls[0]?.[0] as {
      data: { status: string; failReason: string };
    };
    expect(args.data.status).toBe('sent');
    expect(args.data.failReason).toContain('dedup');
  });

  it('does NOT dedup a first attempt (two intentional identical messages)', async () => {
    const prisma = makePrisma();
    const adapter = makeAdapter();
    prisma.client.hrTelegramOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([pendingRow({ retryCount: 0 })]);
    prisma.client.hrTelegramOutbox.findFirst.mockResolvedValue({ sentAt: new Date() });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const worker = new HrTelegramOutboxWorker(prisma as any, adapter as any);

    await worker.runOnce();

    expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
    expect(prisma.client.hrTelegramOutbox.findFirst).not.toHaveBeenCalled();
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
