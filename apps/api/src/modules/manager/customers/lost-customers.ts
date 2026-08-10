import { tashkentDayKey } from '../collection/debt-collection.js';

/**
 * MK17 — «YO'QOLGAN MIJOZLAR SIGNALI» sof qoidalari (4M TZ §8.1/3).
 *
 * Menejer bir ekranda ko'radi: **kim ilgari sotib olardi va endi to'xtadi** ·
 * **necha kun jim** · **kim javobgar (sotuvchi kesimi)** · **nega ketdi**
 * (qo'lda qo'yiladigan sabab belgisi).
 *
 * ⚠️ **HECH NARSANI BLOKLAMAYDI** — MK06/MK16 bilan bir xil falsafa (4M TZ
 * §5.1): bu ro'yxat sotuvni ham, mijozni ham cheklamaydi.
 *
 * ## Ikkinchi haqiqat OCHILMAYDI
 * `Counterparty.lastActivityAt` ustuni YO'Q (u F005 rejasida) va bu modul uni
 * **talab ham qilmaydi**: faollik mavjud hujjatlardan o'qiladi — posted
 * `Demand` (ulgurji jo'natma) va posted `RetailSale` (kassa). Denormalizatsiya
 * qilingan ustun qo'shilsa, uni HAR yozuvchi yangilashi kerak bo'lardi va
 * bitta unutilgan joy jimgina «yo'qolgan mijoz» yolg'onini tug'dirardi.
 * `counterparty.service.ts` dagi «Последняя продажа» ham aynan shu ta'rif
 * (`max(Demand.moment)`, posted) — bu yerda faqat kassa savdosi ham
 * qo'shilgan, chunki POS orqali olayotgan mijoz «to'xtagan» emas.
 *
 * ## Ikki ma'lumot-sifati shartnomasi (repo bo'ylab bir xil)
 *  1. **NULL ≠ 0.** Hech qachon xarid qilmagan mijozning `inactiveDays` i
 *     `null`, `0` EMAS — va u «yo'qolgan» ham emas (`never_purchased`).
 *  2. **Yorliq ≠ instant.** Jimlik KALENDAR kunlarida (Toshkent) sanaladi —
 *     `tashkentDayKey` MK16 dan qayta ishlatiladi, uchinchi nusxa yozilmaydi.
 *
 * Bu fayl **SOF**: Prisma ham, Nest ham, `Date.now()` ham yo'q.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ketish sabablarining YOPIQ ro'yxati. Erkin matn alohida `note` maydonida —
 * kod esa taqsimot chizish uchun barqaror bo'lishi kerak (erkin matn bo'yicha
 * guruhlash «Narx»/«narx»/«narxi qimmat» ni uch sabab qilib ko'rsatardi).
 */
export const LOST_REASON_CODES = [
  /** Narx yuqori / raqobatchi arzonroq berdi. */
  'price',
  /** Tovar sifati yoki brak. */
  'quality',
  /** Kerakli tovar assortimentda yo'q / doim yo'q. */
  'assortment',
  /** Xizmat: yetkazish kechikdi, muomala, xato hujjat. */
  'service',
  /** Boshqa yetkazib beruvchiga o'tdi. */
  'competitor',
  /** Mijozning o'zi ishini yopdi / faoliyatini to'xtatdi. */
  'closed',
  /** Boshqa hududga ko'chdi. */
  'moved',
  /** Sabab noma'lum yoki yuqoridagilarga tushmaydi. */
  'other',
] as const;

export type LostReasonCode = (typeof LOST_REASON_CODES)[number];

export function isLostReasonCode(value: unknown): value is LostReasonCode {
  return typeof value === 'string' && (LOST_REASON_CODES as readonly string[]).includes(value);
}

/**
 * `lost` — ilgari sotib olgan, chegara kunidan uzoq jim · `active` — yaqinda
 * xarid qilgan · `never_purchased` — **hech qachon** sotib olmagan (yo'qolishi
 * mumkin emas: u hech qachon kelmagan).
 */
export type CustomerBucket = 'lost' | 'active' | 'never_purchased';

/** Qo'lda qo'yilgan sabab belgisi (eng oxirgisi). */
export interface LostReasonMark {
  /** Xom qiymat — ro'yxatga mos kelmasligi mumkin (qo'lda tahrirlangan baza). */
  code: string;
  note: string | null;
  at: Date;
  authorId: string | null;
  authorName?: string | null;
}

