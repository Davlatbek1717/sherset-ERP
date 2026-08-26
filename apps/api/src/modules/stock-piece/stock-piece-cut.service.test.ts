import { readFileSync } from 'node:fs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StockPieceCutService } from './stock-piece-cut.service.js';

/**
 * K4 — kesim servisining WIRING qulfi.
 *
 * Eng muhim da'vo birinchi testda: **kesim STOK-NEYTRAL** — bu servis
 * `Stock`/`StockByCell` ga hech qachon yozmaydi. 250 m «180 + 70» bo'ladi,
 * jami o'sha 250; qoldiq faqat to'lovda kamayadi (K-reja 2-bo'lim).
 * 2026-08-24 da savdo aynan qoldiq mexanizmiga tegilgani uchun 46 daqiqa
 * to'xtagan edi.
 */

const ACC = 'acc-1';
const SALE = 'sale-1';
const POS = 'pos-1';
const SRC = 'piece-src';

const dec = (v: string) => ({ toString: () => v }) as unknown as never;

function makeTx(
  overrides: { maxLabel?: string | null; source?: unknown; pieces?: unknown[] } = {},
) {
  const create = vi.fn().mockResolvedValue({ id: 'piece-new' });
  const createMany = vi.fn().mockResolvedValue({ count: 0 });
  const update = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findMany = vi.fn().mockResolvedValue(overrides.pieces ?? []);
  const findFirst = vi
    .fn()
    .mockImplementation(async (args: { select?: Record<string, unknown> }) => {
      if (args.select && Object.keys(args.select).length === 1 && 'label' in args.select) {
        return overrides.maxLabel === undefined ? null : { label: overrides.maxLabel };
      }
      return overrides.source === undefined
        ? {
            id: SRC,
            storeId: 'store-1',
            cellId: 'cell-1',
            assortmentKind: 'product',
            assortmentId: 'prod-1',
            length: dec('250'),
            whole: false,
            label: 'BLK-000001',
            status: 'active',
            reservedPositionId: null,
          }
        : overrides.source;
    });

  const tx = {
    stockPiece: { create, createMany, update, updateMany, findMany, findFirst },
  } as never;

  return { tx, create, createMany, update, updateMany, findMany, findFirst };
}

