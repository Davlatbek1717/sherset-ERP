import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StockPieceAvailabilityService } from './stock-piece-availability.service.js';

/**
 * K3 — kassir ko'rinishi servisining WIRING qulfi.
 *
 * Uch da'vo:
 *   1. servis FAQAT O'QIYDI (K1 sverkasi bilan bir intizom);
 *   2. bayroq O'CHIQ tovarda reyestrga so'rov UMUMAN ketmaydi va javob bo'sh —
 *      «bayroq o'chiq tovarlarda kassa ekrani MUTLAQO o'zgarmaydi» qabul
 *      mezonining server tomoni;
 *   3. BRAK ombori (G3 `__brakStore`, G4 E4) bo'laklari kassirga KO'RINMAYDI —
 *      aks holda kassir mijozga sotib bo'lmaydigan tovarni va'da qilardi.
 */

const ACC = 'acc-1';
const PRODUCT = '11111111-1111-4111-8111-111111111111';
const STORE = '22222222-2222-4222-8222-222222222222';
const BRAK = '33333333-3333-4333-8333-333333333333';

const dec = (v: string) => ({ toString: () => v });

interface Rows {
  product?: unknown;
  pieces?: unknown[];
}

function makeSvc(rows: Rows = {}) {
  const productFindFirst = vi
    .fn()
    .mockResolvedValue(
      rows.product === undefined
        ? { id: PRODUCT, name: 'UzKabel VVG 2x2.5', code: 'K-1', uom: 'м', pieceTracked: true }
        : rows.product,
    );
  const pieceFindMany = vi.fn().mockResolvedValue(rows.pieces ?? []);
  const client = {
    product: { findFirst: productFindFirst, findMany: vi.fn(), update: vi.fn() },
    stockPiece: {
      findMany: pieceFindMany,
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  };
  return {
    svc: new StockPieceAvailabilityService({ client } as never),
    productFindFirst,
    pieceFindMany,
    client,
  };
}

function pieceRow(
  id: string,
  length: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    storeId: STORE,
    cellId: null,
    length: dec(length),
    whole: false,
    label: `BLK-00000${id}`,
    status: 'active',
    store: { id: STORE, name: 'Ombor 02', attributes: {} },
    cell: null,
    ...over,
  };
}

