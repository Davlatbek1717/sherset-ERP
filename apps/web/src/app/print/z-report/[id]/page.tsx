'use client';

import { PrintShell } from '@/components/print/print-shell';
import { api } from '@/lib/api-client';
import { useZReceiptLabels } from '@/lib/use-z-receipt-labels';
import { type ZReceiptRow, type ZReportPayload, buildZReceipt } from '@/lib/z-report-receipt';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

/**
 * Z-hisobot chop sahifasi — 72mm chek printeri (kassa TZ §8.5, F11).
 *
 * 🔴 RAQAMLARNI SAHIFA HISOBLAMAYDI. Yagona manba —
 * `GET /cashier-sessions/:id/z-report`; aynan shu endpoint
 * `/retail/sessions/[id]` ekranini ham to'ldiradi, ya'ni qog'ozdagi va
 * ekrandagi raqam bir hisobdan chiqadi. Ikkinchi (eski) endpoint faqat
 * BITTA maydon uchun — `returnsCount` — chaqiriladi, chunki yangi
 * javobda qaytarishlar SONI yo'q; ekran ham xuddi shu manbadan oladi.
 * Manba yetib kelmasa raqam «—» bo'ladi, NOL emas.
 *
 * 🔴 NULL ≠ 0 mantig'i sahifada emas, `lib/z-report-receipt.ts` sof
 * modulida — u yerdan React, Electron-HTML va ESC/POS renderer'lari bir
 * xil model oladi (xotira: «Ombor cheki uch renderer»).
 */
export default function PrintZReportPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const tCommon = useTranslations('common');
  const labels = useZReceiptLabels();

  const { data, isLoading } = useQuery<ZReportPayload>({
    queryKey: ['z-report-print', id],
    queryFn: () => api.get<ZReportPayload>(`/cashier-sessions/${id}/z-report`),
    enabled: !!id,
  });

  // Qaytarishlar SONI — yangi z-report javobida yo'q maydon. Yiqilishi
  // butun chekni yo'q qilmasligi kerak: `retry:false` + `null` fallback.
  const { data: legacy } = useQuery<{ returnsCount: number }>({
    queryKey: ['z-report-print-legacy', id],
    queryFn: () => api.get<{ returnsCount: number }>(`/retail-sales/z-report?sessionId=${id}`),
    enabled: !!id,
    retry: false,
  });

  if (isLoading) return <div style={{ padding: 24 }}>{tCommon('loading')}</div>;
  if (!data) return <div style={{ padding: 24 }}>{tCommon('not_found')}</div>;

  const view = buildZReceipt(data, {
    labels,
    returnsCount: typeof legacy?.returnsCount === 'number' ? legacy.returnsCount : null,
  });

  return (
    <PrintShell autoPrint={auto}>
      <div
        data-test-id="z-receipt"
        style={{ maxWidth: 320, margin: '0 auto', fontFamily: 'monospace', fontSize: 13 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{view.org}</div>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{view.title}</div>
          {view.subtitle.map((s) => (
            <div key={s} style={{ fontSize: 11, color: '#666' }}>
              {s}
            </div>
          ))}
        </div>

        <Block rows={view.header} />

        {view.sections.map((section) => (
          <Block key={section.key} title={section.title} rows={section.rows} />
        ))}
      </div>
    </PrintShell>
  );
}

/** Bir bo'lim — punktir chiziq bilan ajratilgan «yorliq · qiymat» qatorlari. */
function Block({ title, rows }: { title?: string | null; rows: ZReceiptRow[] }) {
  return (
    <div style={{ borderTop: '1px dashed #999', paddingTop: 5, marginBottom: 5 }}>
      {title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>}
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{r.label}</span>
          <span
            data-test-id={`z-row-${r.key}`}
            style={{
              fontWeight: r.tone === 'strong' ? 700 : 400,
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
