import { formatDecimalScaled, parseDecimalScaled, roundHalfUp } from '../../shared/decimal.js';

/**
 * 4M.8 — **uch xil zaxira signali**. Sof modul (Prisma'siz).
 *
 * Egasining savoli dona haqida emas, PUL haqida: «qancha pulim qotib qolgan»,
 * «qancha pullik talabni yopolmayman», «qancha pul ortiqcha yotibdi».
 * Shuning uchun har signalning asosiy o'lchovi — **tiyin**, dona esa faqat
 * kontekst. TZ: `2026-08-02-menejer-kunlik-kpi-tz-design.md` §8.
 *
 * ## NULL ≠ 0 (shartnoma, test bilan qulflangan)
 * Tan narx noma'lum bo'lsa signal **`amountMinor: null`** bilan chiqadi va
 * `measured:false` deb belgilanadi — hech qachon `0n`. «0 so'm qotgan pul»
 * menejerga «muammo yo'q» deb ko'rinadi; aynan shu yolg'on
 * (`?? 0n`) chakana hisobotda 100% marja bergan edi. O'lchanmagan qator
 * jamiga qo'shilmaydi, lekin ro'yxatdan **yo'qolmaydi** — u ayrim
 * ko'rsatkich: «bu tovarning tan narxini kiritish kerak».
 *
 * `Stock.costBalanceMinor` DEFAULT 0 bo'lgani uchun **0 ham NOMA'LUM** deb
 * qaraladi: hech kim tan narxi rostdan nol bo'lgan zaxirani hisobotda
 * ko'rmoqchi emas, 0 esa «yozilmagan» degani.
 */

/** Signal turlari — uchtasi, TZ §8 jadvalidagi tartibda. */
export const STOCK_SIGNAL = {
  /** Qotib qolgan pul: uzoq vaqt sotilmayotgan zaxira tannarxi. */
  deadMoney: 'dead_money',
  /** Tugash xavfi: gorizontgacha yopilmaydigan talab tannarxi. */
  stockoutRisk: 'stockout_risk',
  /** Ortiqcha zaxira: gorizontdan ortiq yotgan zaxira tannarxi. */
  overstock: 'overstock',
} as const;

export type StockSignalKind = (typeof STOCK_SIGNAL)[keyof typeof STOCK_SIGNAL];

/** Nega pul o'lchanmadi. Har biri EKRANDA ko'rsatiladi — jim qolmaydi. */
export const UNMEASURED = {
  /** Tan narx yo'q yoki 0 (= yozilmagan). */
  noCost: 'no_cost',
  /** Harakat tarixi umuman yo'q — «o'lik» deb ayblash uchun asos yo'q. */
  noHistory: 'no_history',
} as const;

export type UnmeasuredReason = (typeof UNMEASURED)[keyof typeof UNMEASURED];

export interface StockSignalThresholds {
  /** Shuncha kun sotuvsiz tursa — pul qotgan hisoblanadi. */
  deadDays: number;
  /** Qoldiq shuncha kunlik talabga yetmasa — tugash xavfi. */
  coverDays: number;
  /** Shuncha kunlik talabdan ortig'i — ortiqcha zaxira. */
  overstockDays: number;
}

/**
 * Boshlang'ich chegaralar. **Kodda qattiq yozilgan emas** — HTTP so'rovida
 * almashtiriladi. Doimiy (per-akkaunt) sozlama `ManagerRuleConfig` bilan
 * keladi (MK06) — u paydo bo'lgach shu qiymatlar faqat fallback bo'lib qoladi.
 */
export const DEFAULT_STOCK_THRESHOLDS: StockSignalThresholds = {
  deadDays: 90,
  coverDays: 14,
  overstockDays: 120,
};

export interface StockSignalInput {
  storeId: string;
  storeName: string | null;
  assortmentKind: string;
  assortmentId: string;
  name: string | null;
  /** Qoldiq — Decimal(20,6) satri (float EMAS). */
  qty: string;
  /** Birlik tan narxi, tiyin. `null` = noma'lum. */
  unitCostMinor: bigint | null;
  /** Oxirgi SOTUV sanasi (butun tarix bo'yicha), `null` = hech qachon. */
  lastSaleAt: Date | null;
  /** Kuzatuv oynasida sof sotilgan miqdor — Decimal satri. */
  soldQty: string;
  /** Kuzatuv oynasi uzunligi (kun). */
  windowDays: number;
  /** Birinchi kirim sanasi — «qachondan beri yotibdi», `null` = noma'lum. */
  stockedSinceAt: Date | null;
}

