/**
 * MK19 — «ERTALABKI BRIFING» va «KECHKI YAKUN» sof kompozitsiya qatlami
 * (4M TZ §8.1/5).
 *
 * Ertalab menejer bitta ekranda ko'radi: **nima qotib qolgan** · **SLA
 * buzilishi** · **qabul kutayotgan kunlar** · **zaxira signali**.
 * Kechqurun: **tushum** · **smena qabuli** · **kassa farqi** · **ochiq
 * qolganlar**.
 *
 * 🔴 BU FAYLDA HECH QANDAY FORMULA YO'Q. Har blokning raqami MAVJUD
 * servisdan tayyor holda keladi (`day-briefing.service.ts` I/O qatlami
 * o'qiydi) — `money-map.ts` bilan aynan bir naqsh:
 *
 *   qotib qolgan / SLA   → `ManagerSlaService.board`
 *   qabul kutayotgan kun → `DailyKpiAcceptanceService.queue`
 *   zaxira signali       → `ManagerInventoryService.stockSignals`
 *   tushum               → `ReportService.salesReport`
 *   smena qabuli / farq  → `ShiftAcceptanceService.queue`
 *   ochiq qolganlar      → `ManagerQueueService.list`
 *
 * Fayl **SOF**: Prisma ham, Nest ham, `Date.now()` ham yo'q.
 *
 * ## 🔴 UCHTA SHARTNOMA
 *
 * **1. «Tinch kun» faqat O'LCHANGAN nollardan chiqadi.** Manba javob bermasa
 * blok `count: null` bo'ladi va kun `incomplete` — `quiet` EMAS. Bu asosiy
 * xavf: brifing aynan «bugun tinch» deb aytish uchun ochiladi, va o'lchanmagan
 * manbadan chiqqan xotirjamlik menejerni ekranga ishonishga o'rgatib, keyin
 * bir kuni jimgina aldardi. `money-map.ts` dagi NULL≠0 shartnomasining kunlik
 * brifingdagi ko'rinishi.
 *
 * **2. Har blok SIGNAL emas.** `stuck` (jarayonda turgan ish) va `revenue`
 * (bugungi tushum) — `measure`: ular nolga teng bo'lmasa ham ogohlantirish
 * BERMAYDI. Aks holda 5 ta buyurtma yig'ilayotgan normal kun ham «diqqat»
 * bo'lib chiqardi va bir haftada signal qadrsizlanardi. Rol jadvali
 * `Record<BriefingBlockKey, …>` — yangi blok qo'shilsa TypeScript shu yerda
 * yiqiladi, ya'ni u jimgina «signal» bo'lib qolmaydi.
 *
 * **3. Yarim yig'indi berilmaydi.** Bitta signal o'lchanmagan bo'lsa
 * `attentionCount` — `null`, qolganlarining yig'indisi EMAS. Lekin
 * O'LCHANGAN ogohlantirish `incomplete` ostida YASHIRINMAYDI: haqiqiy
 * ogohlantirish bo'lsa holat baribir `attention` bo'ladi.
 *
 * ## Digest matni NEGA serverda o'zbekcha
 * Telegram xabari — UI EMAS: uni `next-intl` chizmaydi va foydalanuvchi til
 * tanlamaydi. `live-status.ts` allaqachon shu qarorni qilgan (u yerda ham
 * o'zbekcha tayyor qator saqlanadi, izohda «kelajakdagi Telegram xulosasi»
 * deb yozilgan). EKRAN esa aksincha: server faqat kalit + raqam qaytaradi,
 * matnni FE tarjima qiladi — shuning uchun bu yerdagi yagona matn manbai
 * digestdir.
 */

import { Money, isCurrencyCode } from '@moysklad/money';
import type { DataQualityLevel } from '../../report/metrics/index.js';
import { metricQuality, overallQuality } from '../../report/metrics/index.js';

export const BRIEFING_KIND = {
  /** Ertalabki brifing — «bugun nima muhim». */
  morning: 'morning',
  /** Kechki yakun — «bugun nima bo'ldi». */
  evening: 'evening',
} as const;

export type BriefingKind = (typeof BRIEFING_KIND)[keyof typeof BRIEFING_KIND];

