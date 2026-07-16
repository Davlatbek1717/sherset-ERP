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
    lines: Array<{ productId: string; name: string; quantity: number; priceMinor: string }>;
    discountPct: number;
  }) => void;
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
}
interface AgentPickingSheet {
  skladNo: number | null;
  omborchiName: string | null;
  lines: AgentPickingLine[];
}
interface AgentPickingSheetsResponse {
  sourceName: string | null;
  sheets: AgentPickingSheet[];
}
interface AgentKeeperRow {
  skladNo: number;
  printerName: string | null;
}

/** Plain-text (ESC/POS-bound) picking sheet for one warehouse zone. */
function buildSheetText(sheet: AgentPickingSheet, orderName: string): string {
  const sklad = sheet.skladNo != null ? String(sheet.skladNo).padStart(2, '0') : '—';
  const bar = '================================';
  const dash = '--------------------------------';
  const lines: string[] = [
    bar,
    "      YIG'ISH VARAG'I",
    `         SKLAD ${sklad}`,
    bar,
    `Buyurtma: ${orderName || '—'}`,
    `Omborchi: ${sheet.omborchiName ?? '—'}`,
    dash,
  ];
  let totalQty = 0;
  sheet.lines.forEach((l, i) => {
    const qty = Number(l.quantity);
    totalQty += qty;
    lines.push(`${i + 1}. ${l.productName}`);
    lines.push(`   Joy: ${l.binLocation ?? '—'}   x ${qty}   [ ]`);
  });
  lines.push(dash);
  lines.push(`Jami: ${sheet.lines.length} tovar, ${totalQty} dona`);
  lines.push(bar);
  return lines.join('\n');
}

/** 80mm-thermal HTML picking sheet for Electron native printing (driver renders
 *  it — so Cyrillic works without ESC/POS codepages). */
