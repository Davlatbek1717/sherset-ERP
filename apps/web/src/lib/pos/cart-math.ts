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

import { computePositionTotal } from '@moysklad/money';

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

/** Qator-darajasidagi chegirmasi bor savat qatori (retail POS). */
export interface DiscountedCartLine {
  /** Miqdor — son yoki Decimal(20,6) satri. */
  quantity: number | string;
  /** Bir dona narxi (tiyin). */
  priceMinor: bigint;
  /** Qator chegirmasi, foiz 0..100 (4 kasr xonagacha). */
  discount: number | string;
}

/**
 * Bitta savat qatorining jami (tiyin) — **server formulasi bilan bir xil**.
 *
 * FE-01: ilgari retail POS `BigInt(Math.round(qty * Number(priceMinor) *
 * (1 - discount / 100)))` hisoblardi. Bu IEEE-754 float; server esa
 * `computePositionTotal` (BigInt fixed-point, half-up) bilan qayta hisoblab
 * `expectedSumMinor` bilan QAT'IY tenglikni tekshiradi va farq bo'lsa chekni
 * RAD ETADI. Misol: 115 tiyin × 1, −10% → float 103, server 104.
 *
 * Miqdor/foiz normalizatsiyadan o'tadi (`normalizeQtyDecimal`) — aks holda
 * eksponent ko'rinishdagi son (`1e-7`) `computePositionTotal` ichida
 * `BigInt()` bilan otilardi.
 */
export function discountedLineTotalMinor(line: DiscountedCartLine): bigint {
  return computePositionTotal(
    {
      quantity: normalizeQtyDecimal(String(line.quantity)),
      priceMinor: line.priceMinor.toString(),
      discount: normalizeDecimalString(String(line.discount), 4),
      vat: null,
    },
    false,
    false,
  ).totalMinor;
}

/**
 * Savat jami — qator-ba-qator (server ham aynan shunday: har qatorni
 * alohida yaxlitlab qo'shadi, jamiga bir marta emas).
 */
export function discountedCartTotalMinor(lines: ReadonlyArray<DiscountedCartLine>): bigint {
  let sum = 0n;
  for (const l of lines) sum += discountedLineTotalMinor(l);
  return sum;
}

/**
 * Decimal-satrni server sxemasi qabul qiladigan kanonik shaklga keltiradi.
 *
 * Buzuq/eksponent/bo'sh qiymat → `'0'`: `String(number)` chegaraviy
 * qiymatlarda `'1e-7'` beradi va server regexi (`^\d+(\.\d{1,N})?$`) uni
 * 400 bilan rad etadi — bu yerda u jimgina nolga aylanadi, chunki nol
 * miqdor keyingi filtrda tushib qoladi.
 */
function normalizeDecimalString(raw: string, maxDecimals: number): string {
  const s = raw.trim();
  if (!/^\d*(?:\.\d*)?$/.test(s) || s === '' || s === '.') return '0';
  const [intPart = '', fracPart = ''] = s.split('.');
  const int = intPart.replace(/^0+(?=\d)/, '') || '0';
  const frac = fracPart.slice(0, maxDecimals).replace(/0+$/, '');
  return frac === '' ? int : `${int}.${frac}`;
}

/** Miqdor-satr → server sxemasi (`Decimal(20,6)`) qabul qiladigan shakl. */
export function normalizeQtyDecimal(raw: string): string {
  return normalizeDecimalString(raw, 6);
}

/**
 * Qaytarish maydonining kiritmasini [0..maxQty] oralig'iga qisadi,
 * **satr sifatida**.
 *
 * FE-02: maydon `number` saqlaganda kassir kasr miqdor kirita OLMASDI —
 * «1.» yozilishi bilan `Number('1.')` = 1 bo'lib nuqta o'chib ketardi,
 * ya'ni og'irlik bilan sotilgan tovarni qisman qaytarib bo'lmasdi.
 * Shuning uchun yozilayotgan oraliq holat (`'1.'`, `''`) SAQLANADI va
 * faqat so'rov yuborishdan oldin normalizatsiya qilinadi.
 */
export function clampReturnQty(raw: string, maxQty: string): string {
  const s = raw.trim();
  if (s === '') return '';
  if (s.startsWith('-')) return '0';
  if (!/^\d*(?:\.\d*)?$/.test(s)) return '';
  const max = Number(maxQty);
  const n = Number(s === '.' ? '0' : s);
  if (!Number.isFinite(n) || !Number.isFinite(max)) return s;
  return n > max ? maxQty : s;
}

