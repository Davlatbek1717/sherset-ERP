'use client';

import { type UnconvertedAmountRow, UnconvertedNotice } from '@/components/reports/report-notices';

/**
 * «Юнит-экономика» (Unit Economics) — moysklad-parity per-SKU
 * unit-margin breakdown. Where Profitability shows TOTALS per
 * product, this report shows the AVERAGE per-unit economics:
 * avgPrice / avgCost / avgMargin / margin %, plus the underlying
 * volume so the buyer can spot cash-cows, premium niches and
 * loss-leaders at a glance.
 */

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Container,
  Icons,
  Input,
  PageHeader,
  StickyHScroll,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatIso,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface UERow {
  productId: string;
  name: string;
  code: string | null;
  uom: string | null;
  quantitySold: string;
  ordersCount: number;
  revenueMinor: string;
  cogsMinor: string;
  avgPriceMinor: string;
  avgCostMinor: string;
  avgMarginMinor: string;
  marginPercent: string;
}

interface UEReport {
  filter: { dateFrom: string; dateTo: string };
  totals: {
    quantitySold: string;
    ordersCount: number;
    revenueMinor: string;
    cogsMinor: string;
    avgMarginMinor: string;
    marginPercent: string;
  };
  rows: UERow[];
  /** Account base (валюта учёта) — revenue is consolidated into it. */
  currency: string;
  /** True when sales span >1 currency (revenue is converted). */
  mixedCurrency: boolean;
  unconvertedByCurrency: UnconvertedAmountRow[];
}

type SortKey = 'name' | 'qty' | 'orders' | 'avgPrice' | 'avgCost' | 'avgMargin' | 'marginPct';
type SortDir = 'asc' | 'desc';

const INPUT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

function defaultDateFrom(): string {
  const d = new Date();
  return formatIso(new Date(d.getFullYear(), 0, 1));
}
function defaultDateTo(): string {
  return formatIso(new Date());
}