export interface StockSignalRow {
  kind: StockSignalKind;
  storeId: string;
  storeName: string | null;
  assortmentKind: string;
  assortmentId: string;
  name: string | null;
  /** Ombordagi qoldiq (kontekst uchun; o'lchov emas). */
  qty: string;
  /** Signalga tegishli miqdor: qotgan / yetishmayotgan / ortiqcha dona. */
  signalQty: string;
  /** **ASOSIY O'LCHOV** — tiyin. `null` = o'lchanmadi (0 EMAS). */
  amountMinor: bigint | null;
  measured: boolean;
  unmeasuredReason: UnmeasuredReason | null;
  /** Kunlik o'rtacha sotuv (Decimal satri) — `null` = sur'at noma'lum. */
  dailySaleQty: string | null;
  /** Qoldiq necha kunga yetadi — `null` = hisoblanmadi. */
  coverDays: number | null;
  /** Oxirgi sotuvdan beri o'tgan kun — `null` = tarix yo'q. */
  daysIdle: number | null;
}

const SCALE = 1_000_000n;
const DAY_MS = 24 * 60 * 60 * 1000;

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** qty(scaled) × unitCost(tiyin) → tiyin, yarim yuqoriga yaxlitlash. */
function valueMinor(qtyScaled: bigint, unitCostMinor: bigint): bigint {
  return roundHalfUp(qtyScaled * unitCostMinor, SCALE);
}

/**
 * Bitta (ombor × tovar) uchun signallar.
 *
 * Kesishmaslik qoidasi: **qotgan pul** aniqlansa «ortiqcha zaxira»
 * chiqarilmaydi — bir xil pulni ikki signalda ko'rsatish jamini ikki
 * karra qilardi va menejer «qaysi biri rost» deb ishonchini yo'qotardi.
 */
