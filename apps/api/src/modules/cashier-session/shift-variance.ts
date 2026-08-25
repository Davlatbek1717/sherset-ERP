/**
 * Smena farq akti va Z-hisobot qoidalari (kassa TZ §8.4 / §8.5).
 *
 * Sof modul — Prisma ham, soat ham yo'q. Bu yerdagi ikki qaror moliyaviy:
 * «farq aktga arziydimi» va «Z-hisobotdagi raqamlar qanday chiqadi».
 * Ikkalasi ham servis ichida yashasa, ularni sinash uchun butun DB
 * ko'tarish kerak bo'lardi.
 */

/** Farq turi. Manfiy = kassada pul YETMAYDI. */
export const VARIANCE_KIND = {
  shortage: 'shortage',
  surplus: 'surplus',
} as const;

export type VarianceKind = (typeof VARIANCE_KIND)[keyof typeof VARIANCE_KIND];

export interface VarianceInput {
  currency: string;
  expectedMinor: bigint;
  countedMinor: bigint;
}

export interface VarianceAct {
  currency: string;
  expectedMinor: bigint;
  countedMinor: bigint;
  varianceMinor: bigint;
  kind: VarianceKind;
}

/**
 * Farq aktini tayyorlaydi — farq bo'lmasa `null`.
 *
 * `null` qaytishi «akt yozilmaydi» degani: nol farq uchun akt yaratish
 * jurnalни ma'nosiz yozuvlar bilan to'ldirib, haqiqiy farqlarni ko'rinmas
 * qilardi (menejer «ko'rilmagan aktlar» ro'yxatini har kuni tozalashi
 * kerak bo'lardi).
 */
export function planVarianceAct(input: VarianceInput): VarianceAct | null {
  const varianceMinor = input.countedMinor - input.expectedMinor;
  if (varianceMinor === 0n) return null;
  return {
    currency: input.currency,
    expectedMinor: input.expectedMinor,
    countedMinor: input.countedMinor,
    varianceMinor,
    kind: varianceMinor < 0n ? VARIANCE_KIND.shortage : VARIANCE_KIND.surplus,
  };
}

/**
 * Bir necha valyutadagi sanoq → aktlar ro'yxati.
 *
 * USD farqi UZS'ga **o'girilmaydi** (§8.4): kurs bilan o'girish yo'qolgan
 * dollarni «taxminiy so'm»ga aylantirib, dalilni yo'qotardi. Har valyuta —
 * o'z akti, o'z sanoq birligida.
 */
export function planVarianceActs(inputs: ReadonlyArray<VarianceInput>): VarianceAct[] {
  const acts: VarianceAct[] = [];
  for (const i of inputs) {
    const act = planVarianceAct(i);
    if (act) acts.push(act);
  }
  return acts;
}

// ── Menejerga xabar ─────────────────────────────────────────────────────────

export interface VarianceMessageArgs {
  cashierName: string;
  cashDeskName?: string | null;
  closedAtLabel: string;
  acts: ReadonlyArray<VarianceAct>;
  /** Kassirning izohi — bo'lsa, xabarga kiradi. */
  cashierNote?: string | null;
}