export default function UnitEconomicsReportPage() {
  const t = useTranslations('pages.report_unit_economics');

  const [dateFrom, setDateFrom] = useState<string>(defaultDateFrom());
  const [dateTo, setDateTo] = useState<string>(defaultDateTo());
  const [minQty, setMinQty] = useState<string>('1');
  const [sortKey, setSortKey] = useState<SortKey>('avgMargin');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, error } = useQuery<UEReport>({
    queryKey: ['reports', 'unit-economics', dateFrom, dateTo, minQty],
    queryFn: () => {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        minQty: minQty || '0',
        limit: '500',
      });
      return api.get<UEReport>(`/reports/unit-economics?${params}`);
    },
  });

  const sortedRows = useMemo<UERow[]>(() => {
    if (!data?.rows) return [];
    const rows = [...data.rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmpBig = (a: string, b: string) => Number(BigInt(a) - BigInt(b));
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'qty':
          return (Number(a.quantitySold) - Number(b.quantitySold)) * dir;
        case 'orders':
          return (a.ordersCount - b.ordersCount) * dir;
        case 'avgPrice':
          return cmpBig(a.avgPriceMinor, b.avgPriceMinor) * dir;
        case 'avgCost':
          return cmpBig(a.avgCostMinor, b.avgCostMinor) * dir;
        case 'avgMargin':
          return cmpBig(a.avgMarginMinor, b.avgMarginMinor) * dir;
        case 'marginPct': {
          const av = a.marginPercent === '' ? 0 : Number.parseFloat(a.marginPercent);
          const bv = b.marginPercent === '' ? 0 : Number.parseFloat(b.marginPercent);
          return (av - bv) * dir;
        }
      }
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };
  const sortGlyph = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const onExportCsv = () => {
    if (!data) return;
    const csv = buildCsv<UERow>(
      [
        { header: t('col_product'), cellText: (r) => r.name },
        { header: t('col_code'), cellText: (r) => r.code ?? '' },
        { header: t('col_qty'), cellText: (r) => r.quantitySold },
        { header: t('col_orders'), cellText: (r) => String(r.ordersCount) },
        {
          header: t('col_avg_price'),
          cellText: (r) => formatMoney(r.avgPriceMinor, data.currency, { displayAs: 'none' }),
        },
        {
          header: t('col_avg_cost'),
          cellText: (r) => formatMoney(r.avgCostMinor, data.currency, { displayAs: 'none' }),
        },
        {
          header: t('col_avg_margin'),
          cellText: (r) => formatMoney(r.avgMarginMinor, data.currency, { displayAs: 'none' }),
        },
        {
          header: t('col_margin_pct'),
          cellText: (r) => (r.marginPercent ? `${r.marginPercent}%` : ''),
        },
      ],
      sortedRows,
    );
    downloadCsv(`unit-economics-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="lg" className="py-4">
      <Breadcrumb
        items={[{ label: t('breadcrumb_reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3">
        <div>
          <label htmlFor="ue-from" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('date_from')}
          </label>
          <Input
            id="ue-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="ue-date-from"
          />
        </div>
        <div>
          <label htmlFor="ue-to" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('date_to')}
          </label>
          <Input
            id="ue-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="ue-date-to"
          />
        </div>
        <div>
          <label htmlFor="ue-min-qty" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('min_qty')}
          </label>
          <Input
            id="ue-min-qty"
            type="number"
            min="0"
            step="1"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            className={`${INPUT_CLASS} w-24`}
            data-test-id="ue-min-qty"
          />
        </div>
        <div className="ml-auto">
          <Button
            variant="tertiary"
            size="sm"
            onClick={onExportCsv}
            disabled={!data || sortedRows.length === 0}
            data-test-id="ue-export-csv"
          >
            <Icons.download className="h-4 w-4" />
            {t('export_csv')}
          </Button>
        </div>
      </div>

      {data?.mixedCurrency && (
        <div
          className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs"
          data-test-id="ue-mixed-currency-warn"
        >
          {t('currency_mixed_warn')}
        </div>
      )}
      <UnconvertedNotice rows={data?.unconvertedByCurrency} testId="ue-unconverted-warn" />

      {data && data.rows.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-surface)] p-3">
            <div className="text-[var(--ms-text-muted)] text-xs">{t('kpi_skus')}</div>
            <div className="mt-1 font-semibold text-lg tabular-nums">{data.rows.length}</div>
          </div>
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-surface)] p-3">
            <div className="text-[var(--ms-text-muted)] text-xs">{t('kpi_qty')}</div>
            <div className="mt-1 font-semibold text-lg tabular-nums">
              {data.totals.quantitySold}
            </div>
          </div>
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-surface)] p-3">
            <div className="text-[var(--ms-text-muted)] text-xs">{t('kpi_avg_margin')}</div>
            <div className="mt-1 font-semibold text-lg tabular-nums">
              {formatMoney(data.totals.avgMarginMinor, data.currency, { displayAs: 'none' })}
            </div>
          </div>
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-surface)] p-3">
            <div className="text-[var(--ms-text-muted)] text-xs">{t('kpi_margin_pct')}</div>
            <div className="mt-1 font-semibold text-lg tabular-nums">
              {data.totals.marginPercent ? `${data.totals.marginPercent}%` : '—'}
            </div>
          </div>
        </div>
      )}

      {isLoading && <div className="mt-6 text-[var(--ms-text-muted)] text-sm">{t('loading')}</div>}
      {error && (
        <div className="mt-6 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <StickyHScroll className="mt-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] text-[var(--ms-text-secondary)]">
              <tr>
                <th
                  className="cursor-pointer px-3 py-2 text-left font-medium"
                  onClick={() => onSort('name')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('name');
                    }
                  }}
                  data-test-id="ue-sort-name"
                >
                  {t('col_product')}
                  {sortGlyph('name')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('qty')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('qty');
                    }
                  }}
                >
                  {t('col_qty')}
                  {sortGlyph('qty')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('orders')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('orders');
                    }
                  }}
                >
                  {t('col_orders')}
                  {sortGlyph('orders')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('avgPrice')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('avgPrice');
                    }
                  }}
                >
                  {t('col_avg_price')}
                  {sortGlyph('avgPrice')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('avgCost')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('avgCost');
                    }
                  }}
                >
                  {t('col_avg_cost')}
                  {sortGlyph('avgCost')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('avgMargin')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('avgMargin');
                    }
                  }}
                >
                  {t('col_avg_margin')}
                  {sortGlyph('avgMargin')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('marginPct')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('marginPct');
                    }
                  }}
                >
                  {t('col_margin_pct')}
                  {sortGlyph('marginPct')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-[var(--ms-text-muted)] text-sm"
                  >
                    {t('empty')}
                  </td>
                </tr>
              )}
              {sortedRows.map((r) => {
                const negativeMargin = BigInt(r.avgMarginMinor) < 0n;
                return (
                  <tr
                    key={r.productId}
                    className="border-[var(--ms-border-subtle)] border-b last:border-b-0 hover:bg-[var(--ms-bg-muted)]/50"
                    data-test-id={`ue-row-${r.productId}`}
                  >
                    <td className="px-3 py-2">
                      <a
                        href={`/products/${r.productId}`}
                        className="text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                      >
                        {r.name}
                      </a>
                      <span className="ml-1 text-[var(--ms-text-muted)] text-xs">
                        {r.uom ? `/ ${r.uom}` : ''}
                        {r.code ? ` · ${r.code}` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.quantitySold}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ms-text-muted)]">
                      {r.ordersCount}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(r.avgPriceMinor, data.currency, { displayAs: 'none' })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ms-text-muted)]">
                      {formatMoney(r.avgCostMinor, data.currency, { displayAs: 'none' })}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        negativeMargin
                          ? 'text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-success)]'
                      }`}
                    >
                      {formatMoney(r.avgMarginMinor, data.currency, { displayAs: 'none' })}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        negativeMargin
                          ? 'text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-secondary)]'
                      }`}
                    >
                      {r.marginPercent ? `${r.marginPercent}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </StickyHScroll>
      )}
    </Container>
  );
}