/**
 * Ertalabki bloklar. Tartib — ekrandagi tartib: avval jarayon (nima turibdi,
 * qaysi biri chegaradan oshdi), keyin menejerning o'z navbati (qabul), oxirida
 * tovar signali.
 */
export const MORNING_BLOCK_KEYS = [
  'stuck',
  'sla_breach',
  'acceptance_pending',
  'stock_signal',
] as const;

/** Kechki bloklar: avval natija (tushum), keyin javobgarlik, keyin qoldiq ish. */
export const EVENING_BLOCK_KEYS = [
  'revenue',
  'shift_acceptance',
  'cash_variance',
  'open_items',
] as const;

export type BriefingBlockKey =
  | (typeof MORNING_BLOCK_KEYS)[number]
  | (typeof EVENING_BLOCK_KEYS)[number];

/** `signal` — nolga teng bo'lmasa DIQQAT · `measure` — kontekst raqami. */
export const BLOCK_ROLE = { signal: 'signal', measure: 'measure' } as const;
export type BlockRole = (typeof BLOCK_ROLE)[keyof typeof BLOCK_ROLE];

/**
 * Rol jadvali — 2-shartnoma (fayl sarlavhasi).
 *
 * `stuck` **measure**: bu bosqichlarda turgan BARCHA ochiq ob'ekt, ya'ni
 * normal ish oqimi ham shu yerda. Chegaradan oshgani alohida — `sla_breach`.
 * `revenue` **measure**: tushum katta bo'lgani muammo emas.
 */
export const BRIEFING_BLOCK_ROLE: Record<BriefingBlockKey, BlockRole> = {
  stuck: BLOCK_ROLE.measure,
  sla_breach: BLOCK_ROLE.signal,
  acceptance_pending: BLOCK_ROLE.signal,
  stock_signal: BLOCK_ROLE.signal,
  revenue: BLOCK_ROLE.measure,
  shift_acceptance: BLOCK_ROLE.signal,
  cash_variance: BLOCK_ROLE.signal,
  open_items: BLOCK_ROLE.signal,
};

/** Manbadan o'qilgan xom holat. I/O qatlami to'ldiradi. */
export interface BriefingReading {
  key: BriefingBlockKey;
  /** Birliklar soni. `null` = **o'lchanmadi** (0 EMAS). */
  count: number | null;
  /** Blokning pul o'lchovi (bo'lsa). `null` = pul o'lchovi yo'q yoki o'lchanmadi. */
  amountMinor: bigint | null;
  /**
   * Manba to'liqmi. `false` — raqam bor, lekin manbaning bir qismi ko'rinmadi
   * (shift urildi / bir qism qator o'lchanmagan) ⇒ ekranda «qisman».
   */
  sourceComplete: boolean;
  /** Provenance — raqam qaysi servisdan kelgani (javobda ham qaytadi). */
  source: string;
  /** Ikkilamchi qator uchun kontekst (masalan «shundan kritik: 2»). */
  context?: Record<string, number | string | null>;
}

export interface BriefingBlock {
  key: BriefingBlockKey;
  role: BlockRole;
  source: string;
  /** `null` = o'lchanmadi. */
  count: number | null;
  /** BigInt-string yoki `null`. */
  amountMinor: string | null;
  quality: DataQualityLevel;
  /** 🔴 Faqat `signal` bloki va faqat o'lchangan musbat son uchun `true`. */
  attention: boolean;
  context: Record<string, number | string | null>;
}

export const BRIEFING_STATUS = {
  /** Hamma signal o'lchandi va nol. */
  quiet: 'quiet',
  /** Kamida bitta o'lchangan signal musbat. */
  attention: 'attention',
  /** Signalning bir qismi o'lchanmagan va ogohlantirish topilmagan. */
  incomplete: 'incomplete',
} as const;

export type BriefingStatus = (typeof BRIEFING_STATUS)[keyof typeof BRIEFING_STATUS];

export interface BriefingSummary {
  kind: BriefingKind;
  status: BriefingStatus;
  /** Signal birliklari jami. Bitta signal o'lchanmasa — **`null`**. */
  attentionCount: number | null;
  /** Qaysi bloklar diqqat talab qilyapti (tartib — ekran tartibi). */
  attentionBlocks: BriefingBlockKey[];
  quality: DataQualityLevel;
}

