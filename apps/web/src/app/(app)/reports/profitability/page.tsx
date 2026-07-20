'use client';

/**
 * «Прибыльность» (Profitability) — moysklad-parity per-SKU margin
 * report. For a date window, lists every product sold along with
 * revenue, COGS, gross margin and margin %. Sortable per column;
 * defaults to margin-DESC so the highest earners surface first.
 *
 * Data flows from POST /reports/profitability which JOINs
 * demand_positions × demands (state=posted, in window) and
 * GROUPs by product. costMinor on each line is the FIFO-frozen
 * per-unit cost set when the demand was posted; rows where it
 * was NULL contribute 0 to COGS (so margin == revenue), flagged
 * implicitly by the FE noting "no cost basis" — explicit badge
 * deferred to a later UX pass.
 */

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Checkbox,
  Container,
  Icons,
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
import { useMemo, useState } from 'react';

interface StoreRef {
  id: string;
  name: string;
}

interface ProfRow {
  productId: string;
  name: string;
  code: string | null;
  uom: string | null;
  quantitySold: string;
  revenueMinor: string;
  cogsMinor: string;
  marginMinor: string;
  marginPercent: string;
}

interface ProfReport {
  filter: { dateFrom: string; dateTo: string };
  totals: {
    quantitySold: string;
    revenueMinor: string;
    cogsMinor: string;
    marginMinor: string;
    marginPercent: string;
  };
  rows: ProfRow[];
  // moysklad parity (Tier-2): figures consolidated into the account base
  // (валюта учёта); mixedCurrency flags multi-currency source periods.
  currency: string;
  mixedCurrency: boolean;
}

type SortKey = 'name' | 'quantity' | 'revenue' | 'cogs' | 'margin' | 'marginPct';
type SortDir = 'asc' | 'desc';

const INPUT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

