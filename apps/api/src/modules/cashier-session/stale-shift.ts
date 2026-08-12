/**
 * P4 — «UNUTILGAN SMENA» himoyasi (sof modul).
 *
 * ## Nima uchun bor
 * Prodda (2026-08-12 o'lchovi) uchta smena ochiq edi va **hech biri hech qachon
 * yopilmagan**; bittasi 11 kundan beri ochiq turardi. Ochiq smena — kassa
 * hisobining ochiq og'zi: kutilgan naqd o'sib boradi, sanoq bo'lmaydi, farq
 * akti yozilmaydi, menejer navbatiga hech nima tushmaydi. Kassir buni ekranda
 * KO'RMASDI — «smena ochiq» yorlig'i ochilgan lahzadagidek yashil turardi.
 *
 * ## 🔴 Avto-yopish YO'Q (egasi qarori, 2026-08-12)
 * Bu modul faqat YOSHNI o'lchaydi va ogohlantiradi. Smenani sanoqsiz yopish
 * kassaga «kutilgan» summani haqiqat sifatida yozib qo'yardi — pul sanalmagan
 * bo'lsa, farq ham o'lchanmagan bo'ladi (`data-quality-flag-layer` intizomi:
 * o'lchanmagan ≠ nol).
 *
 * ## Sof
 * Baza yo'q, soat yo'q — `now` chaqiruvchidan kiradi. Test soatni o'zi
 * boshqaradi, `vi.useFakeTimers` shart emas.
 *
 * ## Yorliq emas, INSTANT
 * Bu yerdagi butun arifmetika ikki instant ORASIDAGI farq — kalendar
 * yorlig'i («qaysi kun») emas. Shuning uchun vaqt mintaqasi umuman
 * qatnashmaydi (`month-bounds-label-vs-instant` tuzog'i shu bilan chetlanadi).
 */

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export interface ShiftAgeInput {
  readonly openedAt: Date;
  readonly now: Date;
  /**
   * Chegara (soat). `null` = ogohlantirish o'chirilgan — YOSH baribir
   * o'lchanadi va ekranda ko'rinadi, faqat «eskirgan» bayrog'i qo'yilmaydi.
   */
  readonly warnHours: number | null;
}

export interface ShiftAge {
  /** Ochilganidan beri o'tgan to'liq daqiqa. Hech qachon manfiy emas. */
  readonly openMinutes: number;
  /** Amaldagi chegara (soat) yoki `null` (o'chirilgan). */
  readonly warnHours: number | null;
  /** `openMinutes >= warnHours × 60`. Chegara `null` bo'lsa doim `false`. */
  readonly stale: boolean;
}

/**
 * Smena yoshi.
 *
 * Manfiy farq (server/DB soati orqaga siljigan yoki kelajakdagi `openedAt`)
 * **0 ga qisiladi**: manfiy «yosh» ekranda «-3 soat» bo'lib chiqardi va
 * `stale` ni ham jimgina o'chirardi.
 */
export function describeShiftAge({ openedAt, now, warnHours }: ShiftAgeInput): ShiftAge {
  const deltaMs = now.getTime() - openedAt.getTime();
  const openMinutes = Number.isFinite(deltaMs)
    ? Math.max(0, Math.floor(deltaMs / MS_PER_MINUTE))
    : 0;
  const stale = warnHours != null && warnHours > 0 && openMinutes >= warnHours * MINUTES_PER_HOUR;
  return { openMinutes, warnHours, stale };
}

/**
 * Insonga o'qiladigan davomiylik (o'zbekcha, server xabarlari uchun).
 *
 * `2 kun 3 soat` · `5 soat 20 daqiqa` · `12 daqiqa` · `0 daqiqa`.
 * Eng katta ikki birlik — «11 kun 4 soat 37 daqiqa» xabarni uzaytiradi,
 * qaror uchun esa hech nima qo'shmaydi.
 */
export function formatShiftAge(openMinutes: number): string {
  const total = Math.max(0, Math.floor(openMinutes));
  const days = Math.floor(total / MINUTES_PER_DAY);
  const hours = Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const minutes = total % MINUTES_PER_HOUR;
  if (days > 0) return hours > 0 ? `${days} kun ${hours} soat` : `${days} kun`;
  if (hours > 0) return minutes > 0 ? `${hours} soat ${minutes} daqiqa` : `${hours} soat`;
  return `${minutes} daqiqa`;
}

/**
 * «Allaqachon ochiq smena bor» xabari.
 *
 * Ilgari ikki joyda ikki xil va MA'LUMOTSIZ edi:
 *   · `CashierSessionService.open()` → `Cashier already has an open session: <uuid>. Close it first.`
 *   · `SmenaService.openSessionFromSmena()` → `Allaqachon ochiq smena mavjud`
 * Ikkalasi ham kassirga NIMA qilishni aytmasdi: qaysi smena, qachondan beri,
 * kim yopadi. Endi ikkala yo'l ham shu funksiyani chaqiradi — bitta matn.
 */
export function formatOpenShiftConflict(args: {
  readonly age: ShiftAge;
  readonly sessionId: string;
  readonly sessionName?: string | null;
}): string {
  const label = args.sessionName?.trim() ? args.sessionName.trim() : args.sessionId;
  const age = formatShiftAge(args.age.openMinutes);
  const stale = args.age.stale ? ' Bu smena juda uzoq ochiq turgan — naqdni sanab yoping.' : '';
  return (
    `Sizda allaqachon ochiq smena bor: ${label} (${age} dan beri ochiq). ` +
    `Yangi smena ochishdan oldin uni yoping — naqdni sanab, farq bo'lsa izoh yozib.${stale}`
  );
}