/**
 * Bitta manbani blokka aylantiradi.
 *
 * Sifat bayrog'i mavjud `metricQuality(value, complete)` dan — hisobot bo'ylab
 * yagona ta'rif. `count` `bigint` ga o'giriladi, chunki bayroq qatlami butun
 * repo bo'ylab `bigint | null` bilan ishlaydi; bu yerda ikkinchi ta'rif
 * yozilmaydi.
 */
export function buildBriefingBlock(reading: BriefingReading): BriefingBlock {
  const role = BRIEFING_BLOCK_ROLE[reading.key];
  const measured = reading.count == null ? null : BigInt(reading.count);
  return {
    key: reading.key,
    role,
    source: reading.source,
    count: reading.count,
    amountMinor: reading.amountMinor == null ? null : reading.amountMinor.toString(),
    quality: metricQuality(measured, reading.sourceComplete),
    // 🔴 O'lchanmagan signal diqqat BERMAYDI (ko'rsatiladigan son yo'q), lekin
    // xulosada u «tinch kun» ni ham bermaydi — `summarizeBriefing` ga qara.
    attention: role === BLOCK_ROLE.signal && reading.count != null && reading.count > 0,
    context: reading.context ?? {},
  };
}

/**
 * Kun xulosasi: holat + diqqat jami + umumiy bayroq.
 *
 * Holat TARTIBI ataylab shunday:
 *  1. o'lchangan ogohlantirish bormi ⇒ `attention` (haqiqiy ish `incomplete`
 *     ostida yashirinmaydi);
 *  2. yo'q, lekin signalning bir qismi o'lchanmaganmi ⇒ `incomplete`
 *     («tinch kun» — soxta xotirjamlik bo'lardi);
 *  3. hammasi o'lchandi va nol ⇒ `quiet`.
 *
 * Bo'sh ro'yxat `incomplete`: hech narsa tekshirilmagan holatni «tinch kun»
 * deb ko'rsatish eng xavfli yolg'on bo'lardi (`overallQuality` dagi bir xil
 * qaror).
 */
export function summarizeBriefing(
  kind: BriefingKind,
  blocks: readonly BriefingBlock[],
): BriefingSummary {
  const signals = blocks.filter((b) => b.role === BLOCK_ROLE.signal);
  const anySignalUnmeasured = signals.length === 0 || signals.some((b) => b.count == null);

  const attentionBlocks = signals.filter((b) => b.attention).map((b) => b.key);

  let attentionCount: number | null = null;
  if (!anySignalUnmeasured) {
    attentionCount = signals.reduce((sum, b) => sum + (b.count ?? 0), 0);
  }

  const status: BriefingStatus =
    attentionBlocks.length > 0
      ? BRIEFING_STATUS.attention
      : anySignalUnmeasured
        ? BRIEFING_STATUS.incomplete
        : BRIEFING_STATUS.quiet;

  return {
    kind,
    status,
    attentionCount,
    attentionBlocks,
    quality: overallQuality(blocks.map((b) => b.quality)),
  };
}

// ── Telegram digest ──────────────────────────────────────────────────────────

/**
 * Digest yorlig'i — **dublikatsizlikning yagona kaliti**.
 *
 * `TelegramOutbox` da dedup ustuni YO'Q va u umumiy resurs (migratsiya —
 * CLAUDE.md §6.4), shuning uchun kalit xabarning O'ZIGA yoziladi: yorliq tur
 * va ish kunidan determinist chiqadi, ya'ni raqamlar o'zgarsa ham o'zgarmaydi.
 * Ikkinchi urinish o'sha kunning yorlig'i bilan navbatda/yuborilganini topadi
 * va yubormaydi.
 *
 * Ertalabki va kechki yorliqlar KESISHMAYDI: bir kunda ikkala xabar ham
 * ketishi kerak.
 */
export function digestTag(kind: BriefingKind, businessDate: string): string {
  return `#${kind === BRIEFING_KIND.morning ? 'brifing' : 'yakun'}_${businessDate}`;
}

/**
 * Yorliq bo'yicha topilgan outbox qatorlari dublikatni bildiradimi.
 *
 * `dead`/`failed` — yetkazilMAGAN xabar: uni qayta yuborish dublikat emas,
 * aksincha yagona yetkazish urinishi. `pending`/`sending`/`sent` esa
 * «navbatda yoki yetkazilgan» ⇒ ikkinchisi yubormaydi.
 */
