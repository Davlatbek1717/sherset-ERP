'use client';

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Container,
  Input,
  NativeSelect,
  PageHeader,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface StoreRef {
  id: string;
  name: string;
}

interface VarianceRow {
  inventoryId: string;
  inventoryName: string;
  storeId: string;
  storeName: string;
  moment: string;
  surplusLineCount: number;
  shortageLineCount: number;
  surplusQty: string;
  shortageQty: string;
  varianceCostMinor: string;
}

interface InventoryVarianceResponse {
  from: string;
  to: string;
  storeId: string | null;
  totals: {
    inventoryCount: number;
    totalSurplusQty: string;
    totalShortageQty: string;
    totalVarianceCostMinor: string;
  };
  rows: VarianceRow[];
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

export default function InventoryVarianceReport() {
  const t = useTranslations('pages.report_inventory_variance');
  const tCommon = useTranslations('common');

  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [storeId, setStoreId] = useState<string>('');

  const params = new URLSearchParams({ limit: '200' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (storeId) params.set('storeId', storeId);

  const { data: stores } = useQuery<{ items: StoreRef[] }>({
    queryKey: ['stores-active'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/stores?archived=false&limit=50'),
  });

  const { data, isLoading, error, refetch } = useQuery<InventoryVarianceResponse>({
    queryKey: ['report-inventory-variance', from, to, storeId],
    queryFn: () =>
      api.get<InventoryVarianceResponse>(`/reports/inventory-variance?${params.toString()}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(
      [
        { header: t('col_inventory'), cellText: (r: VarianceRow) => r.inventoryName },
        { header: t('col_store'), cellText: (r: VarianceRow) => r.storeName },
        { header: t('col_moment'), cellText: (r: VarianceRow) => r.moment.slice(0, 10) },
        {
          header: t('col_surplus_lines'),
          cellText: (r: VarianceRow) => String(r.surplusLineCount),
        },
        {
          header: t('col_shortage_lines'),
          cellText: (r: VarianceRow) => String(r.shortageLineCount),
        },
        { header: t('col_surplus_qty'), cellText: (r: VarianceRow) => r.surplusQty },
        { header: t('col_shortage_qty'), cellText: (r: VarianceRow) => r.shortageQty },
        {
          header: t('col_variance_cost'),
          cellText: (r: VarianceRow) => r.varianceCostMinor,
        },
      ],
      data.rows,
    );
    downloadCsv(`inventory-variance-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="full" className="py-4">
      <Breadcrumb
        items={[{ label: tCommon('reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_from')}</div>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_to')}</div>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_store')}</div>
          <NativeSelect
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">{t('all_stores')}</option>
            {stores?.items?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="button" variant="primary" onClick={() => refetch()} loading={isLoading}>
          {tCommon('apply')}
        </Button>
        <Button type="button" variant="tertiary" onClick={exportCsv} disabled={!data}>
          {tCommon('export_csv')}
        </Button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-[var(--ms-destructive-200)] bg-[var(--ms-destructive-50)] p-3 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="overflow-auto rounded border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">{t('col_inventory')}</th>
                <th className="px-3 py-2 text-left">{t('col_store')}</th>
                <th className="px-3 py-2 text-left">{t('col_moment')}</th>
                <th className="px-3 py-2 text-right">{t('col_surplus_lines')}</th>
                <th className="px-3 py-2 text-right">{t('col_shortage_lines')}</th>
                <th className="px-3 py-2 text-right">{t('col_surplus_qty')}</th>
                <th className="px-3 py-2 text-right">{t('col_shortage_qty')}</th>
                <th className="px-3 py-2 text-right">{t('col_variance_cost')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.inventoryId}
                  className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                >
                  <td className="px-3 py-2 font-medium">{r.inventoryName}</td>
                  <td className="px-3 py-2">{r.storeName}</td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] tabular-nums">
                    {r.moment.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.surplusLineCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.shortageLineCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.surplusQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.shortageQty}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(BigInt(r.varianceCostMinor), 'UZS')}
                  </td>
                </tr>
              ))}
              {data.rows.length > 0 && (
                <tr className="bg-[var(--ms-bg-muted)] font-semibold">
                  <td className="px-3 py-2">
                    {t('row_total')} ({data.totals.inventoryCount})
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums">
                    {data.totals.totalSurplusQty}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {data.totals.totalShortageQty}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(BigInt(data.totals.totalVarianceCostMinor), 'UZS')}
                  </td>
                </tr>
              )}
              {data.rows.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[var(--ms-text-muted)] text-sm">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
