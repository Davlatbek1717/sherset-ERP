import { describe, expect, it, vi } from 'vitest';
import { StockService } from '../stock/stock.service.js';
import { InventoryService } from './inventory.service.js';

/**
 * F7 — inventarizatsiya post'ida joylashtirish (inventory.cell.test naqshi:
 * haqiqiy servis + soxta `tx`, DB kerak emas).
 *
 * Qo'riqlanadigan shartnoma:
 *   - yacheykali ORTIQCHA avval manbalardan ko'chadi: o'z-ombor yacheykasiz
 *     qoldig'i (juftlik store ichida, cost ko'chmaydi) → hovuz-ombor
 *     (`__unassignedSource`, juftlik omborlararo, cost ko'chadi);
 *   - faqat qoplanmagan qism `inventory_surplus` (tannarxi ham qisqargan);
 *   - hovuz yo'q va o'z-qoldiq 0 bo'lsa — ESKI xulq bayt-ba-bayt;
 *   - cancel: placement qatorlari ledgerdan AYNAN teskarilanadi, surplus
 *     teskarisi joylashgan qismga qisqaradi.
 */

const dec = (n: string | number) => ({ toString: () => String(n) }) as never;

interface LedgerRow {
  storeId: string;
  cellId: string | null;
  qtyDelta: unknown;
  costDeltaMinor: bigint | null;
  docType: string;
  docPositionId: string | null;
  reason: string;
}

interface FakeWorld {
  /** Hujjat omborining Stock qatori (expected + tannarx asosi). */
  stockRow?: { qty: ReturnType<typeof dec>; costBalanceMinor: bigint } | null;
  /** stockByCell.findUnique: cellId → qty (expected o'qish). */
  cellQty?: Record<string, ReturnType<typeof dec>>;
  /** findPoolStore javobi. */
  poolStores?: Array<{ id: string; name: string }>;
  /** lockBalances xom qatorlari: storeId → rows. */
  lockRows?: Record<
    string,
    Array<{
      account_id: string;
      store_id: string;
      assortment_kind: string;
      assortment_id: string;
      qty: string;
      reserved_qty: string;
      cost_balance_minor: string;
    }>
  >;
  /** stockByCell.groupBy (Σyacheyka): storeId → qty stringi. */
  assignedByStore?: Record<string, string>;
  /** cancel: ledgerdagi inventory_placement qatorlari. */
  placementRows?: Array<{
    storeId: string;
    assortmentKind: string;
    assortmentId: string;
    cellId: string | null;
    qtyDelta: ReturnType<typeof dec>;
    costDeltaMinor: bigint | null;
    docPositionId: string | null;
  }>;
}

