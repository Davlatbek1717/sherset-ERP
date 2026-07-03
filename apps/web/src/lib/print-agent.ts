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
  printSheet: (printerName: string, html: string) => Promise<{ ok: boolean; error?: string }>;
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
