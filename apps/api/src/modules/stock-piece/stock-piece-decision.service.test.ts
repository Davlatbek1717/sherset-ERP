import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StockPieceDecisionService } from './stock-piece-decision.service.js';

/**
 * K6/3 — «Hal qilinmagan» ro'yxati servisining WIRING qulfi.
 *
 * Ikki da'vo eng muhim:
 *   1. servis FAQAT O'QIYDI (qarorni `setFlag` yozadi — muhr bitta joyda);
 *   2. birlik mezoni SQL da EMAS, `isMeterUom` da — ya'ni «М», «m», «Metr»
 *      deb yozilgan tovarlar JIMGINA ro'yxatdan tushib qolmaydi.
 */

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';

interface Row {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  pieceTracked: boolean;
  pieceTrackedDecidedAt: Date | null;
}

function make(products: Row[], pieceGroups: Array<{ assortmentId: string; count: number }> = []) {
  const productFindMany = vi.fn().mockResolvedValue(products);
  const stockPieceGroupBy = vi
    .fn()
    .mockResolvedValue(
      pieceGroups.map((g) => ({ assortmentId: g.assortmentId, _count: { _all: g.count } })),
    );
  const client = {
    product: { findMany: productFindMany },
    stockPiece: { groupBy: stockPieceGroupBy },
  };
  return {
    svc: new StockPieceDecisionService({ client } as never),
    productFindMany,
    stockPieceGroupBy,
  };
}

const row = (over: Partial<Row> = {}): Row => ({
  id: P1,
  name: 'Kabel VVG',
  code: 'K-1',
  uom: 'м',
  pieceTracked: false,
  pieceTrackedDecidedAt: null,
  ...over,
});

describe('K6/3 — servis FAQAT O`QIYDI', () => {
  it('manba matnida birorta yozish yo`li YO`Q', () => {
    const src = StockPieceDecisionService.prototype.pending.toString();
    expect(src).not.toMatch(/\.(create|update|delete|upsert|createMany|updateMany)\(/);
    expect(src).not.toMatch(/executeRaw/);
  });

  it('fake klientda faqat `findMany` va `groupBy` bor — yozuvga urinsa TypeError', async () => {
    const { svc } = make([row()]);
    await expect(svc.pending('acc-1', {})).resolves.toBeDefined();
  });
});

describe('K6/3 — ro`yxatga tushish mezoni', () => {
  it('so`rov faqat QAROR QILINMAGAN kesimini oladi', async () => {
    const { svc, productFindMany } = make([row()]);
    await svc.pending('acc-1', {});
    const where = productFindMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      accountId: 'acc-1',
      deletedAt: null,
      pieceTrackedDecidedAt: null,
    });
  });

  it('🔴 birlik SQL da filtrlanmaydi — «М» va «Metr» ham tushadi', async () => {
    const { svc, productFindMany } = make([
      row({ id: P1, uom: 'М', name: 'A' }),
      row({ id: P2, uom: 'Metr', name: 'B' }),
    ]);
    const out = await svc.pending('acc-1', {});

    // SQL tomonida `uom` sharti UMUMAN yo'q (registr tuzog'i).
    expect(productFindMany.mock.calls[0]?.[0]?.where.uom).toBeUndefined();
    expect(out.rows.map((r) => r.id)).toEqual([P1, P2]);
  });

  it('birligi «шт» bo`lgan tovar ro`yxatga TUSHMAYDI', async () => {
    const { svc } = make([row({ uom: 'шт' })]);
    const out = await svc.pending('acc-1', {});
    expect(out.rows).toEqual([]);
  });

  it('🔴 birligi boshqa, lekin REYESTRDA bo`lagi bor — tushadi (ikkinchi shox)', async () => {
    // K1 sverkasidagi `pieces-without-flag` ogohlantirishining jufti: uni
    // yopadigan tugma shu ro'yxatda bo'lishi kerak.
    const { svc } = make(
      [row({ id: P3, uom: 'шт', name: 'Shlang' })],
      [{ assortmentId: P3, count: 5 }],
    );
    const out = await svc.pending('acc-1', {});
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.activePieces).toBe(5);
  });

  it('reyestr so`rovi faqat FAOL va `product` turidagi bo`laklarni sanaydi', async () => {
    const { svc, stockPieceGroupBy } = make([row()]);
    await svc.pending('acc-1', {});
    expect(stockPieceGroupBy.mock.calls[0]?.[0]?.where).toEqual({
      accountId: 'acc-1',
      status: 'active',
      assortmentKind: 'product',
    });
  });
});

describe('K6/3 — qidiruv va chegara', () => {
  it('qidiruv nom va kod bo`yicha, registr farqsiz', async () => {
    const { svc } = make([
      row({ id: P1, name: 'Kabel VVG', code: 'K-1' }),
      row({ id: P2, name: 'Sim', code: 'S-9' }),
    ]);
    expect((await svc.pending('acc-1', { search: 'kabel' })).rows.map((r) => r.id)).toEqual([P1]);
    expect((await svc.pending('acc-1', { search: 's-9' })).rows.map((r) => r.id)).toEqual([P2]);
  });

  it('chegara javobda ko`rinadi', async () => {
    const { svc } = make([row({ id: P1, name: 'A' }), row({ id: P2, name: 'B' })]);
    const out = await svc.pending('acc-1', { limit: 1 });
    expect(out.rows).toHaveLength(1);
    expect(out.truncated).toBe(1);
  });

  it('katalog skani chegaraga urilmasa `scanTruncated` — false', async () => {
    const { svc } = make([row()]);
    expect((await svc.pending('acc-1', {})).scanTruncated).toBe(false);
  });

  it('noto`g`ri `limit` — 400', async () => {
    const { svc } = make([]);
    await expect(svc.pending('acc-1', { limit: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.pending('acc-1', { limit: 5000 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
