/**
 * Eskirgan kun tuzatmasi — «tuzatuvchi qator» qoidalari (menejer KPI TZ §3.4).
 *
 * MUAMMO. Kun qabul qilinadi → oylikka kiradi → **to'lanadi**. Keyin manba
 * hujjat o'zgaradi (chek tahrirlandi, qaytarish kiritildi) → kun `eskirgan`
 * bo'lib navbatga qaytadi → menejer uni qayta qabul qiladi. Agar oylik
 * shunchaki «qabul qilingan kunlar yig'indisi»ni qayta hisoblasa, **allaqachon
 * to'langan iyul raqami jimgina o'zgaradi** — buxgalter uni tushuntira olmaydi
 * va xodim «oyligim kamayib qoldi» deydi.
 *
 * YECHIM (TZ §3.4): to'langan raqam **qayta yozilmaydi**. Qabul lahzasidagi
 * fakt MUZLATILADI, qayta qabulda esa faqat **FARQ** alohida qator bo'lib
 * yoziladi va u **tuzatma sanasi** tushgan oyga kiradi.
 *
 * Sof modul: bu qaror pul haqida va uni sinash uchun DB kerak bo'lmasligi
 * kerak. Servis faqat Prisma-I/O.
 */

/** Bir kunning oylikka ta'sir qiluvchi fakti (tiyin). */
export interface CorrectionInput {
  /** Oldingi qabulda MUZLATILGAN fakt. `null` = kun ilgari qabul qilinmagan. */
  previousMinor: bigint | null;
  /** Hozirgi qabulda muzlatilayotgan fakt. */
  nextMinor: bigint;
}

export interface CorrectionPlan {
  previousMinor: bigint;
  nextMinor: bigint;
  /** `next − previous`. Manfiy = xodimga ortiqcha to'langan. */
  diffMinor: bigint;
  /** 'increase' | 'decrease' — hisobotlar shu bo'yicha filtrlaydi. */
  direction: CorrectionDirection;
}

export const CORRECTION_DIRECTION = {
  increase: 'increase',
  decrease: 'decrease',
} as const;

export type CorrectionDirection = (typeof CORRECTION_DIRECTION)[keyof typeof CORRECTION_DIRECTION];

/**
 * Tuzatuvchi qator kerakmi.
 *
 * `null` uch holatda qaytadi va uchalasi ham TO'G'RI:
 *   1. **Kun ilgari qabul qilinmagan** (`previousMinor === null`) — bu birinchi
 *      qabul, tuzatiladigan hech narsa yo'q. Bu yerda 0 deb olish har birinchi
 *      qabulga soxta «+N tuzatma» qatorini yozardi.
 *   2. **Fakt o'zgarmagan** — kun eskirgan bo'lsa ham (masalan hujjatning
 *      boshqa maydoni tahrirlangan), pul o'zgarmagan bo'lsa tuzatma yo'q.
 *   3. Ikkalasi ham nol.
 */
export function planCorrection(input: CorrectionInput): CorrectionPlan | null {
  if (input.previousMinor === null) return null;
  const diffMinor = input.nextMinor - input.previousMinor;
  if (diffMinor === 0n) return null;
  return {
    previousMinor: input.previousMinor,
    nextMinor: input.nextMinor,
    diffMinor,
    direction: diffMinor > 0n ? CORRECTION_DIRECTION.increase : CORRECTION_DIRECTION.decrease,
  };
}

// ── Oylikka qo'shilish ───────────────────────────────────────────────────────

export interface CorrectionRow {
  diffMinor: bigint;
  direction: string;
}

export interface CorrectionSummary {
  /** Tuzatmalar sof yig'indisi (musbat va manfiy birga). */
  netMinor: bigint;
  /** Qo'shimcha to'lov summasi. */
  increaseMinor: bigint;
  /** Ushlanma summasi (musbat son sifatida — buxgalter shunday o'qiydi). */
  decreaseMinor: bigint;
  count: number;
}

/**
 * Davr tuzatmalarining xulosasi.
 *
 * `increase` va `decrease` ALOHIDA: «sof −50 000» degan bitta raqam
 * buxgalterga yetarli emas — u qo'shimcha to'lov va ushlanmani hujjatda
 * alohida ko'rsatishi kerak. `decrease` **musbat** son sifatida qaytadi,
 * chunki hujjatda u «ushlandi: 50 000» deb yoziladi, «−50 000» deb emas.
 */
export function summarizeCorrections(rows: ReadonlyArray<CorrectionRow>): CorrectionSummary {
  let increaseMinor = 0n;
  let decreaseMinor = 0n;
  for (const r of rows) {
    if (r.diffMinor > 0n) increaseMinor += r.diffMinor;
    else decreaseMinor += -r.diffMinor;
  }
  return {
    netMinor: increaseMinor - decreaseMinor,
    increaseMinor,
    decreaseMinor,
    count: rows.length,
  };
}

/**
 * Tuzatma QAYSI oyga tushadi.
 *
 * ⚠️ **Kun sanasi bo'yicha EMAS, tuzatma sanasi bo'yicha.** Iyul kunining
 * avgustda topilgan xatosi **avgust** oyligiga kiradi: iyul allaqachon
 * to'langan va yopilgan, uni qayta ochish buxgalteriya nuqtai nazaridan
 * yangi hujjat talab qiladi. Aynan shuning uchun bu «tuzatuvchi qator»,
 * «qayta hisob» emas.
 */
export function correctionPeriod(correctedAt: Date): string {
  const y = correctedAt.getFullYear();
  const m = String(correctedAt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
