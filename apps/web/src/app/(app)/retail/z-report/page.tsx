'use client';

import { api } from '@/lib/api-client';
import { type DataTableColumn, ListView, formatDate, formatMoney, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface SessionRow {
  id: string;
  state: 'closed';
  openedAt: string;
  closedAt: string;
  cashier: { id: string; name: string };
  cashDesk: { id: string; name: string; currency: string };
  store: { id: string; name: string };
  organization: { id: string; name: string };
  salesCount: number;
  salesSumMinor: string;
  returnsCount: number;
  returnsSumMinor: string;
  discrepancyMinor: string | null;
}

interface ListResponse {
  items: SessionRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function ZReportListPage() {
  const t = useTranslations('pages.z_report');
  const tSession = useTranslations('pages.cashier_sessions');
  const tFields = useTranslations('fields');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('openedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const params = new URLSearchParams({
    state: 'closed',
    ...(search ? { search } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['z-report-sessions', search, cursor, sortKey, sortDir] as const,
    queryFn: () => api.get<ListResponse>(`/cashier-sessions?${params.toString()}`),
  });

  const columns: DataTableColumn<SessionRow>[] = [
    {
      key: 'cashier',
      header: tSession('cashier'),
      cell: (row) => (
        <a
          href={`/retail/sessions/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.cashier.name}
        </a>
      ),
      cellText: (r) => r.cashier.name,
    },
    {
      key: 'cash_desk',
      header: tSession('cash_desk'),
      cell: (row) => <span className="text-sm">{row.cashDesk.name}</span>,
      cellText: (r) => r.cashDesk.name,
    },
    // «Склад» + «Организация» — moysklad «Смены» grid columns; the shared
    // /cashier-sessions list() already returns both, they were just never
    // rendered here (mirrors the sessions-list fix; 1:1 plan §2.5).
    {
      key: 'store',
      header: tFields('store'),
      cell: (row) => <span className="text-sm">{row.store.name}</span>,
      cellText: (r) => r.store.name,
    },
    {
      key: 'organization',
      header: tFields('organization'),
      cell: (row) => <span className="text-sm">{row.organization.name}</span>,
      cellText: (r) => r.organization.name,
    },
    {
      key: 'closed_at',
      header: tSession('closed_at'),
      width: '160px',
      sortable: true,
      sortField: 'closedAt',
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(row.closedAt)}</span>
      ),
      cellText: (r) => formatDate(r.closedAt),
    },
    {
      key: 'sales',
      header: tSession('sales'),
      width: '160px',
      align: 'right',
      cell: (row) => (
        <span className="text-sm tabular-nums">
          {row.salesCount} (
          {formatMoney(row.salesSumMinor, row.cashDesk.currency, { displayAs: 'none' })})
        </span>
      ),
      cellText: (r) =>
        `${r.salesCount} (${formatMoney(r.salesSumMinor, r.cashDesk.currency, { displayAs: 'none' })})`,
    },
    {
      key: 'returns',
      header: tSession('returns'),
      width: '160px',
      align: 'right',
      cell: (row) => (
        <span className="text-sm tabular-nums">
          {row.returnsCount} (
          {formatMoney(row.returnsSumMinor, row.cashDesk.currency, { displayAs: 'none' })})
        </span>
      ),
      cellText: (r) =>
        `${r.returnsCount} (${formatMoney(r.returnsSumMinor, r.cashDesk.currency, { displayAs: 'none' })})`,
    },
    {
      key: 'discrepancy',
      header: tSession('discrepancy'),
      width: '140px',
      align: 'right',
      cell: (row) => {
        if (row.discrepancyMinor === null)
          return <span className="text-[var(--ms-text-muted)] text-xs">—</span>;
        const d = BigInt(row.discrepancyMinor);
        return (
          <span
            className={`font-semibold text-sm tabular-nums ${
              d < 0n ? 'text-red-600' : d > 0n ? 'text-yellow-600' : 'text-green-600'
            }`}
          >
            {d >= 0n ? '+' : ''}
            {formatMoney(d, row.cashDesk.currency, { displayAs: 'none' })}
          </span>
        );
      },
      cellText: (r) =>
        r.discrepancyMinor === null
          ? '—'
          : formatMoney(r.discrepancyMinor, r.cashDesk.currency, { displayAs: 'none' }),
    },
  ];

  return (
    <ListView
      testId="z-report-list-page"
      title={t('list_title')}
      subtitle={t('list_subtitle')}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(d) => `z-report-row-${d.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      hasNext={!!data?.nextCursor}
      hasPrevious={!!cursor}
      onNext={() => setCursor(data?.nextCursor)}
      onPrevious={() => setCursor(undefined)}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={search ? tCommon('no_results') : t('empty_title')}
    />
  );
}
