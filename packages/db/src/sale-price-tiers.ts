/**
 * MoySklad narx qavatlarini akkauntning `PriceType` larига bog'lash —
 * `Product.salePrices` JSON'i uchun YAGONA manba.
 *
 * NEGA BOR (P12, 2026-08-12 da o'lchandi): ikkala import yo'li ham
 * (`scripts/ops-import-products.ts` va `prisma/seed-real.ts`) har bir qavatni
 * AYNI default tur id'si bilan muhrlardi:
 *
 *   r.salePrices.map((p) => ({ priceTypeId: defaultPtId, value }))   // ← bug
 *
 * Natijada «Оптовая цена» ham `default` turi bilan yozilar, optom narxni
 * o'qiydigan `resolveWholesaleMinor` esa optom TURINI qidiradi va topmasdi.
 * Prod o'lchovi: 4905 tovardan **3960 tasida optom narx yo'q** (81%) — POS'dagi
 * «optomdan past» sariq ogohlantirishi katalogning aksariyatida o'lik edi.
 *
 * Ikki import yo'li bitta funksiyani chaqiradi: ilgari mantiq nusxa edi va
 * «biri o'zgarsa qolgani jimgina eskiradi» klassiga tushardi.
 */

/** MoySklad `/entity/product` javobidagi narx qatori. */
export interface MsSalePrice {
  value?: number;
  priceType?: { name?: string };
}

/** Akkauntning narx turi — POZITSIYA tartibida (birinchisi default). */
export interface AccountPriceType {
  id: string;
  name: string;
}

/** `Product.salePrices` da saqlanadigan shakl (qiymat — minor birlik SATRI). */
export interface SalePriceTier {
  priceTypeId: string;
  value: string;
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Har MoySklad qavatini o'z turiga bog'laydi: avval NOM bo'yicha, nom
 * topilmasa TARTIB bo'yicha (MoySklad qavatlarni akkaunt tartibida beradi).
 *
 * Shartnomalar:
 *  · akkauntda mos tur bo'lmasa qavat TASHLAB ketiladi — «ortiqcha» qavatni
 *    default turga quyish aynan tuzatilayotgan bug (chakana narx almashinardi);
 *  · bitta turga ikki qavat tushsa BIRINCHISI qoladi — o'quvchilar
 *    (`resolveBasePriceMinor`) birinchi mosni oladi, dublikat esa jim
 *    noaniqlik demakdir;
 *  · narx yo'q bo'lsa bo'sh ro'yxat — 0 TO'QILMAYDI (NULL ≠ 0).
 */
export function mapSalePriceTiers(
  msPrices: ReadonlyArray<MsSalePrice> | undefined | null,
  priceTypes: ReadonlyArray<AccountPriceType>,
): SalePriceTier[] {
  if (!msPrices || msPrices.length === 0 || priceTypes.length === 0) return [];
  const byName = new Map(priceTypes.map((t) => [norm(t.name), t.id]));
  const used = new Set<string>();
  const out: SalePriceTier[] = [];

  msPrices.forEach((p, index) => {
    const typeId = byName.get(norm(p.priceType?.name)) ?? priceTypes[index]?.id;
    if (!typeId || used.has(typeId)) return;
    used.add(typeId);
    out.push({ priceTypeId: typeId, value: String(Math.round(p.value ?? 0)) });
  });

  return out;
}
