import { describe, expect, it, vi } from 'vitest';
import { ProductRepository } from './product.repository.js';

/**
 * K6/2 (K-Q9) — birligi «m» bo'lgan YANGI tovarda «Bo'lak hisobi yuritilsin»
 * bayrog'i YOQILGAN holda keladi.
 *
 * Egasining sababi: «jim ishlamaslikdan ko'ra shovqinli ishlamaslik yaxshi —
 * bayroq yoqilgan bo'lsa ortiqchaligi birinchi kunda bilinadi; o'chiq bo'lsa
 * kerakligi mijoz ketib qolganda bilinadi».
 *
 * 🔴 Bu jonli XULQqa tegadi: bayrog'i yoqilgan tovarda kassa taqsimoti
 * boshqacha ishlaydi (K3 ning 7.1 istisnosi). Shuning uchun uch da'vo
 * qulflanadi:
 *   1. «m» → yoqilgan, «шт» → o'chiq;
 *   2. QAROR MUHRLANMAYDI (`piece_tracked_decided_at` yozilmaydi) ⇒ tovar
 *      «Hal qilinmagan» ro'yxatida ko'rinadi (K6/3);
 *   3. bayroq FOYDALANUVCHI KIRITMASIDAN olinmaydi — `product.update`
 *      ruxsati bo'lgan har kim kassa taqsimotini o'zgartira olmasin.
 */

const baseInput = {
  name: 'UzKabel VVG 2x2.5',
  code: '00001',
  barcodes: [],
  barcodeTypes: [],
} as unknown as Parameters<ProductRepository['create']>[2];

function makeRepo(cloneSource?: Record<string, unknown>) {
  const create = vi.fn().mockResolvedValue({ id: 'p-new' });
  const findFirst = vi.fn().mockResolvedValue(cloneSource ?? null);
  const client = { product: { create, findFirst } };
  const repo = new ProductRepository({ client } as never, {} as never);
  return { repo, create };
}

describe('K6/2 — yangi tovarning bayrog`i birlikdan chiqadi', () => {
  it('birligi «м» — bayroq YOQILGAN', async () => {
    const { repo, create } = makeRepo();
    await repo.create('acc-1', 'emp-1', { ...baseInput, uom: 'м' });
    expect(create.mock.calls[0]?.[0]?.data?.pieceTracked).toBe(true);
  });

  it('lotin «m» va «Metr» ham — YOQILGAN (klaviatura farqi)', async () => {
    for (const uom of ['m', 'Metr', ' М ']) {
      const { repo, create } = makeRepo();
      await repo.create('acc-1', 'emp-1', { ...baseInput, uom });
      expect(create.mock.calls[0]?.[0]?.data?.pieceTracked, uom).toBe(true);
    }
  });

  it('birligi «шт» / «мм» / bo`sh — bayroq O`CHIQ', async () => {
    for (const uom of ['шт', 'мм', '', null, undefined]) {
      const { repo, create } = makeRepo();
      await repo.create('acc-1', 'emp-1', { ...baseInput, uom } as never);
      expect(create.mock.calls[0]?.[0]?.data?.pieceTracked, String(uom)).toBe(false);
    }
  });

  it('🔴 QAROR MUHRLANMAYDI — tovar «Hal qilinmagan» ro`yxatida qoladi', async () => {
    const { repo, create } = makeRepo();
    await repo.create('acc-1', 'emp-1', { ...baseInput, uom: 'м' });
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data.pieceTrackedDecidedAt).toBeUndefined();
    expect(data.pieceTrackedDecidedById).toBeUndefined();
  });

  it('🔴 bayroq foydalanuvchi kiritmasidan OLINMAYDI', async () => {
    // `pieceTracked` sxemada (`CreateProductSchema`) YO'Q va shunday qolishi
    // kerak: uni o'zgartirish `piecetracking.update` ruxsatini talab
    // qiladigan alohida yo'l (`POST /stock-pieces/flag`).
    const { repo, create } = makeRepo();
    await repo.create('acc-1', 'emp-1', {
      ...baseInput,
      uom: 'шт',
      pieceTracked: true,
    } as never);
    expect(create.mock.calls[0]?.[0]?.data?.pieceTracked).toBe(false);
  });
});

describe('K6/2 — NUSXA ham yangi nomenklatura', () => {
  it('bayroq manbadan ko`chirilmaydi, birlikdan qayta hisoblanadi', async () => {
    // Manbada bayroq O'CHIQ, lekin birligi «м» ⇒ nusxada YOQILGAN.
    const { repo, create } = makeRepo({
      id: 'src',
      name: 'Kabel',
      uom: 'м',
      pieceTracked: false,
      pieceTrackedDecidedAt: new Date(),
      packs: [],
      salePrices: null,
      attributes: null,
      barcodes: [],
      barcodeTypes: [],
    });
    await repo.clone('acc-1', 'emp-1', 'src');
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data.pieceTracked).toBe(true);
    // Manbaning QARORI ham ko'chmaydi — nusxa ro'yxatdan o'tishi kerak.
    expect(data.pieceTrackedDecidedAt).toBeUndefined();
  });
});
