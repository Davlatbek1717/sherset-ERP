'use client';

/**
 * /print/picking/[orderId] — «Omborchi yig'ish varaqalari» (Sherset custom),
 * THERMAL (Xprinter 80/58mm). Read-only: one strip per sklad (warehouse zone) —
 * the products that zone's omborchi must collect, each with its bin location
 * «NN-NN-NN-NN». Creates NO tasks, sends NO notifications. Each sklad is its own
 * tear-off strip (thermal-cut → page-break). `?source=retailsale` reads a kassa
 * sale; default reads a customer order. `?w=58` for the compact printer.
 */

import { ThermalShell } from '@/components/print/thermal-shell';
import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
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
  lines: SheetLine[];
}
interface PickingSheetsResponse {
  sourceName: string | null;
  storeName: string | null;
  sheets: PickingSheet[];
}

function fmtSklad(n: number | null): string {
  return n == null ? '—' : String(n).padStart(2, '0');
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

  if (isLoading) return <div style={{ padding: 24 }}>{t('print_loading')}</div>;
  if (error) return <div style={{ padding: 24 }}>{(error as Error).message}</div>;
  const sheets = data?.sheets ?? [];
  if (sheets.length === 0) return <div style={{ padding: 24 }}>{t('print_empty')}</div>;

  const fs = widthMm === 58 ? 10 : 12;
  const dash: React.CSSProperties = { borderTop: '1px dashed #000', margin: '5px 0' };

  return (
    <ThermalShell widthMm={widthMm} autoPrint={auto}>
      {sheets.map((sheet, idx) => (
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
  );
}