describe('K4 — kesim servisi QOLDIQQA tegmaydi', () => {
  it('🔴 manbada `stock`/`stockByCell` yozuv metodlari UMUMAN yo`q', () => {
    // Fake klientda ular berilmagan ⇒ chaqirilsa test yiqilardi. Ikkinchi
    // qavat — manba matnining o'zi (K1/K2 testlaridagi naqsh).
    const src = readFileSync(new URL('./stock-piece-cut.service.ts', import.meta.url), 'utf8');
    for (const forbidden of [
      'stock.create',
      'stock.update',
      'stock.upsert',
      'stockByCell.create',
      'stockByCell.update',
      'stockByCell.upsert',
      'stockByCell.delete',
      'executeRaw',
      'applyDeltas',
    ]) {
      expect(src.includes(forbidden)).toBe(false);
    }
  });

  it('kesim: manba `consumed`, mijoz bo`lagi BAND, qolganlari bola sifatida', async () => {
    const svc = new StockPieceCutService();
    const { tx, create, createMany, update } = makeTx();
    const source = await svc.findSource(tx, ACC, { pieceId: SRC });

    const res = await svc.cut(tx, {
      accountId: ACC,
      source,
      cutLength: '180',
      saleId: SALE,
      positionId: POS,
      startSeq: 41,
    });

    expect(res.rule).toBe('cut');
    expect(res.labels).toEqual(['BLK-000041', 'BLK-000042']);

    // Mijoz bo'lagi — BAND (chek qatoriga biriktirilgan) va manbaga bog'langan.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          length: '180',
          label: 'BLK-000041',
          reservedSaleId: SALE,
          reservedPositionId: POS,
          sourcePieceId: SRC,
          status: 'active',
          // Yacheyka MANBADAN meros: bo'lak jismonan o'sha javonda qoladi.
          cellId: 'cell-1',
        }),
      }),
    );

    // Qoldiq — omborda, BAND EMAS.
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          length: '70',
          label: 'BLK-000042',
          reservedSaleId: null,
          reservedPositionId: null,
        }),
      ],
    });

    // Manba reyestrdan chiqadi (jismonan endi mavjud emas — bolalarga bo'lindi).
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SRC },
        data: expect.objectContaining({ status: 'consumed' }),
      }),
    );
  });

  it("`take-whole`: hech narsa yaratilmaydi, manbaning O'ZI band qilinadi", async () => {
    const svc = new StockPieceCutService();
    const { tx, create, createMany, update } = makeTx();
    const source = await svc.findSource(tx, ACC, { pieceId: SRC });

    const res = await svc.cut(tx, {
      accountId: ACC,
      source,
      cutLength: '250',
      saleId: SALE,
      positionId: POS,
      startSeq: 1,
    });

    expect(res.rule).toBe('take-whole');
    expect(res.customerPieceId).toBe(SRC);
    expect(res.labels).toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: SRC },
      data: { reservedSaleId: SALE, reservedPositionId: POS },
    });
  });

  it('chiqindi va kesim yo`qotishi `consumed` qator bo`lib YOZILADI (izsiz yo`qolmaydi)', async () => {
    const svc = new StockPieceCutService();
    const { tx, createMany } = makeTx();
    const source = await svc.findSource(tx, ACC, { pieceId: SRC });

    await svc.cut(tx, {
      accountId: ACC,
      source,
      cutLength: '180',
      remainingLength: '0.5', // 1 m dan kalta ⇒ chiqindi, ustiga 69,5 yo'qotish
      saleId: SALE,
      positionId: POS,
      startSeq: 1,
    });

    const rows = createMany.mock.calls[0]?.[0]?.data as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      expect.objectContaining({ length: '0.5', status: 'consumed', consumedReason: 'scrap' }),
      expect.objectContaining({ length: '69.5', status: 'consumed', consumedReason: 'cut-loss' }),
    ]);
    // Zanjir: 180 + 0,5 + 69,5 = 250 (manba). Sverkadagi farq shu bilan
    // TUSHUNTIRILADI — sababsiz kamayish bo'lmaydi.
  });

  it('yorliq bo`yicha topish: `BLK-` makonidan tashqarisi RAD etiladi (7.3)', async () => {
    const svc = new StockPieceCutService();
    const { tx, findFirst } = makeTx();
    await expect(svc.findSource(tx, ACC, { label: '4780123456789' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Tovar shtrixi bilan reyestrga so'rov UMUMAN ketmaydi.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('topilmagan bo`lak — 404 (jimgina boshqasi tanlanmaydi)', async () => {
    const svc = new StockPieceCutService();
    const { tx } = makeTx({ source: null });
    await expect(svc.findSource(tx, ACC, { label: 'BLK-000041' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("to'lovda: bo'laklar `sold` bo'ladi", async () => {
    const svc = new StockPieceCutService();
    const { tx, updateMany } = makeTx({
      pieces: [
        { id: 'a', reservedPositionId: POS, length: dec('150'), status: 'active' },
        { id: 'b', reservedPositionId: POS, length: dec('30'), status: 'active' },
      ],
    });

    const res = await svc.consumeForSale(tx, ACC, [{ id: POS, quantity: '180' }]);
    expect(res.mismatches).toEqual([]);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: expect.objectContaining({ status: 'consumed', consumedReason: 'sold' }),
    });
  });

  it("bo'lagi yo'q chekda to'lov yo'lida HECH NARSA qilinmaydi", async () => {
    const svc = new StockPieceCutService();
    const { tx, updateMany } = makeTx({ pieces: [] });
    const res = await svc.consumeForSale(tx, ACC, [{ id: POS, quantity: '180' }]);
    expect(res).toEqual({ consumed: 0, mismatches: [] });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("🔴 bekor qilishda bo'lak OMBORDA QOLADI — faqat bog'lanish uziladi", async () => {
    const svc = new StockPieceCutService();
    const { tx, updateMany } = makeTx();
    await svc.releaseSale(tx, ACC, SALE);
    // `status` TEGILMAYDI: kesilgan kabelni qaytarib ulab bo'lmaydi, u
    // yorlig'i bilan javonda turaveradi va ertaga boshqa mijozga ketadi.
    const call = updateMany.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(call.data).toEqual({ reservedSaleId: null, reservedPositionId: null });
    expect(call.data.status).toBeUndefined();
  });

  it('yorliq ketma-ketligi eng katta yorliqdan davom etadi', async () => {
    const svc = new StockPieceCutService();
    const { tx } = makeTx({ maxLabel: 'BLK-000120' });
    expect(await svc.nextSeq(tx, ACC)).toBe(121);

    const empty = makeTx({ maxLabel: null });
    expect(await svc.nextSeq(empty.tx, ACC)).toBe(1);
  });
});
