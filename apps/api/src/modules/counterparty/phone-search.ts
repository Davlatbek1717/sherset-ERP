/**
 * F9 — telefon bo'yicha qidiruv (sof modul, DB yo'q).
 *
 * 🔴 O'LCHANGAN HOLAT (2026-08-11, lokal `climart_adopt`):
 *   · `counterparties.phone` — `VarChar(20)`, **normalizatsiyalanmagan**
 *     (POS «yangi mijoz» maydoni erkin matn, hech kim `+998…` ni tozalamaydi);
 *   · `phone` ustunida indeks YO'Q (`pg_indexes`: name/inn/bank-account uchun
 *     bor, telefon uchun yo'q);
 *   · lokal bazada telefoni bor kontragent **0 ta** — ya'ni saqlanadigan
 *     formatni ma'lumot bilan asoslab bo'lmadi (hisobotda «o'lchanmagan»).
 *
 * Mavjud `?search=` `phone contains` qiladi. Kassir `901234567` deb yozsa,
 * bazada `+998 90 123 45 67` turgan mijoz TOPILMAYDI — aynan shu bo'shliq
 * yopiladi: ikkala tomon ham raqamga keltiriladi.
 *
 * NEGA SQL indeksiz: to'g'ri yechim — normalizatsiyalangan ustun + indeks,
 * u esa migratsiya talab qiladi (bu to'lqinda TAQIQ). Shuning uchun skan
 * IKKI TOMONLAMA cheklangan: (a) so'rov `isPhoneQuery` dan o'tsagina yuradi,
 * (b) natija `LIMIT` bilan kesiladi. Qarz — hisobotda.
 */

/**
 * Skan yuguradigan eng qisqa raqam ketma-ketligi.
 *
 * 4 raqam O'zbek raqamlarida deyarli har mijozga mos kelardi (oxirgi to'rtlik
 * takrorlanadi) — ya'ni butun bazani qaytarib, qidiruvni foydasiz qilardi.
 */
export const PHONE_MIN_DIGITS = 5;

/**
 * Eng uzun qabul qilinadigan raqam ketma-ketligi.
 *
 * `phone` ustuni `VarChar(20)`; undan uzun so'rov hech qachon mos kela
 * olmaydi, lekin SQL argumentini cheksiz uzaytirardi.
 */
export const PHONE_MAX_DIGITS = 20;

/** Telefon yozuvida uchraydigan ajratgichlar — ular raqamni buzmaydi. */
const SEPARATORS = /[\s+\-().]/g;

/** Faqat raqamlarni qoldiradi: `+998 (90) 123-45-67` → `998901234567`. */
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * So'rov telefon qidiruvimi.
 *
 * Shart ataylab qattiq: ajratgichlar olib tashlangandan keyin **faqat
 * raqam** qolishi va uzunlik chegaraga tushishi kerak. `«Alisher 90»` yoki
 * `«QRZ-00012»` telefon emas — ular uchun qimmat skan yugurmasligi kerak.
 */
export function isPhoneQuery(raw: string): boolean {
  const stripped = raw.replace(SEPARATORS, '');
  if (stripped.length === 0) return false;
  if (!/^\d+$/.test(stripped)) return false;
  return stripped.length >= PHONE_MIN_DIGITS && stripped.length <= PHONE_MAX_DIGITS;
}