function makeTx(f: FakeWorld) {
  const ledger: LedgerRow[] = [];
  const cellUpserts: Array<{ cellId: string; qty: string }> = [];

  const tx = {
    store: { findMany: vi.fn(async () => f.poolStores ?? []) },
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, ...values: unknown[]) => {
      // lockBalances: values = [accountId, storeId, kinds, ids]
      const storeId = String(values[1]);
      return f.lockRows?.[storeId] ?? [];
    }),
    stock: {
      findFirst: vi.fn(async () => f.stockRow ?? null),
      upsert: vi.fn(async () => ({})),
    },
    stockByCell: {
      findUnique: vi.fn(async (args: { where: Record<string, { cellId: string }> }) => {
        const key = Object.values(args.where)[0];
        const qty = f.cellQty?.[key.cellId];
        return qty === undefined ? null : { qty };
      }),
      groupBy: vi.fn(async (args: { where: { storeId: string } }) => {
        const sum = f.assignedByStore?.[args.where.storeId];
        return sum === undefined
          ? []
          : [
              {
                assortmentKind: 'product',
                assortmentId: 'prod-1',
                _sum: { qty: dec(sum) },
              },
            ];
      }),
      upsert: vi.fn(
        async (args: { where: Record<string, { cellId: string }>; create: { qty: unknown } }) => {
          const key = Object.values(args.where)[0];
          cellUpserts.push({ cellId: key.cellId, qty: String(args.create.qty) });
          return {};
        },
      ),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    stockOperation: {
      createMany: vi.fn(async (args: { data: LedgerRow[] }) => {
        ledger.push(...args.data);
        return { count: args.data.length };
      }),
      findMany: vi.fn(async () => f.placementRows ?? []),
    },
    product: { findMany: vi.fn(async () => []) },
    storeCell: { findMany: vi.fn(async () => []) },
    inventoryPosition: { update: vi.fn(async () => ({})) },
    inventory: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirstOrThrow: vi.fn(async () => ({ id: 'inv-1', state: 'posted' })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { tx, ledger, cellUpserts };
}

interface FakePosition {
  id: string;
  assortmentKind: string;
  assortmentId: string;
  actualQty: ReturnType<typeof dec>;
  varianceQty: ReturnType<typeof dec>;
  costMinor: bigint | null;
  cellId: string | null;
}

function makeService(
  existing: { state: string; applicable: boolean; positions: FakePosition[] },
  tx: unknown,
) {
  const doc = { id: 'inv-1', storeId: 'store-1', deletedAt: null, ...existing };
  const prisma = {
    client: {
      inventory: { findFirst: vi.fn(async () => doc) },
      product: { findMany: vi.fn(async () => [{ id: 'prod-1', buyPrice: 0n }]) },
      $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    },
  };
  const stock = new StockService({ client: {} } as never);
  const webhook = { fireForEvent: vi.fn() };
  return new InventoryService(prisma as never, stock, {} as never, webhook as never);
}

const pos = (over: Partial<FakePosition>): FakePosition => ({
  id: 'pos-1',
  assortmentKind: 'product',
  assortmentId: 'prod-1',
  actualQty: dec('0'),
  varianceQty: dec('0'),
  costMinor: null,
  cellId: null,
  ...over,
});

const lockRow = (storeId: string, qty: string, cost: string, reserved = '0') => ({
  account_id: 'acc',
  store_id: storeId,
  assortment_kind: 'product',
  assortment_id: 'prod-1',
  qty,
  reserved_qty: reserved,
  cost_balance_minor: cost,
});

describe('post() — F7 joylashtirish', () => {
  it("hovuz surplus'ni to'liq qoplasa: placement juftligi, surplus YO'Q, cost ko'chadi", async () => {
    const { tx, ledger } = makeTx({
      stockRow: { qty: dec('0'), costBalanceMinor: 0n },
      cellQty: {},
      poolStores: [{ id: 'pool-1', name: 'Taqsimlanmagan' }],
      lockRows: {
        'store-1': [lockRow('store-1', '0', '0')],
        'pool-1': [lockRow('pool-1', '10', '1000')],
      },
    });
    const svc = makeService(
      {
        state: 'draft',
        applicable: false,
        positions: [pos({ cellId: 'cell-A', actualQty: dec('4') })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'post');

    expect(ledger.map((l) => l.docType)).toEqual(['inventory_placement', 'inventory_placement']);
    const minus = ledger[0];
    const plus = ledger[1];
    expect(minus).toMatchObject({ storeId: 'pool-1', cellId: null, docPositionId: 'pos-1' });
    expect(String(minus?.qtyDelta)).toBe('-4');
    // 10 dona 1000 tiyin asos → 4 dona 400 tiyin bilan ketadi
    expect(minus?.costDeltaMinor).toBe(-400n);
    expect(plus).toMatchObject({ storeId: 'store-1', cellId: 'cell-A' });
    expect(String(plus?.qtyDelta)).toBe('4');
    expect(plus?.costDeltaMinor).toBe(400n);
  });

  it('hovuz qisman qoplasa: placement + qisqargan inventory_surplus', async () => {
    const { tx, ledger } = makeTx({
      stockRow: { qty: dec('0'), costBalanceMinor: 0n },
      cellQty: {},
      poolStores: [{ id: 'pool-1', name: 'Taqsimlanmagan' }],
      lockRows: {
        'store-1': [lockRow('store-1', '0', '0')],
        'pool-1': [lockRow('pool-1', '3', '0')],
      },
    });
    const svc = makeService(
      {
        state: 'draft',
        applicable: false,
        positions: [pos({ cellId: 'cell-A', actualQty: dec('5') })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'post');

    expect(ledger.map((l) => [l.docType, String(l.qtyDelta)])).toEqual([
      ['inventory_placement', '-3'],
      ['inventory_placement', '3'],
      ['inventory_surplus', '2'],
    ]);
    expect(ledger[2]).toMatchObject({ storeId: 'store-1', cellId: 'cell-A' });
  });

  it("o'z omborining yacheykasiz qoldig'i HOVUZDAN OLDIN ishlatiladi (cost ko'chmaydi)", async () => {
    const { tx, ledger } = makeTx({
      stockRow: { qty: dec('100'), costBalanceMinor: 0n },
      cellQty: {},
      poolStores: [{ id: 'pool-1', name: 'Taqsimlanmagan' }],
      lockRows: {
        // o'z omborda 100 dona, 90 tasi yacheykalarda → remainder 10
        'store-1': [lockRow('store-1', '100', '5000')],
        'pool-1': [lockRow('pool-1', '50', '0')],
      },
      assignedByStore: { 'store-1': '90' },
    });
    const svc = makeService(
      {
        state: 'draft',
        applicable: false,
        positions: [pos({ cellId: 'cell-A', actualQty: dec('4') })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'post');

    expect(ledger.map((l) => [l.docType, l.storeId, String(l.qtyDelta)])).toEqual([
      ['inventory_placement', 'store-1', '-4'],
      ['inventory_placement', 'store-1', '4'],
    ]);
    // store ichidagi juftlik — tannarx ko'chmaydi
    expect(ledger[0]?.costDeltaMinor).toBeNull();
    expect(ledger[1]?.costDeltaMinor).toBeNull();
  });

  it("hovuz YO'Q va o'z-qoldiq 0: eski xulq — to'liq inventory_surplus", async () => {
    const { tx, ledger, cellUpserts } = makeTx({
      stockRow: { qty: dec('100'), costBalanceMinor: 0n },
      cellQty: { 'cell-A': dec('3') },
      poolStores: [],
      lockRows: { 'store-1': [lockRow('store-1', '100', '0')] },
      assignedByStore: { 'store-1': '100' },
    });
    const svc = makeService(
      {
        state: 'draft',
        applicable: false,
        positions: [pos({ cellId: 'cell-A', actualQty: dec('5') })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'post');

    expect(ledger.map((l) => [l.docType, String(l.qtyDelta)])).toEqual([
      ['inventory_surplus', '2'],
    ]);
    expect(cellUpserts).toEqual([{ cellId: 'cell-A', qty: '2' }]);
  });

  it('hovuz hujjat omborining O`ZI bo`lsa manba sifatida olinmaydi', async () => {
    const { tx, ledger } = makeTx({
      stockRow: { qty: dec('0'), costBalanceMinor: 0n },
      cellQty: {},
      // findPoolStore excludeStoreId bilan filtrlaydi — bu yerda faqat doc store
      poolStores: [{ id: 'store-1', name: 'Taqsimlanmagan' }],
      lockRows: { 'store-1': [lockRow('store-1', '0', '0')] },
    });
    const svc = makeService(
      {
        state: 'draft',
        applicable: false,
        positions: [pos({ cellId: 'cell-A', actualQty: dec('2') })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'post');
    expect(ledger.map((l) => l.docType)).toEqual(['inventory_surplus']);
  });

  it('bir tovar ikki yacheykada: hovuz qoldig`i KETMA-KET kamayadi', async () => {
    const { tx, ledger } = makeTx({
      stockRow: { qty: dec('0'), costBalanceMinor: 0n },
      cellQty: {},
      poolStores: [{ id: 'pool-1', name: 'Taqsimlanmagan' }],
      lockRows: {
        'store-1': [lockRow('store-1', '0', '0')],
        'pool-1': [lockRow('pool-1', '5', '0')],
      },
    });
    const svc = makeService(
      {
        state: 'draft',
        applicable: false,
        positions: [
          pos({ id: 'pos-1', cellId: 'cell-A', actualQty: dec('4') }),
          pos({ id: 'pos-2', cellId: 'cell-B', actualQty: dec('4') }),
        ],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'post');

    // pos-1: 4 hovuzdan; pos-2: qolgan 1 hovuzdan + 3 surplus
    expect(ledger.map((l) => [l.docType, String(l.qtyDelta), l.docPositionId])).toEqual([
      ['inventory_placement', '-4', 'pos-1'],
      ['inventory_placement', '4', 'pos-1'],
      ['inventory_placement', '-1', 'pos-2'],
      ['inventory_placement', '1', 'pos-2'],
      ['inventory_surplus', '3', 'pos-2'],
    ]);
  });
});

describe('cancel() — F7 placement teskarisi', () => {
  it('placement qatorlari aynan teskarilanadi, surplus teskarisi qisqaradi', async () => {
    const { tx, ledger, cellUpserts } = makeTx({
      placementRows: [
        {
          storeId: 'pool-1',
          assortmentKind: 'product',
          assortmentId: 'prod-1',
          cellId: null,
          qtyDelta: dec('-4'),
          costDeltaMinor: -400n,
          docPositionId: 'pos-1',
        },
        {
          storeId: 'store-1',
          assortmentKind: 'product',
          assortmentId: 'prod-1',
          cellId: 'cell-A',
          qtyDelta: dec('4'),
          costDeltaMinor: 400n,
          docPositionId: 'pos-1',
        },
      ],
    });
    const svc = makeService(
      {
        state: 'posted',
        applicable: true,
        positions: [pos({ cellId: 'cell-A', varianceQty: dec('6'), costMinor: 100n })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'cancel');

    expect(ledger.map((l) => [l.docType, l.storeId, String(l.qtyDelta), l.costDeltaMinor])).toEqual(
      [
        ['inventory_placement', 'pool-1', '4', 400n],
        ['inventory_placement', 'store-1', '-4', -400n],
        // surplus qismi: variance 6 − placed 4 = 2 → -2, cost -2×100
        ['inventory_cancel', 'store-1', '-2', -200n],
      ],
    );
    // yacheyka harakati: placement teskarisi -4 va cancel -2 — bir yacheykaga
    expect(cellUpserts).toEqual([
      { cellId: 'cell-A', qty: '-4' },
      { cellId: 'cell-A', qty: '-2' },
    ]);
  });

  it('placement to`liq qoplagan pozitsiyada inventory_cancel yozilmaydi', async () => {
    const { tx, ledger } = makeTx({
      placementRows: [
        {
          storeId: 'pool-1',
          assortmentKind: 'product',
          assortmentId: 'prod-1',
          cellId: null,
          qtyDelta: dec('-6'),
          costDeltaMinor: null,
          docPositionId: 'pos-1',
        },
        {
          storeId: 'store-1',
          assortmentKind: 'product',
          assortmentId: 'prod-1',
          cellId: 'cell-A',
          qtyDelta: dec('6'),
          costDeltaMinor: null,
          docPositionId: 'pos-1',
        },
      ],
    });
    const svc = makeService(
      {
        state: 'posted',
        applicable: true,
        positions: [pos({ cellId: 'cell-A', varianceQty: dec('6'), costMinor: 100n })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'cancel');
    expect(ledger.map((l) => l.docType)).toEqual(['inventory_placement', 'inventory_placement']);
  });

  it("placementsiz eski hujjat: cancel avvalgidek to'liq variance'ni teskarilaydi", async () => {
    const { tx, ledger } = makeTx({ placementRows: [] });
    const svc = makeService(
      {
        state: 'posted',
        applicable: true,
        positions: [pos({ cellId: 'cell-A', varianceQty: dec('2'), costMinor: 500n })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'cancel');
    expect(ledger.map((l) => [l.docType, String(l.qtyDelta), l.costDeltaMinor])).toEqual([
      ['inventory_cancel', '-2', -1000n],
    ]);
  });
});
