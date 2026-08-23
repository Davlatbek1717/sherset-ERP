import { describe, expect, it, vi } from 'vitest';
import { StockService } from '../stock/stock.service.js';
import { InventoryService, computeVarianceLine } from './inventory.service.js';

/**
 * Yacheyka bo'yicha inventarizatsiya — XULQ testlari (stock-by-cell.behaviour
 * naqshi: haqiqiy servis + soxta `tx`, DB kerak emas).
 *
 * Qo'riqlanadigan shartnoma:
 *   - cellId'li qator: expectedQty StockByCell'dan, delta cellId bilan chiqadi
 *     (applyDeltas Stock'ni ham, AYNAN o'sha yacheykani ham birga tekislaydi);
 *   - cellId'siz qator: F12'gacha bo'lgan xulq BAYT-BA-BAYT (expected Stock'dan,
 *     shortage yacheykalardan avtomat-ayirish bilan);
 *   - cancel(): yacheykali qator teskari deltani ham o'sha yacheykaga qaytaradi;
 *   - basisQty: yacheyka qatorida tannarx OMBOR qoldig'iga bo'linadi.
 */

const dec = (n: string | number) => ({ toString: () => String(n) }) as never;

interface CellRow {
  cellId: string;
  qty: { toString: () => string };
}

interface FakeStores {
  /** stock.findFirst javobi (ombor-darajali qoldiq + tannarx asosi). */
  stockRow?: { qty: ReturnType<typeof dec>; costBalanceMinor: bigint } | null;
  /** stockByCell.findUnique javoblari: cellId → qty. */
  cellQty?: Record<string, ReturnType<typeof dec>>;
  /** Avtomat-ayirish o'qiydigan band yacheykalar. */
  occupiedCells?: CellRow[];
}

