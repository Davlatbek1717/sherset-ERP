import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookDeliveryService } from './webhook-delivery.service.js';

/**
 * Faza 28 — INT-08 / INT-09.
 *
 * The store below is the point of the file: `updateMany` evaluates its
 * predicate and writes with NO suspension point in between, which is exactly
 * what Postgres gives us under ReadCommitted once the row lock is taken. Two
 * service instances sharing one store = the pm2-cluster / overlapping-deploy
 * scenario that produced duplicate POSTs.
 */
type Row = {
  id: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: Date;
  attemptedAt: Date | null;
  deliveredAt: Date | null;
  httpStatus: number | null;
  errorMsg: string | null;
  payload: unknown;
  webhook: { enabled: boolean; url: string; secretHash: string | null };
};

type Where = {
  id?: string;
  status?: string | { in: string[] };
  nextRetryAt?: { lte: Date };
};
type Data = Record<string, unknown>;

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'd-1',
    status: 'pending',
    attempt: 1,
    maxAttempts: 6,
    nextRetryAt: new Date(Date.now() - 1000),
    attemptedAt: null,
    deliveredAt: null,
    httpStatus: null,
    errorMsg: null,
    payload: { events: [] },
    webhook: { enabled: true, url: 'https://example.test/hook', secretHash: null },
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
      webhookDelivery: {
        findMany: vi.fn(async (args: { take: number }) =>
          [...store.values()]
            .filter((r) => r.status === 'pending' && r.nextRetryAt <= new Date())
            .slice(0, args.take)
            .map((r) => ({ ...r })),
        ),
        updateMany: vi.fn(async (args: { where: Where; data: Data }) => {
          let count = 0;
          for (const r of store.values()) {
            if (args.where.id !== undefined && r.id !== args.where.id) continue;
            const s = args.where.status;
            if (s !== undefined) {
              if (typeof s === 'string' ? r.status !== s : !s.in.includes(r.status)) continue;
            }
            if (args.where.nextRetryAt && r.nextRetryAt > args.where.nextRetryAt.lte) continue;
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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // `vi.stubEnv(name, undefined)` REMOVES the var (a plain assignment would
  // store the string 'undefined').
  vi.stubEnv('NODE_APP_INSTANCE', undefined);
  fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('WebhookDeliveryService — exclusive claim (INT-08)', () => {
  it('claims the row (pending → sending + lease) BEFORE the POST', async () => {
    const prisma = makeStore([row()]);
    let statusAtPost: string | undefined;
    let attemptedAtPost: Date | null | undefined;
    fetchMock.mockImplementation(async () => {
      statusAtPost = prisma.store.get('d-1')?.status;
      attemptedAtPost = prisma.store.get('d-1')?.attemptedAt;
      return new Response('ok', { status: 200 });
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new WebhookDeliveryService(prisma as any);

    await svc.processDue();

    // INT-09: the row is already out of the sendable set and stamped as
    // attempted at the moment the HTTP call goes out.
    expect(statusAtPost).toBe('sending');
    expect(attemptedAtPost).toBeInstanceOf(Date);
    expect(prisma.store.get('d-1')?.status).toBe('sent');
  });

  it('two parallel workers on the same delivery → EXACTLY ONE POST', async () => {
    const prisma = makeStore([row({ id: 'race' })]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const a = new WebhookDeliveryService(prisma as any);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const b = new WebhookDeliveryService(prisma as any);

    await Promise.all([a.processDue(), b.processDue()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prisma.store.get('race')?.status).toBe('sent');
  });

  it('sends an Idempotency-Key header (delivery id) so consumers can dedup', async () => {
    const prisma = makeStore([row({ id: 'idem-1' })]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new WebhookDeliveryService(prisma as any).processDue();

    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers['Idempotency-Key']).toBe('idem-1');
  });

  it('a row parked in `sending` is invisible to the queue query', async () => {
    const prisma = makeStore([
      row({ id: 'inflight', status: 'sending', nextRetryAt: new Date(Date.now() + 300_000) }),
    ]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new WebhookDeliveryService(prisma as any).processDue();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.store.get('inflight')?.status).toBe('sending');
  });

  it('non-leader replica (NODE_APP_INSTANCE=1) does nothing', async () => {
    vi.stubEnv('NODE_APP_INSTANCE', '1');
    const prisma = makeStore([row()]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new WebhookDeliveryService(prisma as any).processDue();

    expect(prisma.client.webhookDelivery.findMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WebhookDeliveryService — lease reaper', () => {
  it('re-queues a `sending` row whose lease expired and bumps attempt', async () => {
    const prisma = makeStore([
      row({
        id: 'stale',
        status: 'sending',
        attempt: 2,
        nextRetryAt: new Date(Date.now() - 60_000),
      }),
    ]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new WebhookDeliveryService(prisma as any).processDue();

    const r = prisma.store.get('stale');
    expect(r?.attempt).toBe(3); // reaped: +1, then re-sent in the same tick
    expect(r?.status).toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
