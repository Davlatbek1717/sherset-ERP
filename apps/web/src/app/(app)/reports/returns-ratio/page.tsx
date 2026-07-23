'use client';

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Checkbox,
  Container,
  Input,
  NativeSelect,
  PageHeader,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatIso,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type GroupBy = 'product' | 'counterparty';

interface ReturnsRow {
  groupId: string;
  groupName: string;
  groupCode: string | null;
  soldQty: string;
  soldRevenueMinor: string;
  returnedQty: string;
  returnedRevenueMinor: string;
  /**
   * ratio is ALREADY a percent (0..1000, capped at 1000%) — see
   * returns-ratio.service.ts:165-168. Render it directly; do NOT
   * multiply by 100.
   */
  ratio: number;
}

interface ReturnsReport {
  filter: { from: string; to: string; groupBy: GroupBy; onlyWithReturns: boolean };
  totals: {
    soldQty: string;
    soldRevenueMinor: string;
    returnedQty: string;
    returnedRevenueMinor: string;
    ratio: number;
  };
  rows: ReturnsRow[];
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

const SELECT_CLASS = INPUT_CLASS;

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  const fmt = (d: Date) => formatIso(d);
  return { from: fmt(from), to: fmt(today) };
}

// `r` is a percent (0..1000), not a 0..1 fraction — thresholds are in
// percent: >=20% destructive, >=10% warning.
function ratioColor(r: number): string {
  if (r >= 20) return 'text-[var(--ms-text-destructive)]';
  if (r >= 10) return 'text-[var(--ms-text-warning)]';
  return 'text-[var(--ms-text-muted)]';
}

export default function ReturnsRatioReport() {
  const t = useTranslations('pages.report_returns_ratio');
  const tCommon = useTranslations('common');

  const [{ from, to }, setRange] = useState(defaultRange);
  const [groupBy, setGroupBy] = useState<GroupBy>('product');
  const [onlyWithReturns, setOnlyWithReturns] = useState(true);

  const params = new URLSearchParams({
    from,
    to,
    groupBy,
    onlyWithReturns: String(onlyWithReturns),
  });

  const { data, isLoading, error, refetch } = useQuery<ReturnsReport>({
    queryKey: ['report-returns-ratio', from, to, groupBy, onlyWithReturns],
    queryFn: () => api.get<ReturnsReport>(`/reports/returns-ratio?${params.toString()}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(
      [
        { header: t('col_name'), cellText: (r: ReturnsRow) => r.groupName },
        { header: t('col_code'), cellText: (r: ReturnsRow) => r.groupCode ?? '' },
        { header: t('col_sold_qty'), cellText: (r: ReturnsRow) => r.soldQty },
        { header: t('col_sold_revenue'), cellText: (r: ReturnsRow) => r.soldRevenueMinor },
        { header: t('col_returned_qty'), cellText: (r: ReturnsRow) => r.returnedQty },
        {
          header: t('col_returned_revenue'),
          cellText: (r: ReturnsRow) => r.returnedRevenueMinor,
        },
        {
          header: t('col_ratio'),
          // ratio is already a percent (0..1000) from the BE — do NOT ×100.
          cellText: (r: ReturnsRow) => `${r.ratio.toFixed(2)}%`,
        },
      ],
      data.rows,
    );
    downloadCsv(`returns-ratio-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="md" className="py-4">
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
            onChange={(e) => setRange({ from: e.target.value, to })}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_to')}</div>
          <Input
            type="date"
            value={to}
            onChange={(e) => setRange({ from, to: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_group_by')}</div>
          <NativeSelect
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className={SELECT_CLASS}
          >
            <option value="product">{t('group_product')}</option>
            <option value="counterparty">{t('group_counterparty')}</option>
          </NativeSelect>
        </div>
        <label
          htmlFor="onlyWithReturns"
          className="mb-1 inline-flex cursor-pointer items-center gap-2 text-sm"
        >
          <Checkbox
            id="onlyWithReturns"
            checked={onlyWithReturns}
            onCheckedChange={(v) => setOnlyWithReturns(!!v)}
          />
          <span>{t('only_with_returns')}</span>
        </label>
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
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
              <div className="text-[var(--ms-text-muted)] text-xs">{t('summary_sold')}</div>
              <div className="font-semibold text-lg tabular-nums">
                {formatMoney(BigInt(data.totals.soldRevenueMinor), 'UZS')}
              </div>
              <div className="text-[var(--ms-text-muted)] text-xs">
                {data.totals.soldQty} {t('qty_short')}
              </div>
            </div>
            <div className="rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
              <div className="text-[var(--ms-text-muted)] text-xs">{t('summary_returned')}</div>
              <div className="font-semibold text-[var(--ms-text-warning)] text-lg tabular-nums">
                {formatMoney(BigInt(data.totals.returnedRevenueMinor), 'UZS')}
              </div>
              <div className="text-[var(--ms-text-muted)] text-xs">
                {data.totals.returnedQty} {t('qty_short')}
              </div>
            </div>
            <div className="rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
              <div className="text-[var(--ms-text-muted)] text-xs">{t('summary_ratio')}</div>
              <div
                className={`font-semibold text-lg tabular-nums ${ratioColor(data.totals.ratio)}`}
              >
                {data.totals.ratio.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="overflow-auto rounded border border-[var(--ms-border-default)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">{t('col_name')}</th>
                  <th className="px-3 py-2 text-left">{t('col_code')}</th>
                  <th className="px-3 py-2 text-right">{t('col_sold_qty')}</th>
                  <th className="px-3 py-2 text-right">{t('col_sold_revenue')}</th>
                  <th className="px-3 py-2 text-right">{t('col_returned_qty')}</th>
                  <th className="px-3 py-2 text-right">{t('col_returned_revenue')}</th>
                  <th className="px-3 py-2 text-right">{t('col_ratio')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.groupId}
                    className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                  >
                    <td className="px-3 py-2 font-medium">{r.groupName}</td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)]">{r.groupCode ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.soldQty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(BigInt(r.soldRevenueMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.returnedQty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(BigInt(r.returnedRevenueMinor), 'UZS')}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${ratioColor(r.ratio)}`}>
                      {r.ratio.toFixed(2)}%
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[var(--ms-text-muted)] text-sm">
                      {t('empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Container>
  );
}