function defaultDateFrom(): string {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProfitabilityReportPage() {
  const t = useTranslations('pages.report_profitability');

  const [dateFrom, setDateFrom] = useState<string>(defaultDateFrom());
  const [dateTo, setDateTo] = useState<string>(defaultDateTo());
  const [storeId, setStoreId] = useState<string>('');
  const [excludeZero, setExcludeZero] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('margin');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: stores } = useQuery<{ items: StoreRef[] }>({
    queryKey: ['stores-active'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/stores?archived=false&limit=50'),
  });

  const { data, isLoading, error } = useQuery<ProfReport>({
    queryKey: ['reports', 'profitability', dateFrom, dateTo, storeId, excludeZero],
    queryFn: () => {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        excludeZeroRevenue: String(excludeZero),
        limit: '500',
      });
      if (storeId) params.set('storeId', storeId);
      return api.get<ProfReport>(`/reports/profitability?${params}`);
    },
  });

  // Client-side sort (server already returns up to 500 rows, so a JS
  // sort is faster than re-querying). Keys map to ProfRow numeric or
  // string comparisons; numeric fields are converted via BigInt /
  // Number to avoid lexicographic surprises (e.g. "9000" > "10000").
  const sortedRows = useMemo<ProfRow[]>(() => {
    if (!data?.rows) return [];
    const rows = [...data.rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'quantity':
          return (Number(a.quantitySold) - Number(b.quantitySold)) * dir;
        case 'revenue':
          return Number(BigInt(a.revenueMinor) - BigInt(b.revenueMinor)) * dir;
        case 'cogs':
          return Number(BigInt(a.cogsMinor) - BigInt(b.cogsMinor)) * dir;
        case 'margin':
          return Number(BigInt(a.marginMinor) - BigInt(b.marginMinor)) * dir;
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
    const csv = buildCsv<ProfRow>(
      [
        { header: t('col_product'), cellText: (r) => r.name },
        { header: t('col_code'), cellText: (r) => r.code ?? '' },
        { header: t('col_quantity'), cellText: (r) => r.quantitySold },
        {
          header: t('col_revenue'),
          cellText: (r) => formatMoney(r.revenueMinor, 'UZS', { displayAs: 'none' }),
        },
        {
          header: t('col_cogs'),
          cellText: (r) => formatMoney(r.cogsMinor, 'UZS', { displayAs: 'none' }),
        },
        {
          header: t('col_margin'),
          cellText: (r) => formatMoney(r.marginMinor, 'UZS', { displayAs: 'none' }),
        },
        {
          header: t('col_margin_pct'),
          cellText: (r) => (r.marginPercent ? `${r.marginPercent}%` : ''),
        },
      ],
      sortedRows,
    );
    downloadCsv(`profitability-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="full" className="py-4">
      <Breadcrumb
        items={[{ label: t('breadcrumb_reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3">
        <div>
          <label
            htmlFor="prof-date-from"
            className="mb-1 block text-[var(--ms-text-muted)] text-xs"
          >
            {t('date_from')}
          </label>
          <Input
            id="prof-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="prof-date-from"
          />
        </div>
        <div>
          <label htmlFor="prof-date-to" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('date_to')}
          </label>
          <Input
            id="prof-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="prof-date-to"
          />
        </div>
        <div>
          <label htmlFor="prof-store" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('field_store')}
          </label>
          <NativeSelect
            id="prof-store"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="prof-store"
          >
            <option value="">{t('all_stores')}</option>
            {stores?.items?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="mb-1 inline-flex select-none items-center gap-2 text-sm">
          <Checkbox
            checked={excludeZero}
            onCheckedChange={(v) => setExcludeZero(v === true)}
            data-test-id="prof-exclude-zero"
          />
          {t('exclude_zero_revenue')}
        </label>
        <div className="ml-auto">
          <Button
            variant="tertiary"
            size="sm"
            onClick={onExportCsv}
            disabled={!data || sortedRows.length === 0}
            data-test-id="prof-export-csv"
          >
            <Icons.download className="h-4 w-4" />
            {t('export_csv')}
          </Button>
        </div>
      </div>

      {data?.mixedCurrency && (
        <div
          className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs"
          data-test-id="prof-mixed-currency-warn"
        >
          {t('currency_mixed_warn')}
        </div>
      )}

      {isLoading && <div className="mt-6 text-[var(--ms-text-muted)] text-sm">{t('loading')}</div>}
      {error && (
        <div className="mt-6 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="mt-3 overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
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
                  data-test-id="prof-sort-name"
                >
                  {t('col_product')}
                  {sortGlyph('name')}
                </th>
                <th className="px-3 py-2 text-left font-medium">{t('col_code')}</th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('quantity')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('quantity');
                    }
                  }}
                  data-test-id="prof-sort-quantity"
                >
                  {t('col_quantity')}
                  {sortGlyph('quantity')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('revenue')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('revenue');
                    }
                  }}
                  data-test-id="prof-sort-revenue"
                >
                  {t('col_revenue')}
                  {sortGlyph('revenue')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('cogs')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('cogs');
                    }
                  }}
                  data-test-id="prof-sort-cogs"
                >
                  {t('col_cogs')}
                  {sortGlyph('cogs')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('margin')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('margin');
                    }
                  }}
                  data-test-id="prof-sort-margin"
                >
                  {t('col_margin')}
                  {sortGlyph('margin')}
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
                  data-test-id="prof-sort-margin-pct"
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
                const marginIsNegative = BigInt(r.marginMinor) < 0n;
                return (
                  <tr
                    key={r.productId}
                    className="border-[var(--ms-border-subtle)] border-b last:border-b-0 hover:bg-[var(--ms-bg-muted)]/50"
                    data-test-id={`prof-row-${r.productId}`}
                  >
                    <td className="px-3 py-2">
                      <a
                        href={`/products/${r.productId}`}
                        className="text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                      >
                        {r.name}
                      </a>
                      {r.uom && (
                        <span className="ml-1 text-[var(--ms-text-muted)] text-xs">/ {r.uom}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {r.code ?? ''}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.quantitySold}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(r.revenueMinor, 'UZS', { displayAs: 'none' })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ms-text-muted)]">
                      {formatMoney(r.cogsMinor, 'UZS', { displayAs: 'none' })}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        marginIsNegative
                          ? 'text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-success)]'
                      }`}
                    >
                      {formatMoney(r.marginMinor, 'UZS', { displayAs: 'none' })}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        marginIsNegative
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
            {sortedRows.length > 0 && (
              <tfoot className="border-[var(--ms-border-strong)] border-t-2 bg-[var(--ms-bg-muted)]">
                <tr>
                  <td colSpan={2} className="px-3 py-2 font-semibold">
                    {t('totals')}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {data.totals.quantitySold}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(data.totals.revenueMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(data.totals.cogsMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(data.totals.marginMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {data.totals.marginPercent ? `${data.totals.marginPercent}%` : '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Container>
  );
}
