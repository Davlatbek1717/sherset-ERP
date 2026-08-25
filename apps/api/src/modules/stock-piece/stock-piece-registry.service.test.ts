import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StockPieceRegistryService } from './stock-piece-registry.service.js';

/**
 * K2 — reyestr boshqaruvi servisining WIRING qulfi.
 *
 * Eng muhim da'vo birinchi testda: **bu servis `Stock`/`StockByCell` ga
 * HECH QACHON yozmaydi.** 2026-08-24 da savdo aynan qoldiq mexanizmiga
 * tegilgani uchun 46 daqiqa to'xtagan edi; bo'lak reyestri esa qoldiqning
 * YONIDA turadi, uning O'RNIDA emas (K-reja 10-bo'lim, 5-band).
 */

const STORE = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const CELL = '33333333-3333-4333-8333-333333333333';
const OTHER_CELL = '44444444-4444-4444-8444-444444444444';
const PIECE = '55555555-5555-4555-8555-555555555555';

const dec = (v: string) => ({ toString: () => v }) as unknown as never;

interface Rows {
  pieces?: unknown[];
  maxLabel?: string | null;
  cellStock?: unknown[];
  storeQty?: string | null;
  cells?: Array<{ id: string; name: string }>;
  store?: unknown;
  product?: unknown;
  cell?: unknown;
  piece?: unknown;
}

function makePrisma(rows: Rows = {}) {
  const stockPieceCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const stockPieceUpdate = vi.fn().mockResolvedValue({});
  const stockPieceFindMany = vi.fn().mockResolvedValue(rows.pieces ?? []);
  const stockPieceFindFirst = vi
    .fn()
    .mockImplementation(async (args: { select?: Record<string, unknown> }) => {
      // `nextSeq` faqat `label` ni so'raydi; qolgani — bo'lakning o'zi.
      if (args.select && Object.keys(args.select).length === 1 && 'label' in args.select) {
        return rows.maxLabel === undefined ? null : { label: rows.maxLabel };
      }
      return rows.piece ?? null;
    });

  const productFindFirst = vi
    .fn()
    .mockResolvedValue(
      rows.product === undefined
        ? { id: PRODUCT, name: 'UzKabel VVG 2x2.5', code: 'K-1', uom: 'м', pieceTracked: true }
        : rows.product,
    );
  const productUpdate = vi.fn().mockResolvedValue({ id: PRODUCT, pieceTracked: true });
  const storeFindFirst = vi
    .fn()
    .mockResolvedValue(rows.store === undefined ? { id: STORE, name: 'Ombor 07' } : rows.store);
  const storeCellFindFirst = vi
    .fn()
    .mockResolvedValue(rows.cell === undefined ? { id: CELL } : rows.cell);
  const storeCellFindMany = vi
    .fn()
    .mockResolvedValue(rows.cells ?? [{ id: CELL, name: '07-01-01-01' }]);
  const stockByCellFindMany = vi.fn().mockResolvedValue(rows.cellStock ?? []);
  const stockFindFirst = vi
    .fn()
    .mockResolvedValue(rows.storeQty == null ? null : { qty: dec(rows.storeQty) });

  const client = {
    stockPiece: {
      createMany: stockPieceCreateMany,
      update: stockPieceUpdate,
      findMany: stockPieceFindMany,
      findFirst: stockPieceFindFirst,
    },
    product: { findFirst: productFindFirst, update: productUpdate },
    store: { findFirst: storeFindFirst },
    storeCell: { findFirst: storeCellFindFirst, findMany: storeCellFindMany },
    stockByCell: { findMany: stockByCellFindMany },
    stock: { findFirst: stockFindFirst },
  };

  return {
    svc: new StockPieceRegistryService({ client } as never),
    client,
    stockPieceCreateMany,
    stockPieceUpdate,
    stockPieceFindFirst,
    productUpdate,
    stockByCellFindMany,
    stockFindFirst,
  };
}

const baseCreate = { storeId: STORE, assortmentId: PRODUCT, cellId: CELL };

// ---------------------------------------------------------------------------