function makeTx(f: FakeStores) {
  const cellUpserts: Array<{ cellId: string; qty: string }> = [];
  const cellDecrements: Array<{ cellId: string; decrement: string }> = [];
  const storeUpserts: string[] = [];
  const positionUpdates: Array<Record<string, unknown>> = [];

  const tx = {
    stock: {
      findFirst: vi.fn(async () => f.stockRow ?? null),
      upsert: vi.fn(async (args: { update: unknown }) => {
        // costDeltaMinor BigInt bo'ladi — oddiy JSON.stringify uni ko'tarmaydi.
        storeUpserts.push(
          JSON.stringify(args.update, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        );
        return {};
      }),
    },
    stockByCell: {
      findUnique: vi.fn(async (args: { where: Record<string, { cellId: string }> }) => {
        const key = Object.values(args.where)[0];
        const qty = f.cellQty?.[key.cellId];
        return qty === undefined ? null : { qty };
      }),
      upsert: vi.fn(
        async (args: { where: Record<string, { cellId: string }>; create: { qty: unknown } }) => {
          const key = Object.values(args.where)[0];
          cellUpserts.push({ cellId: key.cellId, qty: String(args.create.qty) });
          return {};
        },
      ),
      findMany: vi.fn(async () => f.occupiedCells ?? []),
      update: vi.fn(
        async (args: {
          where: Record<string, { cellId: string }>;
          data: { qty: { decrement: unknown } };
        }) => {
          const key = Object.values(args.where)[0];
          cellDecrements.push({ cellId: key.cellId, decrement: String(args.data.qty.decrement) });
          return {};
        },
      ),
    },
    stockOperation: { createMany: vi.fn(async () => ({ count: 0 })) },
    // resolveHomeCells (yacheykasiz KIRIM uchungina) shu ikkitasini o'qiydi.
    product: { findMany: vi.fn(async () => []) },
    storeCell: { findMany: vi.fn(async () => []) },
    inventoryPosition: {
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        positionUpdates.push(args.data);
        return {};
      }),
    },
    inventory: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirstOrThrow: vi.fn(async () => ({ id: 'inv-1', state: 'posted' })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { tx, cellUpserts, cellDecrements, storeUpserts, positionUpdates };
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
  const doc = {
    id: 'inv-1',
    storeId: 'store-1',
    deletedAt: null,
    ...existing,
  };
  const prisma = {
    client: {
      inventory: { findFirst: vi.fn(async () => doc) },
      product: { findMany: vi.fn(async () => [{ id: 'prod-1', buyPrice: 0n }]) },
      $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    },
  };
  // StockService konstruktor clientini applyDeltas ishlatmaydi (tx parametr).
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

describe('post() — yacheykali qator', () => {
  it("expected StockByCell'dan olinadi va ORTIQCHA o'sha yacheykaga yoziladi", async () => {
    const { tx, cellUpserts, cellDecrements, positionUpdates } = makeTx({
      stockRow: { qty: dec('100'), costBalanceMinor: 100_000n },
      cellQty: { 'cell-A': dec('3') },
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

    // expected=3 (yacheyka!), actual=5 → variance +2 aynan cell-A ga.
    expect(positionUpdates[0]).toMatchObject({ expectedQty: '3', varianceQty: '2' });
    expect(cellUpserts).toEqual([{ cellId: 'cell-A', qty: '2' }]);
    expect(cellDecrements).toEqual([]);
  });

  it("KAMOMAD ham aynan sanalgan yacheykadan ayiriladi (avtomat-ayirish YO'Q)", async () => {
    const { tx, cellUpserts, cellDecrements } = makeTx({
      stockRow: { qty: dec('100'), costBalanceMinor: 0n },
      cellQty: { 'cell-A': dec('10') },
      // Boshqa band yacheykalar bor — lekin ularga TEGILMASIN:
      occupiedCells: [{ cellId: 'cell-B', qty: dec('50') }],
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

    // Aniq cellId bilan delta -6 → upsert increment('-6') o'sha qatorga.
    expect(cellUpserts).toEqual([{ cellId: 'cell-A', qty: '-6' }]);
    expect(cellDecrements).toEqual([]);
  });

  it("yacheykada yozuv YO'Q bo'lsa expected=0 — butun sanov ortiqcha", async () => {
    const { tx, cellUpserts, positionUpdates } = makeTx({
      stockRow: { qty: dec('100'), costBalanceMinor: 0n },
      cellQty: {},
    });
    const svc = makeService(
      {
        state: 'draft',
        applicable: false,
        positions: [pos({ cellId: 'cell-A', actualQty: dec('7') })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'post');
    expect(positionUpdates[0]).toMatchObject({ expectedQty: '0', varianceQty: '7' });
    expect(cellUpserts).toEqual([{ cellId: 'cell-A', qty: '7' }]);
  });
});

describe("post() — cellId'siz qator (REGRESSIYA: F12'gacha xulq)", () => {
  it("expected Stock'dan, kamomad yacheykalardan avtomat ayiriladi", async () => {
    const { tx, cellUpserts, cellDecrements, positionUpdates } = makeTx({
      stockRow: { qty: dec('10'), costBalanceMinor: 0n },
      occupiedCells: [{ cellId: 'cell-B', qty: dec('8') }],
    });
    const svc = makeService(
      { state: 'draft', applicable: false, positions: [pos({ actualQty: dec('4') })] },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'post');

    // expected=10 (ombor), actual=4 → -6 avtomat-ayirish orqali (cell-B dan).
    expect(positionUpdates[0]).toMatchObject({ expectedQty: '10', varianceQty: '-6' });
    expect(cellUpserts).toEqual([]);
    expect(cellDecrements).toEqual([{ cellId: 'cell-B', decrement: '6' }]);
    // stockByCell.findUnique (yacheyka expected o'qish) UMUMAN chaqirilmagan.
    expect(
      (tx as { stockByCell: { findUnique: { mock: { calls: unknown[] } } } }).stockByCell.findUnique
        .mock.calls,
    ).toEqual([]);
  });
});

describe('cancel() — yacheykali qator teskari deltasi', () => {
  it('post qilgan yacheykasiga QAYTARADI', async () => {
    const { tx, cellUpserts } = makeTx({});
    const svc = makeService(
      {
        state: 'posted',
        applicable: true,
        positions: [pos({ cellId: 'cell-A', varianceQty: dec('2'), costMinor: 500n })],
      },
      tx,
    );
    await svc.transition('acc', 'user', 'inv-1', 'cancel');
    // post +2 bergan edi → cancel -2 ni AYNAN cell-A ga yozadi.
    expect(cellUpserts).toEqual([{ cellId: 'cell-A', qty: '-2' }]);
  });
});

describe('computeVarianceLine — basisQty (yacheyka tannarxi)', () => {
  it('basisQty berilmasa eski semantika AYNAN saqlanadi', () => {
    const r = computeVarianceLine({
      expectedQty: '10',
      actualQty: '4',
      costBalanceMinor: 10_000n,
      buyPriceMinor: 777n,
    });
    expect(r.varianceQty).toBe('-6');
    expect(r.unitCostMinor).toBe(1_000n); // 10000 / 10
  });

  it("yacheyka qatori: tannarx OMBOR qoldig'iga bo'linadi, yacheykanikiga emas", () => {
    // Yacheykada 2 dona, omborda 10 dona, ombor asosi 10 000 tiyin.
    // basisQty'siz 10000/2=5000 bo'lib ketardi — 5 barobar shishgan narx.
    const r = computeVarianceLine({
      expectedQty: '2',
      actualQty: '5',
      costBalanceMinor: 10_000n,
      buyPriceMinor: 0n,
      basisQty: '10',
    });
    expect(r.varianceQty).toBe('3');
    expect(r.unitCostMinor).toBe(1_000n); // 10000 / 10 (ombor)
    expect(r.varianceCostMinor).toBe(3_000n);
  });

  it("ombor qoldig'i 0 bo'lsa buyPrice fallback ishlaydi", () => {
    const r = computeVarianceLine({
      expectedQty: '0',
      actualQty: '5',
      costBalanceMinor: 0n,
      buyPriceMinor: 250n,
      basisQty: '0',
    });
    expect(r.unitCostMinor).toBe(250n);
    expect(r.varianceCostMinor).toBe(1_250n);
  });
});
