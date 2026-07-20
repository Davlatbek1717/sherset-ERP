'use client';

/**
 * «Управление закупками» (Purchase Management) — moysklad-parity
 * per-supplier procurement dashboard. For a date window, lists every
 * active supplier with their order volume, receipt status, invoicing
 * coverage, payment status and outstanding balance. Use case:
 * procurement monitors who needs follow-up (high outstanding,
 * low on-time delivery, pending receipt).
 *
 * Backend: GET /reports/purchase-management?dateFrom=...&dateTo=...
 * which JOINs purchase_orders × counterparties (state!=cancelled,
 * !deleted, in window) and GROUPs by agent.
 */

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
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

interface CatalogRef {
  id: string;
  name: string;
}

interface PMRow {
  agentId: string;
  agentName: string;
  agentLegalTitle: string | null;
  ordersCount: number;
  orderedSumMinor: string;
  receivedSumMinor: string;
  invoicedSumMinor: string;
  payedSumMinor: string;
  outstandingMinor: string;
  onTimeDeliveryPct: string;
}

interface PMReport {
  filter: { dateFrom: string; dateTo: string };
  totals: {
    ordersCount: number;
    orderedSumMinor: string;
    receivedSumMinor: string;
    invoicedSumMinor: string;
    payedSumMinor: string;
    outstandingMinor: string;
  };
  rows: PMRow[];
  // moysklad parity (Tier-2): purchase amounts consolidated into the account
  // base (валюта учёта); mixedCurrency flags multi-currency source periods.
  currency: string;
  mixedCurrency: boolean;
}

type SortKey =
  | 'name'
  | 'orders'
  | 'ordered'
  | 'received'
  | 'invoiced'
  | 'payed'
  | 'outstanding'
  | 'onTime';
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

/**
 * Coverage progress mini-bar — same visual idiom as the FulfilmentBar
 * on the purchase-orders list. Width = cur/target × 100%, green when
 * fully covered, orange when partially.
 */
function CoverageBar({ cur, target }: { cur: bigint; target: bigint }) {
  if (cur <= 0n || target <= 0n) return null;
  const ratio = Number(cur) / Number(target);
  const pct = Math.min(ratio, 1) * 100;
  const isFull = ratio >= 1;
  return (
    <div
      aria-hidden="true"
      className={`mt-1 ${isFull ? 'h-[3px]' : 'h-[2px]'} w-full rounded-sm bg-[var(--ms-border-subtle)]`}
    >
      <div
        className="h-full rounded-sm"
        style={{ width: `${pct}%`, backgroundColor: isFull ? '#3eb53e' : '#e8a33b' }}
      />
    </div>
  );
}

