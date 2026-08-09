/**
 * MK15 — «KORXONA PULI QAYERDA» sof kompozitsiya qatlami (4M TZ §8.1/1).
 *
 * Egasi bir ekranda ko'radi: **kassalarda** · **bank hisoblarida** · **mijoz
 * qarzida** · **ta'minotchi qarzida** · **haydovchi qo'lida** · **yo'ldagi
 * tovarda** qancha pul turibdi.
 *
 * 🔴 BU FAYLDA HECH QANDAY PUL FORMULASI YO'Q. Har blokning raqami MAVJUD
 * servisdan tayyor holda keladi (`money-map.service.ts` I/O qatlami o'qiydi):
 *
 *   kassa            → `CashDeskService.balancesByCurrency`
 *   bank             → `OrganizationAccountService.balancesByCurrency`
 *   mijoz qarzi      → `CounterpartyBalanceService.counterpartyBalanceReport`
 *   ta'minotchi qarzi→ `CounterpartyBalanceService.counterpartyBalanceReport`
 *   haydovchi naqdi  → `DriverCashService.outstandingByCurrency`
 *   yo'ldagi tovar   → `StockInTransitService.getInTransitValueByCurrency`
 *
 * Bu yerda faqat uchta ish bajariladi: (1) valyutalarni bazaga konsolidatsiya
 * (mavjud `consolidateToBase`), (2) ma'lumot-sifati bayrog'i (mavjud
 * `report/metrics/data-quality`), (3) aktiv/passiv yo'nalish bo'yicha sof
 * qoldiq. Ikkinchi haqiqat ochilmasligi `money-map-single-source.test.ts`
 * bilan qulflangan.
 *
 * Fayl **SOF**: Prisma ham, Nest ham, `Date.now()` ham yo'q.
 *
 * ⚠️ **IKKI SHARTNOMA — ikkalasi ham sezgiga zid, ikkalasi ham test bilan qulflangan:**
 *
 *  1. **NULL ≠ 0.** Manba javob bermasa blok `null` + «hisoblanmadi» bo'ladi,
 *     `0` EMAS. Bu mavhum xavf emas: `OrganizationAccount.balanceMinor` Faza 11
 *     gacha HECH KIM yozmagan (`money.service.ts:23-27`) — saqlangan `0` u yerda
 *     «o'lchanmagan», «pul yo'q» degani EMAS. Uni nol deb ko'rsatish egasiga
 *     «bankda pul qolmadi» degan yolg'onni aytardi.
 *  2. **Yarim yig'indi berilmaydi.** Bitta blok o'lchanmagan bo'lsa, SOF QOLDIQ
 *     `null` — qolganlarining yig'indisi EMAS. Yarim yig'indi to'liq raqamdek
 *     ko'rinadi va aynan shu qaror qabul qilinadigan raqam; «6 tadan 5 tasi»
 *     degan izoh ekranda o'qilmay qoladi.
 */

import type { DataQualityLevel } from '../../report/metrics/index.js';
import { metricQuality, overallQuality } from '../../report/metrics/index.js';
import {
  CurrencyTally,
  type RateContext,
  type UnconvertedAmount,
  consolidateToBase,
} from '../../report/report-rate-ctx.util.js';

/**
 * Panel bloklari. Tartib — ekrandagi tartib: avval «bizda turgan pul»
 * (kassa/bank), keyin «bizga qarz» (mijoz), keyin «biz qarz» (ta'minotchi),
 * oxirida «yo'lda ketayotgan» (haydovchi/tovar).
 */
export const MONEY_MAP_BLOCK_KEYS = [
  'cash',
  'bank',
  'customer_debt',
  'supplier_debt',
  'driver_cash',
  'goods_in_transit',
] as const;

export type MoneyMapBlockKey = (typeof MONEY_MAP_BLOCK_KEYS)[number];

/** `asset` — bizniki/bizga tegishli · `liability` — biz qarzdormiz. */
export type MoneyDirection = 'asset' | 'liability';

