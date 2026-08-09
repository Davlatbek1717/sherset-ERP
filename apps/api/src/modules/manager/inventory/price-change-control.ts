/**
 * 4M.8 — **narx o'zgarishi tarixi va chegarasi**. Sof modul (Prisma'siz).
 *
 * Manba — mavjud `AuditLog.fieldChanges` (TZ §8 jadvali shuni ko'rsatadi).
 * `ProductService.logAudit` har `update` da o'zgargan maydonlar diffini
 * `entity:'Product'` bilan yozadi, shu jumladan `buyPrice` / `minPrice` /
 * `salePrices`. Ya'ni tarix ALLAQACHON yig'ilgan — bu modul uni o'qiydi,
 * yangi yozuvchi ochmaydi (ikki manba = ikki haqiqat).
 *
 * ## BLOKLAMAYDI — bu shartnoma, qulay xulq emas
 * 4-bo'lim TZ §5.1: kassir va sotuvchi ataylab erkin qoldirilgan, navbat
 * «to'siq emas, keyingi ko'rib chiqish». Shuning uchun hukmda `blocks`
 * maydoni **literal `false`** tipida — kimdir kelajakda bu yerdan taqiq
 * yasamoqchi bo'lsa, avval tipni va testni buzishi kerak bo'ladi.
 *
 * ## NULL ≠ 0
 * Foiz o'zgarish faqat **bazasi bor** o'zgarishda hisoblanadi. Baza yo'q
 * (birinchi marta narx qo'yildi) yoki 0 bo'lsa — `deltaPercent: null` va
 * chegara **qo'llanmaydi**. «0%» deb yozish «o'zgarish bo'lmagan» degan
 * yolg'on bo'lardi, `∞%` esa navbatni shovqinga ko'mardi.
 */

/** Qaysi narx maydoni o'zgardi. */
export const PRICE_FIELD = {
  buy: 'buyPrice',
  min: 'minPrice',
  sale: 'salePrice',
} as const;

export type PriceField = (typeof PRICE_FIELD)[keyof typeof PRICE_FIELD];

/** Nega foiz o'lchanmadi. */
export const PRICE_UNMEASURED = {
  /** Oldingi narx yo'q yoki 0 — taqqoslash bazasi yo'q. */
  noBaseline: 'no_baseline',
  /** Valyuta almashgan — kurssiz taqqoslash yolg'on bo'lardi. */
  currencyMismatch: 'currency_mismatch',
} as const;

export type PriceUnmeasuredReason = (typeof PRICE_UNMEASURED)[keyof typeof PRICE_UNMEASURED];

/**
 * Boshlang'ich chegara: **20%**. Kodda qattiq emas — so'rovda almashtiriladi;
 * doimiy sozlama `ManagerRuleConfig` bilan keladi (MK06/MK07).
 */
export const DEFAULT_PRICE_THRESHOLD_PERCENT = 20;

/** `AuditLog` qatorining shu modulga keraklic qismi. */
export interface PriceAuditRow {
  id: string;
  /** `AuditLog.entityId` = Product.id */
  entityId: string;
  userId: string | null;
  userName: string | null;
  at: Date;
  fieldChanges: unknown;
}

export interface PriceChange {
  auditId: string;
  productId: string;
  productName: string | null;
  field: PriceField;
  /** Faqat `salePrice` uchun to'ladi (qaysi narx turi). */
  priceTypeId: string | null;
  beforeMinor: bigint | null;
  afterMinor: bigint;
  /** `after − before`; baza yo'q bo'lsa `null` (0 EMAS). */
  deltaMinor: bigint | null;
  /** Foiz (2 kasr), `null` = o'lchanmadi. */
  deltaPercent: number | null;
  unmeasuredReason: PriceUnmeasuredReason | null;
  currencyCode: string | null;
  changedById: string | null;
  changedByName: string | null;
  at: Date;
}

/** MK06 navbat dvigateli uchun tayyor element (hali saqlanmaydi). */
export interface PriceChangeWorkItem {
  /** Barqaror dedup kaliti — bir hodisa ikki element yaratmaydi. */
  dedupKey: string;
  ruleType: 'PRICE_CHANGE';
  /** O'zgartirgan xodim — navbat elementining «kim»i. */
  subjectEmployeeId: string | null;
  docType: 'product';
  docId: string;
  /** «Qancha» — pul farqi (tiyin). */
  amountMinor: bigint | null;
  at: Date;
  context: {
    field: PriceField;
    priceTypeId: string | null;
    beforeMinor: bigint | null;
    afterMinor: bigint;
    deltaPercent: number | null;
    thresholdPercent: number;
  };
}

