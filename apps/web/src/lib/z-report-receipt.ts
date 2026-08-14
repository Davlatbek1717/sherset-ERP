/**
 * Z-hisobot cheki — SOF model (kassa TZ §8.5, F11).
 *
 * 🔴 NEGA ALOHIDA MODUL: Z-hisobot uchta renderer'da chiqadi — React chop
 * sahifasi (`/print/z-report/[id]`), Electron uchun 72mm HTML va print-agent
 * uchun ESC/POS matn. Xotira «Ombor cheki uch renderer»: biri o'zgarsa
 * qolgani JIMGINA eskiradi. Shuning uchun **raqam va NULL mantig'i shu yerda
 * bir marta** hisoblanadi, uch renderer esa tayyor `ZReceiptView` ni chizadi.
 *
 * 🔴 RAQAMLAR QAYTA HISOBLANMAYDI. Yagona manba — server:
 * `GET /cashier-sessions/:id/z-report` (`cashier-session.service.ts#zReport`).
 * Aynan shu endpoint `/retail/sessions/[id]` ekranini ham to'ldiradi, ya'ni
 * chop etilgan qog'oz va ekrandagi raqam bir manbadan.
 * Yagona istisno — `returnsCount`: yangi endpointda bunday maydon YO'Q, uni
 * chaqiruvchi eski `/retail-sales/z-report` dan oladi va shu yerga uzatadi
 * (ekran ham xuddi shu manbadan oladi). Manbasiz bo'lsa `null` — nol EMAS.
 *
 * 🔴 NULL ≠ 0 (uch holat):
 *  · `null`  — sanalmagan / o'lchanmagan → matn yorlig'i («sanalmagan»)
 *  · `'0'`   — sanaldi va nol            → «0,00» / «farq yo'q»
 *  · normal  — raqam
 * Sanalmagan dollarni «0» deb chop etish — kassirning qo'lida qolgan
 * dollarni «yo'q» deb rasmiylashtirish bo'lardi.
 */

import { formatMoney } from '@moysklad/ui';

// ── Server payload (endpoint javobining aynan o'zi) ─────────────────────────

export interface ZReportPayload {
  session: {
    id: string;
    state: string;
    openedAt: string;
    closedAt: string | null;
    cashier: { id: string; name: string };
    cashDesk: { id: string; name: string; currency: string };
    store: { name: string } | null;
    organization: { name: string; legalTitle: string | null } | null;
  };
  salesCount: number;
  revenueMinor: string;
  revenueByMethod: Array<{
    method: string;
    sumMinor: string;
    currency: string;
    baseMinor: string | null;
  }>;
  unconvertedByMethod: Array<{ method: string; sumMinor: string; currency: string }>;
  averageReceiptMinor: string | null;
  grossProfitMinor: string | null;
  discountMinor: string;
  creditSoldMinor: string;
  debtPaidMinor: string;
  returnsMinor: string;
  expenseMinor: string;
  collectionMinor: string;
  expenseByItem: Array<{ id: string | null; name: string | null; sumMinor: string }>;
  openingCashMinor: string;
  expectedCashMinor: string;
  countedCashMinor: string | null;
  varianceMinor: string | null;
  openingCashUsdMinor: string;
  expectedUsdCashMinor: string;
  countedUsdCashMinor: string | null;
  varianceUsdMinor: string | null;
  variances: Array<{
    currency: string;
    expectedMinor: string;
    countedMinor: string;
    varianceMinor: string;
    kind: string;
    cashierNote: string | null;
    acknowledgedAt: string | null;
  }>;
}

// ── Yorliqlar (i18n'dan uzatiladi — modul sof qoladi) ───────────────────────

