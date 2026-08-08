/**
 * Currency row → ALPHA (ISO 4217 harfli) kod. M-03 (Faza 16) yechimi.
 *
 * Tarixiy dard: sxema/seed ikki avlodda yashagan —
 *   - YANGI konventsiya (moysklad parity): `code` = NUMERIC ('860'),
 *     `isoCode` = ALPHA ('UZS');
 *   - ESKI/legacy qatorlar: `code` = ALPHA ('UZS'), `isoCode` bo'sh yoki
 *     NUMERIC ('840') — almashib qolgan.
 * Hujjatlar esa `currency` maydonida HAR DOIM ALPHA saqlaydi. Shu sabab
 * har qanday rate-lookup/CBU-matching ALPHA kod orqali bo'lishi shart —
 * bu helper qatorning qaysi avlodidan qat'i nazar ALPHA kodni topib beradi.
 *
 * Data-migratsiya (20260808 unify_rate_scale_e8_currency_isocode) legacy
 * qatorlarning isoCode'ini to'ldiradi, lekin runtime baribir ikkala
 * avlodga chidamli qoladi (prod drift ehtimoli — sherset-v2).
 */

const ALPHA_RE = /^[A-Za-z]{3}$/;

export function alphaCurrencyCode(row: {
  code: string;
  isoCode?: string | null;
}): string | null {
  if (row.isoCode && ALPHA_RE.test(row.isoCode)) return row.isoCode.toUpperCase();
  if (ALPHA_RE.test(row.code)) return row.code.toUpperCase();
  return null;
}
