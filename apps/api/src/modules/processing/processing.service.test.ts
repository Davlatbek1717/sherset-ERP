import { Prisma } from '@moysklad/db';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { StockService } from '../stock/stock.service.js';
import { ProcessingService } from './processing.service.js';

/**
 * Adversarial test coverage:
 *
 *   1. SIGN — does post() emit deltas with correct signs (consume negative,
 *      produce positive)?
 *   2. MATH — does the BOM-component multiplier scale correctly when
 *      processingQty ≠ BOM.outputQty (i.e. recipe runs > 1)?
 *   3. SUFFICIENCY — does post() reject when any material has less stock
 *      than required?
 *   4. STATE GUARDS — concurrent post attempts, posted-edit, posted-delete
 *      all rejected appropriately.
 *   5. REVERSAL — unpost/cancel emit exact opposite-sign deltas using
 *      persisted costSumMinor.
 *   6. NO BOM — post fails fast when processingPlanId is missing.
 *   7. ZERO OUTPUT — guard against BOM.outputQty=0 division-by-zero.
 */

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/**
 * Stock test double. By default returns an empty Map for lockBalances,
 * which means no cost basis exists for any material (zero-cost cascade).
 * Pass `balances` to seed (productId → { qty, costBalanceMinor }) for
 * cost-cascade testing.
 */
function makeStock(balances?: Record<string, { qty: string; costBalanceMinor: string }>): {
  service: StockService;
  spies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const lockBalances = vi.fn(async () => {
    if (!balances) return new Map();
    const map = new Map<string, unknown>();
    for (const [productId, b] of Object.entries(balances)) {
      map.set(productId, {
        storeId: 'store-x',
        assortmentKind: 'product',
        assortmentId: productId,
        qty: b.qty,
        reservedQty: '0',
        costBalanceMinor: b.costBalanceMinor,
      });
    }
    return map;
  });
  const spies = {
    lockBalances,
    assertAvailable: vi.fn(),
    applyDeltas: vi.fn(async () => undefined),
  };
  const service = spies as unknown as StockService;
  return { service, spies };
}

interface ProcessingRow {
  id: string;
  accountId: string;
  name: string;
  organizationId: string;
  materialsStoreId: string;
  productsStoreId: string;
  processingPlanId: string | null;
  processingOrderId: string | null;
  moment: Date;
  state: string;
  applicable: boolean;
  postedAt: Date | null;
  quantity: bigint;
  costSumMinor: bigint;
  materialsSnapshot: {
    outputProductId: string;
    outputQty: string;
    outputs?: Array<{ productId: string; qty: string; costMinor: string }>;
    items: Array<{ productId: string; qty: string; costMinor: string }>;
  } | null;
  description: string | null;
  externalCode: string | null;
  deletedAt: Date | null;
  // Joined fields (only on findById):
  processingPlan?: {
    id: string;
    productId: string;
    outputQty: Prisma.Decimal;
    standardCostMinor: bigint;
    components: Array<{
      productId: string;
      qty: Prisma.Decimal;
      position: number;
      product?: { id: string; name: string };
    }>;
  };
  // §88 — explicit per-op materials (findById join). When present,
  // post() consumes THESE (absolute qty) instead of BOM-explode.
  materials?: Array<{
    productId: string;
    qty: Prisma.Decimal;
    position: number;
    product?: { id: string; name: string };
  }>;
  // §89 — explicit per-op outputs. When present, post() produces
  // THESE (multi/by-product) instead of the single BOM product.
  products?: Array<{
    productId: string;
    qty: Prisma.Decimal;
    position: number;
    product?: { id: string; name: string };
  }>;
}

function decimal(s: string): Prisma.Decimal {
  return new Prisma.Decimal(s);
}

