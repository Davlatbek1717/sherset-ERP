import type { PrintIdleReason } from '../print-agent';

/**
 * Chop natijasidan keyin NIMA qilish kerakligi — sof qaror (P7).
 *
 * Ikki chaqiruvchi joy bor (chek va Z-hisobot), uchinchisi yacheykali chek;
 * ilgari har biri o'zi `if (!outcome.handled) window.open(...)` yozardi.
 * Qaror bitta joyga chiqarilgani uchun «qobiqda popup ochmaslik» qoidasi
 * uchalasida ham bir vaqtda amal qiladi va sinovdan o'tadi.
 */
export type PrintFollowUp =
  /** Chop bo'ldi — hech narsa qilinmaydi. */
  | 'none'
  /** Chop qilishga urinildi, lekin printer/drayver rad etdi — xato ko'rsatiladi. */
  | 'error'
  /** Brauzer chop sahifasi (`?auto=1`) ochiladi. */
  | 'popup'
  /** Omborga printer biriktirilmagan — kassirga manzilli ogohlantirish (popup EMAS). */
  | 'configure-printer';

/**
 * @param outcome `printReceiptViaAgent` / `printZReportViaAgent` /
 *   `printPickingViaAgent` natijasi.
 * @param opts.inShell Electron qobiq ichidamizmi (`hasNativePrinting()`).
 *
 * 🔴 Qobiq ichida popup — CHALG'ITUVCHI: `?auto=1` sahifasi `window.print()`
 * chaqiradi va Chromium TASDIQ oynasini chiqaradi, ya'ni «exe chekni o'zi
 * chiqarsin» maqsadining teskarisi. Shuning uchun sozlama muammosi bo'lsa
 * qobiqda popup o'rniga ogohlantirish beriladi. Oddiy brauzerda esa popup —
 * YAGONA chop yo'li, o'zgarmaydi.
 *
 * Sozlama bo'shlig'i endi YAGONA: `no-printer-mapped` (ombor→printer, yig'ish
 * varag'i). Mijoz cheki va Z-hisobotda «printer sozlanmagan» holati YO'Q — ular
 * qurilmaning Windows sukut printeriga bosiladi (desktop v1.4.0+), ya'ni ular
 * uzilsa bu haqiqiy xato (`error`) yoki yuklash muammosi (`popup`), sozlama
 * emas.
 */
export function printFollowUp(
  outcome: { handled: boolean; ok: boolean; reason?: PrintIdleReason },
  opts: { inShell: boolean },
): PrintFollowUp {
  if (outcome.handled) return outcome.ok ? 'none' : 'error';
  if (opts.inShell && outcome.reason === 'no-printer-mapped') return 'configure-printer';
  return 'popup';
}