export interface PriceChangeReview extends PriceChange {
  exceedsThreshold: boolean;
  /** **Doim `false`.** Nazorat amalni to'xtatmaydi (TZ §5.1). */
  blocks: false;
  workItem: PriceChangeWorkItem | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Tiyin qiymatini o'qish: BigInt JSON'da satr, Prisma'dan raqam bo'lishi mumkin. */
function asMinor(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

function asCurrency(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Foiz, 2 kasrgacha. Baza 0/`null` bo'lsa — chaqiruvchi bu yerga kelmaydi. */
function percent(before: bigint, delta: bigint): number {
  const base = before < 0n ? -before : before;
  return Number((delta * 10_000n) / base) / 100;
}

interface SalePriceEntry {
  priceTypeId: string;
  valueMinor: bigint | null;
  currencyCode: string | null;
}

/** `salePrices` JSON'ini narx turi bo'yicha xaritaga aylantiradi. */
function saleEntries(value: unknown): Map<string, SalePriceEntry> {
  const map = new Map<string, SalePriceEntry>();
  if (Array.isArray(value)) {
    // Odatiy shakl: [{ priceTypeId, value, currencyCode }]
    for (const raw of value) {
      const row = asRecord(raw);
      if (!row) continue;
      const id = typeof row.priceTypeId === 'string' ? row.priceTypeId : null;
      if (!id) continue;
      map.set(id, {
        priceTypeId: id,
        valueMinor: asMinor(row.value),
        currencyCode: asCurrency(row.currencyCode),
      });
    }
    return map;
  }
  const obj = asRecord(value);
  if (obj) {
    // Pick-modal «Doimiy narx» shakli: { default: "850000" }
    // (`ProductService.setDefaultSalePrice` aynan shuni yozadi).
    for (const [id, raw] of Object.entries(obj)) {
      const minor = asMinor(raw);
      if (minor != null) map.set(id, { priceTypeId: id, valueMinor: minor, currencyCode: null });
    }
  }
  return map;
}

function buildChange(args: {
  row: PriceAuditRow;
  productName: string | null;
  field: PriceField;
  priceTypeId: string | null;
  before: bigint | null;
  after: bigint;
  beforeCurrency: string | null;
  afterCurrency: string | null;
}): PriceChange {
  const { before, after } = args;
  let deltaMinor: bigint | null = null;
  let deltaPercent: number | null = null;
  let unmeasuredReason: PriceUnmeasuredReason | null = null;

  if (before == null || before === 0n) {
    unmeasuredReason = PRICE_UNMEASURED.noBaseline;
  } else if (
    args.beforeCurrency != null &&
    args.afterCurrency != null &&
    args.beforeCurrency !== args.afterCurrency
  ) {
    // Kurs bu modulda yo'q — «1 000 000 UZS → 100 000 USD» ni foizga
    // aylantirish sof yolg'on bo'lardi (hisobot konvertatsiya shartnomasi).
    deltaMinor = null;
    unmeasuredReason = PRICE_UNMEASURED.currencyMismatch;
  } else {
    deltaMinor = after - before;
    deltaPercent = percent(before, deltaMinor);
  }

  return {
    auditId: args.row.id,
    productId: args.row.entityId,
    productName: args.productName,
    field: args.field,
    priceTypeId: args.priceTypeId,
    beforeMinor: before,
    afterMinor: after,
    deltaMinor,
    deltaPercent,
    unmeasuredReason,
    currencyCode: args.afterCurrency,
    changedById: args.row.userId,
    changedByName: args.row.userName,
    at: args.row.at,
  };
}

/**
 * AuditLog qatorlaridan narx o'zgarishlari tarixini yig'adi.
 * Kutilmagan/buzuq `fieldChanges` — jim tashlanadi (audit jurnali eski
 * yozuvlarni ham saqlaydi; bitta buzuq qator butun ekranni yiqitmasin).
 */
export function extractPriceChanges(
  rows: ReadonlyArray<PriceAuditRow>,
  productNames: Record<string, string | null>,
): PriceChange[] {
  const out: PriceChange[] = [];

  for (const row of rows) {
    const changes = asRecord(row.fieldChanges);
    if (!changes) continue;
    const productName = productNames[row.entityId] ?? null;

    // buyPrice / minPrice — skalyar maydonlar.
    for (const [key, field] of [
      ['buyPrice', PRICE_FIELD.buy],
      ['minPrice', PRICE_FIELD.min],
    ] as const) {
      const diff = asRecord(changes[key]);
      if (!diff) continue;
      const after = asMinor(diff.after);
      if (after == null) continue; // yangi qiymatsiz «o'zgarish» ma'nosiz
      const currencyDiff = asRecord(changes[`${key}Currency`]);
      out.push(
        buildChange({
          row,
          productName,
          field,
          priceTypeId: null,
          before: asMinor(diff.before),
          after,
          beforeCurrency: currencyDiff ? asCurrency(currencyDiff.before) : null,
          afterCurrency: currencyDiff ? asCurrency(currencyDiff.after) : null,
        }),
      );
    }

    // salePrices — narx turi bo'yicha taqqoslanadi.
    const saleDiff = asRecord(changes.salePrices);
    if (saleDiff) {
      const before = saleEntries(saleDiff.before);
      const after = saleEntries(saleDiff.after);
      for (const [priceTypeId, entry] of after) {
        if (entry.valueMinor == null) continue;
        const prev = before.get(priceTypeId);
        // O'zgarmagan narx turi tarixga tushmaydi — shovqin bo'lardi.
        if (
          prev &&
          prev.valueMinor === entry.valueMinor &&
          prev.currencyCode === entry.currencyCode
        ) {
          continue;
        }
        out.push(
          buildChange({
            row,
            productName,
            field: PRICE_FIELD.sale,
            priceTypeId,
            before: prev?.valueMinor ?? null,
            after: entry.valueMinor,
            beforeCurrency: prev?.currencyCode ?? null,
            afterCurrency: entry.currencyCode,
          }),
        );
      }
    }
  }

  // Eng yangisi tepada — menejer ekranida «bugun nima o'zgardi» birinchi.
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export interface PriceReviewOptions {
  /** Mutlaq foiz chegarasi. Undan **oshgani** navbatga tushadi. */
  thresholdPercent: number;
}

/**
 * Har o'zgarishga hukm: chegaradan oshdimi va navbatga qanday element
 * tushadi. Element hali SAQLANMAYDI — `ManagerWorkItem` ombori MK06 da
 * keladi; shu vaqtgacha bu ro'yxat ekranda «tasdiq kutmoqda» sifatida
 * ko'rinadi. `dedupKey` shu bugungi ro'yxat bilan kelajakdagi ombor
 * o'rtasidagi ko'prik: dvigatel yoqilganda takror element yaratilmaydi.
 */
export function reviewPriceChanges(
  changes: ReadonlyArray<PriceChange>,
  options: PriceReviewOptions,
): PriceChangeReview[] {
  const threshold = Math.abs(options.thresholdPercent);

  return changes.map((change) => {
    // O'lchanmagan foiz (baza yo'q / valyuta almashgan) HECH QACHON
    // chegaradan «oshgan» deb hisoblanmaydi — taxminiy ayblov yozilmaydi.
    const exceeds = change.deltaPercent != null && Math.abs(change.deltaPercent) > threshold;

    return {
      ...change,
      exceedsThreshold: exceeds,
      // Literal `false`: nazorat kuzatadi, to'xtatmaydi.
      blocks: false as const,
      workItem: exceeds
        ? {
            dedupKey: `price_change:${change.auditId}:${change.field}:${change.priceTypeId ?? '-'}`,
            ruleType: 'PRICE_CHANGE' as const,
            subjectEmployeeId: change.changedById,
            docType: 'product' as const,
            docId: change.productId,
            amountMinor: change.deltaMinor,
            at: change.at,
            context: {
              field: change.field,
              priceTypeId: change.priceTypeId,
              beforeMinor: change.beforeMinor,
              afterMinor: change.afterMinor,
              deltaPercent: change.deltaPercent,
              thresholdPercent: threshold,
            },
          }
        : null,
    };
  });
}