function makeRow(overrides: Partial<ProcessingRow> = {}): ProcessingRow {
  return {
    id: 'p-1',
    accountId: 'acc-1',
    name: 'TP-2026-00001',
    organizationId: '00000000-0000-0000-0000-000000000010',
    materialsStoreId: '00000000-0000-0000-0000-000000000020',
    productsStoreId: '00000000-0000-0000-0000-000000000021',
    processingPlanId: '00000000-0000-0000-0000-000000000050',
    processingOrderId: null,
    moment: new Date('2026-05-12'),
    state: 'draft',
    applicable: false,
    postedAt: null,
    quantity: 10_000n, // 10 units
    costSumMinor: 0n,
    materialsSnapshot: null,
    description: null,
    externalCode: null,
    deletedAt: null,
    processingPlan: {
      id: '00000000-0000-0000-0000-000000000050',
      productId: '00000000-0000-0000-0000-000000000099',
      outputQty: decimal('1'),
      standardCostMinor: 500_000n, // 5 000 minor per output unit
      components: [
        {
          productId: '00000000-0000-0000-0000-000000000100',
          qty: decimal('2'),
          position: 1,
          product: { id: '00000000-0000-0000-0000-000000000100', name: 'Material A' },
        },
        {
          productId: '00000000-0000-0000-0000-000000000101',
          qty: decimal('0.5'),
          position: 2,
          product: { id: '00000000-0000-0000-0000-000000000101', name: 'Material B' },
        },
      ],
    },
    ...overrides,
  };
}

