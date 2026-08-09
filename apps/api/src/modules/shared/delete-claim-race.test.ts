import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CashInService } from '../cash-in/cash-in.service.js';
import { CashOutService } from '../cash-out/cash-out.service.js';
import { CounterpartyAdjustmentService } from '../counterparty-adjustment/counterparty-adjustment.service.js';
import { InvoiceInService } from '../invoice-in/invoice-in.service.js';
import { InvoiceOutService } from '../invoice-out/invoice-out.service.js';
import { LossService } from '../loss/loss.service.js';
import { PaymentInService } from '../payment-in/payment-in.service.js';
import { PaymentOutService } from '../payment-out/payment-out.service.js';
import { WorkOrderService } from '../work-order/work-order.service.js';

/**
 * Faza Q3 — the `delete()` half of the TOCTOU class (Faza 1 / 3 / 5 leftovers).
 *
 * Faza 1 hardened `post()/unpost()/cancel()` for the money family and Faza 5 did
 * the same for Loss, but BOTH left `delete()` / `softDelete()` as
 * read-check-then-write: `findById` (outside any transaction, an already stale
 * snapshot by the time it returns) decides whether the doc is still a draft, and
 * the soft-delete then runs as an UNCONDITIONAL
 * `update({ where: { id, accountId }, data: { deletedAt } })`.
 *
 * A concurrent `post()` therefore slips straight through the window: the doc
 * ends up BOTH posted (stock moved / counterparty balance nudged) AND
 * soft-deleted — an orphaned `StockOperation` / balance delta that no screen
 * lists and no unpost can ever reverse. `counterparty-adjustment.softDelete` is
 * worse still: it reverses the balance based on the SNAPSHOT's `applicable`, so
 * a rival `cancel()` (or a second delete click) reverses the same delta twice.
 *
 * The fix is the shape the seven stock siblings have carried since 2026-06: the
 * state check and the soft-delete are ONE conditional
 * `updateMany({ where: { …, state, applicable, deletedAt: null } })` — the loser
 * of the race sees `count === 0` and is refused.
 *
 * Test-double honesty (same harness as `money-transition-race.test.ts` /
 * `loss/loss-transition-race.test.ts`): `findFirst` yields and returns a
 * DETACHED copy (an unlocked read), while `updateMany` evaluates its WHERE
 * against the LIVE row in a body that never yields (a single atomic statement
 * under the row write lock).
 */

interface DocRow {
  id: string;
  accountId: string;
  state: string;
  applicable: boolean;
  deletedAt: Date | null;
  agentId: string;
  organizationId: string;
  currency: string;
  sumMinor: bigint;
  payedSumMinor: bigint;
  groupId: string | null;
  cashDeskId: string;
  customerOrderId: string | null;
  purchaseOrderId: string | null;
  paymentPurpose: string | null;
  direction: 'INCREASE' | 'DECREASE';
  postedAt: Date | null;
  name: string;
  version: number;
  rateValue: bigint;
  attributes: Record<string, unknown>;
  contractId: string | null;
  projectId: string | null;
  externalCode: string | null;
  description: string | null;
  moment: Date;
  storeId: string;
  reason: string | null;
}

function makeRow(overrides: Partial<DocRow> = {}): DocRow {
  return {
    id: 'doc-1',
    accountId: 'acc-1',
    state: 'draft',
    applicable: false,
    deletedAt: null,
    agentId: 'cp-1',
    organizationId: 'org-1',
    currency: 'UZS',
    sumMinor: 1_000_000n,
    payedSumMinor: 0n,
    groupId: null,
    cashDeskId: 'cd-1',
    customerOrderId: null,
    purchaseOrderId: null,
    paymentPurpose: null,
    direction: 'INCREASE',
    postedAt: null,
    name: '00001',
    version: 1,
    rateValue: 100_000_000n,
    attributes: {},
    contractId: null,
    projectId: null,
    externalCode: null,
    description: null,
    moment: new Date('2026-08-09'),
    storeId: 'store-1',
    reason: null,
    ...overrides,
  };
}