export default function PurchaseManagementReportPage() {
  const t = useTranslations('pages.report_purchase_management');

  const [dateFrom, setDateFrom] = useState<string>(defaultDateFrom());
  const [dateTo, setDateTo] = useState<string>(defaultDateTo());
  const [organizationId, setOrganizationId] = useState<string>('');
  const [storeId, setStoreId] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('ordered');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: orgs } = useQuery<{ items: CatalogRef[] }>({
    queryKey: ['organizations-active'],
    queryFn: () => api.get<{ items: CatalogRef[] }>('/organizations?limit=50'),
  });
  const { data: stores } = useQuery<{ items: CatalogRef[] }>({
    queryKey: ['stores-active'],
    queryFn: () => api.get<{ items: CatalogRef[] }>('/stores?archived=false&limit=50'),
  });

  const { data, isLoading, error } = useQuery<PMReport>({
    queryKey: ['reports', 'purchase-management', dateFrom, dateTo, organizationId, storeId],
    queryFn: () => {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        limit: '500',
      });
      if (organizationId) params.set('organizationId', organizationId);
      if (storeId) params.set('storeId', storeId);
      return api.get<PMReport>(`/reports/purchase-management?${params}`);
    },
  });

  const sortedRows = useMemo<PMRow[]>(() => {
    if (!data?.rows) return [];
    const rows = [...data.rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmpBig = (a: string, b: string) => Number(BigInt(a) - BigInt(b));
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.agentName.localeCompare(b.agentName) * dir;
        case 'orders':
          return (a.ordersCount - b.ordersCount) * dir;
        case 'ordered':
          return cmpBig(a.orderedSumMinor, b.orderedSumMinor) * dir;
        case 'received':
          return cmpBig(a.receivedSumMinor, b.receivedSumMinor) * dir;
        case 'invoiced':
          return cmpBig(a.invoicedSumMinor, b.invoicedSumMinor) * dir;
        case 'payed':
          return cmpBig(a.payedSumMinor, b.payedSumMinor) * dir;
        case 'outstanding':
          return cmpBig(a.outstandingMinor, b.outstandingMinor) * dir;
        case 'onTime': {
          const av = a.onTimeDeliveryPct === '' ? -1 : Number.parseFloat(a.onTimeDeliveryPct);
          const bv = b.onTimeDeliveryPct === '' ? -1 : Number.parseFloat(b.onTimeDeliveryPct);
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
    const csv = buildCsv<PMRow>(
      [
        { header: t('col_supplier'), cellText: (r) => r.agentName },
        { header: t('col_legal'), cellText: (r) => r.agentLegalTitle ?? '' },
        { header: t('col_orders'), cellText: (r) => String(r.ordersCount) },
        {
          header: t('col_ordered'),
          cellText: (r) => formatMoney(r.orderedSumMinor, 'UZS', { displayAs: 'none' }),
        },
        {
          header: t('col_received'),
          cellText: (r) => formatMoney(r.receivedSumMinor, 'UZS', { displayAs: 'none' }),
        },
        {
          header: t('col_invoiced'),
          cellText: (r) => formatMoney(r.invoicedSumMinor, 'UZS', { displayAs: 'none' }),
        },
        {
          header: t('col_payed'),
          cellText: (r) => formatMoney(r.payedSumMinor, 'UZS', { displayAs: 'none' }),
        },
        {
          header: t('col_outstanding'),
          cellText: (r) => formatMoney(r.outstandingMinor, 'UZS', { displayAs: 'none' }),
        },
        {
          header: t('col_on_time'),
          cellText: (r) => (r.onTimeDeliveryPct ? `${r.onTimeDeliveryPct}%` : ''),
        },
      ],
      sortedRows,
    );
    downloadCsv(`purchase-management-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="full" className="py-4">
      <Breadcrumb
        items={[{ label: t('breadcrumb_reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3">
        <div>
          <label htmlFor="pm-from" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('date_from')}
          </label>
          <Input
            id="pm-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="pm-date-from"
          />
        </div>
        <div>
          <label htmlFor="pm-to" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('date_to')}
          </label>
          <Input
            id="pm-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="pm-date-to"
          />
        </div>
        <div>
          <label
            htmlFor="pm-organization"
            className="mb-1 block text-[var(--ms-text-muted)] text-xs"
          >
            {t('field_organization')}
          </label>
          <NativeSelect
            id="pm-organization"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="pm-organization"
          >
            <option value="">{t('all_organizations')}</option>
            {orgs?.items?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="pm-store" className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('field_store')}
          </label>
          <NativeSelect
            id="pm-store"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className={INPUT_CLASS}
            data-test-id="pm-store"
          >
            <option value="">{t('all_stores')}</option>
            {stores?.items?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="ml-auto">
          <Button
            variant="tertiary"
            size="sm"
            onClick={onExportCsv}
            disabled={!data || sortedRows.length === 0}
            data-test-id="pm-export-csv"
          >
            <Icons.download className="h-4 w-4" />
            {t('export_csv')}
          </Button>
        </div>
      </div>

      {data?.mixedCurrency && (
        <div
          className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs"
          data-test-id="pm-mixed-currency-warn"
        >
          {t('currency_mixed_warn')}
        </div>
      )}

      {/* Top KPI strip — at-a-glance window totals. */}
      {data && data.totals.ordersCount > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-surface)] p-3">
            <div className="text-[var(--ms-text-muted)] text-xs">{t('kpi_orders')}</div>
            <div className="mt-1 font-semibold text-lg tabular-nums">{data.totals.ordersCount}</div>
          </div>
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-surface)] p-3">
            <div className="text-[var(--ms-text-muted)] text-xs">{t('kpi_ordered')}</div>
            <div className="mt-1 font-semibold text-lg tabular-nums">
              {formatMoney(data.totals.orderedSumMinor, 'UZS', { displayAs: 'none' })}
            </div>
          </div>
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-surface)] p-3">
            <div className="text-[var(--ms-text-muted)] text-xs">{t('kpi_received')}</div>
            <div className="mt-1 font-semibold text-lg tabular-nums">
              {formatMoney(data.totals.receivedSumMinor, 'UZS', { displayAs: 'none' })}
            </div>
          </div>
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-surface)] p-3">
            <div className="text-[var(--ms-text-muted)] text-xs">{t('kpi_outstanding')}</div>
            <div className="mt-1 font-semibold text-[var(--ms-text-destructive)] text-lg tabular-nums">
              {formatMoney(data.totals.outstandingMinor, 'UZS', { displayAs: 'none' })}
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
                  data-test-id="pm-sort-name"
                >
                  {t('col_supplier')}
                  {sortGlyph('name')}
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
                  data-test-id="pm-sort-orders"
                >
                  {t('col_orders')}
                  {sortGlyph('orders')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('ordered')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('ordered');
                    }
                  }}
                  data-test-id="pm-sort-ordered"
                >
                  {t('col_ordered')}
                  {sortGlyph('ordered')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('received')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('received');
                    }
                  }}
                  data-test-id="pm-sort-received"
                >
                  {t('col_received')}
                  {sortGlyph('received')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('invoiced')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('invoiced');
                    }
                  }}
                  data-test-id="pm-sort-invoiced"
                >
                  {t('col_invoiced')}
                  {sortGlyph('invoiced')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('payed')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('payed');
                    }
                  }}
                  data-test-id="pm-sort-payed"
                >
                  {t('col_payed')}
                  {sortGlyph('payed')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('outstanding')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('outstanding');
                    }
                  }}
                  data-test-id="pm-sort-outstanding"
                >
                  {t('col_outstanding')}
                  {sortGlyph('outstanding')}
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => onSort('onTime')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSort('onTime');
                    }
                  }}
                  data-test-id="pm-sort-on-time"
                >
                  {t('col_on_time')}
                  {sortGlyph('onTime')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-[var(--ms-text-muted)] text-sm"
                  >
                    {t('empty')}
                  </td>
                </tr>
              )}
              {sortedRows.map((r) => {
                const ordered = BigInt(r.orderedSumMinor);
                const received = BigInt(r.receivedSumMinor);
                const payed = BigInt(r.payedSumMinor);
                const outstanding = BigInt(r.outstandingMinor);
                const onTime = r.onTimeDeliveryPct ? Number.parseFloat(r.onTimeDeliveryPct) : null;
                return (
                  <tr
                    key={r.agentId}
                    className="border-[var(--ms-border-subtle)] border-b last:border-b-0 hover:bg-[var(--ms-bg-muted)]/50"
                    data-test-id={`pm-row-${r.agentId}`}
                  >
                    <td className="px-3 py-2">
                      <a
                        href={`/counterparties/${r.agentId}`}
                        className="font-medium text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                      >
                        {r.agentName}
                      </a>
                      {r.agentLegalTitle && (
                        <div className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
                          {r.agentLegalTitle}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <a
                        href={`/purchase-orders?agentId=${r.agentId}`}
                        className="text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                      >
                        {r.ordersCount}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(ordered, 'UZS', { displayAs: 'none' })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(received, 'UZS', { displayAs: 'none' })}
                      <CoverageBar cur={received} target={ordered} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ms-text-muted)]">
                      {formatMoney(BigInt(r.invoicedSumMinor), 'UZS', { displayAs: 'none' })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(payed, 'UZS', { displayAs: 'none' })}
                      <CoverageBar cur={payed} target={ordered} />
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        outstanding > 0n
                          ? 'text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-muted)]'
                      }`}
                    >
                      {formatMoney(outstanding, 'UZS', { displayAs: 'none' })}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        onTime == null
                          ? 'text-[var(--ms-text-muted)]'
                          : onTime >= 80
                            ? 'text-[var(--ms-text-success)]'
                            : onTime >= 50
                              ? 'text-[var(--ms-text-warning)]'
                              : 'text-[var(--ms-text-destructive)]'
                      }`}
                    >
                      {onTime == null ? '—' : `${onTime.toFixed(2)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {sortedRows.length > 0 && (
              <tfoot className="border-[var(--ms-border-strong)] border-t-2 bg-[var(--ms-bg-muted)]">
                <tr>
                  <td className="px-3 py-2 font-semibold">{t('totals')}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {data.totals.ordersCount}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(data.totals.orderedSumMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(data.totals.receivedSumMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(data.totals.invoicedSumMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(data.totals.payedSumMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--ms-text-destructive)]">
                    {formatMoney(data.totals.outstandingMinor, 'UZS', { displayAs: 'none' })}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Container>
  );
}