function makePrismaMock(rows: ProcessingRow[]) {
  // Track which "fresh" reads should return what — defaults to whatever the row currently is.
  const findFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where ?? {};
    return (
      rows.find((r) => {
        if (w.id && r.id !== w.id) return false;
        if (w.deletedAt === null && r.deletedAt !== null) return false;
        return true;
      }) ?? null
    );
  });
  const update = vi.fn(async (args: { where: { id: string }; data: Partial<ProcessingRow> }) => {
    const row = rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, args.data);
    return row;
  });
  const create = vi.fn(async (args: { data: Partial<ProcessingRow> }) => {
    const row = makeRow(args.data);
    rows.push(row);
    return row;
  });
  const count = vi.fn(async () => rows.length);
  const findMany = vi.fn(async () => rows);
  // Atomic state-claim (TOCTOU guard): conditional updateMany matching the
  // row's current state/applicable/deletedAt, mutating + returning {count}.
  const updateMany = vi.fn(
    async (args: { where: Record<string, unknown>; data: Partial<ProcessingRow> }) => {
      const w = args.where ?? {};
      const matched = rows.filter((r) => {
        if (w.id && r.id !== w.id) return false;
        if (w.state !== undefined && r.state !== w.state) return false;
        if (w.applicable !== undefined && r.applicable !== w.applicable) return false;
        if (w.deletedAt === null && r.deletedAt !== null) return false;
        return true;
      });
      for (const r of matched) Object.assign(r, args.data);
      return { count: matched.length };
    },
  );
  const findFirstOrThrow = vi.fn(async (args: { where: { id: string } }) => {
    const row = rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    return row;
  });

  const processing = {
    findFirst,
    findUnique: findFirst,
    update,
    updateMany,
    create,
    count,
    findMany,
    findFirstOrThrow,
  };

  // BOM lookup uses the processingPlan field from the row by default
  const bomFindFirst = vi.fn(async (args: { where: { id: string } }) => {
    for (const r of rows) {
      if (r.processingPlan?.id === args.where.id) return r.processingPlan;
    }
    return null;
  });
  const billOfMaterials = { findFirst: bomFindFirst };

  const organization = { findFirst: vi.fn(async () => ({ id: 'org', name: 'Demo' })) };
  const store = { findFirst: vi.fn(async () => ({ id: 'store', name: 'Demo' })) };
  const auditLog = { create: vi.fn(async () => ({ id: 'audit-1' })) };

  // ProcessingOrder.updateMany for fulfilment counter bump/decrement.
  // §2c — post() also reads processingOrder.findFirst to resolve the
  // parent Production for release-on-consume; these fixtures model a
  // linked PO with NO parent Production ⇒ release-on-consume is inert
  // (the existing cost/movedSumMinor assertions are unaffected).
  const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
  const processingOrder = {
    updateMany: orderUpdateMany,
    findFirst: vi.fn(async () => ({ productionId: null })),
  };
  // §2c — Production reservation ledger; empty ⇒ nothing to release.
  const stockReservation = {
    findMany: vi.fn(async () => [] as unknown[]),
    createMany: vi.fn(async () => ({ count: 0 })),
  };

  const $transaction = vi.fn(
    async (
      fn: (tx: {
        processing: typeof processing;
        billOfMaterials: typeof billOfMaterials;
        organization: typeof organization;
        store: typeof store;
        auditLog: typeof auditLog;
        processingOrder: typeof processingOrder;
        stockReservation: typeof stockReservation;
      }) => Promise<unknown>,
    ) => {
      // Simulate tx rollback: snapshot row scalars, restore on throw so the
      // early atomic state-claim (now the first op) is undone like a real tx.
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        return await fn({
          processing,
          billOfMaterials,
          organization,
          store,
          auditLog,
          processingOrder,
          stockReservation,
        });
      } catch (e) {
        rows.forEach((r, i) => {
          const s = snapshot[i];
          if (s) Object.assign(r, s);
        });
        throw e;
      }
    },
  );

  return {
    client: {
      processing,
      billOfMaterials,
      organization,
      store,
      auditLog,
      processingOrder,
      stockReservation,
      $transaction,
    },
    spies: { findFirst, update, create, bomFindFirst, orderUpdateMany, $transaction },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessingService — post (stock cascade)', () => {
  it('rejects when state is not draft (idempotency guard)', async () => {
    const rows = [makeRow({ state: 'posted', applicable: true })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
    expect(stock.spies.applyDeltas).not.toHaveBeenCalled();
  });

  it('rejects when processingPlanId is null', async () => {
    const rows = [
      makeRow({
        processingPlanId: null,
        processingPlan: undefined,
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
    expect(stock.spies.applyDeltas).not.toHaveBeenCalled();
  });

  it('rejects when BOM has no components', async () => {
    const rows = [
      makeRow({
        processingPlan: {
          id: '00000000-0000-0000-0000-000000000050',
          productId: '00000000-0000-0000-0000-000000000099',
          outputQty: decimal('1'),
          standardCostMinor: 0n,
          components: [],
        },
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects when BOM.outputQty is zero (division-by-zero guard)', async () => {
    const rows = [
      makeRow({
        processingPlan: {
          id: '00000000-0000-0000-0000-000000000050',
          productId: '00000000-0000-0000-0000-000000000099',
          outputQty: decimal('0'),
          standardCostMinor: 0n,
          components: [
            {
              productId: '00000000-0000-0000-0000-000000000100',
              qty: decimal('1'),
              position: 1,
            },
          ],
        },
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('emits correct deltas: materials consumed at weighted-avg cost, output gets aggregated cost', async () => {
    // 10 units of output, BOM yields 1 per run → 10 recipe runs.
    //   Material A: 2 × 10 = 20 units; stock has 100 units @ 1_000_000 cost
    //     → per-unit cost = 10_000; consumed cost = 200_000
    //   Material B: 0.5 × 10 = 5 units; stock has 50 units @ 100_000 cost
    //     → per-unit cost = 2_000; consumed cost = 10_000
    //   Output total cost = 210_000
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      '00000000-0000-0000-0000-000000000100': { qty: '100', costBalanceMinor: '1000000' },
      '00000000-0000-0000-0000-000000000101': { qty: '50', costBalanceMinor: '100000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');

    expect(stock.spies.applyDeltas).toHaveBeenCalledTimes(1);
    const args = stock.spies.applyDeltas.mock.calls[0];
    const deltas = args?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      docType: string;
      assortmentId: string;
    }>;
    expect(deltas).toHaveLength(3);

    const matA = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000100');
    const matB = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000101');
    const output = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000099');

    expect(matA?.qtyDelta).toBe('-20');
    expect(matA?.costDeltaMinor).toBe(-200_000n);
    expect(matA?.docType).toBe('processing_consume');
    expect(matB?.qtyDelta).toBe('-5');
    expect(matB?.costDeltaMinor).toBe(-10_000n);
    expect(output?.qtyDelta).toBe('10');
    expect(output?.costDeltaMinor).toBe(210_000n);
    expect(output?.docType).toBe('processing_produce');

    // Snapshot persisted on the row for exact reversal
    expect(rows[0]?.materialsSnapshot).toBeTruthy();
    const snap = rows[0]?.materialsSnapshot;
    expect(snap?.outputProductId).toBe('00000000-0000-0000-0000-000000000099');
    expect(snap?.outputQty).toBe('10');
    expect(snap?.items).toHaveLength(2);

    expect(rows[0]?.state).toBe('posted');
    expect(rows[0]?.applicable).toBe(true);
    expect(rows[0]?.costSumMinor).toBe(210_000n);
  });

  it('produces zero-cost output when materials have no cost basis (honest about missing data)', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    // No stock balances → zero cost cascade
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');
    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      assortmentId: string;
      costDeltaMinor: bigint | null;
    }>;
    const output = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000099');
    expect(output?.costDeltaMinor).toBe(0n);
    expect(rows[0]?.costSumMinor).toBe(0n);
  });

  it('scales materials correctly when BOM yields > 1 unit per run', async () => {
    // BOM yields 5 per run, processing makes 20 → 4 runs.
    // Material A: 2 × 4 = 8 units; stock has 100 @ 500_000 → per-unit 5_000
    //   → consumed = 40_000
    const rows = [
      makeRow({
        quantity: 20_000n, // 20 units
        processingPlan: {
          id: '00000000-0000-0000-0000-000000000050',
          productId: '00000000-0000-0000-0000-000000000099',
          outputQty: decimal('5'),
          standardCostMinor: 100_000n,
          components: [
            {
              productId: '00000000-0000-0000-0000-000000000100',
              qty: decimal('2'),
              position: 1,
            },
          ],
        },
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      '00000000-0000-0000-0000-000000000100': { qty: '100', costBalanceMinor: '500000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');

    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      qtyDelta: string;
      assortmentId: string;
      costDeltaMinor: bigint | null;
    }>;
    const matA = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000100');
    expect(matA?.qtyDelta).toBe('-8');
    expect(matA?.costDeltaMinor).toBe(-40_000n);

    const output = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000099');
    expect(output?.qtyDelta).toBe('20');
    expect(output?.costDeltaMinor).toBe(40_000n);
  });

  it('bumps linked ProcessingOrder.movedSumMinor on post', async () => {
    const rows = [makeRow({ processingOrderId: '00000000-0000-0000-0000-000000000200' })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      '00000000-0000-0000-0000-000000000100': { qty: '100', costBalanceMinor: '1000000' },
      '00000000-0000-0000-0000-000000000101': { qty: '50', costBalanceMinor: '100000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');
    expect(prisma.spies.orderUpdateMany).toHaveBeenCalledTimes(1);
    const call = prisma.spies.orderUpdateMany.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { movedSumMinor: { increment: bigint } };
    };
    expect(call.where.id).toBe('00000000-0000-0000-0000-000000000200');
    expect(call.data.movedSumMinor.increment).toBe(210_000n);
  });

  it('does NOT call ProcessingOrder.updateMany when not linked', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      '00000000-0000-0000-0000-000000000100': { qty: '100', costBalanceMinor: '1000000' },
      '00000000-0000-0000-0000-000000000101': { qty: '50', costBalanceMinor: '100000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');
    expect(prisma.spies.orderUpdateMany).not.toHaveBeenCalled();
  });

  it('propagates BadRequestException from assertAvailable (sufficiency check)', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    stock.spies.assertAvailable.mockImplementation(() => {
      throw new BadRequestException({
        error: 'InsufficientStock',
        message: 'shortage',
      });
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
    // applyDeltas must NOT have been called if the sufficiency check threw
    expect(stock.spies.applyDeltas).not.toHaveBeenCalled();
    // Row state must remain draft
    expect(rows[0]?.state).toBe('draft');
  });
});

describe('ProcessingService — unpost / cancel (reversal)', () => {
  // Helper: build a posted row with a snapshot matching what post() would have written
  const postedWithSnapshot = (overrides: Partial<ProcessingRow> = {}) =>
    makeRow({
      state: 'posted',
      applicable: true,
      postedAt: new Date('2026-05-12'),
      costSumMinor: 210_000n,
      materialsSnapshot: {
        outputProductId: '00000000-0000-0000-0000-000000000099',
        outputQty: '10',
        items: [
          {
            productId: '00000000-0000-0000-0000-000000000100',
            qty: '20',
            costMinor: '200000',
          },
          {
            productId: '00000000-0000-0000-0000-000000000101',
            qty: '5',
            costMinor: '10000',
          },
        ],
      },
      ...overrides,
    });

  it('unpost uses snapshot for exact reversal (snapshot path)', async () => {
    const rows = [postedWithSnapshot()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'unpost');

    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      docType: string;
      assortmentId: string;
    }>;
    expect(deltas).toHaveLength(3);
    const matA = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000100');
    expect(matA?.qtyDelta).toBe('20');
    expect(matA?.costDeltaMinor).toBe(200_000n); // restored exactly
    expect(matA?.docType).toBe('processing_unpost_restore');
    const matB = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000101');
    expect(matB?.qtyDelta).toBe('5');
    expect(matB?.costDeltaMinor).toBe(10_000n);
    const output = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000099');
    expect(output?.qtyDelta).toBe('-10');
    expect(output?.costDeltaMinor).toBe(-210_000n);
    expect(output?.docType).toBe('processing_unpost_out');

    expect(rows[0]?.state).toBe('draft');
    expect(rows[0]?.applicable).toBe(false);
    expect(rows[0]?.postedAt).toBeNull();
    expect(rows[0]?.costSumMinor).toBe(0n);
    // Snapshot is cleared via Prisma.JsonNull sentinel (SQL NULL on real DB;
    // the mock keeps the sentinel object as-is — assert it's no longer the
    // structured snapshot we started with).
    expect(rows[0]?.materialsSnapshot).not.toHaveProperty('items');
  });

  it('unpost uses legacy path when snapshot is absent (pre-snapshot rows)', async () => {
    const rows = [
      makeRow({
        state: 'posted',
        applicable: true,
        postedAt: new Date('2026-05-12'),
        costSumMinor: 5_000_000n,
        materialsSnapshot: null,
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'unpost');

    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      qtyDelta: string;
      docType: string;
      costDeltaMinor: bigint | null;
      assortmentId: string;
    }>;
    const matA = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000100');
    expect(matA?.qtyDelta).toBe('20'); // 2 × (10/1) = 20, restored
    expect(matA?.docType).toBe('processing_unpost_restore_legacy');
    expect(matA?.costDeltaMinor).toBeNull(); // legacy: qty-only
    const output = deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000099');
    expect(output?.costDeltaMinor).toBe(-5_000_000n);
    expect(output?.docType).toBe('processing_unpost_out_legacy');
  });

  it('cancel from posted reverses via snapshot + sets cancelled state', async () => {
    const rows = [postedWithSnapshot()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'cancel');
    expect(stock.spies.applyDeltas).toHaveBeenCalledTimes(1);
    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{ docType: string }>;
    expect(deltas[0]?.docType).toBe('processing_cancel_restore');
    expect(rows[0]?.state).toBe('cancelled');
    expect(rows[0]?.applicable).toBe(false);
    // costSumMinor + snapshot are NOT zeroed on cancel — kept for audit trail
    expect(rows[0]?.costSumMinor).toBe(210_000n);
    expect(rows[0]?.materialsSnapshot).toBeTruthy();
  });

  it('unpost decrements linked ProcessingOrder.movedSumMinor', async () => {
    const rows = [
      postedWithSnapshot({
        processingOrderId: '00000000-0000-0000-0000-000000000200',
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await svc.transition('acc-1', 'emp-1', 'p-1', 'unpost');
    expect(prisma.spies.orderUpdateMany).toHaveBeenCalledTimes(1);
    const call = prisma.spies.orderUpdateMany.mock.calls[0]?.[0] as {
      data: { movedSumMinor: { decrement: bigint } };
    };
    expect(call.data.movedSumMinor.decrement).toBe(210_000n);
  });

  it('cancel from draft skips stock reversal (nothing to reverse)', async () => {
    const rows = [makeRow({ state: 'draft' })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await svc.transition('acc-1', 'emp-1', 'p-1', 'cancel');
    expect(stock.spies.applyDeltas).not.toHaveBeenCalled();
    expect(rows[0]?.state).toBe('cancelled');
  });

  it('unpost rejects when state is not posted', async () => {
    const rows = [makeRow({ state: 'draft' })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'unpost')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('cancel rejects when already cancelled', async () => {
    const rows = [makeRow({ state: 'cancelled' })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'cancel')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ProcessingService — update / delete guards', () => {
  it('update rejects edits on posted', async () => {
    const rows = [makeRow({ state: 'posted', applicable: true })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    // version: 1 so the payload passes the schema (optimistic-lock token) and the
    // rejection comes from the posted-doc guard, not a parse error.
    await expect(
      svc.update('acc-1', 'emp-1', 'p-1', { version: 1, description: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('softDelete rejects posted', async () => {
    const rows = [makeRow({ state: 'posted', applicable: true })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.softDelete('acc-1', 'emp-1', 'p-1')).rejects.toThrow(BadRequestException);
  });

  it('softDelete rejects non-draft (e.g. cancelled)', async () => {
    const rows = [makeRow({ state: 'cancelled' })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.softDelete('acc-1', 'emp-1', 'p-1')).rejects.toThrow(BadRequestException);
  });

  it('softDelete succeeds on draft', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await svc.softDelete('acc-1', 'emp-1', 'p-1');
    expect(rows[0]?.deletedAt).toBeInstanceOf(Date);
    expect(rows[0]?.state).toBe('cancelled');
  });
});

describe('ProcessingService — find / NotFound', () => {
  it('findById throws NotFoundException for missing id', async () => {
    const rows: ProcessingRow[] = [];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.findById('acc-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('findById excludes soft-deleted rows', async () => {
    const rows = [makeRow({ deletedAt: new Date() })];
    const prisma = makePrismaMock(rows);
    const stock = makeStock();
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.findById('acc-1', 'p-1')).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// §88 — explicit per-operation materials override
// ---------------------------------------------------------------------------

describe('ProcessingService — §88 explicit materials', () => {
  const MX = '00000000-0000-0000-0000-0000000000a1';
  const MY = '00000000-0000-0000-0000-0000000000a2';
  const OUT = '00000000-0000-0000-0000-000000000099'; // BOM output product

  function rowWithExplicit(): ProcessingRow {
    return makeRow({
      materials: [
        { productId: MX, qty: decimal('3'), position: 0, product: { id: MX, name: 'Subst X' } },
        { productId: MY, qty: decimal('1.5'), position: 1, product: { id: MY, name: 'Subst Y' } },
      ],
    });
  }

  it('consumes the EXPLICIT list at ABSOLUTE qty (no recipe scaling); BOM components NOT consumed; output still BOM product', async () => {
    // processingQty = 10, BOM outputQty = 1 → BOM path would consume
    // 100:-20 / 101:-5. Explicit overrides: consume MX:-3, MY:-1.5 EXACTLY.
    const rows = [rowWithExplicit()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      [MX]: { qty: '100', costBalanceMinor: '1000000' }, // per-unit 10_000 → 3 = 30_000
      [MY]: { qty: '30', costBalanceMinor: '300000' }, //   per-unit 10_000 → 1.5 = 15_000
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');

    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      assortmentId: string;
      docType: string;
    }>;
    const mx = deltas.find((d) => d.assortmentId === MX);
    const my = deltas.find((d) => d.assortmentId === MY);
    const out = deltas.find((d) => d.assortmentId === OUT);
    // Absolute qty — NOT ×10.
    expect(mx?.qtyDelta).toBe('-3');
    expect(mx?.costDeltaMinor).toBe(-30_000n);
    expect(my?.qtyDelta).toBe('-1.5');
    expect(my?.costDeltaMinor).toBe(-15_000n);
    // BOM components must NOT be consumed when explicit list is present.
    expect(
      deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000100'),
    ).toBeUndefined();
    expect(
      deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000101'),
    ).toBeUndefined();
    // Output still the BOM product, aggregated explicit cost.
    expect(out?.qtyDelta).toBe('10');
    expect(out?.costDeltaMinor).toBe(45_000n);
    // Snapshot records the EXPLICIT consumed list (source-agnostic).
    expect(rows[0]?.materialsSnapshot?.items.map((i) => i.productId).sort()).toEqual(
      [MX, MY].sort(),
    );
  });

  it('exact reversal via snapshot for explicit materials (unpost restores EXACTLY)', async () => {
    const rows = [rowWithExplicit()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      [MX]: { qty: '100', costBalanceMinor: '1000000' },
      [MY]: { qty: '30', costBalanceMinor: '300000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');
    await svc.transition('acc-1', 'emp-1', 'p-1', 'unpost');

    const rev = stock.spies.applyDeltas.mock.calls[1]?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      assortmentId: string;
    }>;
    // Reverse signs of the post deltas — exact zero-sum.
    expect(rev.find((d) => d.assortmentId === MX)?.qtyDelta).toBe('3');
    expect(rev.find((d) => d.assortmentId === MX)?.costDeltaMinor).toBe(30_000n);
    expect(rev.find((d) => d.assortmentId === MY)?.qtyDelta).toBe('1.5');
    expect(rev.find((d) => d.assortmentId === OUT)?.qtyDelta).toBe('-10');
    expect(rows[0]?.state).toBe('draft');
  });

  it('applies the sufficiency guard to the explicit list', async () => {
    const rows = [rowWithExplicit()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({ [MX]: { qty: '100', costBalanceMinor: '1000000' } });
    stock.spies.assertAvailable.mockImplementation(() => {
      throw new BadRequestException('Yetarli emas: Subst Y');
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'post')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('regression: with NO explicit materials the BOM-explode path is unchanged', async () => {
    const rows = [makeRow()]; // no `materials`
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      '00000000-0000-0000-0000-000000000100': { qty: '100', costBalanceMinor: '1000000' },
      '00000000-0000-0000-0000-000000000101': { qty: '50', costBalanceMinor: '100000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');
    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      qtyDelta: string;
      assortmentId: string;
    }>;
    // BOM components consumed, scaled ×10 (byte-identical to pre-§88).
    expect(
      deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000100')?.qtyDelta,
    ).toBe('-20');
    expect(
      deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000101')?.qtyDelta,
    ).toBe('-5');
  });
});

// ---------------------------------------------------------------------------
// §89 — explicit multi-output products[]
// ---------------------------------------------------------------------------

describe('ProcessingService — §89 explicit products / multi-output', () => {
  const P1 = '00000000-0000-0000-0000-0000000000b1';
  const P2 = '00000000-0000-0000-0000-0000000000b2';

  function rowWithProducts(): ProcessingRow {
    return makeRow({
      products: [
        { productId: P1, qty: decimal('6'), position: 0, product: { id: P1, name: 'Out 1' } },
        { productId: P2, qty: decimal('4'), position: 1, product: { id: P2, name: 'Out 2' } },
      ],
    });
  }

  it('produces EACH explicit output; consumed cost split qty-proportional Σ=total; BOM product NOT produced', async () => {
    // BOM materials (100:2×10=20 @10_000=200_000, 101:0.5×10=5 @2_000=10_000)
    // → totalCost 210_000. Outputs 6:4 → 126_000 / 84_000.
    const rows = [rowWithProducts()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      '00000000-0000-0000-0000-000000000100': { qty: '100', costBalanceMinor: '1000000' },
      '00000000-0000-0000-0000-000000000101': { qty: '50', costBalanceMinor: '100000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');

    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      assortmentId: string;
      docType: string;
    }>;
    const o1 = deltas.find((d) => d.assortmentId === P1);
    const o2 = deltas.find((d) => d.assortmentId === P2);
    expect(o1?.qtyDelta).toBe('6');
    expect(o1?.costDeltaMinor).toBe(126_000n);
    expect(o1?.docType).toBe('processing_produce');
    expect(o2?.qtyDelta).toBe('4');
    expect(o2?.costDeltaMinor).toBe(84_000n);
    // Σ output cost === totalCostMinor (exact, no tiyin lost).
    expect((o1?.costDeltaMinor ?? 0n) + (o2?.costDeltaMinor ?? 0n)).toBe(210_000n);
    // The single BOM product (…099) must NOT be produced.
    expect(
      deltas.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000099'),
    ).toBeUndefined();
    // Snapshot: canonical outputs[] + denormalised primary (back-compat).
    const snap = rows[0]?.materialsSnapshot;
    expect(snap?.outputs?.map((o) => o.productId)).toEqual([P1, P2]);
    expect(snap?.outputs?.map((o) => o.costMinor)).toEqual(['126000', '84000']);
    expect(snap?.outputProductId).toBe(P1); // primary = outputs[0]
    expect(rows[0]?.costSumMinor).toBe(210_000n);
  });

  it('multi-output exact zero-sum reversal (unpost restores materials + removes each output exactly)', async () => {
    const rows = [rowWithProducts()];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      '00000000-0000-0000-0000-000000000100': { qty: '100', costBalanceMinor: '1000000' },
      '00000000-0000-0000-0000-000000000101': { qty: '50', costBalanceMinor: '100000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');
    await svc.transition('acc-1', 'emp-1', 'p-1', 'unpost');

    const rev = stock.spies.applyDeltas.mock.calls[1]?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      assortmentId: string;
    }>;
    // Each output reversed exactly (negative qty + negative its share).
    expect(rev.find((d) => d.assortmentId === P1)?.qtyDelta).toBe('-6');
    expect(rev.find((d) => d.assortmentId === P1)?.costDeltaMinor).toBe(-126_000n);
    expect(rev.find((d) => d.assortmentId === P2)?.qtyDelta).toBe('-4');
    expect(rev.find((d) => d.assortmentId === P2)?.costDeltaMinor).toBe(-84_000n);
    // Materials restored (items path unchanged).
    expect(
      rev.find((d) => d.assortmentId === '00000000-0000-0000-0000-000000000100')?.qtyDelta,
    ).toBe('20');
    expect(rows[0]?.state).toBe('draft');
    expect(rows[0]?.costSumMinor).toBe(0n);
  });

  it('explicit SINGLE output (N=1) is byte-identical to the single-output path (all cost to it)', async () => {
    const PX = '00000000-0000-0000-0000-0000000000bf';
    const rows = [
      makeRow({
        products: [
          { productId: PX, qty: decimal('7'), position: 0, product: { id: PX, name: 'Solo' } },
        ],
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({
      '00000000-0000-0000-0000-000000000100': { qty: '100', costBalanceMinor: '1000000' },
      '00000000-0000-0000-0000-000000000101': { qty: '50', costBalanceMinor: '100000' },
    });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await svc.transition('acc-1', 'emp-1', 'p-1', 'post');
    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      assortmentId: string;
    }>;
    const out = deltas.find((d) => d.assortmentId === PX);
    expect(out?.qtyDelta).toBe('7');
    expect(out?.costDeltaMinor).toBe(210_000n); // ENTIRE cost — single output
    expect(rows[0]?.materialsSnapshot?.outputs).toHaveLength(1);
    expect(rows[0]?.materialsSnapshot?.outputProductId).toBe(PX);
  });
});

// ---------------------------------------------------------------------------
// §90 — processingPlanId optional when BOTH explicit materials & products
// ---------------------------------------------------------------------------

describe('ProcessingService — §90 BOM-less (both-explicit) operation', () => {
  const MX = '00000000-0000-0000-0000-0000000000a1';
  const OX = '00000000-0000-0000-0000-0000000000b1';

  it('posts with NO processingPlanId when both materials[] and products[] given (no BOM error); consumes/produces explicit; exact zero-sum reversal', async () => {
    const rows = [
      makeRow({
        processingPlanId: null,
        processingPlan: undefined, // no BOM at all
        materials: [
          { productId: MX, qty: decimal('3'), position: 0, product: { id: MX, name: 'Mat X' } },
        ],
        products: [
          { productId: OX, qty: decimal('5'), position: 0, product: { id: OX, name: 'Out X' } },
        ],
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({ [MX]: { qty: '100', costBalanceMinor: '1000000' } }); // 10_000/unit → 3 = 30_000
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);

    await svc.transition('acc-1', 'emp-1', 'p-1', 'post'); // must NOT throw "BOM majburiy"

    const deltas = stock.spies.applyDeltas.mock.calls[0]?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      assortmentId: string;
    }>;
    expect(deltas.find((d) => d.assortmentId === MX)?.qtyDelta).toBe('-3');
    expect(deltas.find((d) => d.assortmentId === MX)?.costDeltaMinor).toBe(-30_000n);
    const out = deltas.find((d) => d.assortmentId === OX);
    expect(out?.qtyDelta).toBe('5');
    expect(out?.costDeltaMinor).toBe(30_000n); // single explicit output gets all consumed cost
    expect(rows[0]?.materialsSnapshot?.outputs).toEqual([
      { productId: OX, qty: '5', costMinor: '30000' },
    ]);
    expect(rows[0]?.state).toBe('posted');

    // Exact zero-sum reversal (snapshot-driven, no BOM needed).
    await svc.transition('acc-1', 'emp-1', 'p-1', 'unpost');
    const rev = stock.spies.applyDeltas.mock.calls[1]?.[3] as Array<{
      qtyDelta: string;
      costDeltaMinor: bigint | null;
      assortmentId: string;
    }>;
    expect(rev.find((d) => d.assortmentId === MX)?.qtyDelta).toBe('3');
    expect(rev.find((d) => d.assortmentId === MX)?.costDeltaMinor).toBe(30_000n);
    expect(rev.find((d) => d.assortmentId === OX)?.qtyDelta).toBe('-5');
    expect(rev.find((d) => d.assortmentId === OX)?.costDeltaMinor).toBe(-30_000n);
    expect(rows[0]?.state).toBe('draft');
  });

  it('still rejects post with no plan AND missing one explicit side', async () => {
    const rows = [
      makeRow({
        processingPlanId: null,
        processingPlan: undefined,
        materials: [
          { productId: MX, qty: decimal('3'), position: 0, product: { id: MX, name: 'Mat X' } },
        ],
        // products[] omitted → no output source
      }),
    ];
    const prisma = makePrismaMock(rows);
    const stock = makeStock({ [MX]: { qty: '100', costBalanceMinor: '1000000' } });
    const svc = new ProcessingService({ client: prisma.client } as never, stock.service);
    await expect(svc.transition('acc-1', 'emp-1', 'p-1', 'post')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