export function stockSignalsFor(
  input: StockSignalInput,
  thresholds: StockSignalThresholds,
  now: Date,
): StockSignalRow[] {
  const qtyScaled = parseDecimalScaled(input.qty);
  // Manfiy qoldiq — ma'lumot nuqsoni (hujjatlar tartibi buzilgan). Uni
  // «bor» deb sanash yetishmovchilikni yashiradi ⇒ 0 kabi qaraladi.
  const onHandScaled = qtyScaled > 0n ? qtyScaled : 0n;

  const soldScaled = parseDecimalScaled(input.soldQty);
  const hasRate = soldScaled > 0n && input.windowDays > 0;
  const windowDays = BigInt(Math.max(1, Math.trunc(input.windowDays)));
  // Kunlik sur'at faqat KO'RSATISH uchun yaxlitlanadi; hisob-kitob
  // hamma joyda `soldScaled × kun / windowDays` ratsional shaklida boradi —
  // avval yaxlitlash 1 dona/kun atrofida sezilarli xato berardi.
  const dailySaleQty = hasRate ? formatDecimalScaled(roundHalfUp(soldScaled, windowDays)) : null;
  const coverDays = hasRate ? Number((onHandScaled * windowDays) / soldScaled) : null;

  // Tan narx: 0 ham «yozilmagan» degani (Stock.costBalanceMinor DEFAULT 0).
  const cost = input.unitCostMinor != null && input.unitCostMinor > 0n ? input.unitCostMinor : null;

  const base = {
    storeId: input.storeId,
    storeName: input.storeName,
    assortmentKind: input.assortmentKind,
    assortmentId: input.assortmentId,
    name: input.name,
    qty: input.qty,
    dailySaleQty,
    coverDays,
  };

  const row = (
    kind: StockSignalKind,
    signalScaled: bigint,
    daysIdle: number | null,
    forcedReason: UnmeasuredReason | null = null,
  ): StockSignalRow => {
    const reason = forcedReason ?? (cost == null ? UNMEASURED.noCost : null);
    return {
      ...base,
      kind,
      signalQty: formatDecimalScaled(signalScaled),
      amountMinor: reason == null && cost != null ? valueMinor(signalScaled, cost) : null,
      measured: reason == null,
      unmeasuredReason: reason,
      daysIdle,
    };
  };

  const rows: StockSignalRow[] = [];

  // ---- 1. Qotib qolgan pul --------------------------------------------
  // Zaxira bor, lekin sotuv yo'q. «Qachondan beri» — oxirgi sotuvdan, u
  // yo'q bo'lsa birinchi kirimdan sanaladi (yangi kelgan tovar darhol
  // «o'lik» bo'lib qolmasligi uchun).
  const idleFrom = input.lastSaleAt ?? input.stockedSinceAt;
  let dead = false;
  if (onHandScaled > 0n) {
    if (idleFrom == null) {
      // Tarix yo'q — bu tovar haqida hech narsa DEYA OLMAYMIZ. Uni jim
      // tashlab ketish «hammasi joyida» degan yolg'on bo'lardi.
      rows.push(row(STOCK_SIGNAL.deadMoney, onHandScaled, null, UNMEASURED.noHistory));
      dead = true;
    } else {
      const daysIdle = wholeDaysBetween(idleFrom, now);
      if (daysIdle >= thresholds.deadDays) {
        rows.push(row(STOCK_SIGNAL.deadMoney, onHandScaled, daysIdle));
        dead = true;
      }
    }
  }

  // ---- 2. Tugash xavfi -------------------------------------------------
  // Sur'atsiz hisoblab bo'lmaydi — taxmin qilinmaydi (sotuvi yo'q tovar
  // «tugab qolmaydi», u qotib qoladi ⇒ 1-signal ishi).
  if (hasRate) {
    const needScaled =
      (soldScaled * BigInt(Math.max(0, Math.trunc(thresholds.coverDays)))) / windowDays;
    const shortfall = needScaled - onHandScaled;
    if (shortfall > 0n) {
      rows.push(row(STOCK_SIGNAL.stockoutRisk, shortfall, null));
    }
  }

  // ---- 3. Ortiqcha zaxira ---------------------------------------------
  if (hasRate && !dead) {
    const normalScaled =
      (soldScaled * BigInt(Math.max(0, Math.trunc(thresholds.overstockDays)))) / windowDays;
    const excess = onHandScaled - normalScaled;
    if (excess > 0n) {
      rows.push(row(STOCK_SIGNAL.overstock, excess, null));
    }
  }

  return rows;
}

export interface StockSignalGroup {
  rows: StockSignalRow[];
  /** Faqat **o'lchangan** qatorlar jami (tiyin) — NULL'lar qo'shilmaydi. */
  totalMinor: bigint;
  measuredCount: number;
  /** Pulini o'lchay olmaganlar soni — jamining halolligi shu raqamda. */
  unmeasuredCount: number;
}

export interface StockSignalBoard {
  signals: Record<StockSignalKind, StockSignalGroup>;
}

/**
 * Taxta: har signal alohida guruh, ichida PULI katta qator tepada.
 * O'lchanmagan qatorlar oxirida — ular ham ko'rinadi, lekin real pulni
 * pastga surib yubormaydi.
 */
export function buildStockSignalBoard(rows: ReadonlyArray<StockSignalRow>): StockSignalBoard {
  const empty = (): StockSignalGroup => ({
    rows: [],
    totalMinor: 0n,
    measuredCount: 0,
    unmeasuredCount: 0,
  });
  const signals: Record<StockSignalKind, StockSignalGroup> = {
    [STOCK_SIGNAL.deadMoney]: empty(),
    [STOCK_SIGNAL.stockoutRisk]: empty(),
    [STOCK_SIGNAL.overstock]: empty(),
  };

  for (const r of rows) {
    const group = signals[r.kind];
    group.rows.push(r);
    if (r.measured && r.amountMinor != null) {
      group.totalMinor += r.amountMinor;
      group.measuredCount += 1;
    } else {
      group.unmeasuredCount += 1;
    }
  }

  for (const group of Object.values(signals)) {
    group.rows.sort((a, b) => {
      const am = a.amountMinor;
      const bm = b.amountMinor;
      if (am == null && bm == null) return (a.name ?? '').localeCompare(b.name ?? '');
      if (am == null) return 1;
      if (bm == null) return -1;
      if (am !== bm) return am > bm ? -1 : 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }

  return { signals };
}
