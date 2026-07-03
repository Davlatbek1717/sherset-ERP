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

async function agentFetch(path: string, init?: RequestInit, timeoutMs = 4000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${PRINT_AGENT_URL}${path}`, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Is the agent up? (GET /health) */
export async function checkPrintAgent(): Promise<boolean> {
  try {
    const r = await agentFetch('/health', {}, 2000);
    if (!r.ok) return false;
    const j = (await r.json()) as { ok?: boolean };
    return j.ok === true;
  } catch {
    return false;
  }
}

/** Installed Windows printers on the cashier PC (GET /printers). [] if unreachable. */
export async function fetchAgentPrinters(): Promise<string[]> {
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

  const results = await Promise.all(
    sheets.map(async (sheet) => {
      const printer = sheet.skladNo != null ? printerBySklad.get(sheet.skladNo) : undefined;
      if (!printer) return 'skipped' as const;
      const r = await agentPrint(printer, {
        text: buildSheetText(sheet, sheetsRes.sourceName ?? ''),
      });
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