function buildSheetHtml(sheet: AgentPickingSheet, orderName: string): string {
  const sklad = sheet.skladNo != null ? String(sheet.skladNo).padStart(2, '0') : '—';
  let totalQty = 0;
  const rows = sheet.lines
    .map((l, i) => {
      const qty = Number(l.quantity);
      totalQty += qty;
      return `<div class="ln"><div class="nm">${i + 1}. ${escapeHtml(l.productName)}</div><div class="mt"><span class="loc">${escapeHtml(l.binLocation ?? '—')}</span><span>x ${qty}</span><span>&#9744;</span></div></div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}
*{box-sizing:border-box}
body{width:72mm;margin:0 auto;padding:2mm 1mm;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#000}
.h{text-align:center;font-weight:700}
.big{font-size:16px;line-height:1.2}
.sep{border-top:1px dashed #000;margin:4px 0}
.ln{margin-bottom:6px}
.nm{font-weight:600}
.mt{display:flex;justify-content:space-between;align-items:center;gap:6px}
.loc{font-family:monospace;font-weight:700;letter-spacing:.04em}
</style></head><body>
<div class="h big">YIG'ISH VARAG'I</div>
<div class="h big">SKLAD ${sklad}</div>
<div class="sep"></div>
<div>Buyurtma: <b>${escapeHtml(orderName || '—')}</b></div>
<div>Omborchi: ${escapeHtml(sheet.omborchiName ?? '—')}</div>
<div class="sep"></div>
${rows}
<div class="sep"></div>
<div>Jami: ${sheet.lines.length} tovar, ${totalQty} dona</div>
</body></html>`;
}

export interface PickingPrintOutcome {
  /** true = the agent handled printing (route to per-warehouse printers). */
  handled: boolean;
  printed: number;
  skipped: number; // sheets with no mapped printer
  errors: number;
}

/**
 * Route each warehouse's picking sheet to its own printer via the local agent.
 * Returns handled=false when the agent is down or NO zone has a printer mapped —
 * the caller should then fall back to the browser popup print. Sheets print
 * concurrently (the agent is multi-threaded), so two printers fire in parallel.
 */
export async function printPickingViaAgent(saleId: string): Promise<PickingPrintOutcome> {
  const idle: PickingPrintOutcome = { handled: false, printed: 0, skipped: 0, errors: 0 };
  if (!(await checkPrintAgent())) return idle;

  let sheetsRes: AgentPickingSheetsResponse;
  let keepers: { items: AgentKeeperRow[] };
  try {
    [sheetsRes, keepers] = await Promise.all([
      api.get<AgentPickingSheetsResponse>(`/restock-tasks/picking-sheets/retailsale/${saleId}`),
      api.get<{ items: AgentKeeperRow[] }>('/sklad-keepers'),
    ]);
  } catch {
    return idle;
  }

  const printerBySklad = new Map<number, string>();
  for (const k of keepers.items) if (k.printerName) printerBySklad.set(k.skladNo, k.printerName);

  const sheets = sheetsRes.sheets ?? [];
  const anyMapped = sheets.some((s) => s.skladNo != null && printerBySklad.has(s.skladNo));
  // Nothing to route (agent up but no printer configured) → let caller fall back.
  if (sheets.length === 0 || !anyMapped) return idle;

  const el = electron();
  const results = await Promise.all(
    sheets.map(async (sheet) => {
      const printer = sheet.skladNo != null ? printerBySklad.get(sheet.skladNo) : undefined;
      if (!printer) return 'skipped' as const;
      // Electron shell → native driver print (HTML, Cyrillic-safe).
      // Plain browser → HTTP print-agent (raw ESC/POS).
      const r = el
        ? await el.printSheet(printer, buildSheetHtml(sheet, sheetsRes.sourceName ?? ''))
        : await agentPrint(printer, { text: buildSheetText(sheet, sheetsRes.sourceName ?? '') });
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
  cashAmountMinor: string;
  cardAmountMinor: string;
  terminalAmountMinor: string;
  advancePaymentSumMinor: string;
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
 *  cashier's printer already renders nicely. */
function buildReceiptText(sale: ReceiptSale): string {
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
  if (Number(sale.cashAmountMinor) > 0) L.push(row('Naqd', sumStr(sale.cashAmountMinor)));
  if (Number(sale.cardAmountMinor) > 0) L.push(row('Karta', sumStr(sale.cardAmountMinor)));
  if (Number(sale.terminalAmountMinor) > 0)
    L.push(row('Terminal', sumStr(sale.terminalAmountMinor)));
  if (Number(sale.advancePaymentSumMinor) > 0)
    L.push(row('Qarz', sumStr(sale.advancePaymentSumMinor)));
  if (Number(sale.changeMinor) > 0) L.push(row('Qaytim', sumStr(sale.changeMinor)));
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

/** 80mm-thermal HTML receipt for Electron native printing (driver renders it). */
function buildReceiptHtml(sale: ReceiptSale): string {
  const org = escapeHtml(sale.session.organization.legalTitle ?? sale.session.organization.name);
  const rowsHtml = sale.positions
    .map(
      (p) =>
        `<div class="ln"><div class="nm">${escapeHtml(p.product?.name ?? '—')}</div><div class="mt"><span>${Number(p.quantity)} x ${sumStr(p.priceMinor)}</span><span class="b">${sumStr(p.sumMinor)}</span></div></div>`,
    )
    .join('');
  const pay = (label: string, minor: string, cls = '') =>
    Number(minor) > 0
      ? `<div class="mt${cls ? ` ${cls}` : ''}"><span>${label}</span><span>${sumStr(minor)}</span></div>`
      : '';
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
${pay('Naqd', sale.cashAmountMinor)}
${pay('Karta', sale.cardAmountMinor)}
${pay('Terminal', sale.terminalAmountMinor)}
${pay('Qarz', sale.advancePaymentSumMinor)}
${pay('Qaytim', sale.changeMinor)}
${sale.description ? `<div>${escapeHtml(sale.description)}</div>` : ''}
<div class="thanks">Xarid uchun rahmat!</div>
</body></html>`;
}

export interface ReceiptPrintOutcome {
  /** true = the agent/Electron handled printing → caller must NOT popup-print. */
  handled: boolean;
  ok: boolean;
  error?: string;
}

/**
 * Print the customer sales receipt straight to the configured receipt printer
 * via the local agent (or Electron native). Returns handled=false — so the
 * caller falls back to the browser popup — when the agent is down, the printer
 * isn't configured, or the sale can't be loaded.
 */
export async function printReceiptViaAgent(saleId: string): Promise<ReceiptPrintOutcome> {
  const idle: ReceiptPrintOutcome = { handled: false, ok: false };
  if (!(await checkPrintAgent())) return idle;

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
    return idle;
  }
  if (!printer) return idle; // not configured → browser popup fallback

  const el = electron();
  const r = el
    ? await el.printSheet(printer, buildReceiptHtml(sale))
    : await agentPrint(printer, { text: buildReceiptText(sale) });
  return { handled: true, ok: r.ok, error: r.error };
}