/**
 * Yo'nalish jadvali — sof qoldiqda ishorani belgilaydi.
 *
 * `Record<MoneyMapBlockKey, …>` ATAYLAB: yangi blok qo'shilsa TypeScript shu
 * yerda yiqiladi, ya'ni yangi blok jimgina «aktiv» bo'lib qolmaydi.
 *
 * `customer_debt` aktiv (bizga qarz — bu bizning pulimiz, hali kelmagan),
 * `supplier_debt` passiv (biz qarzdormiz). Ikkalasi ham AYNI hisobotdan
 * keladi va u yerda ishora bo'yicha ajratilgan: musbat qoldiq = bizga qarz,
 * manfiy = biz qarz. Ajratish kontragent TURI bo'yicha emas, PUL YO'NALISHI
 * bo'yicha — bitta kontragent ham xaridor, ham ta'minotchi bo'lishi mumkin.
 */
export const MONEY_MAP_DIRECTION: Record<MoneyMapBlockKey, MoneyDirection> = {
  cash: 'asset',
  bank: 'asset',
  customer_debt: 'asset',
  supplier_debt: 'liability',
  driver_cash: 'asset',
  goods_in_transit: 'asset',
};

/** Bir valyutadagi summa (minor birlik). */
export interface CurrencyAmount {
  currency: string;
  amountMinor: bigint;
}

/**
 * Manbadan o'qilgan xom holat. I/O qatlami to'ldiradi.
 *
 * `amounts: null` — manba javob bermadi (xato yoki umuman o'lchanmagan).
 * `amounts: []` — manba javob berdi va u yerda pul YO'Q. Bu ikkisi bir xil
 * emas va ekranda ham bir xil ko'rinmaydi.
 */
export interface MoneyMapSourceReading {
  key: MoneyMapBlockKey;
  /** `null` = o'lchanmagan · `[]` = o'lchandi, nol. */
  amounts: CurrencyAmount[] | null;
  /**
   * Manba to'liqmi. `false` — raqam bor, lekin manbaning bir qismi yetishmaydi
   * (masalan bank hisoblarining bir qismida daftar yozuvi yo'q ⇒ qoldiq
   * o'lchanmagan). Ekranda «qisman» bo'lib chiqadi.
   */
  sourceComplete: boolean;
  /** Provenance — raqam qaysi servisdan kelgani (javobda ham qaytadi). */
  source: string;
  /**
   * Manba O'ZI bazaga konsolidatsiya qilib bergan bo'lsa (kontragent qarzi
   * hisoboti shunday), uning kursi topilmagan qoldig'i shu yerdan o'tadi.
   * Panel uni QAYTA hisoblamaydi — ikkinchi konvertatsiya ochilardi. Blok
   * shu sababli «qisman» bo'ladi: ko'rsatilgan jami to'liq emas.
   */
  unconverted?: UnconvertedAmount[];
}

/** Panelning bitta bloki. */
export interface MoneyMapBlock {
  key: MoneyMapBlockKey;
  direction: MoneyDirection;
  source: string;
  /** Bazaga konsolidatsiya qilingan summa (BigInt-string) yoki `null`. */
  amountMinor: string | null;
  quality: DataQualityLevel;
  /** Kursi yo'qligi sababli jamiga QO'SHILMAGAN pul (M-12). */
  unconvertedByCurrency: UnconvertedAmount[];
  mixedCurrency: boolean;
}

/** Panel yakuni. */
export interface MoneyMapSummary {
  /** Aktivlar − passivlar. Bitta blok o'lchanmagan bo'lsa — `null`. */
  netMinor: string | null;
  currency: string;
  quality: DataQualityLevel;
  /** Bloklardan yig'ilgan konvertatsiya qilinmagan qoldiq. */
  unconvertedByCurrency: UnconvertedAmount[];
}

/**
 * Bitta manbani blokka aylantiradi.
 *
 * Konsolidatsiya `consolidateToBase` orqali — hisobot bo'ylab YAGONA
 * shartnoma (Faza 17). Bu yerda `docRateValue` UZATILMAYDI: pul manzarasi —
 * OCHIQ QOLDIQ manzarasi (aging / counterparty-balance bilan bir sinf), ya'ni
 * bugungi kursda revalyatsiya qilinadi. Davr-oqim hisobotlarigina hujjatning
 * o'z tarixiy kursini oladi.
 *
 * Sifat bayrog'i mavjud `metricQuality(value, complete)` dan: qiymat yo'q ⇒
 * «yig'ilmagan» (manba `complete` desa ham); qiymat bor-u manba chala YOKI
 * qandaydir summa bazaga konvertatsiya qilinmagan ⇒ «qisman».
 */
