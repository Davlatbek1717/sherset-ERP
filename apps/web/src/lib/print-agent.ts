/**
 * Sherset local print-agent client.
 *
 * The agent (tools/print-agent) runs on the cashier PC and prints raw ESC/POS to
 * a NAMED Windows printer, so each warehouse's picking sheet can be routed to its
 * own printer. It listens on http://127.0.0.1:17777; localhost is a "potentially
 * trustworthy" origin, so the HTTPS site may call it without mixed-content errors.
 *
 * Every call fails soft (short timeout, no throw on network error) — the agent is
 * optional infrastructure that may simply not be running.
 */

import { api } from './api-client';
import {
  type ReceiptPaymentRow,
  formatForeignMajor,
  formatFrozenRate,
  receiptPaymentLines,
} from './pos/receipt-payments';
import {
  type ZReceiptLabels,
  type ZReportPayload,
  buildZReceipt,
  renderZReceiptHtml,
  renderZReceiptText,
} from './z-report-receipt';

export const PRINT_AGENT_URL = 'http://127.0.0.1:17777';

// ─── Electron desktop shell bridge (optional) ────────────────────────────────
// When the web app runs inside the Sherset desktop app (Electron), the shell
// exposes window.electronAPI for NATIVE per-printer printing — no HTTP agent,
// no ESC/POS codepage (the Windows driver renders the HTML, Cyrillic included).
// Outside Electron (a normal browser) this is undefined and everything falls
// back to the localhost print-agent over HTTP.
interface ElectronBridge {
  isSherset: boolean;
  version: string;
  listPrinters: () => Promise<string[]>;
  printSheet: (
    printerName: string,
    html: string,
    // v1.0.3+: label kabi qat'iy qog'oz o'lchami (mikron). Eski exe'lar
    // qo'shimcha argumentni bilmaydi — jim e'tiborsiz qoldiradi (80mm legacy).
    pageSizeMicrons?: { width: number; height: number },
  ) => Promise<{ ok: boolean; error?: string }>;
  // v1.0.4+: kassir savati → mijoz-ekran (orqadagi 2-monitor). Savat har
  // o'zgarganda chaqiriladi; eski exe'lar bu funksiyani bilmaydi (optional).
  pushCart?: (payload: {
    // `quantity` — `Decimal(20,6)` SATRi (F8 audit): og'irlik tovarida u
    // `'1.5'` bo'ladi va mijoz-ekran uni `BigInt()` ga bermaydi. Eski exe
    // versiyalari raqamni ham yuborishi mumkin, shu sababdan union.
    lines: Array<{
      productId: string;
      name: string;
      quantity: number | string;
      priceMinor: string;
    }>;
    discountPct: number;
  }) => void;
  // v1.0.5+: mijoz ekranini och/yop (Sotuv panelidagi tugma; F9 ham shu ish).
  // Tashqi ekran topilmasa { open:false, error } qaytadi.
  toggleCustomerDisplay?: () => Promise<{ open: boolean; error?: string }>;
  // Mijoz ekrani hozir ochiqmi (tugma holatini ko'rsatish uchun).
  customerDisplayStatus?: () => Promise<{ open: boolean }>;
}
declare global {
  interface Window {
    electronAPI?: ElectronBridge;
  }
}
function electron(): ElectronBridge | null {
  if (typeof window === 'undefined') return null;
  const el = window.electronAPI;
  return el?.isSherset ? el : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function agentFetch(path: string, init?: RequestInit, timeoutMs = 4000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${PRINT_AGENT_URL}${path}`, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Electron qobiqdamizmi — native (dialogsiz, printer-tanlab) chop bor-yo'qligi. */
export function hasNativePrinting(): boolean {
  return electron() != null;
}

/**
 * Tayyor HTML hujjatni tanlangan printerga JIM (dialogsiz) bosish — faqat
 * Electron qobiqda ishlaydi (offscreen BrowserWindow → webContents.print).
 * Senik/label kabi maxsus @page o'lchamli sahifalar uchun `pageSizeMm`
 * MAJBURIY berilsin (aks holda exe legacy 80mm-chek rejimida bosadi);
 * exe v1.0.3+ shu o'lchamni driver'ga uzatadi.
 */
export async function printHtmlNative(
  printerName: string,
  html: string,
  pageSizeMm?: { widthMm: number; heightMm: number },
): Promise<{ ok: boolean; error?: string }> {
  const el = electron();
  if (!el) return { ok: false, error: 'Electron qobiq emas' };
  const pageSizeMicrons = pageSizeMm
    ? {
        width: Math.round(pageSizeMm.widthMm * 1000),
        height: Math.round(pageSizeMm.heightMm * 1000),
      }
    : undefined;
  try {
    return await el.printSheet(printerName, html, pageSizeMicrons);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Is a printing backend available? (Electron native, or the HTTP agent /health) */
export async function checkPrintAgent(): Promise<boolean> {
  if (electron()) return true; // native printing is always available in the shell
  try {
    const r = await agentFetch('/health', {}, 2000);
    if (!r.ok) return false;
    const j = (await r.json()) as { ok?: boolean };
    return j.ok === true;
  } catch {
    return false;
  }
}

/** Installed Windows printers on the cashier PC (Electron native, or GET /printers). */
export async function fetchAgentPrinters(): Promise<string[]> {
  const el = electron();
  if (el) {
    try {
      return await el.listPrinters();
    } catch {
      return [];
    }
  }
  try {
    const r = await agentFetch('/printers', {}, 3000);
    if (!r.ok) return [];
    const j = (await r.json()) as { printers?: string[] };
    return Array.isArray(j.printers) ? j.printers : [];
  } catch {
    return [];
  }
}

export interface PrintResult {
  ok: boolean;
  error?: string;
}

/**
 * Chop zanjiri QAYSI qavatda uzilgani (`handled:false` bo'lganda).
 *
 * Ilgari uchala uzilish ham bir xil `{ handled:false }` edi va chaqiruvchi
 * hammasiga bitta javob berardi — brauzer popup'i (`?auto=1`). Qobiq ichida
 * o'sha popup `window.print()` chaqiradi ⇒ Chromium TASDIQ oynasi chiqadi.
 * Egasi monoblokda ko'rgan «chek avtomatik chiqmayapti» simptomi aynan shu
 * (2026-08-11, P7): prodda `company_settings` 0 qator ⇒ printer sozlanmagan.
 * Sabab ajratilgani chaqiruvchiga to'g'ri javob tanlash imkonini beradi
 * (`lib/pos/print-fallback.ts`).
 */
export type PrintIdleReason =
  /** Qobiq ham, HTTP print-agent ham yo'q — oddiy brauzer. */
  | 'no-agent'
  /** Chek printeri sozlanmagan (`CompanySettings.receiptPrinterName` = null). */
  | 'printer-not-set'
  /** Hech bir sklad'ga printer biriktirilmagan (yacheykali chek). */
  | 'no-printer-mapped'
  /** Sozlama yoki hujjat yuklanmadi (tarmoq/server xatosi). */
  | 'load-failed';

/** Send a job to one named printer. Provide either `text` or base64 ESC/POS bytes. */
export async function agentPrint(
  printerName: string,
  payload: { text?: string; dataBase64?: string },
): Promise<PrintResult> {
  try {
    const r = await agentFetch(
      '/print',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer: printerName, ...payload }),
      },
      8000,
    );
    const j = (await r.json().catch(() => ({}))) as PrintResult;
    if (!r.ok) return { ok: false, error: j.error ?? `HTTP ${r.status}` };
    return { ok: j.ok !== false, error: j.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'agent unreachable' };
  }
}

// ─── Per-warehouse picking-sheet routing (stage 3) ───────────────────────────

interface AgentPickingLine {
  productName: string;
  quantity: string;
  binLocation: string | null;
  uom?: string | null;
}
interface AgentPickingSheet {
  skladNo: number | null;
  omborchiName: string | null;
  lines: AgentPickingLine[];
}
/**
 * `/restock-tasks/picking-sheets/:source/:id`. The header fields feed the
 * «Товарный чек» template (climart namunasi) — they are what turns a bare line
 * list into the receipt the owner asked for.
 */
export interface AgentPickingSheetsResponse {
  sourceName: string | null;
  docNumber?: string | null;
  /** ISO instant of the source document. */
  docDate?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  sellerName?: string | null;
  comment?: string | null;
  sheets: AgentPickingSheet[];
}
interface AgentKeeperRow {
  skladNo: number;
  printerName: string | null;
}

/** «01» / «Yacheykasiz» — the receipt's group heading for one sklad sheet. */
export function pickGroupLabel(skladNo: number | null): string {
  return skladNo != null ? String(skladNo).padStart(2, '0') : 'Yacheykasiz';
}

/** ISO instant → «DD.MM.YYYY» (the receipt's «от» line). */
function receiptDateOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const RECEIPT_BRAND = 'Sherset - savdo va ombor boshqaruvi';

/**
 * Plain-text picking sheet for the raw ESC/POS agent — an APPROXIMATION of the
 * «Товарный чек» template, not a 1:1 copy: a raw thermal stream has no table
 * borders, so the same information is printed in the same ORDER (header block →
 * group heading → numbered lines with yacheyka + qty → «Jami nomlanish N» →
 * brand line). Labels stay Latin here because the ESC/POS codepage is not
 * negotiated by the agent — the Electron/browser paths render the real table.
 */
export function buildSheetText(sheet: AgentPickingSheet, res: AgentPickingSheetsResponse): string {
  const dash = '--------------------------------';
  const center = (s: string) =>
    s.length >= 32 ? s : ' '.repeat(Math.floor((32 - s.length) / 2)) + s;
  const L: string[] = [];
  if (res.buyerName) L.push(res.buyerName);
  L.push(center(`Tovar cheki № ${res.docNumber ?? res.sourceName ?? '—'}`));
  const dateStr = receiptDateOf(res.docDate);
  if (dateStr) L.push(center(dateStr));
  L.push(`Sotuvchi: ${res.sellerName ?? ''}`);
  L.push(`Xaridor: ${res.buyerName ?? ''}`);
  L.push(`Telefon: ${res.buyerPhone ?? ''}`);
  L.push(`Izoh: ${res.comment ?? ''}`);
  L.push(dash);
  L.push(pickGroupLabel(sheet.skladNo));
  sheet.lines.forEach((l, i) => {
    L.push(`${i + 1}. ${l.productName}`);
    L.push(`   ${l.binLocation ?? '-'}   ${Number(l.quantity)} ${l.uom ?? 'dona'}`);
  });
  L.push(dash);
  L.push(`Jami nomlanish ${sheet.lines.length}`);
  L.push(RECEIPT_BRAND);
  return L.join('\n');
}

/**
 * 80mm-thermal HTML picking sheet for Electron native printing — the «Товарный
 * чек» template 1:1 (the Windows driver renders it, so the bordered table and
 * Cyrillic both survive; no ESC/POS codepage involved). Mirrors
 * <PickReceiptBody> in components/pick-list/receipt-print-portal.tsx.
 */
export function buildSheetHtml(sheet: AgentPickingSheet, res: AgentPickingSheetsResponse): string {
  const rows = sheet.lines
    .map(
      (l, i) =>
        `<tr><td class="c">${i + 1}</td><td class="nm">${escapeHtml(l.productName)}</td><td class="c">${escapeHtml(l.uom ?? 'шт')}</td><td class="c qty">${Number(l.quantity)}</td><td class="c cell">${escapeHtml(l.binLocation ?? '–')}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}
*{box-sizing:border-box}
body{width:72mm;margin:0 auto;padding:2mm 1mm;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:#000}
.agent{font-weight:700;font-size:14px}
.title{text-align:center;font-weight:700;font-size:16px;margin-top:2px}
.from{text-align:center;font-size:11px}
.req{margin-top:2px;font-weight:700;font-size:11px;line-height:1.2}
.grp{margin-top:6px;font-weight:700;font-size:15px}
table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px}
th,td{border:1.5px solid #000;padding:1px 2px;vertical-align:top}
th{text-align:center;font-weight:700}
.c{text-align:center}
.nm{font-size:11px;font-weight:700;word-break:break-word}
.qty{font-size:11px;font-weight:700}
.cell{white-space:nowrap;font-weight:800;font-variant-numeric:tabular-nums}
.total{margin-top:3px;font-size:12px;font-weight:700}
.brand{margin-top:12px;border-top:1px solid #000;padding-top:3px;font-size:11px;font-weight:700;font-style:italic}
</style></head><body>
<div class="agent">${escapeHtml(res.buyerName ?? '')}</div>
<div class="title">Товарный чек № ${escapeHtml(res.docNumber ?? res.sourceName ?? '—')}</div>
<div class="from">от ${escapeHtml(receiptDateOf(res.docDate))}</div>
<div class="req">
<div>Продавец: ${escapeHtml(res.sellerName ?? '')}</div>
<div>Покупатель: ${escapeHtml(res.buyerName ?? '')}</div>
<div>Телефон: ${escapeHtml(res.buyerPhone ?? '')}</div>
<div>Комментарий: ${escapeHtml(res.comment ?? '')}</div>
</div>
<div class="grp">${escapeHtml(pickGroupLabel(sheet.skladNo))}</div>
<table><thead><tr><th style="width:5mm">№</th><th>Наименование</th><th style="width:7mm">Ед.изм</th><th style="width:8mm">Кол-во</th><th style="width:19mm">Yacheyka</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total">Всего наименований ${sheet.lines.length}</div>
<div class="brand">${RECEIPT_BRAND}</div>
</body></html>`;
}

export interface PickingPrintOutcome {
  /** true = the agent handled printing (route to per-warehouse printers). */
  handled: boolean;
  printed: number;
  skipped: number; // sheets with no mapped printer
  errors: number;
  /** handled=false bo'lganda — uzilish qavati (`PrintIdleReason`). */
  reason?: PrintIdleReason;
}

/**
 * Route each warehouse's picking sheet to its own printer via the local agent.
 * Returns handled=false when the agent is down or NO zone has a printer mapped —
 * the caller should then fall back to the browser popup print. Sheets print
 * concurrently (the agent is multi-threaded), so two printers fire in parallel.
 */
export async function printPickingViaAgent(saleId: string): Promise<PickingPrintOutcome> {
  const idle = (reason: PrintIdleReason): PickingPrintOutcome => ({
    handled: false,
    printed: 0,
    skipped: 0,
    errors: 0,
    reason,
  });
  if (!(await checkPrintAgent())) return idle('no-agent');

  let sheetsRes: AgentPickingSheetsResponse;
  let keepers: { items: AgentKeeperRow[] };
  try {
    [sheetsRes, keepers] = await Promise.all([
      api.get<AgentPickingSheetsResponse>(`/restock-tasks/picking-sheets/retailsale/${saleId}`),
      api.get<{ items: AgentKeeperRow[] }>('/sklad-keepers'),
    ]);
  } catch {
    return idle('load-failed');
  }

  const printerBySklad = new Map<number, string>();
  for (const k of keepers.items) if (k.printerName) printerBySklad.set(k.skladNo, k.printerName);

  const sheets = sheetsRes.sheets ?? [];
  const anyMapped = sheets.some((s) => s.skladNo != null && printerBySklad.has(s.skladNo));
  // Nothing to route (agent up but no printer configured) → let caller fall back.
  // Varaq umuman yo'q — bu SOZLAMA muammosi emas (ogohlantirish noto'g'ri
  // manzil ko'rsatardi), shuning uchun eski xulq: popup.
  if (sheets.length === 0) return idle('load-failed');
  if (!anyMapped) return idle('no-printer-mapped');

  const el = electron();
  const results = await Promise.all(
    sheets.map(async (sheet) => {
      const printer = sheet.skladNo != null ? printerBySklad.get(sheet.skladNo) : undefined;
      if (!printer) return 'skipped' as const;
      // Electron shell → native driver print (HTML, Cyrillic-safe).
      // Plain browser → HTTP print-agent (raw ESC/POS).
      const r = el
        ? await el.printSheet(printer, buildSheetHtml(sheet, sheetsRes))
        : await agentPrint(printer, { text: buildSheetText(sheet, sheetsRes) });
      return r.ok ? ('printed' as const) : ('error' as const);
    }),
  );

  return {
    handled: true,
    printed: results.filter((r) => r === 'printed').length,
    skipped: results.filter((r) => r === 'skipped').length,
    errors: results.filter((r) => r === 'error').length,
  };
}

// ─── Customer sales receipt («mijoz cheki») routing ──────────────────────────
// The receipt counterpart of picking-sheet routing: the whole account has one
// configured receipt printer (Settings → Sklad-keepers → «Chek printeri»,
// stored on CompanySettings). When the agent (or Electron) is up and that
// printer is set, the receipt prints straight to it — one action, correct
// thermal size — exactly like the omborchi sheet. Otherwise the caller falls
// back to the browser popup print (/print/retail-sale/[id]).

interface ReceiptPosition {
  quantity: string;
  priceMinor: string;
  sumMinor: string;
  product: { name: string } | null;
}
interface ReceiptSale {
  name: string;
  moment: string;
  sumMinor: string;
  /**
   * Kassa TZ §6.1 — chekning to'lov qatlami. Ilgari bu yerda
   * `terminalAmountMinor` va `advancePaymentSumMinor` turardi: birinchisi
   * `RetailSale` da MAVJUD BO'LMAGAN ustun (terminal puli «Karta» bo'lib
   * ko'rinardi), ikkinchisiga esa hech kim yozmaydi (qarz qatori o'lik edi).
   * Endi manba bitta — `receiptPaymentLines()`.
   */
  payments?: ReceiptPaymentRow[] | null;
  /** Legacy fallback — to'lov qatorlaridan oldingi arxiv cheklari. */
  cashAmountMinor: string;
  cardAmountMinor: string;
  changeMinor: string;
  description: string | null;
  agent: { name: string; legalTitle: string | null } | null;
  session: {
    cashDesk: { name: string } | null;
    cashier: { name: string };
    store: { name: string } | null;
    organization: { name: string; legalTitle: string | null };
  };
  positions: ReceiptPosition[];
}

/** Whole sums grouped by thousands with a plain ASCII space (ESC/POS-safe). */
function sumStr(minorStr: string): string {
  const whole = Math.round(Number(minorStr || '0') / 100);
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** ESC/POS plain-text receipt. 32-char columns — matches the picking sheet the
 *  cashier's printer already renders nicely.
 *
 *  Eksport qilingan — chek renderer'lari sinaladigan yagona narsa (uchalasi bir
 *  xil qatorlarni chiqarishi `lib/__tests__/receipt-renderers.test.ts` da). */
export function buildReceiptText(sale: ReceiptSale): string {
  const W = 32;
  const bar = '-'.repeat(W);
  const center = (s: string) => {
    if (s.length >= W) return s;
    const pad = Math.floor((W - s.length) / 2);
    return ' '.repeat(pad) + s;
  };
  const row = (l: string, r: string) => {
    const space = W - l.length - r.length;
    return space > 0 ? l + ' '.repeat(space) + r : `${l} ${r}`;
  };

  const L: string[] = [];
  L.push(center(sale.session.organization.legalTitle ?? sale.session.organization.name));
  if (sale.session.cashDesk) L.push(center(sale.session.cashDesk.name));
  if (sale.session.store) L.push(center(sale.session.store.name));
  L.push(bar);
  L.push(row('Chek', sale.name));
  L.push(row('Sana', fmtReceiptDate(sale.moment)));
  L.push(row('Kassir', sale.session.cashier.name));
  if (sale.agent) L.push(row('Mijoz', sale.agent.legalTitle ?? sale.agent.name));
  L.push(bar);
  for (const p of sale.positions) {
    L.push(p.product?.name ?? '—');
    L.push(row(`${Number(p.quantity)} x ${sumStr(p.priceMinor)}`, sumStr(p.sumMinor)));
  }
  L.push(bar);
  L.push(row('JAMI', `${sumStr(sale.sumMinor)} so'm`));
  L.push(bar);
  for (const p of receiptPaymentLines(sale)) {
    if (p.foreign) {
      // Chet valyuta: birinchi qatorda mijoz BERGAN asl summa, ikkinchisida
      // chekka MUZLATILGAN kurs va so'mdagi ekvivalenti (serverning raqami).
      L.push(row(p.label, formatForeignMajor(p.foreign.amountMinor, p.foreign.currency)));
      L.push(
        row(
          `  1${p.foreign.currency} = ${formatFrozenRate(p.foreign.rateMinor)}`,
          sumStr(p.baseMinor.toString()),
        ),
      );
    } else {
      L.push(row(p.label, sumStr(p.baseMinor.toString())));
    }
  }
  if (sale.description) L.push(sale.description);
  L.push('');
  L.push(center('Xarid uchun rahmat!'));
  return L.join('\n');
}

function fmtReceiptDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 80mm-thermal HTML receipt for Electron native printing (driver renders it).
 *  Eksport qilingan — matnli renderer bilan bir xil qatorlarni chiqarishi
 *  testda qulflangan. */
export function buildReceiptHtml(sale: ReceiptSale): string {
  const org = escapeHtml(sale.session.organization.legalTitle ?? sale.session.organization.name);
  const rowsHtml = sale.positions
    .map(
      (p) =>
        `<div class="ln"><div class="nm">${escapeHtml(p.product?.name ?? '—')}</div><div class="mt"><span>${Number(p.quantity)} x ${sumStr(p.priceMinor)}</span><span class="b">${sumStr(p.sumMinor)}</span></div></div>`,
    )
    .join('');
  // To'lov qatlami — matnli renderer bilan AYNAN bir manbadan.
  const payHtml = receiptPaymentLines(sale)
    .map((p) =>
      p.foreign
        ? `<div class="mt"><span>${escapeHtml(p.label)}</span><span>${escapeHtml(formatForeignMajor(p.foreign.amountMinor, p.foreign.currency))}</span></div>` +
          `<div class="mt sub"><span>1${escapeHtml(p.foreign.currency)} = ${escapeHtml(formatFrozenRate(p.foreign.rateMinor))}</span><span>${sumStr(p.baseMinor.toString())}</span></div>`
        : `<div class="mt"><span>${escapeHtml(p.label)}</span><span>${sumStr(p.baseMinor.toString())}</span></div>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}
*{box-sizing:border-box}
body{width:72mm;margin:0 auto;padding:2mm 1mm;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#000}
.h{text-align:center}
.org{font-weight:700;font-size:15px}
.sep{border-top:1px dashed #000;margin:4px 0}
.ln{margin-bottom:4px}
.nm{font-weight:600}
.mt{display:flex;justify-content:space-between;gap:6px}
.sub{font-size:10px;color:#333}
.b{font-weight:700}
.tot{font-weight:700;font-size:15px}
.thanks{text-align:center;margin-top:8px}
</style></head><body>
<div class="h org">${org}</div>
${sale.session.cashDesk ? `<div class="h">${escapeHtml(sale.session.cashDesk.name)}</div>` : ''}
${sale.session.store ? `<div class="h">${escapeHtml(sale.session.store.name)}</div>` : ''}
<div class="sep"></div>
<div class="mt"><span>Chek</span><span class="b">${escapeHtml(sale.name)}</span></div>
<div class="mt"><span>Sana</span><span>${escapeHtml(fmtReceiptDate(sale.moment))}</span></div>
<div class="mt"><span>Kassir</span><span>${escapeHtml(sale.session.cashier.name)}</span></div>
${sale.agent ? `<div class="mt"><span>Mijoz</span><span>${escapeHtml(sale.agent.legalTitle ?? sale.agent.name)}</span></div>` : ''}
<div class="sep"></div>
${rowsHtml}
<div class="sep"></div>
<div class="mt tot"><span>JAMI</span><span>${sumStr(sale.sumMinor)} so'm</span></div>
<div class="sep"></div>
${payHtml}
${sale.description ? `<div>${escapeHtml(sale.description)}</div>` : ''}
<div class="thanks">Xarid uchun rahmat!</div>
</body></html>`;
}

export interface ReceiptPrintOutcome {
  /** true = the agent/Electron handled printing → caller must NOT popup-print. */
  handled: boolean;
  ok: boolean;
  error?: string;
  /** handled=false bo'lganda — uzilish qavati (`PrintIdleReason`). */
  reason?: PrintIdleReason;
}

/**
 * Print the customer sales receipt straight to the configured receipt printer
 * via the local agent (or Electron native). Returns handled=false — so the
 * caller falls back to the browser popup — when the agent is down, the printer
 * isn't configured, or the sale can't be loaded.
 */
export async function printReceiptViaAgent(saleId: string): Promise<ReceiptPrintOutcome> {
  const idle = (reason: PrintIdleReason): ReceiptPrintOutcome => ({
    handled: false,
    ok: false,
    reason,
  });
  if (!(await checkPrintAgent())) return idle('no-agent');

  let printer: string | null;
  let sale: ReceiptSale;
  try {
    const [settings, saleDetail] = await Promise.all([
      api.get<{ receiptPrinterName: string | null }>('/sklad-keepers'),
      api.get<ReceiptSale>(`/retail-sales/${saleId}`),
    ]);
    printer = settings.receiptPrinterName ?? null;
    sale = saleDetail;
  } catch {
    return idle('load-failed');
  }
  // Sozlanmagan: qobiqda — manzilli ogohlantirish, brauzerda — popup
  // (`printFollowUp`). Ilgari ikkalasi ham popup edi ⇒ tasdiq oynasi.
  if (!printer) return idle('printer-not-set');

  const el = electron();
  const r = el
    ? await el.printSheet(printer, buildReceiptHtml(sale))
    : await agentPrint(printer, { text: buildReceiptText(sale) });
  return { handled: true, ok: r.ok, error: r.error };
}

// ─── Z-hisobot («Z-отчёт») chop etish ────────────────────────────────────────
// Chek bilan AYNI yo'l: agent/Electron tirik va chek printeri sozlangan bo'lsa
// qog'oz to'g'ridan-to'g'ri chiqadi, aks holda chaqiruvchi brauzer popup'iga
// (`/print/z-report/<id>?auto=1`) tushadi.
//
// 🔴 Raqamlar bu yerda ham HISOBLANMAYDI — server javobi to'g'ridan-to'g'ri
// `buildZReceipt` ga beriladi, ya'ni qog'oz, Electron-HTML va ekran bitta
// modeldan chiziladi (xotira: «Ombor cheki uch renderer»).

/**
 * Z-hisobotni chek printeriga yuboradi.
 *
 * `labels` chaqiruvchidan keladi (`useZReceiptLabels()`) — print-agent
 * React kontekstida emas, i18n'ni o'zi o'qiy olmaydi.
 */
export async function printZReportViaAgent(
  sessionId: string,
  labels: ZReceiptLabels,
): Promise<ReceiptPrintOutcome> {
  const idle = (reason: PrintIdleReason): ReceiptPrintOutcome => ({
    handled: false,
    ok: false,
    reason,
  });
  if (!(await checkPrintAgent())) return idle('no-agent');

  let printer: string | null;
  let z: ZReportPayload;
  try {
    const [settings, report] = await Promise.all([
      api.get<{ receiptPrinterName: string | null }>('/sklad-keepers'),
      api.get<ZReportPayload>(`/cashier-sessions/${sessionId}/z-report`),
    ]);
    printer = settings.receiptPrinterName ?? null;
    z = report;
  } catch {
    return idle('load-failed');
  }
  if (!printer) return idle('printer-not-set'); // sozlanmagan → chek bilan bir xil yo'l

  // Qaytarishlar SONI — eski endpointda. Yiqilsa chek baribir chiqadi,
  // faqat son o'rnida «—» turadi (NOL EMAS).
  let returnsCount: number | null = null;
  try {
    const legacy = await api.get<{ returnsCount: number }>(
      `/retail-sales/z-report?sessionId=${sessionId}`,
    );
    if (typeof legacy.returnsCount === 'number') returnsCount = legacy.returnsCount;
  } catch {
    returnsCount = null;
  }

  const view = buildZReceipt(z, { labels, returnsCount });
  const el = electron();
  const r = el
    ? await el.printSheet(printer, renderZReceiptHtml(view))
    : await agentPrint(printer, { text: renderZReceiptText(view) });
  return { handled: true, ok: r.ok, error: r.error };
}
