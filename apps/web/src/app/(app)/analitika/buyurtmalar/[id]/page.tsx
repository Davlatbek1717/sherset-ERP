'use client';

import { api } from '@/lib/api-client';
import { Button, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

interface OrderLine {
  productId: string;
  productName: string;
  productCode: string | null;
  qty: number;
  priceMinor: string;
  sumMinor: string;
}
interface OrderDetail {
  id: string;
  number: string;
  counterpartyName: string | null;
  state: string;
  totalMinor: string;
  createdAt: string;
  lines: OrderLine[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU');
}
function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalitikaOrderDetailPage() {
  const t = useTranslations('pages.analitika_orders');
  const stateLabel = (s: string) =>
    s === 'draft' ? t('state_draft') : s === 'done' ? t('state_done') : t('state_formed');
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: ['analitika', 'order', id],
    queryFn: () => api.get<OrderDetail>(`/analitika/orders/${id}`),
    enabled: !!id,
  });

  if (!isLoading && !data) {
    return <div className="p-6 text-[var(--ms-text-muted)]">{t('not_found')}</div>;
  }

  const exportCsv = () => {
    if (!data) return;
    const rows: string[][] = [
      [t('col_product'), t('col_code'), t('col_qty'), t('col_price'), t('col_sum')],
      ...data.lines.map((l) => [
        l.productName,
        l.productCode ?? '',
        String(l.qty),
        formatMoney(l.priceMinor),
        formatMoney(l.sumMinor),
      ]),
    ];
    downloadCsv(`${data.number}.csv`, rows);
  };

  return (
    <div className="p-6">
      <a
        href="/analitika/buyurtmalar"
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('back')}
      </a>

      {data && (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{data.number}</h1>
            <Button variant="secondary" onClick={exportCsv}>
              {t('export_csv')}
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <div className="text-[var(--ms-text-muted)] text-xs">{t('col_counterparty')}</div>
              <div>{data.counterpartyName ?? '—'}</div>
            </div>
            <div>
              <div className="text-[var(--ms-text-muted)] text-xs">{t('col_state')}</div>
              <div>{stateLabel(data.state)}</div>
            </div>
            <div>
              <div className="text-[var(--ms-text-muted)] text-xs">{t('col_date')}</div>
              <div>{fmtDate(data.createdAt)}</div>
            </div>
            <div>
              <div className="text-[var(--ms-text-muted)] text-xs">{t('total')}</div>
              <div className="font-semibold">{formatMoney(data.totalMinor)}</div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--ms-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('col_product')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('col_code')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_qty')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_price')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_sum')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ms-border)]">
                {data.lines.map((l) => (
                  <tr key={l.productId} className="hover:bg-[var(--ms-bg-subtle)]">
                    <td className="px-3 py-2 text-[var(--ms-text-primary)]">{l.productName}</td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                      {l.productCode ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(l.priceMinor)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(l.sumMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
