import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmsDeliveryService } from './sms-delivery.service.js';

/**
 * Faza 28 — INT-08 / INT-09. See `webhook-delivery.service.test.ts` for why the
 * fake store models `updateMany` as an atomic predicate+write: that is the
 * Postgres row-lock behaviour the exclusive claim relies on.
 */
type Row = {
  id: string;
  accountId: string;
  toPhone: string;
  body: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  attemptedAt: Date | null;
  sentAt: Date | null;
  errorMsg: string | null;
};

type Where = {
  id?: string | { not: string };
  status?: string | { in: string[] };
  nextRetryAt?: { lte: Date };
  toPhone?: string;
  body?: string;
  sentAt?: { gte: Date };
};
type Data = Record<string, unknown>;

function row(over: Partial<Row> = {}): Row {
  return {
    id: 's-1',
    accountId: 'acc-1',
    toPhone: '+998901234567',
    body: 'Buyurtma tayyor',
    status: 'pending',
    attempt: 1,
    maxAttempts: 4,
    nextRetryAt: new Date(Date.now() - 1000),
    attemptedAt: null,
    sentAt: null,
    errorMsg: null,
    ...over,
  };
}

function applyData(target: Row, data: Data): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as Record<string, unknown>)) {
      const cur = (target as unknown as Record<string, number>)[k] ?? 0;
      (target as unknown as Record<string, number>)[k] =
        cur + Number((v as { increment: number }).increment);
    } else {
      (target as unknown as Record<string, unknown>)[k] = v;
    }
  }
}

function makeStore(rows: Row[]) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  return {
    store,
    client: {
      smsLog: {
        findMany: vi.fn(async (args: { take: number }) =>
          [...store.values()]
            .filter(
              (r) =>
                r.status === 'pending' && r.nextRetryAt !== null && r.nextRetryAt <= new Date(),
            )
            .slice(0, args.take)
            .map((r) => ({ ...r })),
        ),
        findFirst: vi.fn(async (args: { where: Where }) => {
          const w = args.where;
          const notId = typeof w.id === 'object' ? w.id.not : undefined;
          return (
            [...store.values()].find(
              (r) =>
                r.id !== notId &&
                r.status === w.status &&
                r.toPhone === w.toPhone &&
                r.body === w.body &&
                r.sentAt !== null &&
                (!w.sentAt || r.sentAt >= w.sentAt.gte),
            ) ?? null
          );
        }),
        updateMany: vi.fn(async (args: { where: Where; data: Data }) => {
          let count = 0;
          for (const r of store.values()) {
            if (typeof args.where.id === 'string' && r.id !== args.where.id) continue;
            const s = args.where.status;
            if (s !== undefined) {
              if (typeof s === 'string' ? r.status !== s : !s.in.includes(r.status)) continue;
            }
            if (args.where.nextRetryAt) {
              if (r.nextRetryAt === null || r.nextRetryAt > args.where.nextRetryAt.lte) continue;
            }
            applyData(r, args.data);
            count++;
          }
          return { count };
        }),
        update: vi.fn(async (args: { where: { id: string }; data: Data }) => {
          const r = store.get(args.where.id);
          if (r) applyData(r, args.data);
          return r;
        }),
      },
    },
  };
}

beforeEach(() => {
  // `vi.stubEnv(name, undefined)` REMOVES the var (a plain assignment would
  // store the string 'undefined').
  vi.stubEnv('NODE_APP_INSTANCE', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeSms(send?: () => Promise<{ providerMessageId: string }>) {
  return { sendQueuedNow: vi.fn(send ?? (async () => ({ providerMessageId: 'p-1' }))) };
}

describe('SmsDeliveryService — exclusive claim (INT-08)', () => {
  it('claims the row (pending → sending + lease) BEFORE calling the provider', async () => {
    const prisma = makeStore([row()]);
    let statusAtSend: string | undefined;
    const sms = makeSms(async () => {
      statusAtSend = prisma.store.get('s-1')?.status;
      return { providerMessageId: 'p-1' };
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new SmsDeliveryService(prisma as any, sms as any);

    await svc.processDue();

    expect(statusAtSend).toBe('sending');
    expect(prisma.store.get('s-1')?.attemptedAt).toBeInstanceOf(Date);
    expect(prisma.store.get('s-1')?.status).toBe('sent');
  });

  it('two parallel workers on the same row → EXACTLY ONE provider call', async () => {
    const prisma = makeStore([row({ id: 'race' })]);
    const smsA = makeSms();
    const smsB = makeSms();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const a = new SmsDeliveryService(prisma as any, smsA as any);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const b = new SmsDeliveryService(prisma as any, smsB as any);

    await Promise.all([a.processDue(), b.processDue()]);

    expect(smsA.sendQueuedNow.mock.calls.length + smsB.sendQueuedNow.mock.calls.length).toBe(1);
    expect(prisma.store.get('race')?.status).toBe('sent');
  });

  it('non-leader replica (NODE_APP_INSTANCE=1) does nothing', async () => {
    vi.stubEnv('NODE_APP_INSTANCE', '1');
    const prisma = makeStore([row()]);
    const sms = makeSms();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new SmsDeliveryService(prisma as any, sms as any).processDue();

    expect(prisma.client.smsLog.findMany).not.toHaveBeenCalled();
    expect(sms.sendQueuedNow).not.toHaveBeenCalled();
  });
});

describe('SmsDeliveryService — lease reaper', () => {
  it('re-queues a `sending` row whose lease expired and bumps attempt', async () => {
    const prisma = makeStore([
      row({
        id: 'stale',
        status: 'sending',
        attempt: 2,
        nextRetryAt: new Date(Date.now() - 60_000),
      }),
    ]);
    const sms = makeSms();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new SmsDeliveryService(prisma as any, sms as any).processDue();

    const r = prisma.store.get('stale');
    expect(r?.attempt).toBe(3);
    expect(r?.status).toBe('sent');
  });

  it('leaves a `sending` row alone while its lease is still valid', async () => {
    const prisma = makeStore([
      row({ id: 'fresh', status: 'sending', nextRetryAt: new Date(Date.now() + 300_000) }),
    ]);
    const sms = makeSms();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new SmsDeliveryService(prisma as any, sms as any).processDue();

    expect(prisma.store.get('fresh')?.status).toBe('sending');
    expect(sms.sendQueuedNow).not.toHaveBeenCalled();
  });
});

describe('SmsDeliveryService — re-attempt dedup (INT-09)', () => {
  it('suppresses a re-attempt when the same SMS already reached the handset', async () => {
    const prisma = makeStore([
      row({ id: 'twin', status: 'sent', sentAt: new Date(), attempt: 1 }),
      row({ id: 'retry-me', attempt: 2 }),
    ]);
    const sms = makeSms();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new SmsDeliveryService(prisma as any, sms as any).processDue();

    expect(sms.sendQueuedNow).not.toHaveBeenCalled();
    const r = prisma.store.get('retry-me');
    expect(r?.status).toBe('sent');
    expect(String(r?.errorMsg)).toContain('dedup');
  });

  it('does NOT dedup a first attempt (two deliberately identical messages)', async () => {
    const prisma = makeStore([
      row({ id: 'twin', status: 'sent', sentAt: new Date() }),
      row({ id: 'fresh-1', attempt: 1 }),
    ]);
    const sms = makeSms();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new SmsDeliveryService(prisma as any, sms as any).processDue();

    expect(sms.sendQueuedNow).toHaveBeenCalledTimes(1);
    expect(prisma.client.smsLog.findFirst).not.toHaveBeenCalled();
  });
});
