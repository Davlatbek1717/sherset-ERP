'use client';

/**
 * /print/picking/[orderId] — «Omborchi yig'ish varaqalari» (Sherset custom),
 * THERMAL (Xprinter 80/58mm). Read-only: one strip per sklad (warehouse zone) —
 * the products that zone's omborchi must collect, each with its bin location
 * «NN-NN-NN-NN». Creates NO tasks, sends NO notifications. Each sklad is its own
 * tear-off strip (thermal-cut → page-break). `?source=retailsale` reads a kassa
 * sale; default reads a customer order. `?w=58` for the compact printer.
 *
 * PER-PRINTER ROUTING (auto=1): when the local print-agent is running and a
 * sklad has a printer assigned (/settings/sklad-keepers), that sklad's strip is
 * sent straight to ITS printer as raw text — all sklads print CONCURRENTLY on
 * their own printers. Sklads with no assigned printer (and the unassigned-
 * location bucket) fall back to a normal browser `window.print`. If the agent
 * isn't running at all, everything falls back to browser print.
 *
 * 2026-07-20g: per-line QR code (linked to /scan/{productId}) removed —
 * the omborchi picks by bin LOCATION CODE (NN-NN-NN-NN), not by scanning a
 * per-line QR before even finding the product; the location code is now the
 * most prominent element on each line instead of competing with a QR image.
 *
 * 2026-08-10 (owner, climart namunasi): the bespoke «YIG'ISH VARAQASI» strip is
 * gone — every sheet now renders the SHARED «Товарный чек» receipt template
 * (<PickReceiptBody>), the same one the document «Лист сборки» prints. One
 * receipt per sklad, so per-printer routing is unchanged; the sheet's sklad is
 * the receipt's single group heading («01» / «Yacheykasiz»).
 */

import { PickReceiptBody, type ReceiptData } from '@/components/pick-list/receipt-print-portal';
import { ThermalShell } from '@/components/print/thermal-shell';
import { api } from '@/lib/api-client';
import {
  type AgentPickingSheetsResponse,
  type PrintResult,
  agentPrint,
  buildSheetText,
  checkPrintAgent,
} from '@/lib/print-agent';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SheetLine {
  productId: string | null;
  productName: string;
  quantity: string;
  binLocation: string | null;
  uom?: string | null;
  // Multi-bin: additional shelves this product also sits on (besides the primary).
  extraBins?: string[];
}
interface PickingSheet {
  skladNo: number | null;
  omborchiName: string | null;
  printerName: string | null;
  lines: SheetLine[];
}
interface PickingSheetsResponse extends AgentPickingSheetsResponse {
  storeName: string | null;
  sheets: PickingSheet[];
}

interface DispatchResult {
  skladNo: number | null;
  printer: string;
  ok: boolean;
  error?: string;
}

function fmtSklad(n: number | null): string {
  return n == null ? '—' : String(n).padStart(2, '0');
}

/** ISO instant → «DD.MM.YYYY» for the receipt's «от» line. */
function receiptDateOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * One sklad sheet → the shared receipt's shape. `groups` is passed explicitly
 * (a single group) so the server's serpentine pick-route ORDER survives —
 * letting <PickReceiptBody> group the positions itself would re-sort them by
 * cell code and send the omborchi walking the aisles twice.
 */
function sheetToReceipt(
  sheet: PickingSheet,
  res: PickingSheetsResponse | undefined,
  title: string,
): ReceiptData {
  const positions = sheet.lines.map((l) => ({
    name: l.productName,
    qty: Number(l.quantity),
    uom: l.uom ?? null,
    cell: l.binLocation,
  }));
  return {
    title,
    number: res?.docNumber ?? res?.sourceName ?? '—',
    dateStr: receiptDateOf(res?.docDate),
    agentName: res?.buyerName ?? null,
    agentPhone: res?.buyerPhone ?? null,
    ownerName: res?.sellerName ?? null,
    description: res?.comment ?? null,
    positions,
    // null ⇒ the body renders the localized «Yacheykasiz» heading itself.
    groups: [{ warehouse: sheet.skladNo != null ? fmtSklad(sheet.skladNo) : null, positions }],
  };
}

