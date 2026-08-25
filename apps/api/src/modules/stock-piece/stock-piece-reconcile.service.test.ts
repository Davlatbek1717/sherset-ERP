import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StockPieceReconcileService } from './stock-piece-reconcile.service.js';

/**
 * K1 — sverka servisining WIRING qulfi.
 *
 * Eng muhim ikki da'vo:
 *   1. servis FAQAT O'QIYDI — birorta `create/update/delete/executeRaw` yo'q
 *      (`warehouse-state.ts` intizomi: nosozlikni ko'rsatadi, tuzatmaydi);
 *   2. bayroq hech qayerda yoqilmagan holatda (K1 dagi jonli holat) qoldiq
 *      jadvallariga UMUMAN so'rov ketmaydi — 5000+ tovarli bazani bekorga
 *      skan qilmaslik uchun.
 */

interface Rows {
  products?: unknown[];
  pieces?: unknown[];
  cellStock?: unknown[];
  storeStock?: unknown[];
  extraCells?: unknown[];
}

function makePrisma(rows: Rows = {}) {
  const productFindMany = vi.fn().mockImplementation(async (args: { where: { id?: unknown } }) => {
    // Ikkinchi chaqiruv (`loadUntrackedNames`) `id: { in: [...] }` bilan keladi.
    if (args.where?.id) return [];
    return rows.products ?? [];
  });
  const pieceFindMany = vi
    .fn()
    .mockImplementation(async (args: { select?: { cell?: unknown } }) => {
      if (args.select && 'cell' in args.select) return rows.extraCells ?? [];
      return rows.pieces ?? [];
    });
  const cellStockFindMany = vi.fn().mockResolvedValue(rows.cellStock ?? []);
  const stockFindMany = vi.fn().mockResolvedValue(rows.storeStock ?? []);

  const client = {
    product: { findMany: productFindMany },
    stockPiece: { findMany: pieceFindMany },
    stockByCell: { findMany: cellStockFindMany },
    stock: { findMany: stockFindMany },
  };
  return {
    svc: new StockPieceReconcileService({ client } as never),
    productFindMany,
    pieceFindMany,
    cellStockFindMany,
    stockFindMany,
    client,
  };
}

const dec = (v: string) => ({ toString: () => v });

describe('StockPieceReconcileService — faqat o`qish', () => {
  it('servis yozish metodlarini UMUMAN chaqirmaydi', async () => {
    const { svc, client } = makePrisma();
    await svc.reconcile('acc-1', {});
    const source = StockPieceReconcileService.prototype.reconcile.toString();
    expect(source).not.toMatch(/\.(create|update|delete|upsert|executeRaw)\b/);
    // Fake klientda yozish metodlari umuman yo'q — chaqirilsa test yiqilardi.
    expect(Object.keys(client.stockPiece)).toEqual(['findMany']);
  });

  it('🔴 bayroq hech qayerda yoqilmagan va reyestr bo`sh ⇒ qoldiq so`rovi KETMAYDI', async () => {
    const { svc, cellStockFindMany, stockFindMany } = makePrisma();
    const out = await svc.reconcile('acc-1', {});
    expect(cellStockFindMany).not.toHaveBeenCalled();
    expect(stockFindMany).not.toHaveBeenCalled();
    expect(out.rows).toEqual([]);
    expect(out.totals.trackedProducts).toBe(0);
    expect(out.totals.diffBuckets).toBe(0);
  });

  it('bayroqli tovar so`rovi `pieceTracked: true` va o`chirilmaganlar bilan', async () => {
    const { svc, productFindMany } = makePrisma();
    await svc.reconcile('acc-1', {});
    const args = productFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.pieceTracked).toBe(true);
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.accountId).toBe('acc-1');
  });

  it('🔴 bo`lak so`rovida `pieceTracked` filtri ATAYLAB YO`Q (bayroqsiz reyestr ko`rinishi kerak)', async () => {
    const { svc, pieceFindMany } = makePrisma();
    await svc.reconcile('acc-1', {});
    const args = pieceFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where.accountId).toBe('acc-1');
    expect(JSON.stringify(args.where)).not.toContain('pieceTracked');
  });
});

describe('StockPieceReconcileService — sverka natijasi', () => {
  const CABLE = { id: 'cable', name: 'UzKabel VVG 2x2.5', code: 'VVG-25', uom: 'm' };

  it('reyestr qoldiqqa mos ⇒ farq yo`q', async () => {
    const { svc } = makePrisma({
      products: [CABLE],
      pieces: [
        {
          storeId: 's1',
          cellId: 'c1',
          assortmentKind: 'product',
          assortmentId: 'cable',
          length: dec('250'),
          whole: true,
          label: null,
          status: 'active',
        },
      ],
      cellStock: [
        {
          storeId: 's1',
          cellId: 'c1',
          assortmentKind: 'product',
          assortmentId: 'cable',
          qty: dec('250'),
          cell: { id: 'c1', name: '02-03-01-04' },
          store: { id: 's1', name: 'Ombor 02' },
        },
      ],
      storeStock: [
        {
          storeId: 's1',
          assortmentKind: 'product',
          assortmentId: 'cable',
          qty: dec('250'),
          store: { id: 's1', name: 'Ombor 02' },
        },
      ],
    });

    const out = await svc.reconcile('acc-1', {});
    expect(out.totals.diffBuckets).toBe(0);
    expect(out.totals.trackedProducts).toBe(1);
    const row = out.rows.find((r) => r.cellId === 'c1');
    expect(row?.storeName).toBe('Ombor 02');
    expect(row?.cellName).toBe('02-03-01-04');
    expect(row?.status).toBe('ok');
  });

  it('Decimal qiymatlar SATRGA aylantiriladi (float yaxlitlashi yo`q)', async () => {
    const { svc } = makePrisma({
      products: [CABLE],
      pieces: [
        {
          storeId: 's1',
          cellId: null,
          assortmentKind: 'product',
          assortmentId: 'cable',
          length: dec('0.123456'),
          whole: false,
          label: 'BLK-000001',
          status: 'active',
        },
      ],
      storeStock: [
        {
          storeId: 's1',
          assortmentKind: 'product',
          assortmentId: 'cable',
          qty: dec('0.123456'),
          store: { id: 's1', name: 'Ombor 02' },
        },
      ],
    });
    const out = await svc.reconcile('acc-1', {});
    expect(out.rows[0]?.registryQty).toBe('0.123456');
    expect(out.rows[0]?.status).toBe('ok');
  });

  it('ombor filtri qoldiq VA reyestr so`rovlariga birga tushadi', async () => {
    const { svc, pieceFindMany, cellStockFindMany, stockFindMany } = makePrisma({
      products: [CABLE],
    });
    await svc.reconcile('acc-1', { storeId: '11111111-1111-1111-1111-111111111111' });
    const pieceWhere = (pieceFindMany.mock.calls[0]?.[0] as { where: { storeId?: string } }).where;
    expect(pieceWhere.storeId).toBe('11111111-1111-1111-1111-111111111111');
    for (const fn of [cellStockFindMany, stockFindMany]) {
      const where = (fn.mock.calls[0]?.[0] as { where: { storeId?: string } }).where;
      expect(where.storeId).toBe('11111111-1111-1111-1111-111111111111');
    }
  });

  it('noto`g`ri filtr 400 beradi (jimgina hammasini qaytarmaydi)', async () => {
    const { svc } = makePrisma();
    await expect(svc.reconcile('acc-1', { storeId: 'not-a-uuid' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.reconcile('acc-1', { limit: 99999 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