/** Pul matni: tiyin → «12 345,67». Faqat xabar uchun, hisob emas. */
function fmt(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const s = abs.toString().padStart(3, '0');
  const int = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '−' : ''}${int},${s.slice(-2)}`;
}

/**
 * Menejerga boradigan xabar matni.
 *
 * Xabar «farq bor» deb emas, **QANCHA va QAYSI TOMONGA** deb boshlanadi:
 * menejer telefonida bir qatordan qaror qabul qiladi, ilovani ochmaydi.
 * Kamomad va ortiqcha ATAYLAB bir xil ko'rinmaydi — ortiqcha ham
 * muammo (chek o'tkazilmagan bo'lishi mumkin), lekin boshqa muammo.
 */
export function formatVarianceMessage(args: VarianceMessageArgs): string {
  const lines: string[] = [];
  const worst = args.acts.some((a) => a.kind === VARIANCE_KIND.shortage);
  lines.push(worst ? '🔴 KASSA KAMOMADI' : '🟡 KASSADA ORTIQCHA');
  lines.push(`Kassir: ${args.cashierName}`);
  if (args.cashDeskName) lines.push(`Kassa: ${args.cashDeskName}`);
  lines.push(`Yopildi: ${args.closedAtLabel}`);
  lines.push('');
  for (const a of args.acts) {
    const label = a.kind === VARIANCE_KIND.shortage ? 'kamomad' : 'ortiqcha';
    lines.push(
      `${a.currency}: ${label} ${fmt(a.varianceMinor)}` +
        ` (kutilgan ${fmt(a.expectedMinor)} · sanalgan ${fmt(a.countedMinor)})`,
    );
  }
  if (args.cashierNote) {
    lines.push('');
    lines.push(`Kassir izohi: ${args.cashierNote}`);
  }
  return lines.join('\n');
}

// ── Z-hisobot (§8.5) ────────────────────────────────────────────────────────

/** Hisob valyutasi — hisobotdagi barcha jamilar shu valyutada. */
const BASE_CURRENCY = 'UZS';

export interface ZReportRevenueRow {
  method: string;
  /** To'lov VALYUTASIDAGI summa (USD → sent). */
  sumMinor: bigint;
  /** Berilmasa — hisob valyutasi (so'm). */
  currency?: string;
  /**
   * So'mga o'girilgan qiymat. `null` = **kurs noma'lum** — bunday qator
   * jamiga QO'SHILMAYDI (Faza 17 konvertatsiya shartnomasi), lekin
   * yo'qolmaydi ham: `unconvertedByMethod` da ko'rinib turadi.
   */
  baseMinor?: bigint | null;
}

export interface ZReportInput {
  salesCount: number;
  /** To'lov turlari kesimida tushum. */
  revenueByMethod: ReadonlyArray<ZReportRevenueRow>;
  /** Yalpi foyda; noma'lum bo'lsa `null` (tan narx muzlatilmagan chek bor). */
  grossProfitMinor: bigint | null;
  discountMinor: bigint;
  creditSoldMinor: bigint;
  debtPaidMinor: bigint;
  returnsMinor: bigint;
  expenseMinor: bigint;
  collectionMinor: bigint;
  /** G1 — vozvratlar uchun mijozlarga kassadan qaytarilgan naqd (§8.5 qatori). */
  returnPayoutMinor: bigint;
  /**
   * A1 — mijozlardan qabul qilingan AVANS (§8.5 qatori). Berilmasa 0.
   *
   * ⚠️ **Kutilgan naqdga ALOHIDA qo'shilmaydi.** Pul yashiqqa
   * `RetailDrawerCashIn` hujjati bilan kirgan, ya'ni `expectedCashMinor`
   * formulasidagi `drawerInMinor` uni ALLAQACHON o'z ichiga oladi. Bu
   * qator faqat KO'RINISH uchun: «yashiqdagi naqdning qanchasi mijoz
   * puli edi». Uni jamiga qo'shish avansni IKKI MARTA sanardi.
   */
  prepayMinor?: bigint;
  expectedCashMinor: bigint;
  countedCashMinor: bigint | null;
  /** Dollar yashiq — sentda (MK31 · §8.4). Berilmasa 0. */
  expectedUsdCashMinor?: bigint;
  /** Kassir sanagan dollar; `null` = hali sanalmagan (0 EMAS). */
  countedUsdCashMinor?: bigint | null;
}

export interface ZReport extends ZReportInput {
  /** Faqat so'mga o'girilgan qatorlar yig'indisi. */
  revenueMinor: bigint;
  /**
   * Kursi noma'lumligi sababli jamiga KIRMAGAN qatorlar. Bo'sh ro'yxat —
   * «hammasi hisobga olindi» degan halol javob; jimgina tashlab yuborilsa,
   * hisobot to'liq ko'rinib turib kam raqam ko'rsatardi.
   */
  unconvertedByMethod: Array<{ method: string; sumMinor: bigint; currency: string }>;
  /** O'rtacha chek; cheksiz smenada `null` (0 ga bo'lish emas). */
  averageReceiptMinor: bigint | null;
  varianceMinor: bigint | null;
  /** A1 — avans qatori; kirishda berilmasa `0n` (noma'lum emas — nol). */
  prepayMinor: bigint;
  expectedUsdCashMinor: bigint;
  countedUsdCashMinor: bigint | null;
  /** Dollar farqi — SENTDA, so'mga o'girilmaydi (§8.4). */
  varianceUsdMinor: bigint | null;
}

/**
 * Z-hisobot raqamlari.
 *
 * ⚠️ `null` bu yerda «noma'lum», `0n` esa «haqiqatan nol» — ikkalasi
 * hech qachon aralashtirilmaydi. Cheksiz smenada o'rtacha chek `0` emas
 * `null`; tan narx muzlatilmagan bo'lsa yalpi foyda `null`, chunki uni
 * `0` deb ko'rsatish «100% marja» yolg'onini beradi (tan-narx
 * shartnomasi, `retail-cost-freeze-null-contract`).
 */
export function buildZReport(input: ZReportInput): ZReport {
  // Jamiga faqat SO'MDAGI qiymat kiradi. So'm qatorida u summaning o'zi;
  // valyutali qatorda — o'girilgan qiymat. Kurs noma'lum bo'lsa qator
  // jamidan chiqadi (aks holda sent tiyin sifatida qo'shilib, tushum
  // 12 000 barobar kam ko'rinardi).
  let revenueMinor = 0n;
  const unconvertedByMethod: ZReport['unconvertedByMethod'] = [];
  for (const r of input.revenueByMethod) {
    const currency = r.currency ?? BASE_CURRENCY;
    if (currency === BASE_CURRENCY) {
      revenueMinor += r.baseMinor ?? r.sumMinor;
      continue;
    }
    if (r.baseMinor == null) {
      unconvertedByMethod.push({ method: r.method, sumMinor: r.sumMinor, currency });
      continue;
    }
    revenueMinor += r.baseMinor;
  }

  const expectedUsdCashMinor = input.expectedUsdCashMinor ?? 0n;
  const countedUsdCashMinor = input.countedUsdCashMinor ?? null;

  return {
    ...input,
    revenueMinor,
    unconvertedByMethod,
    averageReceiptMinor: input.salesCount > 0 ? revenueMinor / BigInt(input.salesCount) : null,
    varianceMinor:
      input.countedCashMinor == null ? null : input.countedCashMinor - input.expectedCashMinor,
    // A1: `expectedCashMinor` ga TEGMAYDI (avans `drawerInMinor` ichida) —
    // faqat hisobot qatori.
    prepayMinor: input.prepayMinor ?? 0n,
    expectedUsdCashMinor,
    countedUsdCashMinor,
    varianceUsdMinor:
      countedUsdCashMinor == null ? null : countedUsdCashMinor - expectedUsdCashMinor,
  };
}