export interface ZReceiptLabels {
  title: string;
  shiftNo: string;
  opened: string;
  closed: string;
  cashier: string;
  tenders: string;
  unconverted: string;
  summary: string;
  revenue: string;
  receipts: string;
  avgReceipt: string;
  grossProfit: string;
  discount: string;
  creditSold: string;
  debtPaid: string;
  returns: string;
  expense: string;
  collection: string;
  expenseByItem: string;
  expenseNoItem: string;
  cashBlockUzs: string;
  cashBlockUsd: string;
  opening: string;
  expected: string;
  counted: string;
  variance: string;
  openingUsd: string;
  expectedUsd: string;
  countedUsd: string;
  varianceUsd: string;
  /** `null` sanoq — «0» EMAS. */
  notCounted: string;
  /** Tan narx muzlatilmagan ⇒ foyda o'lchanmagan (0 deb ko'rsatish yolg'on). */
  notMeasured: string;
  unknown: string;
  noVariance: string;
  shortage: string;
  surplus: string;
  pcs: string;
  /** To'lov turi kodi → inson o'qiydigan nom (`CASH_UZS` → «Naqd (so'm)»). */
  tender: Record<string, string>;
}

// ── Ko'rinish modeli ────────────────────────────────────────────────────────

export type ZRowTone = 'plain' | 'strong' | 'shortage' | 'surplus';

export interface ZReceiptRow {
  /**
   * Barqaror kalit — React `key` va `data-test-id` uchun. ATAYLAB
   * tarjimadan EMAS: yorliq matni i18n'dan keladi va tarjima tahriri
   * testlarni sababsiz yiqitardi.
   */
  key: string;
  label: string;
  value: string;
  tone?: ZRowTone;
}

export interface ZReceiptSection {
  key: string;
  title: string | null;
  rows: ZReceiptRow[];
}

export interface ZReceiptView {
  /** Chek boshidagi qalin sarlavha — yuridik nom bo'lsa u, aks holda nom. */
  org: string;
  title: string;
  /** Kassa/do'kon qatorlari. */
  subtitle: string[];
  header: ZReceiptRow[];
  sections: ZReceiptSection[];
}

export interface BuildZReceiptOptions {
  labels: ZReceiptLabels;
  /**
   * Qaytarishlar SONI — yangi z-report endpointida YO'Q maydon. Chaqiruvchi
   * uni `/retail-sales/z-report` dan oladi (ekran ham shundan oladi).
   * Manba yetib kelmasa `null` — nol EMAS.
   */
  returnsCount: number | null;
  /** ISO instant → ko'rinadigan sana. Test/renderer almashtira oladi. */
  formatDateTime?: (iso: string) => string;
}

function defaultFormatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Valyuta belgisiz raqam — valyuta bo'lim sarlavhasida bir marta turadi. */
function bare(minor: string): string {
  return formatMoney(BigInt(minor), 'UZS', { displayAs: 'none' });
}

/** Valyuta kodi bilan — aralash valyutali to'lov qatorlari uchun. */
function withCurrency(minor: string, currency: string): string {
  return formatMoney(BigInt(minor), currency, { displayAs: 'iso' });
}

/**
 * `null` → «sanalmagan» matni, `'0'` → «0,00». Ikkisi HECH QACHON
 * bir xil ko'rinmaydi — Z-hisobotning butun ma'nosi shu farqda.
 */
function counted(minor: string | null, L: ZReceiptLabels): string {
  return minor === null ? L.notCounted : bare(minor);
}

/** Farq: `null` → «sanalmagan», `0` → «farq yo'q», aks holda ishorali nom. */
function variance(minor: string | null, L: ZReceiptLabels): ZReceiptRow['value'] {
  if (minor === null) return L.notCounted;
  const v = BigInt(minor);
  if (v === 0n) return L.noVariance;
  const abs = v < 0n ? -v : v;
  return `${v < 0n ? L.shortage : L.surplus} ${bare(abs.toString())}`;
}

function varianceTone(minor: string | null): ZRowTone {
  if (minor === null) return 'plain';
  const v = BigInt(minor);
  if (v === 0n) return 'plain';
  return v < 0n ? 'shortage' : 'surplus';
}

/**
 * Server javobini chek modeliga aylantiradi.
 *
 * Dollar bloki HAR DOIM chiziladi — dollar oqimi bo'lmagan smenada ham.
 * Sabab: Z-hisobot arxiv hujjati; «dollar yashigi sanalmagan» fakti qog'ozda
 * ko'rinib turishi kerak, aks holda uni keyin hech kim so'ramaydi.
 */
