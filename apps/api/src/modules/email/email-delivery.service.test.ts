import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailDeliveryService } from './email-delivery.service.js';

/**
 * Faza 28 — INT-08 / INT-09. The fake store models `updateMany` as an atomic
 * predicate+write (Postgres row-lock semantics); two service instances sharing
 * one store is the pm2-cluster scenario.
 */
type Row = {
  id: string;
  accountId: string;
  toAddresses: string[];
  subject: string;
  bodyHtml: string;
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
  subject?: string;
  bodyHtml?: string;
  sentAt?: { gte: Date };
};
type Data = Record<string, unknown>;

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'e-1',
    accountId: 'acc-1',
    toAddresses: ['buyer@example.test'],
    subject: 'Hisob-faktura',
    bodyHtml: '<p>salom</p>',
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
      emailLog: {
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
                r.subject === w.subject &&
                r.bodyHtml === w.bodyHtml &&
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

function makeEmail(send?: () => Promise<void>) {
  return { sendQueuedNow: vi.fn(send ?? (async () => undefined)) };
}

describe('EmailDeliveryService — exclusive claim (INT-08)', () => {
  it('claims the row (pending → sending + lease) BEFORE the SMTP call', async () => {
    const prisma = makeStore([row()]);
    let statusAtSend: string | undefined;
    const email = makeEmail(async () => {
      statusAtSend = prisma.store.get('e-1')?.status;
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new EmailDeliveryService(prisma as any, email as any).processDue();

    expect(statusAtSend).toBe('sending');
    expect(prisma.store.get('e-1')?.attemptedAt).toBeInstanceOf(Date);
    expect(prisma.store.get('e-1')?.status).toBe('sent');
  });

  it('two parallel workers on the same row → EXACTLY ONE SMTP call', async () => {
    const prisma = makeStore([row({ id: 'race' })]);
    const a = makeEmail();
    const b = makeEmail();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svcA = new EmailDeliveryService(prisma as any, a as any);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svcB = new EmailDeliveryService(prisma as any, b as any);

    await Promise.all([svcA.processDue(), svcB.processDue()]);

    expect(a.sendQueuedNow.mock.calls.length + b.sendQueuedNow.mock.calls.length).toBe(1);
    expect(prisma.store.get('race')?.status).toBe('sent');
  });

  it('non-leader replica (NODE_APP_INSTANCE=1) does nothing', async () => {
    vi.stubEnv('NODE_APP_INSTANCE', '1');
    const prisma = makeStore([row()]);
    const email = makeEmail();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new EmailDeliveryService(prisma as any, email as any).processDue();

    expect(prisma.client.emailLog.findMany).not.toHaveBeenCalled();
    expect(email.sendQueuedNow).not.toHaveBeenCalled();
  });
});

describe('EmailDeliveryService — lease reaper', () => {
  it('re-queues a `sending` row whose lease expired and bumps attempt', async () => {
    const prisma = makeStore([
      row({
        id: 'stale',
        status: 'sending',
        attempt: 2,
        nextRetryAt: new Date(Date.now() - 60_000),
      }),
    ]);
    const email = makeEmail();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new EmailDeliveryService(prisma as any, email as any).processDue();

    const r = prisma.store.get('stale');
    expect(r?.attempt).toBe(3);
    expect(r?.status).toBe('sent');
  });
});

describe('EmailDeliveryService — re-attempt dedup (INT-09)', () => {
  it('suppresses a re-attempt when identical mail was already delivered', async () => {
    const prisma = makeStore([
      row({ id: 'twin', status: 'sent', sentAt: new Date() }),
      row({ id: 'retry-me', attempt: 2 }),
    ]);
    const email = makeEmail();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new EmailDeliveryService(prisma as any, email as any).processDue();

    expect(email.sendQueuedNow).not.toHaveBeenCalled();
    expect(String(prisma.store.get('retry-me')?.errorMsg)).toContain('dedup');
  });

  it('does NOT dedup a first attempt', async () => {
    const prisma = makeStore([
      row({ id: 'twin', status: 'sent', sentAt: new Date() }),
      row({ id: 'fresh-1', attempt: 1 }),
    ]);
    const email = makeEmail();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new EmailDeliveryService(prisma as any, email as any).processDue();

    expect(email.sendQueuedNow).toHaveBeenCalledTimes(1);
    expect(prisma.client.emailLog.findFirst).not.toHaveBeenCalled();
  });
});