/** Bitta mijozning xom faollik holati (I/O qatlami to'ldiradi). */
export interface CustomerActivityInput {
  counterpartyId: string;
  name: string;
  phone: string | null;
  ownerId: string | null;
  ownerName: string | null;
  /** Eng oxirgi posted `Demand.moment`. */
  lastDemandAt: Date | null;
  /** Eng oxirgi posted `RetailSale.moment`. */
  lastRetailAt: Date | null;
  firstDemandAt: Date | null;
  firstRetailAt: Date | null;
  /** Ikki manbadagi hujjatlar soni — «bir marta kelgan» ni ajratish uchun. */
  purchaseCount: number;
  reason: LostReasonMark | null;
}

export interface LostCustomerOptions {
  /** Shuncha KALENDAR kun jimlikdan keyin «yo'qolgan» (MK13 registridan). */
  lostDays: number;
  /**
   * F005 egalik taymeri — bu modul faqat O'QIYDI, qo'llamaydi.
   * `null` = taymer o'chirilgan (`enabled:false`) ⇒ egalik hech qachon
   * bo'shamaydi, demak ziddiyat ham bo'lmaydi.
   */
  ownershipReleaseDays: number | null;
}

/** Ekranga chiqadigan qator. */
export interface LostCustomerRow {
  counterpartyId: string;
  name: string;
  phone: string | null;
  ownerId: string | null;
  ownerName: string | null;
  firstPurchaseAt: Date | null;
  lastPurchaseAt: Date | null;
  purchaseCount: number;
  /** Oxirgi xariddan beri KALENDAR kunlar. `null` = hech qachon xarid yo'q. */
  inactiveDays: number | null;
  bucket: CustomerBucket;
  /** Yopiq ro'yxatdagi kod. Tanilmagan kod bo'lsa `null` (xomi pastda). */
  reasonCode: LostReasonCode | null;
  /** Belgida nima turgani — tanilmagan bo'lsa ham ko'rinadi. */
  reasonRaw: string | null;
  reasonNote: string | null;
  reasonAt: Date | null;
  reasonAuthorName: string | null;
  /**
   * F005 taymeri ishga tushsa shu mijoz egalikdan chiqadi. Bu yerda **hech
   * narsa o'zgartirilmaydi** — faqat ko'rsatiladi.
   */
  releaseDue: boolean;
}