export function buildZReceipt(z: ZReportPayload, opts: BuildZReceiptOptions): ZReceiptView {
  const L = opts.labels;
  const fmtDate = opts.formatDateTime ?? defaultFormatDateTime;
  const org = z.session.organization;

  const header: ZReceiptRow[] = [
    { key: 'shift-no', label: L.shiftNo, value: z.session.id.slice(0, 8).toUpperCase() },
    { key: 'opened', label: L.opened, value: fmtDate(z.session.openedAt) },
    {
      key: 'closed',
      label: L.closed,
      value: z.session.closedAt ? fmtDate(z.session.closedAt) : L.unknown,
    },
    { key: 'cashier', label: L.cashier, value: z.session.cashier.name },
  ];

  const sections: ZReceiptSection[] = [];

  // To'lov turlari kesimi — aralash to'lovda bitta chek bir necha turga
  // bo'linadi, shuning uchun manba `RetailSalePayment` qatorlari (server).
  if (z.revenueByMethod.length > 0) {
    sections.push({
      key: 'tenders',
      title: L.tenders,
      rows: z.revenueByMethod.map((r) => ({
        key: `tender-${r.method}-${r.currency}`,
        label: L.tender[r.method] ?? r.method,
        value: withCurrency(r.sumMinor, r.currency),
      })),
    });
  }

  // Kursi noma'lum qatorlar JAMIGA KIRMAYDI (Faza 17 konvertatsiya
  // shartnomasi) — lekin jimgina tashlanmaydi ham.
  if (z.unconvertedByMethod.length > 0) {
    sections.push({
      key: 'unconverted',
      title: L.unconverted,
      rows: z.unconvertedByMethod.map((r) => ({
        key: `unconverted-${r.method}-${r.currency}`,
        label: L.tender[r.method] ?? r.method,
        value: withCurrency(r.sumMinor, r.currency),
      })),
    });
  }

  const returnsCountText = opts.returnsCount === null ? L.unknown : String(opts.returnsCount);

  sections.push({
    key: 'summary',
    title: L.summary,
    rows: [
      { key: 'revenue', label: L.revenue, value: bare(z.revenueMinor), tone: 'strong' },
      { key: 'receipts', label: L.receipts, value: String(z.salesCount) },
      {
        key: 'avg-receipt',
        label: L.avgReceipt,
        value: z.averageReceiptMinor === null ? L.unknown : bare(z.averageReceiptMinor),
      },
      {
        // Tan narx muzlatilmagan qator bo'lsa server `null` beradi —
        // «0» deb chop etish «100% marja» yolg'oni bo'lardi.
        key: 'gross-profit',
        label: L.grossProfit,
        value: z.grossProfitMinor === null ? L.notMeasured : bare(z.grossProfitMinor),
      },
      { key: 'discount', label: L.discount, value: bare(z.discountMinor) },
      { key: 'credit-sold', label: L.creditSold, value: bare(z.creditSoldMinor) },
      { key: 'debt-paid', label: L.debtPaid, value: bare(z.debtPaidMinor) },
      {
        key: 'returns',
        label: L.returns,
        value: `${returnsCountText} ${L.pcs} · ${bare(z.returnsMinor)}`,
      },
      { key: 'expense', label: L.expense, value: bare(z.expenseMinor) },
      { key: 'collection', label: L.collection, value: bare(z.collectionMinor) },
    ],
  });

  if (z.expenseByItem.length > 0) {
    sections.push({
      key: 'expense-by-item',
      title: L.expenseByItem,
      rows: z.expenseByItem.map((i, idx) => ({
        key: `expense-item-${i.id ?? `none-${idx}`}`,
        label: i.name ?? L.expenseNoItem,
        value: bare(i.sumMinor),
      })),
    });
  }

  sections.push({
    key: 'cash-uzs',
    title: L.cashBlockUzs,
    rows: [
      { key: 'opening', label: L.opening, value: bare(z.openingCashMinor) },
      { key: 'expected', label: L.expected, value: bare(z.expectedCashMinor) },
      { key: 'counted', label: L.counted, value: counted(z.countedCashMinor, L) },
      {
        key: 'variance',
        label: L.variance,
        value: variance(z.varianceMinor, L),
        tone: varianceTone(z.varianceMinor),
      },
    ],
  });

  sections.push({
    key: 'cash-usd',
    title: L.cashBlockUsd,
    rows: [
      { key: 'opening-usd', label: L.openingUsd, value: bare(z.openingCashUsdMinor) },
      { key: 'expected-usd', label: L.expectedUsd, value: bare(z.expectedUsdCashMinor) },
      { key: 'counted-usd', label: L.countedUsd, value: counted(z.countedUsdCashMinor, L) },
      {
        key: 'variance-usd',
        label: L.varianceUsd,
        value: variance(z.varianceUsdMinor, L),
        tone: varianceTone(z.varianceUsdMinor),
      },
    ],
  });

  return {
    org: org?.legalTitle ?? org?.name ?? L.unknown,
    title: L.title,
    subtitle: [z.session.cashDesk.name, z.session.store?.name].filter(
      (s): s is string => typeof s === 'string' && s.length > 0,
    ),
    header,
    sections,
  };
}