export const DIGEST_LIVE_STATUSES = ['pending', 'sending', 'sent'] as const;

export function isDigestAlreadyQueued(rows: ReadonlyArray<{ status: string }>): boolean {
  return rows.some((r) => (DIGEST_LIVE_STATUSES as readonly string[]).includes(r.status));
}

/** Blok sarlavhalari — digest matni uchun (ekran matni FE'da tarjima qilinadi). */
const DIGEST_LABEL: Record<BriefingBlockKey, string> = {
  stuck: 'Jarayonda turgan ish',
  sla_breach: 'SLA buzilishi',
  acceptance_pending: 'Qabul kutayotgan kunlar',
  stock_signal: 'Zaxira signali',
  revenue: 'Tushum',
  shift_acceptance: 'Qabul kutayotgan smenalar',
  cash_variance: 'Kassa farqi',
  open_items: 'Ochiq qolganlar',
};

/**
 * Pul — MAVJUD formatlagich bilan (`Money.format('uz')`). Yangi formatlagich
 * yozilmaydi: ikkinchi nusxa bir kuni ajralib, chek va digest bir summani ikki
 * xil ko'rsatardi. Noma'lum valyuta kodi bo'lsa xom son + kod chiqadi —
 * `Money` bunday kodni qabul qilmaydi va jim yiqilishdan ko'ra ochiq raqam
 * yaxshiroq.
 */
function formatMinor(amountMinor: string, currency: string): string {
  if (!isCurrencyCode(currency)) return `${amountMinor} ${currency}`;
  return Money.fromMinor(BigInt(amountMinor), currency).format('uz');
}

/** O'lchanmagan qiymat — `—`. `0` hech qachon o'rnini bosmaydi. */
function blockLine(block: BriefingBlock, currency: string): string {
  const mark = block.attention ? '⚠️ ' : '· ';
  const label = DIGEST_LABEL[block.key];
  if (block.count == null && block.amountMinor == null) {
    return `${mark}${label}: —`;
  }
  const parts: string[] = [];
  if (block.count != null) parts.push(`${block.count}`);
  if (block.amountMinor != null) parts.push(formatMinor(block.amountMinor, currency));
  return `${mark}${label}: ${parts.join(' · ')}`;
}

/**
 * Telegramga ketadigan matn.
 *
 * **`measure` bloklari HAR DOIM chiziladi** — ular «bugun nima bo'ldi» degan
 * faktlar (tushum, jarayonda turgan ish), signal emas. Ularni tinch kunda
 * yashirish kechki yakunni ma'nosiz qilardi: aynan tushum uchun ochiladi.
 *
 * **`signal` bloklari esa tinch kunda ro'yxat bo'lib CHIZILMAYDI** — o'rniga
 * bitta xotirjam qator. Har kuni to'rt qatorlik nol ro'yxati kelaversa, xabar
 * o'qilmay qoladi va haqiqiy ogohlantirish ham o'sha bilan birga o'qilmasdi.
 */
export function renderDigest(params: {
  kind: BriefingKind;
  businessDate: string;
  blocks: readonly BriefingBlock[];
  summary: BriefingSummary;
  currency: string;
}): string {
  const { kind, businessDate, blocks, summary, currency } = params;
  const head =
    kind === BRIEFING_KIND.morning
      ? `🌅 Ertalabki brifing — ${businessDate}`
      : `🌇 Kechki yakun — ${businessDate}`;

  const lines: string[] = [head, ''];

  for (const b of blocks.filter((b) => b.role === BLOCK_ROLE.measure)) {
    lines.push(blockLine(b, currency));
  }

  if (summary.status === BRIEFING_STATUS.quiet) {
    lines.push('Tinch kun — diqqat talab qiladigan signal yo‘q.');
  } else {
    for (const b of blocks.filter((b) => b.role === BLOCK_ROLE.signal)) {
      lines.push(blockLine(b, currency));
    }
    if (summary.status === BRIEFING_STATUS.incomplete) {
      lines.push('', 'ℹ️ Bir qism manba o‘lchanmadi — «tinch kun» deb aytilmaydi.');
    }
  }

  lines.push('', digestTag(kind, businessDate));
  return lines.join('\n');
}
