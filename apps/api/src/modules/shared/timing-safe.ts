import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Sirlarni doimiy-vaqtda (constant-time) solishtiradi.
 *
 * Faza 21 (`INT-01` HIGH, `INT-14` LOW — audit 2026-08-08). Oddiy `===`
 * birinchi farqli baytda to'xtaydi ⇒ javob vaqti orqali sirni baytma-bayt
 * topish mumkin (timing-oracle). Ochiq, guard'siz endpointlarda (Payme/Click
 * to'lov callback'lari, Telegram inbound webhook) bu standart talab.
 *
 * Ikkala tomon avval SHA-256 digestiga o'tkaziladi. Bu ikki narsani beradi:
 *   1. Digest doim 32 bayt ⇒ uzunliklar farq qilsa ham `timingSafeEqual`
 *      THROW qilmaydi (xom Buffer'da u yiqiladi, shuning uchun kod odatda
 *      oldindan `a.length !== b.length` erta-qaytish qo'yadi — bu esa
 *      uzunlik-oracle qoldiradi).
 *   2. Kirish uzunligi javob vaqtiga ta'sir qilmaydi.
 *
 * FAIL-CLOSED: bo'sh/mavjud bo'lmagan (`undefined` / `null` / `''`) tomon
 * HECH QACHON mos kelmaydi — sozlanmagan sir «hamma o'tadi» degani emas.
 * (Eski `payme.protocol.ts` da `'' === ''` aynan shu teshikni ochib turardi.)
 */
export function secretEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}
