import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { StockService } from '../stock/stock.service.js';
import { WorkOrderService } from './work-order.service.js';

/**
 * Adversarial coverage for the WorkOrder V2 stock cascade. This cascade
 * (applyCompleteCascade / applyCancelCascade + the CAS-guarded
 * transition) was implemented but had ZERO service-level tests, and the
 * schema comment falsely claimed "V1 — NO stock cascades". These tests
 * lock the verified behaviour:
 *
 *   1. SIGN/MATH — complete consumes (componentQty × runs) negative and
 *      emits producedQty positive; runs = producedQty / BOM.outputQty.
 *   2. SUFFICIENCY — insufficient components ⇒ transition rejected.
 *   3. ZERO-SUM — completed → cancelled re-adds the exact components and
 *      removes the exact output (via the persisted producedQty).
 *   4. CONCURRENCY — CAS guard: a row that already moved ⇒ Conflict.
 *   5. FSM GUARDS — illegal transitions + completed needs producedQty>0.
 */

function makeStock(): {
  service: StockService;
  spies: {
    lockBalances: ReturnType<typeof vi.fn>;
    assertAvailable: ReturnType<typeof vi.fn>;
    applyDeltas: ReturnType<typeof vi.fn>;
  };
} {
  const spies = {
    lockBalances: vi.fn(async () => new Map()),
    assertAvailable: vi.fn(),
    applyDeltas: vi.fn(async () => undefined),
  };
  return { service: spies as unknown as StockService, spies };
}