/** Ikki sanadan kechrog'i (ikkalasi ham `null` bo'lsa — `null`). */
function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** Ikki sanadan ertarog'i. */
function earlierOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** `YYYY-MM-DD` → o'sha kun boshining UTC instanti (taqqoslash uchun). */
function dayKeyToUtcMidnight(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`);
}

/**
 * Oxirgi xariddan beri o'tgan KALENDAR kunlari (Toshkent). Xarid bo'lmagan
 * bo'lsa `null` — NULL ≠ 0.
 */
export function inactiveDaysSince(lastPurchaseAt: Date | null, now: Date): number | null {
  if (!lastPurchaseAt) return null;
  const last = dayKeyToUtcMidnight(tashkentDayKey(lastPurchaseAt));
  const today = dayKeyToUtcMidnight(tashkentDayKey(now));
  return Math.round((today - last) / DAY_MS);
}

export function lostCustomerRow(
  input: CustomerActivityInput,
  opts: LostCustomerOptions,
  now: Date,
): LostCustomerRow {
  const lastPurchaseAt = laterOf(input.lastDemandAt, input.lastRetailAt);
  const firstPurchaseAt = earlierOf(input.firstDemandAt, input.firstRetailAt);
  const inactiveDays = inactiveDaysSince(lastPurchaseAt, now);

  // 🔴 Xarid tarixi YO'Q ⇒ «yo'qolgan» bo'la olmaydi. Aks holda bazadagi har
  // yangi (va har bo'sh) kontragent birinchi kunidanoq signalga aylanardi.
  const bucket: CustomerBucket =
    inactiveDays === null ? 'never_purchased' : inactiveDays >= opts.lostDays ? 'lost' : 'active';

  const rawReason = input.reason?.code ?? null;

  return {
    counterpartyId: input.counterpartyId,
    name: input.name,
    phone: input.phone,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    firstPurchaseAt,
    lastPurchaseAt,
    purchaseCount: input.purchaseCount,
    inactiveDays,
    bucket,
    reasonCode: isLostReasonCode(rawReason) ? rawReason : null,
    reasonRaw: rawReason,
    reasonNote: input.reason?.note ?? null,
    reasonAt: input.reason?.at ?? null,
    reasonAuthorName: input.reason?.authorName ?? null,
    // Egasi yo'q mijozda bo'shatadigan narsa ham yo'q.
    releaseDue:
      opts.ownershipReleaseDays !== null &&
      input.ownerId != null &&
      inactiveDays !== null &&
      inactiveDays >= opts.ownershipReleaseDays,
  };
}

/**
 * TO'LIQ DETERMINIST tartib — kirish tartibidan qat'i nazar bir xil natija:
 *
 *  1. `inactiveDays` KAMAYISH bo'yicha — eng uzoq jim mijoz tepada;
 *     xaridsizlar (`null`) **oxirida** (ular yo'qolgan deb isbotlanmagan).
 *  2. nom A→Z — operator ro'yxatni ko'z bilan qidiradi.
 *  3. `counterpartyId` — yakuniy uzil-kesil kalit (unikal).
 */
export function compareLostCustomerRows(a: LostCustomerRow, b: LostCustomerRow): number {
  if (a.inactiveDays === null || b.inactiveDays === null) {
    if (a.inactiveDays !== b.inactiveDays) return a.inactiveDays === null ? 1 : -1;
  } else if (a.inactiveDays !== b.inactiveDays) {
    return b.inactiveDays - a.inactiveDays;
  }
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.counterpartyId < b.counterpartyId ? -1 : a.counterpartyId > b.counterpartyId ? 1 : 0;
}

export function buildLostCustomerList(
  inputs: readonly CustomerActivityInput[],
  opts: LostCustomerOptions,
  now: Date,
): LostCustomerRow[] {
  return inputs.map((i) => lostCustomerRow(i, opts, now)).sort(compareLostCustomerRows);
}

export interface LostOwnerSlice {
  /** `null` = egasiz mijozlar. Ular hech kimning kesimiga QO'SHILMAYDI. */
  ownerId: string | null;
  ownerName: string | null;
  lostCount: number;
}

export interface LostReasonSlice {
  code: LostReasonCode;
  count: number;
}

export interface LostCustomerSummary {
  lostCount: number;
  activeCount: number;
  neverPurchasedCount: number;
  /** Sotuvchi kesimi — FAQAT `lost` qatorlar bo'yicha. */
  byOwner: LostOwnerSlice[];
  /** Sabab taqsimoti — FAQAT `lost` qatorlar, tanilgan kodlar bo'yicha. */
  byReason: LostReasonSlice[];
  /** Sabab belgilanmagan (yoki tanilmagan kodli) yo'qolgan mijozlar. */
  unmarkedCount: number;
  /** F005 taymeri ishga tushsa egalikdan chiqadigan yo'qolgan mijozlar. */
  releaseDueCount: number;
  /**
   * 🔴 Yo'qolish davri egalik muddatidan UZUN. Bunda har «yo'qolgan» mijoz
   * allaqachon egasiz qolgan bo'lardi ⇒ sotuvchi kesimi strukturaviy ravishda
   * bo'sh chiqadi. Jimgina bo'sh jadval o'rniga sabab ko'rsatiladi.
   */
  ownershipConflict: boolean;
}

export function summarizeLostCustomers(
  rows: readonly LostCustomerRow[],
  opts: LostCustomerOptions,
): LostCustomerSummary {
  const owners = new Map<string, LostOwnerSlice>();
  const reasons = new Map<LostReasonCode, number>();
  let lostCount = 0;
  let activeCount = 0;
  let neverPurchasedCount = 0;
  let unmarkedCount = 0;
  let releaseDueCount = 0;

  for (const r of rows) {
    if (r.bucket === 'active') {
      activeCount += 1;
      continue;
    }
    if (r.bucket === 'never_purchased') {
      neverPurchasedCount += 1;
      continue;
    }

    lostCount += 1;
    if (r.releaseDue) releaseDueCount += 1;

    // Egasiz qatorlar `null` kaliti ostida — «Anna: 5» kabi sonlarga
    // qo'shilib ketmaydi.
    const key = r.ownerId ?? ' pool';
    const slice = owners.get(key) ?? {
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      lostCount: 0,
    };
    slice.lostCount += 1;
    owners.set(key, slice);

    if (r.reasonCode) reasons.set(r.reasonCode, (reasons.get(r.reasonCode) ?? 0) + 1);
    else unmarkedCount += 1;
  }

  return {
    lostCount,
    activeCount,
    neverPurchasedCount,
    byOwner: [...owners.values()].sort((a, b) => {
      // Egasizlar HAR DOIM oxirida: ular xodim emas, holat.
      if ((a.ownerId === null) !== (b.ownerId === null)) return a.ownerId === null ? 1 : -1;
      return b.lostCount - a.lostCount || (a.ownerName ?? '').localeCompare(b.ownerName ?? '');
    }),
    byReason: [...reasons.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => (a.code < b.code ? -1 : 1)),
    unmarkedCount,
    releaseDueCount,
    ownershipConflict:
      opts.ownershipReleaseDays !== null && opts.lostDays >= opts.ownershipReleaseDays,
  };
}
