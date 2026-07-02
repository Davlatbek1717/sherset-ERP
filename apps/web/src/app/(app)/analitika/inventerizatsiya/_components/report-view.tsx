'use client';

import { api } from '@/lib/api-client';
import { Button, useConfirm } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { STATUS_DOT, downloadCsv, fmtMoney } from '../_lib/format';
import type { CountReport, Period, RTab } from '../_lib/types';

/**
 * Hisobot — pul kartalar + period filtr + 5 sub-tab (mahsulot/sanovchi/guruh/
 * sabab/top-10) + CSV eksport + reset. Reference parity: `inventory/reports/
 * reports-view.tsx` (922 satr) ning sodda variantasi. XLSX/PDF/snapshot
 * keyingi sub-project P-IR'da qo'shiladi.
 */
export function ReportView() {
  const t = useTranslations('pages.analitika_inventory');
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const [period, setPeriod] = useState<Period>('all');
  const [rtab, setRtab] = useState<RTab>('product');

  const { data } = useQuery<CountReport>({
    queryKey: ['analitika', 'report', period],
    queryFn: () => api.get<CountReport>(`/analitika/counts/report?period=${period}`),
  });

  const resetMut = useMutation({
    mutationFn: () => api.post('/analitika/counts/reset', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analitika'] });
    },
  });

  const handleReset = async () => {
    const ok = await confirm({
      title: t('reset'),
      description: t('reset_confirm'),
      confirmLabel: t('reset'),
      cancelLabel: t('cancel'),
      tone: 'destructive',
    });
    if (ok) resetMut.mutate();
  };

  const exportXlsx = async () => {
    await api.download(
      `/analitika/counts/report/export.xlsx?period=${period}`,
      `inventerizatsiya_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const exportSnapshot = async () => {
    await api.download(
      '/analitika/counts/snapshot.xlsx',
      `sanash_holati_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const exportPdf = async () => {
    await api.download(
      `/analitika/counts/report/export.pdf?period=${period}`,
      `inventerizatsiya_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  };

  const exportCsv = () => {
    const rows: string[][] = [
      [
        t('col_product'),
        t('col_code'),
        t('col_group'),
        t('col_regos'),
        t('col_counted'),
        t('col_pct'),
        t('col_price'),
        t('col_sum'),
        t('col_status'),
        t('col_counter'),
      ],
      ...(data?.byProduct ?? []).map((r) => [
        r.name,
        r.code ?? '',
        r.groupName ?? '',
        String(r.expectedQty),
        String(r.netQty),
        `${r.pct}%`,
        fmtMoney(r.salePriceMinor),
        fmtMoney(r.moneyMinor),
        r.status,
        r.counterName,
      ]),
    ];
    downloadCsv('inventerizatsiya-hisobot.csv', rows);
  };

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: t('period_today') },
    { key: '7d', label: t('period_7d') },
    { key: '30d', label: t('period_30d') },
    { key: 'all', label: t('period_all') },
  ];
  const rtabs: { key: RTab; label: string }[] = [
    { key: 'product', label: t('rtab_product') },
    { key: 'counter', label: t('rtab_counter') },
    { key: 'group', label: t('rtab_group') },
    { key: 'reason', label: t('rtab_reason') },
    { key: 'top', label: t('rtab_top') },
  ];

  const buckets =
    rtab === 'counter' ? data?.byCounter : rtab === 'group' ? data?.byGroup : data?.byReason;
  const productRows = rtab === 'top' ? data?.top10 : data?.byProduct;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
          <div className="text-[var(--ms-text-muted)] text-xs">🔴 {t('kpi_loss')}</div>
          <div className="mt-1 font-semibold text-[var(--ms-destructive-500)] text-xl">
            {fmtMoney(data?.lossMinor ?? '0')}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
          <div className="text-[var(--ms-text-muted)] text-xs">🟢 {t('kpi_surplus')}</div>
          <div className="mt-1 font-semibold text-[var(--ms-success-600)] text-xl">
            {fmtMoney(data?.surplusMinor ?? '0')}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
          <div className="text-[var(--ms-text-muted)] text-xs">📊 {t('kpi_net')}</div>
          <div className="mt-1 font-semibold text-[var(--ms-text-primary)] text-xl">
            {fmtMoney(data?.netMinor ?? '0')}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-3 py-1 text-sm ${
                period === p.key
                  ? 'bg-[var(--ms-text-brand)] text-white'
                  : 'bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportSnapshot}>
            {t('export_snapshot')}
          </Button>
          <Button variant="secondary" onClick={exportPdf}>
            {t('export_pdf')}
          </Button>
          <Button variant="secondary" onClick={exportXlsx}>
            {t('export_xlsx')}
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            {t('export_csv')}
          </Button>
          <Button variant="destructive" onClick={handleReset} disabled={resetMut.isPending}>
            {t('reset')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-[var(--ms-border)] border-b">
        {rtabs.map((rt) => (
          <button
            key={rt.key}
            type="button"
            onClick={() => setRtab(rt.key)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              rtab === rt.key
                ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                : 'border-transparent text-[var(--ms-text-muted)]'
            }`}
          >
            {rt.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--ms-border)]">
        {rtab === 'product' || rtab === 'top' ? (
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_product')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_group')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_regos')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_counted')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_pct')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_sum')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('col_status')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_counter')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ms-border)]">
              {(productRows ?? []).map((r) => (
                <tr key={r.productId} className="hover:bg-[var(--ms-bg-subtle)]">
                  <td className="px-3 py-2 text-[var(--ms-text-primary)]">{r.name}</td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)]">{r.groupName ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.expectedQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.netQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.pct}%</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      Number(r.moneyMinor) < 0
                        ? 'text-[var(--ms-destructive-500)]'
                        : 'text-[var(--ms-success-600)]'
                    }`}
                  >
                    {fmtMoney(r.moneyMinor)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${STATUS_DOT[r.status]}`}
                      title={r.status}
                    />
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)]">{r.counterName}</td>
                </tr>
              ))}
              {(productRows ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[var(--ms-text-muted)]">
                    {t('no_data')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  {rtab === 'counter'
                    ? t('col_counter')
                    : rtab === 'group'
                      ? t('col_group')
                      : t('select_reason')}
                </th>
                <th className="px-3 py-2 text-right font-medium">{t('col_count')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_sum')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ms-border)]">
              {(buckets ?? []).map((b) => (
                <tr key={b.key} className="hover:bg-[var(--ms-bg-subtle)]">
                  <td className="px-3 py-2 text-[var(--ms-text-primary)]">{b.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.count}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      Number(b.moneyMinor) < 0
                        ? 'text-[var(--ms-destructive-500)]'
                        : 'text-[var(--ms-success-600)]'
                    }`}
                  >
                    {fmtMoney(b.moneyMinor)}
                  </td>
                </tr>
              ))}
              {(buckets ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-[var(--ms-text-muted)]">
                    {t('no_data')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