export function buildMoneyMapBlock(
  reading: MoneyMapSourceReading,
  ctx: RateContext,
): MoneyMapBlock {
  const base = {
    key: reading.key,
    direction: MONEY_MAP_DIRECTION[reading.key],
    source: reading.source,
  };

  if (reading.amounts === null) {
    return {
      ...base,
      amountMinor: null,
      quality: metricQuality(null, reading.sourceComplete),
      unconvertedByCurrency: [],
      mixedCurrency: false,
    };
  }

  const tally = new CurrencyTally();
  let total = 0n;
  for (const a of reading.amounts) {
    total += consolidateToBase(a.amountMinor, a.currency, ctx, tally);
  }
  // Manba o'zi konsolidatsiya qilgan bo'lsa — uning qoldig'ini shu tally'ga
  // ko'chiramiz. `add` ham chaqiriladi, aks holda `mixedCurrency` o'sha
  // valyutani ko'rmay qolardi.
  for (const u of reading.unconverted ?? []) {
    tally.add(u.currency);
    tally.addUnconverted(u.currency, BigInt(u.amountMinor));
  }

  // Konvertatsiya qilinmagan pul bor ⇒ ko'rsatilgan jami TO'LIQ EMAS. Uni
  // «to'liq» deb belgilash M-12 ning butun maqsadini yo'qqa chiqarardi.
  const complete = reading.sourceComplete && !tally.hasUnconverted;

  return {
    ...base,
    amountMinor: total.toString(),
    quality: metricQuality(total, complete),
    unconvertedByCurrency: tally.unconvertedRows(),
    mixedCurrency: tally.mixed,
  };
}

/**
 * Panel yakuni: sof qoldiq + umumiy bayroq + yig'ma konvertatsiya qoldig'i.
 *
 * **Sof qoldiq bitta blok o'lchanmagan bo'lsa `null`** — qolganlarining
 * yig'indisi emas (fayl sarlavhasidagi 2-shartnoma).
 *
 * Umumiy bayroq `overallQuality` dan: bitta «yig'ilmagan» blok ham panelni
 * «to'liq» deb atashga to'sqinlik qiladi.
 */
export function summarizeMoneyMap(
  blocks: readonly MoneyMapBlock[],
  baseCurrency: string,
): MoneyMapSummary {
  const merged = new Map<string, bigint>();
  for (const b of blocks) {
    for (const u of b.unconvertedByCurrency) {
      merged.set(u.currency, (merged.get(u.currency) ?? 0n) + BigInt(u.amountMinor));
    }
  }

  let net: bigint | null = 0n;
  for (const b of blocks) {
    if (b.amountMinor === null) {
      net = null;
      break;
    }
    const v = BigInt(b.amountMinor);
    net = (net as bigint) + (b.direction === 'liability' ? -v : v);
  }

  return {
    netMinor: net === null ? null : net.toString(),
    currency: baseCurrency,
    quality: overallQuality(blocks.map((b) => b.quality)),
    unconvertedByCurrency: Array.from(merged, ([currency, amountMinor]) => ({
      currency,
      amountMinor: amountMinor.toString(),
    })),
  };
}

/**
 * Ko'p qatorli manba (masalan har biri alohida o'lchanadigan bank hisoblari)
 * uchun yig'ma provenance.
 *
 * `value === null` = shu qator hech qachon o'lchanmagan. Uch holat farqlanadi:
 *  · hech biri o'lchanmagan (`anyMeasured: false`) ⇒ blok «hisoblanmadi»;
 *  · bir qismi o'lchanmagan ⇒ blok «qisman» (raqam KAM ko'rsatilgan);
 *  · hammasi o'lchangan ⇒ blok «to'liq».
 *
 * `countSamples`/`aggregateQuality` dan farqi: u yerda o'lchanmagan qator
 * bayroqni TUSHIRMAYDI (buxgalterda kassa ko'rsatkichi yo'qligi kamchilik
 * emas). Bu yerda esa aksincha — o'lchanmagan bank hisobi to'g'ridan-to'g'ri
 * ko'rsatilayotgan puldan yetishmaydi, ya'ni raqamning o'zi kam. Shuning
 * uchun ATAYLAB alohida qoida, o'sha helper'ning ustidan yozilmagan.
 */
export function sourceCompleteness(rows: ReadonlyArray<{ value: bigint | null }>): {
  complete: boolean;
  anyMeasured: boolean;
} {
  let measured = 0;
  for (const r of rows) if (r.value != null) measured++;
  return { complete: measured === rows.length, anyMeasured: measured > 0 };
}