describe('StockPieceAvailabilityService — faqat o`qish', () => {
  it('yozish metodlarini UMUMAN chaqirmaydi', async () => {
    const { svc, client } = makeSvc({ pieces: [pieceRow('1', '250')] });
    await svc.availability(ACC, { assortmentId: PRODUCT, quantity: '100' });

    expect(client.stockPiece.create).not.toHaveBeenCalled();
    expect(client.stockPiece.createMany).not.toHaveBeenCalled();
    expect(client.stockPiece.update).not.toHaveBeenCalled();
    expect(client.stockPiece.updateMany).not.toHaveBeenCalled();
    expect(client.stockPiece.delete).not.toHaveBeenCalled();
    expect(client.product.update).not.toHaveBeenCalled();
    expect(client.$executeRaw).not.toHaveBeenCalled();
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('faqat FAOL bo`laklar so`raladi (consumed qoldiqda ham yo`q)', async () => {
    const { svc, pieceFindMany } = makeSvc();
    await svc.availability(ACC, { assortmentId: PRODUCT });
    expect(pieceFindMany.mock.calls[0][0].where.status).toBe('active');
  });

  it('ombor filtri so`rovga tushadi (kassir bitta ombor kesimini so`rasa)', async () => {
    const { svc, pieceFindMany } = makeSvc();
    await svc.availability(ACC, { assortmentId: PRODUCT, storeId: STORE });
    expect(pieceFindMany.mock.calls[0][0].where.storeId).toBe(STORE);
  });

  it('ombor berilmasa — HAMMA ombor (K-Q5: kassir hammasini ko`radi)', async () => {
    const { svc, pieceFindMany } = makeSvc();
    await svc.availability(ACC, { assortmentId: PRODUCT });
    expect(pieceFindMany.mock.calls[0][0].where.storeId).toBeUndefined();
  });
});

describe('bayroq O`CHIQ — reyestr umuman o`qilmaydi', () => {
  it('javob bo`sh va `stockPiece.findMany` CHAQIRILMAYDI', async () => {
    const { svc, pieceFindMany } = makeSvc({
      product: { id: PRODUCT, name: 'Oddiy tovar', code: null, uom: 'шт', pieceTracked: false },
    });
    const res = await svc.availability(ACC, { assortmentId: PRODUCT, quantity: '180' });

    expect(pieceFindMany).not.toHaveBeenCalled();
    expect(res.product.pieceTracked).toBe(false);
    expect(res.stores).toEqual([]);
    expect(res.composition.activePieces).toBe(0);
    expect(res.offer.verdict).toBe('no-registry');
  });
});

describe('🔴 BRAK ombori — kassirga KO`RINMAYDI (E4)', () => {
  it('brak bo`lagi na tarkibga, na taklifga kiradi', async () => {
    const { svc } = makeSvc({
      pieces: [
        pieceRow('1', '100'),
        pieceRow('2', '250', {
          storeId: BRAK,
          store: { id: BRAK, name: 'BRAK', attributes: { __brakStore: true } },
        }),
      ],
    });
    const res = await svc.availability(ACC, { assortmentId: PRODUCT, quantity: '180' });

    expect(res.composition.registryQty).toBe('100');
    expect(res.stores.map((s) => s.storeId)).toEqual([STORE]);
    // BRAK dagi 250 hisobga olinsa hukm `single` bo'lardi — u KIRMAYDI.
    expect(res.offer.verdict).toBe('not-enough');
    expect(res.offer.missing).toBe('80');
  });
});

describe('ombor kesimi va umumiy tarkib', () => {
  it('har ombor o`z tarkibi bilan, umumiysi ustida', async () => {
    const OTHER = '44444444-4444-4444-8444-444444444444';
    const { svc } = makeSvc({
      pieces: [
        pieceRow('1', '250', { whole: true, label: null }),
        pieceRow('2', '150', {
          storeId: OTHER,
          store: { id: OTHER, name: 'Ombor 01', attributes: {} },
          cellId: 'c1',
          cell: { name: '01-02-03-04' },
        }),
      ],
    });
    const res = await svc.availability(ACC, { assortmentId: PRODUCT, quantity: '120' });

    expect(res.composition.registryQty).toBe('400');
    expect(res.composition.longest).toBe('250');
    // Omborlar NOM bo'yicha tartiblangan.
    expect(res.stores.map((s) => s.storeName)).toEqual(['Ombor 01', 'Ombor 02']);
    const o01 = res.stores.find((s) => s.storeId === OTHER);
    expect(o01?.composition.pieces[0]?.cellName).toBe('01-02-03-04');
    // 120 m: 150 lik yolg'iz qoplaydi (250 dan kichik ⇒ eng kichigi).
    expect(res.offer.verdict).toBe('single');
    expect(res.offer.single?.length).toBe('150');
  });
});

describe('kirish tekshiruvi', () => {
  it('tovar topilmasa 404', async () => {
    const { svc } = makeSvc({ product: null });
    await expect(svc.availability(ACC, { assortmentId: PRODUCT })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('`assortmentId` UUID bo`lmasa 400', async () => {
    const { svc } = makeSvc();
    await expect(svc.availability(ACC, { assortmentId: 'yo`q' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('miqdor manfiy/buzuq bo`lsa 400 (jimgina 0 ga tushmaydi)', async () => {
    const { svc } = makeSvc();
    await expect(
      svc.availability(ACC, { assortmentId: PRODUCT, quantity: '-5' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('miqdor berilmasa — tarkib qaytadi, hukm `no-registry`', async () => {
    const { svc } = makeSvc({ pieces: [pieceRow('1', '250')] });
    const res = await svc.availability(ACC, { assortmentId: PRODUCT });
    expect(res.composition.registryQty).toBe('250');
    expect(res.offer.verdict).toBe('no-registry');
  });
});
