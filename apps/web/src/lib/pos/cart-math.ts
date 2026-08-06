/**
 * POS savat matematikasi — sof funksiyalar (kassa TZ §5, B8 texnik qarzi).
 *
 * NEGA ALOHIDA FAYL: bu qoidalar `sotuv/page.tsx` (2000+ satr) ichida
 * yashaganda ularni sinash uchun butun POS ekranini render qilish kerak
 * bo'lardi — shuning uchun ular umuman sinalmagan edi. Pul hisobi esa
 * aynan sinalishi shart bo'lgan joy.
 *
 * Hamma summa **tiyin**da va `bigint`: `number` 2^53 dan keyin yaxlitlaydi
 * va bu chekда jimgina noto'g'ri jami beradi.
 */

/** Savat qatoridan hisob uchun kerakli minimal. */
export interface CartLineLike {
  quantity: number;
  priceMinor: bigint;
}

/** Savatdagi jami dona soni. */
export function cartCount(lines: ReadonlyArray<{ quantity: number }>): number {
  let n = 0;
  for (const l of lines) n += l.quantity;
  return n;
}

/** Chegirmasiz jami (tiyin). */
export function cartTotalMinor(lines: ReadonlyArray<CartLineLike>): bigint {
  let sum = 0n;
  for (const l of lines) sum += l.priceMinor * BigInt(l.quantity);
  return sum;
}

/**
 * Chek darajasidagi foiz chegirmasi.
 *
 * ⚠️ Yaxlitlash **pastga** (bigint bo'linishi) — ya'ni chegirma bir tiyinga
 * KAM bo'lishi mumkin. Bu ataylab: yuqoriga yaxlitlash mijozga har chekda
 * bir tiyin ortiqcha berardi va smena yakunida kamomad ko'rinardi.
 *
 * `percent` chegaradan tashqarida bo'lsa (0..100) — qisiladi: manfiy
 * chegirma «ustama» bo'lib qolardi, 100 dan katta esa manfiy jami berardi.
 */
export function applyDiscountMinor(totalMinor: bigint, percent: number): bigint {
  if (!Number.isFinite(percent) || percent <= 0) return totalMinor;
  const p = BigInt(Math.min(Math.floor(percent), 100));
  return totalMinor - (totalMinor * p) / 100n;
}

/**
 * Tiyin-satr → `bigint`, «berilmagan» holatini `null` sifatida SAQLAB.
 *
 * Ataylab `?? 0n` EMAS: nol tan narx «bu bizga tekin tushgan» degani va
 * 100% marja beradi — savat aynan shu yolg'on raqamni ko'rsatmaslik uchun
 * bor (kassa TZ §5.3).
 */
export function toMinorOrNull(value: string | null | undefined): bigint | null {
  if (value == null || value === '') return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Foyda bazasi — kassa HAQIQATAN oladigan pul.
 *
 * Mavjud chekni to'layotgan bo'lsak (omborchidan qaytgan «Tayyor» chek)
 * bu serverning o'z `sumMinor`i, qayta hisoblangan raqam EMAS: server
 * qator-ba-qator yaxlitlagan, biz esa jamiga foiz qo'llaymiz — ikkalasi
 * tiyinda farq qilishi mumkin va chekda ko'rinadigan raqam serverniki
 * bo'lishi kerak.
 */
export function revenueBaseMinor(
  postedSaleSumMinor: bigint | null | undefined,
  discountedTotalMinor: bigint,
): bigint {
  return postedSaleSumMinor ?? discountedTotalMinor;
}