interface WoRow {
  id: string;
  accountId: string;
  name: string;
  state: string;
  bomId: string;
  storeId: string;
  ownerId: string | null;
  plannedQty: string;
  producedQty: string;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  description: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BOM = {
  id: 'bom-1',
  productId: 'prod-out',
  outputQty: '10',
  product: { id: 'prod-out', name: 'Cake', code: 'CK', uom: 'pcs' },
  components: [
    {
      id: 'c1',
      productId: 'flour',
      qty: '2',
      position: 0,
      product: { id: 'flour', name: 'Flour', code: 'F', uom: 'kg' },
    },
    {
      id: 'c2',
      productId: 'sugar',
      qty: '1',
      position: 1,
      product: { id: 'sugar', name: 'Sugar', code: 'S', uom: 'kg' },
    },
  ],
};

function makeWo(over: Partial<WoRow> = {}): WoRow {
  const now = new Date('2026-05-18T00:00:00Z');
  return {
    id: 'wo-1',
    accountId: 'acc-1',
    name: 'ТЗ-2026-00001',
    state: 'in_progress',
    bomId: 'bom-1',
    storeId: 'store-1',
    ownerId: null,
    plannedQty: '50',
    producedQty: '0',
    plannedStartAt: null,
    plannedEndAt: null,
    startedAt: now,
    completedAt: null,
    description: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function makePrisma(wo: WoRow, opts: { flipCount?: number; allowNegativeStock?: boolean } = {}) {
  const flipCount = opts.flipCount ?? 1;
  const woWithRels = {
    ...wo,
    bom: BOM,
    store: { id: wo.storeId, name: 'Main' },
    owner: null,
  };
  const tx = {
    workOrder: {
      updateMany: vi.fn(async () => ({ count: flipCount })),
      findUniqueOrThrow: vi.fn(async () => ({ ...woWithRels, state: 'x' })),
    },
    billOfMaterials: {
      findFirst: vi.fn(async () => ({
        id: BOM.id,
        productId: BOM.productId,
        outputQty: BOM.outputQty,
        components: BOM.components.map((c) => ({ id: c.id, productId: c.productId, qty: c.qty })),
      })),
    },
    store: {
      findFirst: vi.fn(async () => ({ allowNegativeStock: opts.allowNegativeStock ?? false })),
    },
  };
  const client = {
    workOrder: { findFirst: vi.fn(async () => woWithRels) },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  return { client, tx };
}

function svc(prisma: { client: unknown }, stock: StockService) {
  return new WorkOrderService({ client: prisma.client } as never, stock);
}

describe('WorkOrderService.transition — V2 complete cascade', () => {
  it('consumes scaled components (qty × runs) and emits the output (§86)', async () => {
    const prisma = makePrisma(makeWo());
    const { service, spies } = makeStock();
    await svc(prisma, service).transition('acc-1', 'emp-1', 'wo-1', {
      state: 'completed',
      producedQty: '50',
    });
    // runs = 50 / 10 = 5 → flour 2×5=10, sugar 1×5=5; output +50.
    const deltas = spies.applyDeltas.mock.calls.flatMap(
      (c) => c[3] as Array<{ assortmentId: string; qtyDelta: string }>,
    );
    const flour = deltas.find((d) => d.assortmentId === 'flour');
    const sugar = deltas.find((d) => d.assortmentId === 'sugar');
    const out = deltas.find((d) => d.assortmentId === 'prod-out');
    expect(flour?.qtyDelta).toBe('-10');
    expect(sugar?.qtyDelta).toBe('-5');
    expect(out?.qtyDelta).toBe('50');
    expect(spies.assertAvailable).toHaveBeenCalled();
  });

  it('defaults producedQty to plannedQty when omitted', async () => {
    const prisma = makePrisma(makeWo({ plannedQty: '20' }));
    const { service, spies } = makeStock();
    await svc(prisma, service).transition('acc-1', 'emp-1', 'wo-1', { state: 'completed' });
    const deltas = spies.applyDeltas.mock.calls.flatMap(
      (c) => c[3] as Array<{ assortmentId: string; qtyDelta: string }>,
    );
    expect(deltas.find((d) => d.assortmentId === 'prod-out')?.qtyDelta).toBe('20');
  });

  it('rejects completion when components are insufficient (sufficiency guard)', async () => {
    const prisma = makePrisma(makeWo());
    const { service, spies } = makeStock();
    spies.assertAvailable.mockImplementation(() => {
      throw new BadRequestException('Yetarli emas: Flour');
    });
    await expect(
      svc(prisma, service).transition('acc-1', 'emp-1', 'wo-1', {
        state: 'completed',
        producedQty: '50',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects completed with producedQty = 0', async () => {
    const prisma = makePrisma(makeWo());
    const { service } = makeStock();
    await expect(
      svc(prisma, service).transition('acc-1', 'emp-1', 'wo-1', {
        state: 'completed',
        producedQty: '0',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WorkOrderService.transition — V2 cancel reversal (zero-sum)', () => {
  it('completed → cancelled re-adds exact components and removes exact output', async () => {
    const prisma = makePrisma(makeWo({ state: 'completed', producedQty: '50' }));
    const { service, spies } = makeStock();
    await svc(prisma, service).transition('acc-1', 'emp-1', 'wo-1', { state: 'cancelled' });
    const deltas = spies.applyDeltas.mock.calls.flatMap(
      (c) => c[3] as Array<{ assortmentId: string; qtyDelta: string }>,
    );
    // Reverse of complete: flour +10, sugar +5, output -50.
    expect(deltas.find((d) => d.assortmentId === 'flour')?.qtyDelta).toBe('10');
    expect(deltas.find((d) => d.assortmentId === 'sugar')?.qtyDelta).toBe('5');
    expect(deltas.find((d) => d.assortmentId === 'prod-out')?.qtyDelta).toBe('-50');
  });

  it('does NOT cascade when cancelling a never-completed order (draft → cancelled)', async () => {
    const prisma = makePrisma(makeWo({ state: 'draft' }));
    const { service, spies } = makeStock();
    await svc(prisma, service).transition('acc-1', 'emp-1', 'wo-1', { state: 'cancelled' });
    expect(spies.applyDeltas).not.toHaveBeenCalled();
  });
});

describe('WorkOrderService.create/update — moment (Дата документа)', () => {
  // Captures the `data` arg handed to workOrder.create / workOrder.update so we
  // can assert the document date is persisted (it was silently dropped before
  // the `moment` column existed). BOM + store lookups resolve truthy so the
  // ref guards pass; name is supplied so the auto-number path is skipped.
  function makeCrudPrisma() {
    const created: Array<{ data: Record<string, unknown> }> = [];
    const updated: Array<{ data: Record<string, unknown> }> = [];
    const row = {
      ...makeWo({ state: 'draft' }),
      moment: new Date('2026-05-18T00:00:00Z'),
      bom: BOM,
      store: { id: 'store-1', name: 'Main' },
      owner: null,
      version: 1,
    };
    const client = {
      billOfMaterials: { findFirst: vi.fn(async () => ({ id: 'bom-1' })) },
      store: { findFirst: vi.fn(async () => ({ id: 'store-1' })) },
      workOrder: {
        findFirst: vi.fn(async () => row),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          created.push(args);
          return { ...row, ...args.data };
        }),
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          updated.push(args);
          return { ...row, ...args.data };
        }),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    return { client, created, updated };
  }

  const BOM_UUID = '11111111-1111-1111-1111-111111111111';
  const STORE_UUID = '22222222-2222-2222-2222-222222222222';

  it('create persists the operator-chosen moment', async () => {
    const prisma = makeCrudPrisma();
    const { service } = makeStock();
    await svc(prisma, service).create('acc-1', 'emp-1', {
      name: 'ТЗ-2026-00099',
      bomId: BOM_UUID,
      storeId: STORE_UUID,
      plannedQty: '5',
      moment: '2026-05-01T08:30:00.000Z',
    });
    expect(prisma.created).toHaveLength(1);
    expect(prisma.created[0]?.data.moment).toEqual(new Date('2026-05-01T08:30:00.000Z'));
  });

  it('create defaults moment to ~now when omitted (no silent null)', async () => {
    const prisma = makeCrudPrisma();
    const { service } = makeStock();
    const before = Date.now();
    await svc(prisma, service).create('acc-1', 'emp-1', {
      name: 'ТЗ-2026-00100',
      bomId: BOM_UUID,
      storeId: STORE_UUID,
      plannedQty: '5',
    });
    const moment = prisma.created[0]?.data.moment as Date;
    expect(moment).toBeInstanceOf(Date);
    expect(moment.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(moment.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('update sets moment only when provided (omitting leaves it untouched)', async () => {
    const prisma = makeCrudPrisma();
    const { service } = makeStock();
    await svc(prisma, service).update('acc-1', 'emp-1', 'wo-1', {
      moment: '2026-06-02T00:00:00.000Z',
      version: 1,
    });
    expect(prisma.updated[0]?.data.moment).toEqual(new Date('2026-06-02T00:00:00.000Z'));

    const prisma2 = makeCrudPrisma();
    await svc(prisma2, makeStock().service).update('acc-1', 'emp-1', 'wo-1', {
      description: 'no date change',
      version: 1,
    });
    expect(prisma2.updated[0]?.data).not.toHaveProperty('moment');
  });
});

describe('WorkOrderService.transition — guards', () => {
  it('CAS guard: a row that already moved ⇒ ConflictException (no double-fire)', async () => {
    const prisma = makePrisma(makeWo(), { flipCount: 0 });
    const { service, spies } = makeStock();
    await expect(
      svc(prisma, service).transition('acc-1', 'emp-1', 'wo-1', {
        state: 'completed',
        producedQty: '50',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(spies.applyDeltas).not.toHaveBeenCalled();
  });

  it('rejects an illegal FSM transition (draft → completed)', async () => {
    const prisma = makePrisma(makeWo({ state: 'draft' }));
    const { service } = makeStock();
    await expect(
      svc(prisma, service).transition('acc-1', 'emp-1', 'wo-1', {
        state: 'completed',
        producedQty: '50',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