/** Qaytarish uchun asl chek qatoridan kerakli minimal. */
export interface RefundableLine {
  /** Asl sotilgan miqdor — Decimal(20,6) satri. */
  quantity: string;
  /** Asl qator summasi CHEGIRMADAN KEYIN (tiyin-satr) — server saqlagan raqam. */
  sumMinor: string;
  /** Qaytarilayotgan miqdor (maydon satr saqlaydi — FE-02). */
  returnQty: number | string;
}

/** Miqdor (satr yoki son) → mikro-birlik bigint. `BigInt(1.5)` otilishini yopadi. */
function qtyToMicro(qty: string | number): bigint {
  const n = typeof qty === 'number' ? qty : Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 1e6));
}

/**
 * Qaytariladigan naqd (tiyin) — asl chek qatorining CHEGIRMALI summasidan
 * proporsional.
 *
 * FE-01: ilgari `priceMinor × qty` hisoblanardi, ya'ni chegirma e'tiborsiz
 * qolardi va kassa mijoz to'lamagan pulni qaytarardi. Endi baza — server
 * saqlagan `sumMinor` (chegirma ichida).
 *
 * ⚠️ Yaxlitlash **pastga** — ataylab va server bilan bir xil
 * (`priceRefundFromOriginal`): FE ko'rsatgan summa server qabul qiladigan
 * chegaradan oshsa, so'rov 400 bilan rad etilardi.
 */
export function refundPayoutMinor(lines: ReadonlyArray<RefundableLine>): bigint {
  let sum = 0n;
  for (const l of lines) {
    const soldMicro = qtyToMicro(l.quantity);
    const backMicro = qtyToMicro(l.returnQty);
    if (soldMicro <= 0n || backMicro <= 0n) continue;
    sum += (BigInt(l.sumMinor) * backMicro) / soldMicro;
  }
  return sum;
}

/**
 * Chekning QARZ ulushi (tiyin) — `RetailSalePayment` qatorlaridan.
 *
 * Ilgari FE bu raqamni umuman bilmasdi: chek detali to'lov qatorlarini
 * qaytarmasdi. Natijada qarzga sotilgan chek POS'dan qaytarilmasdi (quyiga
 * qara). Qatorlar yo'q eski chek — 0, ya'ni to'liq pulli deb qaraladi
 * (aynan avvalgi xulq).
 */
export function saleDebtMinor(
  payments: ReadonlyArray<{ method: string; amountBaseMinor: string }> | null | undefined,
): bigint {
  let sum = 0n;
  for (const p of payments ?? []) {
    if (p.method !== 'DEBT') continue;
    try {
      sum += BigInt(p.amountBaseMinor);
    } catch {
      // Buzuq qiymat pul yaratmasin.
    }
  }
  return sum;
}

/**
 * Qaytarishda KASSADAN chiqadigan naqd ulushi (tiyin).
 *
 * AUDIT (2026-08-11): qarzga sotilgan chekni POS'dan qaytarib bo'lmasdi —
 * ekran har doim to'liq naqd so'rardi, server esa
 * `validateRefundSettlement` bilan «payout > moneyMaxMinor» deb 400 berardi.
 * Sabab oddiy: qarzga olingan tovar uchun kassa PUL OLMAGAN, uni naqd
 * qaytarish — kassadan pul yo'qotish (va qarz balansda qolaverardi).
 *
 * Formula serverning `computeRefundSettlementCaps` idagi `moneyCap` bilan
 * AYNAN bir xil: `⌊(sum − debt) × R / sum⌋`, yaxlitlash pastga. Qarz ulushi
 * ATAYLAB yuborilmaydi — server uni o'zi hisoblaydi (`debtReturnMinor`
 * berilmaganda auto-split), shunda ketma-ket qisman qaytarishlarda
 * yaxlitlash serverning kümülativ bazasidan ketadi va tiyin sürüklanmaydi.
 */
export function refundCashShareMinor(i: {
  /** Asl chek summasi (tiyin). */
  originalSumMinor: bigint;
  /** Shu chekning qarzga qoldirilgan qismi (tiyin). */
  originalDebtMinor: bigint;
  /** Hozir qaytarilayotgan qiymat (tiyin) — `refundPayoutMinor` natijasi. */
  refundSumMinor: bigint;
}): bigint {
  const sum = i.originalSumMinor > 0n ? i.originalSumMinor : 0n;
  if (sum === 0n) return 0n;
  // Buzuq/legacy ma'lumot (qarz jamidan katta) yo'qdan naqd YARATMASIN —
  // server ham aynan shu qisishni qiladi.
  const debt =
    i.originalDebtMinor < 0n ? 0n : i.originalDebtMinor > sum ? sum : i.originalDebtMinor;
  const money = sum - debt;
  const refunded = i.refundSumMinor < 0n ? 0n : i.refundSumMinor > sum ? sum : i.refundSumMinor;
  return (money * refunded) / sum;
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
