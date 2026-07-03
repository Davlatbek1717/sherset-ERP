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
 * isn't running at all, everything falls back to browser print (with QR codes).
 */

import { ThermalShell } from '@/components/print/thermal-shell';
import { api } from '@/lib/api-client';
import { agentPrint, checkPrintAgent, type PrintResult } from '@/lib/print-agent';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface SheetLine {
  productId: string | null;
  productName: string;
  quantity: string;
  binLocation: string | null;
}
interface PickingSheet {
  skladNo: number | null;
  omborchiName: string | null;
  printerName: string | null;
  lines: SheetLine[];
}
interface PickingSheetsResponse {
  sourceName: string | null;
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

/**
 * Plain-text strip for the ESC/POS print-agent (the agent adds init + cut).
 * QR codes are omitted in agent mode (raw text) — the bin location + product
 * name carry the pick info; browser-print mode still renders the QR.
 */
function sheetToText(
  sheet: PickingSheet,
  sourceName: string | null,
  storeName: string | null,
): string {
  const bar = '--------------------------------';
  const L: string[] = [];
  L.push("       YIG'ISH VARAQASI");
  L.push(`        SKLAD ${fmtSklad(sheet.skladNo)}`);
  L.push(bar);
  L.push(`Buyurtma: ${sourceName ?? '—'}`);
  if (storeName) L.push(storeName);
  L.push(`Omborchi: ${sheet.omborchiName ?? 'BELGILANMAGAN'}`);
  L.push(bar);
  sheet.lines.forEach((line, i) => {
    L.push(`${i + 1}. ${line.productName}`);
    L.push(`   ${line.binLocation ?? '—'}   ${Number(line.quantity)} dona  [ ]`);
  });
  L.push(bar);
  const qty = sheet.lines.reduce((s, l) => s + Number(l.quantity), 0);
  L.push(`Jami: ${sheet.lines.length} mahsulot / ${qty} dona`);
  return L.join('\n');
}

export default function PrintPickingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const source = searchParams.get('source') === 'retailsale' ? 'retailsale' : 'customerorder';
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;
  const t = useTranslations('picking');

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
            text: sheetToText(s, data.sourceName, data.storeName),
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

  const fs = widthMm === 58 ? 10 : 12;
  const dash: React.CSSProperties = { borderTop: '1px dashed #000', margin: '5px 0' };

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
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0 }}>
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
              ⚠ Ba'zi skladlarga printer belgilanmagan — ular brauzer orqali chiqadi.
              «Sozlamalar → Sklad → Omborchi» da printer tanlang.
            </p>
          )}
        </div>
      )}

      {printSheets.length > 0 && (
        <ThermalShell widthMm={widthMm} autoPrint={shouldBrowserPrint}>
          {printSheets.map((sheet, idx) => (
            <section
              key={`${sheet.skladNo ?? 'none'}-${idx}`}
              className="thermal-cut"
              style={{ padding: '4mm 3mm', fontSize: fs, lineHeight: 1.35 }}
            >
              {/* Header */}
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: fs + 4 }}>
                {t('sheet_title')}
              </div>
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: fs + 6 }}>
                {t('col_sklad')} {fmtSklad(sheet.skladNo)}
              </div>
              <div style={dash} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span>{t('sheet_order')}</span>
                <span style={{ fontWeight: 700 }}>{data?.sourceName ?? '—'}</span>
              </div>
              {data?.storeName && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span>{data.storeName}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span>{t('col_omborchi')}</span>
                <span style={{ fontWeight: 600 }}>
                  {sheet.omborchiName ?? `⚠ ${t('keeper_unassigned')}`}
                </span>
              </div>
              <div style={dash} />

              {/* Lines: product name, qr code, [yacheyka] · qty · ☐ */}
              {sheet.lines.map((line, i) => (
                <div key={`${line.productName}-${i}`} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    {line.productId && (
                      <QRCodeSVG
                        value={`${process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')}/scan/${line.productId}`}
                        size={widthMm === 58 ? 44 : 52}
                        level="M"
                        style={{ flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {i + 1}. {line.productName}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 2,
                        }}
                      >
                        <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
                          {line.binLocation ?? '—'}
                        </span>
                        <span>
                          {Number(line.quantity)} {t('pcs')}
                        </span>
                        <span style={{ fontSize: fs + 4 }}>☐</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div style={dash} />
              <div style={{ color: '#333' }}>
                {t('sheet_total', {
                  products: sheet.lines.length,
                  qty: sheet.lines.reduce((s, l) => s + Number(l.quantity), 0),
                })}
              </div>
            </section>
          ))}
        </ThermalShell>
      )}
    </>
  );
}