// ── Renderer 2: ESC/POS matn (print-agent) ──────────────────────────────────

const TEXT_WIDTH = 32;

function clip(s: string): string {
  return s.length > TEXT_WIDTH ? s.slice(0, TEXT_WIDTH) : s;
}

function center(s: string): string {
  const t = clip(s);
  const pad = Math.floor((TEXT_WIDTH - t.length) / 2);
  return pad > 0 ? ' '.repeat(pad) + t : t;
}

/**
 * «Yorliq …… qiymat» qatori. Ikkisi bir qatorga sig'masa yorliq o'z qatorida
 * qoladi, qiymat esa keyingi qatorda o'ngga tekislanadi — 32 ustunli
 * printerda qatorning avtomatik ko'chishi raqamni buzardi.
 */
function pairLines(label: string, value: string): string[] {
  const l = clip(label);
  const v = clip(value);
  const gap = TEXT_WIDTH - l.length - v.length;
  if (gap >= 1) return [l + ' '.repeat(gap) + v];
  return [l, ' '.repeat(Math.max(TEXT_WIDTH - v.length, 0)) + v];
}

export function renderZReceiptText(view: ZReceiptView): string {
  const bar = '-'.repeat(TEXT_WIDTH);
  const out: string[] = [center(view.org), center(view.title)];
  for (const s of view.subtitle) out.push(center(s));
  out.push(bar);
  for (const r of view.header) out.push(...pairLines(r.label, r.value));
  for (const section of view.sections) {
    out.push(bar);
    if (section.title) out.push(clip(section.title));
    for (const r of section.rows) out.push(...pairLines(r.label, r.value));
  }
  out.push(bar);
  return out.join('\n');
}

// ── Renderer 3: 72mm HTML (Electron native chop) ────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderZReceiptHtml(view: ZReceiptView): string {
  const row = (r: ZReceiptRow) =>
    `<div class="mt${r.tone === 'strong' ? ' b' : ''}"><span>${escapeHtml(r.label)}</span><span>${escapeHtml(r.value)}</span></div>`;
  const sections = view.sections
    .map(
      (s) =>
        `<div class="sep"></div>${s.title ? `<div class="sc">${escapeHtml(s.title)}</div>` : ''}${s.rows
          .map(row)
          .join('')}`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}
*{box-sizing:border-box}
body{width:72mm;margin:0;padding:2mm 1mm;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#000}
.h{text-align:center}
.org{font-weight:700;font-size:15px}
.ti{font-weight:700;font-size:14px}
.sep{border-top:1px dashed #000;margin:4px 0}
.sc{font-weight:700;margin-bottom:2px}
.mt{display:flex;justify-content:space-between;gap:6px}
.b{font-weight:700}
</style></head><body>
<div class="h org">${escapeHtml(view.org)}</div>
<div class="h ti">${escapeHtml(view.title)}</div>
${view.subtitle.map((s) => `<div class="h">${escapeHtml(s)}</div>`).join('')}
<div class="sep"></div>
${view.header.map(row).join('')}
${sections}
</body></html>`;
}