describe('🔴 K2 servisi qoldiqqa YOZMAYDI', () => {
  it('fake klientda `stock`/`stockByCell` da yozish metodi UMUMAN yo`q', async () => {
    const { svc, client } = makePrisma();
    await svc.create('acc-1', { ...baseCreate, whole: true, length: '250', count: 3 });
    expect(Object.keys(client.stock)).toEqual(['findFirst']);
    expect(Object.keys(client.stockByCell)).toEqual(['findMany']);
  });

  it('servis manbasida `stock`/`stockByCell` yozish chaqiruvi yo`q', () => {
    const src = [
      StockPieceRegistryService.prototype.create,
      StockPieceRegistryService.prototype.update,
      StockPieceRegistryService.prototype.close,
      StockPieceRegistryService.prototype.setFlag,
    ]
      .map((f) => f.toString())
      .join('\n');
    expect(src).not.toMatch(/stockByCell\.(create|update|delete|upsert|updateMany)/);
    expect(src).not.toMatch(/\.stock\.(create|update|delete|upsert|updateMany)/);
    expect(src).not.toMatch(/executeRaw/);
  });
});

// ---------------------------------------------------------------------------

describe('create — butun rulon va bo`lak', () => {
  it('«250 × 3» — 3 ta YORLIQSIZ qator (K-Q3)', async () => {
    const { svc, stockPieceCreateMany } = makePrisma();
    const out = await svc.create('acc-1', { ...baseCreate, whole: true, length: '250', count: 3 });

    const data = stockPieceCreateMany.mock.calls[0]?.[0]?.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(3);
    expect(data.every((d) => d.whole === true && d.label === null)).toBe(true);
    expect(data.every((d) => d.length === '250' && d.assortmentKind === 'product')).toBe(true);
    expect(data.every((d) => d.cellId === CELL && d.accountId === 'acc-1')).toBe(true);
    expect(out.labels).toEqual([]);
  });

  it('bo`lak — oxirgi yorliqdan keyingi raqamlar', async () => {
    const { svc, stockPieceCreateMany } = makePrisma({ maxLabel: 'BLK-000041' });
    const out = await svc.create('acc-1', { ...baseCreate, whole: false, length: '70', count: 2 });

    const data = stockPieceCreateMany.mock.calls[0]?.[0]?.data as Array<Record<string, unknown>>;
    expect(data.map((d) => d.label)).toEqual(['BLK-000042', 'BLK-000043']);
    expect(out.labels).toEqual(['BLK-000042', 'BLK-000043']);
  });

  it('vergul bilan kiritilgan uzunlik bazaga nuqta bilan tushadi', async () => {
    const { svc, stockPieceCreateMany } = makePrisma();
    await svc.create('acc-1', { ...baseCreate, whole: true, length: '250,5', count: 1 });
    const data = stockPieceCreateMany.mock.calls[0]?.[0]?.data as Array<Record<string, unknown>>;
    expect(data[0]?.length).toBe('250.5');
  });

  it('yacheykasiz (`cellId: null`) qo`shish ishlaydi — jonlidagi ~94 % holat', async () => {
    const { svc, stockPieceCreateMany } = makePrisma();
    await svc.create('acc-1', {
      storeId: STORE,
      assortmentId: PRODUCT,
      cellId: null,
      whole: true,
      length: '250',
      count: 1,
    });
    const data = stockPieceCreateMany.mock.calls[0]?.[0]?.data as Array<Record<string, unknown>>;
    expect(data[0]?.cellId).toBeNull();
  });

  it('🔴 yorliq poygasida (P2002) keyingi raqamdan QAYTA urinadi', async () => {
    const { svc, stockPieceCreateMany } = makePrisma({ maxLabel: 'BLK-000041' });
    let seen: string[] = [];
    stockPieceCreateMany.mockImplementationOnce(async () => {
      throw Object.assign(new Error('dup'), { code: 'P2002' });
    });
    stockPieceCreateMany.mockImplementationOnce(
      async (args: { data: Array<{ label: string }> }) => {
        seen = args.data.map((d) => d.label);
        return { count: 1 };
      },
    );
    const out = await svc.create('acc-1', { ...baseCreate, whole: false, length: '70', count: 1 });
    expect(stockPieceCreateMany).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['BLK-000042']);
    expect(out.labels).toEqual(['BLK-000042']);
  });

  it('P2002 dan boshqa xato yuqoriga ketadi', async () => {
    const { svc, stockPieceCreateMany } = makePrisma();
    stockPieceCreateMany.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'P2003' }));
    await expect(
      svc.create('acc-1', { ...baseCreate, whole: true, length: '250', count: 1 }),
    ).rejects.toThrow('boom');
  });

  it('1 m dan kalta — 400 (chiqindi, K-Q6)', async () => {
    const { svc, stockPieceCreateMany } = makePrisma();
    await expect(
      svc.create('acc-1', { ...baseCreate, whole: false, length: '0,4', count: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(stockPieceCreateMany).not.toHaveBeenCalled();
  });

  it('noto`g`ri uzunlik — 400', async () => {
    const { svc } = makePrisma();
    await expect(
      svc.create('acc-1', { ...baseCreate, whole: true, length: 'ikki yuz', count: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('🔴 yacheyka BOSHQA omborniki bo`lsa — 404 (bo`lak begona joyga yopishmasin)', async () => {
    const { svc, stockPieceCreateMany } = makePrisma({ cell: null });
    await expect(
      svc.create('acc-1', { ...baseCreate, whole: true, length: '250', count: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(stockPieceCreateMany).not.toHaveBeenCalled();
  });

  it('tovar topilmasa — 404', async () => {
    const { svc } = makePrisma({ product: null });
    await expect(
      svc.create('acc-1', { ...baseCreate, whole: true, length: '250', count: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------

describe('update / close', () => {
  const existing = {
    id: PIECE,
    storeId: STORE,
    assortmentId: PRODUCT,
    status: 'active',
    cellId: CELL,
  };

  it('uzunlik tuzatiladi (kesim yo`qotishi)', async () => {
    const { svc, stockPieceUpdate } = makePrisma({ piece: existing });
    await svc.update('acc-1', PIECE, { length: '68' });
    expect(stockPieceUpdate).toHaveBeenCalledWith({ where: { id: PIECE }, data: { length: '68' } });
  });

  it('boshqa yacheykaga ko`chirish', async () => {
    const { svc, stockPieceUpdate } = makePrisma({ piece: existing, cell: { id: OTHER_CELL } });
    await svc.update('acc-1', PIECE, { cellId: OTHER_CELL });
    expect(stockPieceUpdate).toHaveBeenCalledWith({
      where: { id: PIECE },
      data: { cellId: OTHER_CELL },
    });
  });

  it('yacheykasiz hovuzga qaytarish (`cellId: null`)', async () => {
    const { svc, stockPieceUpdate } = makePrisma({ piece: existing });
    await svc.update('acc-1', PIECE, { cellId: null });
    expect(stockPieceUpdate).toHaveBeenCalledWith({ where: { id: PIECE }, data: { cellId: null } });
  });

  it('faol bo`lakni nolga tushirib bo`lmaydi', async () => {
    const { svc } = makePrisma({ piece: existing });
    await expect(svc.update('acc-1', PIECE, { length: '0' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('bo`sh tahrir — 400', async () => {
    const { svc } = makePrisma({ piece: existing });
    await expect(svc.update('acc-1', PIECE, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('yo`q bo`lak — 404', async () => {
    const { svc } = makePrisma({ piece: null });
    await expect(svc.update('acc-1', PIECE, { length: '10' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('«tugadi» — `consumed` + `consumedAt`', async () => {
    const { svc, stockPieceUpdate } = makePrisma({ piece: existing });
    await svc.close('acc-1', PIECE);
    const call = stockPieceUpdate.mock.calls[0]?.[0] as {
      data: { status: string; consumedAt: Date };
    };
    expect(call.data.status).toBe('consumed');
    expect(call.data.consumedAt).toBeInstanceOf(Date);
  });

  it('allaqachon yopilgan bo`lak — 400', async () => {
    const { svc } = makePrisma({ piece: { ...existing, status: 'consumed' } });
    await expect(svc.close('acc-1', PIECE)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('🔴 yopilganda qoldiq O`ZGARMAYDI — sverka farqni KO`RSATADI', async () => {
    const { svc } = makePrisma({
      piece: existing,
      pieces: [],
      storeQty: '250',
    });
    const out = await svc.close('acc-1', PIECE);
    expect(out.view.totals.stockQty).toBe('250');
    expect(out.view.totals.registryQty).toBe('0');
    expect(out.view.totals.status).toBe('missing');
  });
});

// ---------------------------------------------------------------------------

describe('lookup — yorliq skaneri (7.3)', () => {
  it('🔴 `BLK-` makonidan tashqaridagi kod — 400, HECH NARSA qidirilmaydi', async () => {
    const { svc, stockPieceFindFirst } = makePrisma();
    await expect(svc.lookup('acc-1', { code: '4600001234567' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(stockPieceFindFirst).not.toHaveBeenCalled();
  });

  it('topilmasa — 404', async () => {
    const { svc } = makePrisma({ piece: null });
    await expect(svc.lookup('acc-1', { code: 'BLK-000041' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('AYNAN bitta bo`lak qaytadi (massiv emas — multi-hit yo`q)', async () => {
    const { svc } = makePrisma({
      piece: {
        id: PIECE,
        storeId: STORE,
        cellId: CELL,
        assortmentKind: 'product',
        assortmentId: PRODUCT,
        length: dec('200'),
        whole: false,
        label: 'BLK-000041',
        status: 'active',
        store: { id: STORE, name: 'Ombor 07' },
        cell: { id: CELL, name: '07-01-01-01' },
      },
    });
    const out = await svc.lookup('acc-1', { code: ' blk-000041 ' });
    expect(Array.isArray(out)).toBe(false);
    expect(out.piece.label).toBe('BLK-000041');
    expect(out.piece.length).toBe('200');
    expect(out.piece.cellName).toBe('07-01-01-01');
    expect(out.product?.name).toBe('UzKabel VVG 2x2.5');
  });

  it('yorliq katta harfga keltirib qidiriladi', async () => {
    const { svc, stockPieceFindFirst } = makePrisma({
      piece: {
        id: PIECE,
        storeId: STORE,
        cellId: null,
        assortmentKind: 'product',
        assortmentId: PRODUCT,
        length: dec('200'),
        whole: false,
        label: 'BLK-000041',
        status: 'active',
        store: { id: STORE, name: 'Ombor 07' },
        cell: null,
      },
    });
    await svc.lookup('acc-1', { code: 'blk-000041' });
    const where = stockPieceFindFirst.mock.calls[0]?.[0]?.where as { label: string };
    expect(where.label).toBe('BLK-000041');
  });
});

// ---------------------------------------------------------------------------

describe('bayroq (K-Q9 — K2 doirasidagi minimal enabler)', () => {
  it('bayroqni yoqadi', async () => {
    const { svc, productUpdate } = makePrisma();
    await svc.setFlag('acc-1', { assortmentId: PRODUCT, pieceTracked: true });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: PRODUCT },
      data: { pieceTracked: true },
      select: { id: true, pieceTracked: true },
    });
  });

  it('yo`q tovarda — 404', async () => {
    const { svc } = makePrisma({ product: null });
    await expect(
      svc.setFlag('acc-1', { assortmentId: PRODUCT, pieceTracked: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------

describe('list — doira va sverka', () => {
  it('faqat FAOL bo`laklar so`raladi', async () => {
    const { svc, client } = makePrisma();
    await svc.list('acc-1', { storeId: STORE, assortmentId: PRODUCT });
    const where = (client.stockPiece.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).toMatchObject({
      accountId: 'acc-1',
      storeId: STORE,
      assortmentId: PRODUCT,
      status: 'active',
    });
  });

  it('doira to`liq bo`lmasa — 400', async () => {
    const { svc } = makePrisma();
    await expect(svc.list('acc-1', { storeId: STORE })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bayroq holati javobda ko`rinadi (ekran ogohlantirishi uchun)', async () => {
    const { svc } = makePrisma({
      product: { id: PRODUCT, name: 'UzKabel', code: null, uom: 'м', pieceTracked: false },
      storeQty: '1220',
    });
    const out = await svc.list('acc-1', { storeId: STORE, assortmentId: PRODUCT });
    expect(out.product.pieceTracked).toBe(false);
    expect(out.view.totals.stockQty).toBe('1220');
  });

  it('qoldig`i yo`q tovarda ham javob beradi (`Stock` qatori yo`q)', async () => {
    const { svc } = makePrisma({ storeQty: null });
    const out = await svc.list('acc-1', { storeId: STORE, assortmentId: PRODUCT });
    expect(out.view.totals.stockQty).toBe('0');
    expect(out.view.cells).toEqual([]);
  });
});
