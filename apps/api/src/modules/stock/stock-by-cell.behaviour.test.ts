import { describe, expect, it, vi } from 'vitest';
import { StockService } from './stock.service.js';
import type { StockDelta } from './stock.service.js';

/**
 * Per-cell stock (Адресное хранение) — XULQ testlari.
 *
 * NIMA UCHUN ALOHIDA FAYL: yonidagi `stock-by-cell.test.ts` — MANBA-SKAN testi
 * (`stock.service.ts` MATNINI regex bilan tekshiradi). U kodda naqsh borligini
 * isbotlaydi, lekin qoldiq MATEMATIKASI to'g'riligini emas — ya'ni raqamlar
 * buzilsa ham yashil qolaveradi. 2026-07-29 runtime tekshiruvi shu bo'shliqni
 * ochdi: yacheyka mantiqi jonli bazada to'g'ri ishlarkan, lekin doimiy suitеda
 * uni hech narsa qo'riqlamayotgan edi.
 *
 * Bu yerda HAQIQIY `applyDeltas` soxta `tx` bilan chaqiriladi va uning
 * `stockByCell` ga qanday YOZGANI o'lchanadi. DB kerak emas ⇒ CI'da yuradi.
 */

/** Prisma Decimal o'rniga — `.toString()` bo'lgan har narsa yetarli. */
const dec = (n: string | number) => ({ toString: () => String(n) }) as never;

interface CellRow {
  cellId: string;
  qty: { toString: () => string };
}

/**
 * `applyDeltas` chaqiradigan minimal tx: stockOperation.createMany,
 * stock.upsert, stockByCell.{upsert,findMany,update}. Yacheyka yozuvlari
 * `cells` massivida saqlanadi va har `update` unga qo'llanadi, shuning uchun
 * test oxirida haqiqiy qoldiqni o'qish mumkin.
 */
function makeTx(
  cells: CellRow[] = [],
  /** Tovarga biriktirilgan uy-yacheyka: `{ productId: cellName }`. */
  homeByProduct: Record<string, string> = {},
  /** «store-1» ombordagi yacheykalar: `{ cellName: cellId }`. */
  cellsByName: Record<string, string> = {},
) {
  const upserts: Array<{ cellId: string; qty: string }> = [];
  const updates: Array<{ cellId: string; decrement: string }> = [];
  const store: Array<{ storeId: string; qty: string }> = [];

  const tx = {
    stockOperation: { createMany: vi.fn(async () => ({ count: 0 })) },
    // Uy-yacheyka qidiruvi (resolveHomeCells) shu ikkitasini o'qiydi.
    product: {
      findMany: vi.fn(async () =>
        Object.entries(homeByProduct).map(([id, name]) => ({
          id,
          attributes: { __yacheyka: name },
        })),
      ),
    },
    storeCell: {
      findMany: vi.fn(async () =>
        Object.entries(cellsByName).map(([name, id]) => ({ id, name, storeId: 'store-1' })),
      ),
    },
    stock: {
      upsert: vi.fn(async (args: { create: { storeId: string }; update: unknown }) => {
        store.push({ storeId: args.create.storeId, qty: JSON.stringify(args.update) });
        return {};
      }),
    },
    stockByCell: {
      upsert: vi.fn(
        async (args: { where: Record<string, { cellId: string }>; create: { qty: unknown } }) => {
          const key = Object.values(args.where)[0];
          upserts.push({ cellId: key.cellId, qty: String(args.create.qty) });
          return {};
        },
      ),
      findMany: vi.fn(async () => cells),
      update: vi.fn(
        async (args: {
          where: Record<string, { cellId: string }>;
          data: { qty: { decrement: unknown } };
        }) => {
          const key = Object.values(args.where)[0];
          const dcr = String(args.data.qty.decrement);
          updates.push({ cellId: key.cellId, decrement: dcr });
          const row = cells.find((c) => c.cellId === key.cellId);
          if (row) {
            const left = Number(row.qty.toString()) - Number(dcr);
            row.qty = { toString: () => String(left) };
          }
          return {};
        },
      ),
    },
  };
  return { tx, upserts, updates, store, cells };
}

// Konstruktor faqat PrismaService oladi; applyDeltas esa `tx` ni PARAMETR
// sifatida qabul qiladi, ya'ni servis maydonidagi client ishlatilmaydi.
const svc = new StockService({ client: {} } as never);

const delta = (over: Partial<StockDelta> & Pick<StockDelta, 'qtyDelta'>): StockDelta =>
  ({
    storeId: 'store-1',
    assortmentKind: 'product',
    assortmentId: 'prod-1',
    docType: 'enter',
    docId: 'doc-1',
    reason: 'post',
    cellId: null,
    ...over,
  }) as StockDelta;

