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

interface SlowMoverRow {
  productId: string;
  name: string;
  code: string | null;
  storeId: string;
  storeName: string;
  qtyOnHand: string;
  costMinor: string | null;
  tiedCapitalMinor: string | null;
  daysSinceLastSale: number | null;
  daysSinceReceived: number | null;
}

interface SlowMoversResponse {
  thresholdDays: number;
  asOf: string;
  storeId: string | null;
  totalRows: number;
  totalTiedCapitalMinor: string;
  rows: SlowMoverRow[];
  /** Account base (валюта учёта) — tied capital is already in it. */
  currency: string;
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

export default function SlowMoversReport() {
  const t = useTranslations('pages.report_slow_movers');
  const tCommon = useTranslations('common');

  const [thresholdDays, setThresholdDays] = useState<string>('90');
  const [storeId, setStoreId] = useState<string>('');

  const params = new URLSearchParams({ thresholdDays, limit: '200' });
  if (storeId) params.set('storeId', storeId);

  const { data: stores } = useQuery<{ items: StoreRef[] }>({
    queryKey: ['stores-active'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/stores?archived=false&limit=50'),
  });

  const { data, isLoading, error, refetch } = useQuery<SlowMoversResponse>({
    queryKey: ['report-slow-movers', thresholdDays, storeId],
    queryFn: () => api.get<SlowMoversResponse>(`/reports/slow-movers?${params.toString()}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(
      [
        { header: t('col_product'), cellText: (r: SlowMoverRow) => r.name },
        { header: t('col_code'), cellText: (r: SlowMoverRow) => r.code ?? '' },
        { header: t('col_store'), cellText: (r: SlowMoverRow) => r.storeName },
        { header: t('col_qty_on_hand'), cellText: (r: SlowMoverRow) => r.qtyOnHand },
        { header: t('col_cost'), cellText: (r: SlowMoverRow) => r.costMinor ?? '' },
        {
          header: t('col_tied_capital'),
          cellText: (r: SlowMoverRow) => r.tiedCapitalMinor ?? '',
        },
        {
          header: t('col_days_no_sale'),
          cellText: (r: SlowMoverRow) =>
            r.daysSinceLastSale === null ? '' : String(r.daysSinceLastSale),
        },
        {
          header: t('col_days_received'),
          cellText: (r: SlowMoverRow) =>
            r.daysSinceReceived === null ? '' : String(r.daysSinceReceived),
        },
      ],
      data.rows,
    );
    downloadCsv(`slow-movers-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="md" className="py-4">
      <Breadcrumb
        items={[{ label: tCommon('reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
            {t('field_threshold_days')}
          </div>
          <Input
            type="number"
            min={1}
            value={thresholdDays}
            onChange={(e) => setThresholdDays(e.target.value)}
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
                <th className="px-3 py-2 text-left">{t('col_product')}</th>
                <th className="px-3 py-2 text-left">{t('col_code')}</th>
                <th className="px-3 py-2 text-left">{t('col_store')}</th>
                <th className="px-3 py-2 text-right">{t('col_qty_on_hand')}</th>
                <th className="px-3 py-2 text-right">{t('col_cost')}</th>
                <th className="px-3 py-2 text-right">{t('col_tied_capital')}</th>
                <th className="px-3 py-2 text-right">{t('col_days_no_sale')}</th>
                <th className="px-3 py-2 text-right">{t('col_days_received')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={`${r.productId}-${r.storeId}`}
                  className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                >
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)]">{r.code ?? '—'}</td>
                  <td className="px-3 py-2">{r.storeName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.qtyOnHand}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.costMinor === null ? '—' : formatMoney(BigInt(r.costMinor), data.currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {r.tiedCapitalMinor === null
                      ? '—'
                      : formatMoney(BigInt(r.tiedCapitalMinor), data.currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                    {r.daysSinceLastSale === null ? t('never') : String(r.daysSinceLastSale)}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                    {r.daysSinceReceived === null ? '—' : String(r.daysSinceReceived)}
                  </td>
                </tr>
              ))}
              {data.rows.length > 0 && (
                <tr className="bg-[var(--ms-bg-muted)] font-semibold">
                  <td className="px-3 py-2">{t('row_total')}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums">{data.totalRows}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(BigInt(data.totalTiedCapitalMinor), data.currency)}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
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
