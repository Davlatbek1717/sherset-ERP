/**
 * Yacheyka nomini SEGMENT DIAPAZONIGA solishtirish — sof funksiya, DBsiz.
 *
 * Nom tuzilishi (egasi 2026-07-30): `ombor-polka-qator-yacheyka`, har biri
 * 2 xonali raqam, nol bilan to'ldirilgan — masalan `01-02-03-04`.
 *
 * NIMA UCHUN KERAK: chop etish oynasi omborning BARCHA yacheykalarini ro'yxat
 * qilib beradi va ularni belgilab tanlash mumkin edi. 400 ta yacheyka uchun bu
 * amalda ishlamaydi. Shu funksiya diapazon bo'yicha bir bosishda belgilashga
 * imkon beradi.
 *
 * ⚠️ Bu YARATISH mantig'i emas — u backend'dagi `cell-range.util.ts` da va
 * faqat o'sha yerda. Bu yerdagi ish teskari: MAVJUD nomlarni filtrlash.
 * Ikkalasi bir xil nom shaklini nazarda tutadi, lekin bir-birini takrorlamaydi.
 */

/** Yopiq (inclusive) diapazon. `null` ⇒ bu segment cheklanmagan. */
export interface SegmentRange {
  from: number;
  to: number;
}

/**
 * `01-02-03-04` → `[1, 2, 3, 4]`.
 * Segment soni kutilganidan farq qilsa yoki biror segment raqam bo'lmasa —
 * `null` (bunday nomlar hech qanday diapazonga tushmaydi).
 */
export function parseCellName(name: string, segments: number): number[] | null {
  const parts = name.trim().split('-');
  if (parts.length !== segments) return null;
  const out: number[] = [];
  for (const p of parts) {
    const t = p.trim();
    // Faqat raqamlar; bo'sh yoki harfli segment → mos emas.
    if (t === '' || !/^\d+$/.test(t)) return null;
    out.push(Number(t));
  }
  return out;
}

/**
 * Nom berilgan diapazonlarga tushadimi.
 *
 * `ranges` uzunligi kutilgan segment soniga teng; har element `null` bo'lsa
 * o'sha segment cheklanmagan («hammasi»).
 */
export function cellNameInRange(name: string, ranges: Array<SegmentRange | null>): boolean {
  const nums = parseCellName(name, ranges.length);
  if (!nums) return false;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (!r) continue;
    const n = nums[i];
    if (n === undefined || n < r.from || n > r.to) return false;
  }
  return true;
}

/**
 * Diapazonga tushadigan yacheykalarni ajratib beradi — chop etish oynasi shu
 * ro'yxatni belgilaydi.
 */
export function filterCellsByRange<T extends { name: string }>(
  cells: readonly T[],
  ranges: Array<SegmentRange | null>,
): T[] {
  return cells.filter((c) => cellNameInRange(c.name, ranges));
}