describe("applyDeltas — yacheyka qoldig'i (XULQ, manba-skan emas)", () => {
  it("yacheyka KO'RSATILGAN kirim → o'sha yacheykaga yoziladi", async () => {
    const { tx, upserts, updates } = makeTx();
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('10'), cellId: 'cell-A' }),
    ]);
    expect(upserts).toEqual([{ cellId: 'cell-A', qty: '10' }]);
    expect(updates).toEqual([]); // avtomat-ayirish ishlamasin
  });

  it("yacheyka KO'RSATILGAN chiqim → o'sha yacheykadan ayiriladi (avtomat-ayirishsiz)", async () => {
    const { tx, upserts, updates } = makeTx([{ cellId: 'cell-A', qty: dec('10') }]);
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('-3'), cellId: 'cell-A' }),
    ]);
    expect(upserts).toEqual([{ cellId: 'cell-A', qty: '-3' }]);
    expect(updates).toEqual([]);
  });

  it("yacheykasiz KIRIM + uy-yacheykasi YO'Q → hech qaysi yacheykaga tegmaydi", async () => {
    const { tx, upserts, updates } = makeTx([{ cellId: 'cell-A', qty: dec('5') }]);
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('7'), cellId: null }),
    ]);
    expect(upserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("yacheykasiz KIRIM + uy-yacheykasi BOR → o'sha yacheykaga tushadi (2026-07-29)", async () => {
    const { tx, upserts } = makeTx([], { 'prod-1': 'A-01' }, { 'A-01': 'cell-home' });
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('7'), cellId: null }),
    ]);
    expect(upserts).toEqual([{ cellId: 'cell-home', qty: '7' }]);
  });

  it("uy-yacheykasi BOSHQA omborda bo'lsa — joylashtirilmaydi", async () => {
    // storeCell.findMany faqat storeId='store-1' beradi; delta boshqa omborga.
    const { tx, upserts } = makeTx([], { 'prod-1': 'A-01' }, { 'A-01': 'cell-home' });
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('7'), cellId: null, storeId: 'store-2' }),
    ]);
    expect(upserts).toEqual([]);
  });

  it("uy-yacheykasi bor bo'lsa ham CHIQIM avtomat-ayirish yo'lida qoladi", async () => {
    const { tx, upserts, updates } = makeTx(
      [{ cellId: 'cell-A', qty: dec('9') }],
      { 'prod-1': 'A-01' },
      { 'A-01': 'cell-home' },
    );
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('-4'), cellId: null }),
    ]);
    expect(upserts).toEqual([]);
    expect(updates).toEqual([{ cellId: 'cell-A', decrement: '4' }]);
  });

  it("KO'RSATILGAN yacheyka uy-yacheykasidan USTUN", async () => {
    const { tx, upserts } = makeTx([], { 'prod-1': 'A-01' }, { 'A-01': 'cell-home' });
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('7'), cellId: 'cell-explicit' }),
    ]);
    expect(upserts).toEqual([{ cellId: 'cell-explicit', qty: '7' }]);
  });

  it("yacheykasiz CHIQIM → ENG TO'LA yacheykadan boshlab ayiriladi", async () => {
    const { tx, updates, cells } = makeTx([
      { cellId: 'cell-small', qty: dec('2') },
      { cellId: 'cell-big', qty: dec('9') },
    ]);
    // findMany qty desc bo'yicha qaytaradi — servis shu tartibga tayanadi.
    cells.sort((a, b) => Number(b.qty.toString()) - Number(a.qty.toString()));
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('-5'), cellId: null }),
    ]);
    expect(updates).toEqual([{ cellId: 'cell-big', decrement: '5' }]);
    expect(Number(cells.find((c) => c.cellId === 'cell-big')?.qty.toString())).toBe(4);
    expect(Number(cells.find((c) => c.cellId === 'cell-small')?.qty.toString())).toBe(2);
  });

  it("yacheykasiz CHIQIM bir yacheykadan oshsa — keyingisiga o'tadi", async () => {
    const { tx, updates } = makeTx([
      { cellId: 'cell-big', qty: dec('4') },
      { cellId: 'cell-small', qty: dec('3') },
    ]);
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('-6'), cellId: null }),
    ]);
    expect(updates).toEqual([
      { cellId: 'cell-big', decrement: '4' },
      { cellId: 'cell-small', decrement: '2' },
    ]);
  });

  it("yacheyka MANFIYga tushmaydi — bor miqdordan ortig'i olinmaydi", async () => {
    const { tx, updates, cells } = makeTx([{ cellId: 'cell-A', qty: dec('3') }]);
    // 10 talab, yacheykada 3 bor: faqat 3 olinadi, qolgani yacheykasiz qoldiq.
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('-10'), cellId: null }),
    ]);
    expect(updates).toEqual([{ cellId: 'cell-A', decrement: '3' }]);
    expect(Number(cells[0].qty.toString())).toBe(0);
  });

  it("yacheykalar bo'sh bo'lsa — chiqim yiqilmaydi, shunchaki ombor darajasida qoladi", async () => {
    const { tx, updates } = makeTx([]);
    await expect(
      svc.applyDeltas(tx as never, 'acc', 'user', [delta({ qtyDelta: dec('-4'), cellId: null })]),
    ).resolves.toBeUndefined();
    expect(updates).toEqual([]);
  });

  it("kasrli miqdor aniq ayiriladi (6 kasr — float drift yo'q)", async () => {
    const { tx, updates } = makeTx([{ cellId: 'cell-A', qty: dec('1.000003') }]);
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('-0.000002'), cellId: null }),
    ]);
    expect(updates).toEqual([{ cellId: 'cell-A', decrement: '0.000002' }]);
  });

  it('nol delta hech narsa yozmaydi', async () => {
    const { tx, upserts, updates } = makeTx([{ cellId: 'cell-A', qty: dec('5') }]);
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('0'), cellId: null }),
    ]);
    expect(upserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('bir nechta delta mustaqil ishlanadi', async () => {
    const { tx, upserts, updates } = makeTx([{ cellId: 'cell-A', qty: dec('8') }]);
    await svc.applyDeltas(tx as never, 'acc', 'user', [
      delta({ qtyDelta: dec('4'), cellId: 'cell-B' }),
      delta({ qtyDelta: dec('-3'), cellId: null }),
    ]);
    expect(upserts).toEqual([{ cellId: 'cell-B', qty: '4' }]);
    expect(updates).toEqual([{ cellId: 'cell-A', decrement: '3' }]);
  });
});