export default function PrintPickingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const source = searchParams.get('source') === 'retailsale' ? 'retailsale' : 'customerorder';
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;
  const t = useTranslations('picking');
  // The receipt template's own strings live with the shared body's namespace.
  const tReceipt = useTranslations('pages.pickLists');

  const { data, isLoading, error } = useQuery<PickingSheetsResponse>({
    queryKey: ['picking-sheets', source, orderId],
    queryFn: () => api.get(`/restock-tasks/picking-sheets/${source}/${orderId}`),
    enabled: !!orderId,
    retry: false,
  });

  // Routing decision: 'pending' = still probing the agent; 'agent' = each sklad
  // dispatched to its own printer; 'browser' = window.print fallback.
  const [mode, setMode] = useState<'pending' | 'agent' | 'browser'>(auto ? 'pending' : 'browser');
  const [results, setResults] = useState<DispatchResult[]>([]);

  useEffect(() => {
    if (!auto || !data) return;
    let alive = true;
    const routed = data.sheets.filter((s) => s.printerName);
    (async () => {
      // Nothing to route (no printers assigned) → plain browser print.
      if (routed.length === 0) {
        if (alive) setMode('browser');
        return;
      }
      const up = await checkPrintAgent();
      if (!alive) return;
      if (!up) {
        setMode('browser');
        return;
      }
      setMode('agent');
      // Fire every printer at once — the agent handles them in parallel.
      const res = await Promise.all(
        routed.map(async (s): Promise<DispatchResult> => {
          const r: PrintResult = await agentPrint(s.printerName as string, {
            text: buildSheetText(s, data),
          });
          return { skladNo: s.skladNo, printer: s.printerName as string, ok: r.ok, error: r.error };
        }),
      );
      if (alive) setResults(res);
    })();
    return () => {
      alive = false;
    };
  }, [auto, data]);

  if (isLoading) return <div style={{ padding: 24 }}>{t('print_loading')}</div>;
  if (error) return <div style={{ padding: 24 }}>{(error as Error).message}</div>;
  const sheets = data?.sheets ?? [];
  if (sheets.length === 0) return <div style={{ padding: 24 }}>{t('print_empty')}</div>;

  // In agent mode the printer-assigned sklads already went to the agent; only
  // the leftover (no printer / unassigned-location) sklads print in the browser.
  const printSheets = mode === 'agent' ? sheets.filter((s) => !s.printerName) : sheets;
  const shouldBrowserPrint =
    (auto && mode === 'browser') || (mode === 'agent' && printSheets.length > 0);

  // The receipt column inside the paper (climart 1:1 uses 72mm on an 80mm roll).
  const bodyWidthMm = widthMm === 58 ? 54 : 72;

  return (
    <>
      {mode === 'pending' && (
        <div className="print:hidden" style={{ padding: 24, fontFamily: 'system-ui' }}>
          Printerlar tekshirilmoqda…
        </div>
      )}

      {mode === 'agent' && (
        <div
          className="print:hidden"
          style={{ padding: 16, fontFamily: 'system-ui', maxWidth: 540 }}
          data-test-id="picking-agent-status"
        >
          <h2 style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
            Printerlarga yuborildi
          </h2>
          <ul
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              listStyle: 'none',
              padding: 0,
            }}
          >
            {results.map((r) => (
              <li
                key={`${r.skladNo}-${r.printer}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '7px 12px',
                  borderRadius: 8,
                  background: r.ok ? '#ecfdf5' : '#fef2f2',
                }}
              >
                <span>
                  Sklad {fmtSklad(r.skladNo)} → <strong>{r.printer}</strong>
                </span>
                <span style={{ fontWeight: 700, color: r.ok ? '#047857' : '#b91c1c' }}>
                  {r.ok ? '✓ chiqdi' : `✗ ${r.error ?? 'xato'}`}
                </span>
              </li>
            ))}
            {results.length === 0 && <li>Yuborilmoqda…</li>}
          </ul>
          {sheets.some((s) => !s.printerName) && (
            <p style={{ marginTop: 12, color: '#b45309', fontSize: 13 }}>
              ⚠ Ba'zi skladlarga printer belgilanmagan — ular brauzer orqali chiqadi. «Sozlamalar →
              Sklad → Omborchi» da printer tanlang.
            </p>
          )}
        </div>
      )}

      {printSheets.length > 0 && (
        <ThermalShell widthMm={widthMm} autoPrint={shouldBrowserPrint}>
          <style>{`
            .rcpt table th, .rcpt table td { border: 1.5px solid #000; }
            .rcpt, .rcpt table { font-weight: 600; }
            .rcpt td.rcpt-name { font-weight: 700; }
          `}</style>
          {printSheets.map((sheet, idx) => (
            <section key={`${sheet.skladNo ?? 'none'}-${idx}`} className="thermal-cut">
              <PickReceiptBody
                data={sheetToReceipt(sheet, data, tReceipt('receipt_title'))}
                widthMm={bodyWidthMm}
              />
            </section>
          ))}
        </ThermalShell>
      )}
    </>
  );
}
