/**
 * Qabul/xarid hujjati qatorining sukut narxi.
 *
 * Bu hujjatlarda qator narxi = TAN NARX: «Сохранить цены» uni
 * `PATCH /products/:id { buyPrice }` bilan tovar kartasiga yozadi va post
 * paytida u partiyaning `costMinor` iga aylanadi. Shuning uchun sotuv
 * narxlari (`salePrices`) bu yerda MANBA EMAS — ilgari `supplies` qatorini
 * chakana narx bilan to'ldirar va o'sha son tan narx sifatida saqlanardi
 * (2026-08-23 auditi; egasining qarori — tan narx).
 *
 * Tan narx yo'q bo'lsa `'0'` qaytadi: «narx hali ma'lum emas» holati
 * sotuv narxi bilan TO'LDIRILMAYDI — foydalanuvchi o'zi kiritadi.
 */
export function purchaseLinePriceMinor(
  // `salePrices` ataylab imzoda turibdi-yu, O'QILMAYDI: chaqiruvchi to'liq
  // tovar obyektini uzatadi va bu yerda sotuv narxi manba EMASligi tipdan
  // ko'rinib tursin.
  raw: { buyPrice?: string | null; salePrices?: unknown } | null | undefined,
): string {
  return raw?.buyPrice ?? '0';
}
