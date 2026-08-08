import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LossService } from './loss.service.js';

/**
 * Faza 5 — STK-01 concurrency regression for Loss (Списание).
 *
 * `post()` got the atomic state-claim in 2026-07-29, but `unpost()` and
 * `cancel()` never did: both read the state OUTSIDE the `$transaction`
 * (`transition()` → `findById`) and then flipped it with a blind
 * `update({ where: { id, accountId } })`. `cancel()` additionally ran at the
 * DEFAULT isolation level (ReadCommitted) — no `isolationLevel` argument at
 * all — so nothing stopped two concurrent cancels from BOTH seeing `posted`
 * and BOTH calling `applyDeltas(+qty)`: the write-off quantity and
 * `costBalanceMinor` came back TWICE (phantom stock + phantom value, two
 * `loss_cancel` ledger rows).
 *
 * The nastiest variant is cancel racing UNPOST: both reverse the same
 * write-off through different transitions, so a state-literal claim would not
 * even catch it — cancel must claim the EXACT snapshotted state
 * (`existing.state`), the move/enter/inventory rule.
 *
 * These tests drive two genuinely interleaved `transition()` calls against an
 * in-memory Prisma double whose `updateMany` honours the WHERE state filter
 * atomically (its body never yields) — the same harness shape as
 * `shared/money-transition-race.test.ts`.
 *
 * Non-vacuous: against the pre-fix service the two `unpost` and the three
 * `cancel` expectations below report `applyDeltas` called 2× (and 0 rejections).
 */

interface LossRow {
  id: string;
  accountId: string;
  state: string;
  applicable: boolean;
  deletedAt: Date | null;
  storeId: string;
  organizationId: string;
  reason: string | null;
  sumMinor: bigint;
  postedAt: Date | null;
}

interface PosRow {
  id: string;
  position: number;
  assortmentKind: string;
  assortmentId: string;
  productId: string | null;
  cellId: string | null;
  quantity: string;
  costMinor: bigint | null;
  product: { id: string; name: string } | null;
}

function makeRow(overrides: Partial<LossRow> = {}): LossRow {
  return {
    id: 'loss-1',
    accountId: 'acc-1',
    state: 'draft',
    applicable: false,
    deletedAt: null,
    storeId: 'store-1',
    organizationId: 'org-1',
    reason: 'Испорчен',
    sumMinor: 0n,
    postedAt: null,
    ...overrides,
  };
}

const POSITIONS: PosRow[] = [
  {
    id: 'pos-1',
    position: 1,
    assortmentKind: 'product',
    assortmentId: 'a-1',
    productId: 'p-1',
    cellId: null,
    quantity: '3',
    costMinor: 50_000n,
    product: { id: 'p-1', name: 'Tovar' },
  },
];

type WhereState = string | { in?: string[] } | undefined;

/**
 * Prisma double for ONE Loss row. `updateMany` implements the conditional
 * WHERE (id + accountId + state) the atomic claim relies on, and its body is
 * synchronous — exactly the "row write lock" semantics the real claim gets
 * from Postgres.
 */
function makeClient(row: LossRow) {
  // Prisma hands back a DETACHED row; returning `row` itself would let one
  // caller's claim retro-actively mutate the other caller's snapshot and hide
  // the race under test.
  const snapshot = () => ({ ...row, positions: POSITIONS.map((p) => ({ ...p })) });

  const updateMany = vi.fn(
    async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const w = args.where;
      if (w.id !== undefined && w.id !== row.id) return { count: 0 };
      if (w.accountId !== undefined && w.accountId !== row.accountId) return { count: 0 };
      const st = w.state as WhereState;
      if (st !== undefined) {
        const allowed = typeof st === 'string' ? [st] : (st.in ?? []);
        if (!allowed.includes(row.state)) return { count: 0 };
      }
      Object.assign(row, args.data);
      return { count: 1 };
    },
  );

  const client: Record<string, unknown> = {
    loss: {
      findFirst: vi.fn(async () => snapshot()),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        Object.assign(row, args.data);
        return snapshot();
      }),
      updateMany,
    },
    lossPosition: { update: vi.fn(async () => ({})) },
    store: {
      findFirst: vi.fn(async () => ({ id: 'store-1', allowNegativeStock: true })),
    },
    product: { findMany: vi.fn(async () => [{ id: 'p-1', buyPrice: 50_000n }]) },
    auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  return { client, updateMany };
}

