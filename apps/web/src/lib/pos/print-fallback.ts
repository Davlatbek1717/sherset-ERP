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
  | 'popup';

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
 * 🔴 «Printer sozlanmagan» qavati BUTUNLAY YO'Q (2026-08-16 da oxirgisi ham
 * olib tashlandi). Uchala chek ham printer biriktirilmagan bo'lsa qurilmaning
 * Windows sukut printeriga bosiladi, ya'ni chop zanjiri uzilsa bu HAR DOIM
 * yo haqiqiy xato (`error`), yo yuklash muammosi (`popup`) — sozlama emas.
 * Ilgari bu yerda `no-printer-mapped → configure-printer` shoxi turardi va
 * yig'ish varag'ini «avval sozlang» ogohlantirishi bilan to'xtatardi: prodda
 * `sklad_keepers` 0 qator edi, ya'ni chek hech qachon chiqmasdi.
 */
export function printFollowUp(
  outcome: { handled: boolean; ok: boolean; reason?: PrintIdleReason },
  opts: { inShell: boolean },
): PrintFollowUp {
  if (outcome.handled) return outcome.ok ? 'none' : 'error';
  // Qobiqda `handled:false` ning YAGONA sababi — hujjat yuklanmadi
  // (`checkPrintAgent()` qobiqda doim `true`). Popup sahifasi AYNI so'rovni
  // qaytaradi, ya'ni u ham yiqiladi: kassirga bo'sh oyna emas, sabab kerak.
  if (opts.inShell) return 'error';
  return 'popup';
}