const POSITIONS = [
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

type WhereScalar = unknown;

/** Evaluate a Prisma-ish WHERE clause against the LIVE row. */
function matches(where: Record<string, WhereScalar>, row: Record<string, unknown>): boolean {
  for (const [field, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    const actual = row[field];
    if (cond === null) {
      if (actual !== null && actual !== undefined) return false;
      continue;
    }
    if (typeof cond === 'object' && cond !== null) {
      const c = cond as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
      if (Array.isArray(c.in) && !c.in.includes(actual)) return false;
      if (Array.isArray(c.notIn) && c.notIn.includes(actual)) return false;
      if ('not' in c) {
        if (c.not === null && (actual === null || actual === undefined)) return false;
        if (c.not !== null && actual === c.not) return false;
      }
      continue;
    }
    if (actual !== cond) return false;
  }
  return true;
}

/**
 * Prisma double for ONE document row.
 *
 * `staleSnapshot` models the window this whole phase is about: the unlocked
 * pre-read returns what the row looked like BEFORE a rival's committed write.
 */
function makeClient(modelKey: string, row: DocRow, staleSnapshot: Partial<DocRow> = {}) {
  const snapshot = () => ({
    ...row,
    ...staleSnapshot,
    operations: [] as unknown[],
    positions: POSITIONS.map((p) => ({ ...p })),
  });

  const findFirst = vi.fn(async () => snapshot());
  const updateMany = vi.fn(
    async (args: { where: Record<string, WhereScalar>; data: Record<string, unknown> }) => {
      if (!matches(args.where, row as unknown as Record<string, unknown>)) return { count: 0 };
      Object.assign(row, args.data);
      return { count: 1 };
    },
  );
  const update = vi.fn(async (args: { data: Record<string, unknown> }) => {
    Object.assign(row, args.data);
    return snapshot();
  });

  const delegate = {
    findFirst,
    findUnique: findFirst,
    findUniqueOrThrow: findFirst,
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    update,
    updateMany,
  };

  const client: Record<string, unknown> = {
    [modelKey]: delegate,
    auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
    group: { findFirst: vi.fn(async () => null) },
    lossPosition: { update: vi.fn(async () => ({})) },
    store: { findFirst: vi.fn(async () => ({ id: 'store-1', allowNegativeStock: true })) },
    product: { findMany: vi.fn(async () => [{ id: 'p-1', buyPrice: 50_000n }]) },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  return { client, delegate };
}

function makeDeps() {
  const balance = { applyDelta: vi.fn(async () => undefined) };
  const money = { applyDeltas: vi.fn(async () => undefined) };
  const target = {
    applyPayment: vi.fn(async () => undefined),
    applyInvoice: vi.fn(async () => undefined),
  };
  const stock = {
    lockBalances: vi.fn(async () => new Map([['a-1', { qty: '10', costBalanceMinor: '500000' }]])),
    assertAvailable: vi.fn(),
    applyDeltas: vi.fn(async () => undefined),
  };
  const webhookFire = { fireForEvent: vi.fn() };
  const events = { emit: vi.fn() };
  return { balance, money, target, stock, webhookFire, events };
}

type Deps = ReturnType<typeof makeDeps>;

interface Svc {
  transition(a: string, u: string, id: string, t: string): Promise<unknown>;
  delete(a: string, u: string, id: string): Promise<unknown>;
}

interface Case {
  name: string;
  model: string;
  row?: Partial<DocRow>;
  /** The money/stock side effect that must never fire for a deleted doc. */
  probe: (d: Deps) => { mock: { calls: unknown[] } };
  build(client: Record<string, unknown>, d: Deps): Svc;
}

const CASES: Case[] = [
  {
    name: 'payment-in',
    model: 'paymentIn',
    probe: (d) => d.balance.applyDelta,
    build: (client, d) =>
      new PaymentInService(
        { client } as never,
        d.target as never,
        d.target as never,
        d.money as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
        d.events as never,
      ),
  },
  {
    name: 'payment-out',
    model: 'paymentOut',
    probe: (d) => d.balance.applyDelta,
    build: (client, d) =>
      new PaymentOutService(
        { client } as never,
        d.target as never,
        d.target as never,
        d.money as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'cash-in',
    model: 'cashIn',
    probe: (d) => d.money.applyDeltas,
    build: (client, d) =>
      new CashInService(
        { client } as never,
        d.target as never,
        d.money as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'cash-out',
    model: 'cashOut',
    probe: (d) => d.money.applyDeltas,
    build: (client, d) =>
      new CashOutService(
        { client } as never,
        d.target as never,
        d.money as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'invoice-out',
    model: 'invoiceOut',
    probe: (d) => d.balance.applyDelta,
    build: (client, d) =>
      new InvoiceOutService(
        { client } as never,
        d.target as never,
        d.balance as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'invoice-in',
    model: 'invoiceIn',
    row: { purchaseOrderId: 'po-1' },
    probe: (d) => d.target.applyInvoice,
    build: (client, d) =>
      new InvoiceInService(
        { client } as never,
        d.target as never,
        d.target as never,
        {} as never,
        d.webhookFire as never,
      ),
  },
  {
    name: 'loss',
    model: 'loss',
    probe: (d) => d.stock.applyDeltas,
    build: (client, d) =>
      new LossService({ client } as never, d.stock as never, {} as never, d.webhookFire as never),
  },
];

const rejected = (rs: PromiseSettledResult<unknown>[]) =>
  rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

for (const c of CASES) {
  describe(`${c.name}: delete() claims the draft atomically (Faza Q3)`, () => {
    it('refuses to soft-delete a doc a rival already posted (stale snapshot)', async () => {
      // The unlocked pre-read still says «draft»; the row is already posted.
      const row = makeRow({ ...c.row, state: 'posted', applicable: true, postedAt: new Date() });
      const { client } = makeClient(c.model, row, {
        state: 'draft',
        applicable: false,
        postedAt: null,
      });
      const d = makeDeps();
      const svc = c.build(client, d);

      await expect(svc.delete('acc-1', 'emp-1', 'doc-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(row.deletedAt, 'a POSTED doc must never be soft-deleted').toBeNull();
    });

    it('post() racing delete() never leaves a posted-and-deleted doc', async () => {
      const row = makeRow({ ...c.row, state: 'draft', applicable: false });
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      const results = await Promise.allSettled([
        svc.transition('acc-1', 'emp-1', 'doc-1', 'post'),
        svc.delete('acc-1', 'emp-1', 'doc-1'),
      ]);

      expect(rejected(results), 'exactly one of post/delete may win').toHaveLength(1);
      expect(
        row.deletedAt !== null && row.state === 'posted',
        'orphaned side effect: the doc is posted AND soft-deleted',
      ).toBe(false);
    });

    it('two parallel delete() calls soft-delete the doc exactly once', async () => {
      const row = makeRow({ ...c.row, state: 'draft', applicable: false });
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      const results = await Promise.allSettled([
        svc.delete('acc-1', 'emp-1', 'doc-1'),
        svc.delete('acc-1', 'emp-1', 'doc-1'),
      ]);

      expect(rejected(results)).toHaveLength(1);
      expect(row.deletedAt).not.toBeNull();
    });

    it('a plain draft is still deletable (regression lock)', async () => {
      const row = makeRow({ ...c.row, state: 'draft', applicable: false });
      const { client } = makeClient(c.model, row);
      const d = makeDeps();
      const svc = c.build(client, d);

      await expect(svc.delete('acc-1', 'emp-1', 'doc-1')).resolves.toEqual({ ok: true });
      expect(row.deletedAt).not.toBeNull();
    });
  });
}

/**
 * counterparty-adjustment is the sharp one: `softDelete` is legal on a POSTED
 * doc and reverses the counterparty balance itself, off the snapshot's
 * `applicable`. Without a claim, a rival `cancel()` (which reverses too) or a
 * second delete click reverses the SAME delta twice.
 */
describe('counterparty-adjustment: softDelete claims the row before reversing (Faza Q3)', () => {
  const build = (client: Record<string, unknown>, d: Deps) =>
    new CounterpartyAdjustmentService({ client } as never, d.balance as never);

  it('does not reverse a balance a rival cancel() already reversed (stale snapshot)', async () => {
    // Live row: already cancelled + unapplied. Snapshot: still posted.
    const row = makeRow({ state: 'cancelled', applicable: false });
    const { client } = makeClient('counterpartyAdjustment', row, {
      state: 'posted',
      applicable: true,
    });
    const d = makeDeps();
    const svc = build(client, d);

    await expect(svc.softDelete('acc-1', 'emp-1', 'doc-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(d.balance.applyDelta, 'the reversal already happened once').not.toHaveBeenCalled();
  });

  it('two parallel softDelete() calls reverse the balance exactly once', async () => {
    const row = makeRow({ state: 'posted', applicable: true, postedAt: new Date() });
    const { client } = makeClient('counterpartyAdjustment', row);
    const d = makeDeps();
    const svc = build(client, d);

    const results = await Promise.allSettled([
      svc.softDelete('acc-1', 'emp-1', 'doc-1'),
      svc.softDelete('acc-1', 'emp-1', 'doc-1'),
    ]);

    expect(rejected(results)).toHaveLength(1);
    expect(d.balance.applyDelta).toHaveBeenCalledTimes(1);
  });

  it('cancel() racing softDelete() reverses the balance exactly once', async () => {
    const row = makeRow({ state: 'posted', applicable: true, postedAt: new Date() });
    const { client } = makeClient('counterpartyAdjustment', row);
    const d = makeDeps();
    const svc = build(client, d);

    const results = await Promise.allSettled([
      svc.transition('acc-1', 'emp-1', 'doc-1', 'cancel'),
      svc.softDelete('acc-1', 'emp-1', 'doc-1'),
    ]);

    expect(rejected(results)).toHaveLength(1);
    expect(d.balance.applyDelta).toHaveBeenCalledTimes(1);
  });

  it('a posted adjustment can still be soft-deleted, reversing once (regression lock)', async () => {
    const row = makeRow({ state: 'posted', applicable: true, postedAt: new Date() });
    const { client } = makeClient('counterpartyAdjustment', row);
    const d = makeDeps();
    const svc = build(client, d);

    await expect(svc.softDelete('acc-1', 'emp-1', 'doc-1')).resolves.toEqual({ ok: true });
    expect(d.balance.applyDelta).toHaveBeenCalledTimes(1);
    expect(row.deletedAt).not.toBeNull();
    expect(row.state).toBe('cancelled');
  });
});

/**
 * work-order (ТЗ) — found while auditing Faza Q2's weighted-average cost work.
 * `delete()` only refused `in_progress`, so a COMPLETED order (components
 * consumed, output emitted, value moved between stores) could be soft-deleted
 * with no reversal at all: ghost inventory that no screen can reach to cancel.
 */
describe('work-order: delete() cannot orphan a completed stock cascade (Faza Q3)', () => {
  interface WoRow {
    id: string;
    accountId: string;
    name: string;
    state: string;
    deletedAt: Date | null;
    bomId: string;
    storeId: string;
    ownerId: string | null;
    plannedQty: string;
    producedQty: string;
    moment: Date;
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  const makeWo = (overrides: Partial<WoRow> = {}): WoRow => ({
    id: 'wo-1',
    accountId: 'acc-1',
    name: 'ТЗ-2026-00001',
    state: 'draft',
    deletedAt: null,
    bomId: 'bom-1',
    storeId: 'store-1',
    ownerId: null,
    plannedQty: '10',
    producedQty: '0',
    moment: new Date('2026-08-09'),
    plannedStartAt: null,
    plannedEndAt: null,
    startedAt: null,
    completedAt: null,
    description: null,
    createdAt: new Date('2026-08-09'),
    updatedAt: new Date('2026-08-09'),
    ...overrides,
  });

  function makeWoClient(row: WoRow, staleSnapshot: Partial<WoRow> = {}) {
    const snapshot = () => ({ ...row, ...staleSnapshot, bom: null, store: null, owner: null });
    const client: Record<string, unknown> = {
      workOrder: {
        findFirst: vi.fn(async () => snapshot()),
        findUniqueOrThrow: vi.fn(async () => snapshot()),
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          Object.assign(row, args.data);
          return snapshot();
        }),
        updateMany: vi.fn(
          async (args: { where: Record<string, WhereScalar>; data: Record<string, unknown> }) => {
            if (!matches(args.where, row as unknown as Record<string, unknown>)) {
              return { count: 0 };
            }
            Object.assign(row, args.data);
            return { count: 1 };
          },
        ),
      },
      auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
    };
    client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
    return client;
  }

  const build = (client: Record<string, unknown>, d: Deps) =>
    new WorkOrderService({ client } as never, d.stock as never);

  it('refuses to delete a COMPLETED work order (its cascade would be orphaned)', async () => {
    const row = makeWo({ state: 'completed', producedQty: '10', completedAt: new Date() });
    const d = makeDeps();
    const svc = build(makeWoClient(row), d);

    await expect(svc.delete('acc-1', 'emp-1', 'wo-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(row.deletedAt, 'consumed components + emitted output stay reachable').toBeNull();
  });

  it('refuses to delete a work order a rival already started (stale snapshot)', async () => {
    const row = makeWo({ state: 'in_progress', startedAt: new Date() });
    const d = makeDeps();
    const svc = build(makeWoClient(row, { state: 'draft', startedAt: null }), d);

    await expect(svc.delete('acc-1', 'emp-1', 'wo-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(row.deletedAt).toBeNull();
  });

  it('transition() racing delete() never leaves a started-and-deleted order', async () => {
    const row = makeWo({ state: 'draft' });
    const d = makeDeps();
    const svc = build(makeWoClient(row), d);

    const results = await Promise.allSettled([
      svc.transition('acc-1', 'emp-1', 'wo-1', { state: 'in_progress' }),
      svc.delete('acc-1', 'emp-1', 'wo-1'),
    ]);

    expect(rejected(results)).toHaveLength(1);
    expect(row.deletedAt !== null && row.state === 'in_progress').toBe(false);
  });

  it('draft and cancelled work orders stay deletable (regression lock)', async () => {
    for (const state of ['draft', 'cancelled']) {
      const row = makeWo({ state });
      const d = makeDeps();
      const svc = build(makeWoClient(row), d);

      await expect(svc.delete('acc-1', 'emp-1', 'wo-1')).resolves.toEqual({ ok: true });
      expect(row.deletedAt).not.toBeNull();
    }
  });
});