function makeStock() {
  return {
    lockBalances: vi.fn(async () => new Map([['a-1', { qty: '10', costBalanceMinor: '500000' }]])),
    assertAvailable: vi.fn(),
    applyDeltas: vi.fn(async () => undefined),
  };
}

function build() {
  const stock = makeStock();
  const webhookFire = { fireForEvent: vi.fn() };
  return { stock, webhookFire };
}

function makeService(client: Record<string, unknown>, deps: ReturnType<typeof build>) {
  return new LossService(
    { client } as never,
    deps.stock as never,
    {} as never,
    deps.webhookFire as never,
  );
}

/** Run transitions truly concurrently. */
const race = (svc: LossService, ...targets: string[]) =>
  Promise.allSettled(targets.map((t) => svc.transition('acc-1', 'emp-1', 'loss-1', t)));

const rejected = (rs: PromiseSettledResult<unknown>[]) =>
  rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

describe('loss transitions move stock exactly once under concurrency (STK-01)', () => {
  it('two parallel cancel() calls on a posted write-off → reversal applied ONCE', async () => {
    const row = makeRow({ state: 'posted', applicable: true, postedAt: new Date() });
    const { client } = makeClient(row);
    const deps = build();
    const svc = makeService(client, deps);

    const results = await race(svc, 'cancel', 'cancel');

    expect(deps.stock.applyDeltas).toHaveBeenCalledTimes(1);
    expect(row.state).toBe('cancelled');
    const losers = rejected(results);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.reason).toBeInstanceOf(ConflictException);
  });

  it('two parallel unpost() calls → reversal applied ONCE', async () => {
    const row = makeRow({ state: 'posted', applicable: true, postedAt: new Date() });
    const { client } = makeClient(row);
    const deps = build();
    const svc = makeService(client, deps);

    const results = await race(svc, 'unpost', 'unpost');

    expect(deps.stock.applyDeltas).toHaveBeenCalledTimes(1);
    expect(row.state).toBe('draft');
    const losers = rejected(results);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.reason).toBeInstanceOf(ConflictException);
  });

  it('cancel racing unpost on the same posted write-off → stock reversed ONCE', async () => {
    // The exact scenario a state-LITERAL claim would miss: the two transitions
    // target different end states, so only claiming the snapshotted state
    // (`existing.state`) serialises them.
    const row = makeRow({ state: 'posted', applicable: true, postedAt: new Date() });
    const { client } = makeClient(row);
    const deps = build();
    const svc = makeService(client, deps);

    const results = await race(svc, 'cancel', 'unpost');

    expect(deps.stock.applyDeltas).toHaveBeenCalledTimes(1);
    expect(rejected(results)).toHaveLength(1);
  });

  it('a cancel losing to an already-committed cancel never re-credits stock', async () => {
    const row = makeRow({ state: 'posted', applicable: true, postedAt: new Date() });
    const { client } = makeClient(row);
    const deps = build();
    const svc = makeService(client, deps);

    await race(svc, 'cancel', 'cancel', 'cancel');

    expect(deps.stock.applyDeltas).toHaveBeenCalledTimes(1);
    expect(row.state).toBe('cancelled');
  });

  it('two parallel post() calls → the write-off is applied ONCE (2026-07-29 claim, regression lock)', async () => {
    const row = makeRow({ state: 'draft', applicable: false });
    const { client } = makeClient(row);
    const deps = build();
    const svc = makeService(client, deps);

    const results = await race(svc, 'post', 'post');

    expect(deps.stock.applyDeltas).toHaveBeenCalledTimes(1);
    expect(row.state).toBe('posted');
    expect(rejected(results)).toHaveLength(1);
  });

  it('cancelling a DRAFT write-off claims draft (not a hardcoded posted) and moves no stock', async () => {
    const row = makeRow({ state: 'draft', applicable: false });
    const { client, updateMany } = makeClient(row);
    const deps = build();
    const svc = makeService(client, deps);

    await svc.transition('acc-1', 'emp-1', 'loss-1', 'cancel');

    expect(row.state).toBe('cancelled');
    expect(deps.stock.applyDeltas).not.toHaveBeenCalled();
    const claim = updateMany.mock.calls.find(
      ([a]) => (a.data as { state?: string }).state === 'cancelled',
    );
    expect(claim, 'cancel must claim through a conditional updateMany').toBeDefined();
    const st = (claim?.[0].where as { state?: WhereState }).state;
    const allowed = typeof st === 'string' ? [st] : (st?.in ?? []);
    expect(allowed).toEqual(['draft']);
  });
});
