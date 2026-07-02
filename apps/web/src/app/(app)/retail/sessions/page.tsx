'use client';

import { api } from '@/lib/api-client';
import { RETAIL_SESSION_STATE_TONE, documentStateTone } from '@/lib/document-state-tone';
import {
  Badge,
  type DataTableColumn,
  ListView,
  type ListViewFilter,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface SessionRow {
  id: string;
  state: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
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

export default function SessionsPage() {
  const t = useTranslations('pages.cashier_sessions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend (openedAt DESC).
  const [sortKey, setSortKey] = useState<string>('openedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const params = new URLSearchParams({
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(search ? { search } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const listQueryKey = ['cashier-sessions', stateFilter, search, cursor, sortKey, sortDir] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/cashier-sessions?${params.toString()}`),
  });

  const filters: ListViewFilter[] = [
    {
      key: 'all',
      label: tCommon('all'),
      active: stateFilter === null,
      onClick: () => {
        setStateFilter(null);
        setCursor(undefined);
      },
    },
    {
      key: 'open',
      label: t('statuses.open'),
      active: stateFilter === 'open',
      onClick: () => {
        setStateFilter('open');
        setCursor(undefined);
      },
    },
    {
      key: 'closed',
      label: t('statuses.closed'),
      active: stateFilter === 'closed',
      onClick: () => {
        setStateFilter('closed');
        setCursor(undefined);
      },
    },
  ];

  const columns: DataTableColumn<SessionRow>[] = [
    {
      key: 'cashier',
      header: t('cashier'),
      cell: (row) => (
        <a
          href={`/retail/sessions/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.cashier.name}
        </a>
      ),
      cellText: (r: SessionRow) => r.cashier.name,
    },
    {
      key: 'cash_desk',
      header: t('cash_desk'),
      cell: (row) => <span className="text-sm">{row.cashDesk.name}</span>,
      cellText: (r: SessionRow) => r.cashDesk.name,
    },
    // «Склад» + «Организация» — moysklad «Смены» grid columns; the BE list()
    // already fetches both (store + organization), they were just never rendered.
    {
      key: 'store',
      header: tFields('store'),
      cell: (row) => <span className="text-sm">{row.store.name}</span>,
      cellText: (r: SessionRow) => r.store.name,
    },
    {
      key: 'organization',
      header: tFields('organization'),
      cell: (row) => <span className="text-sm">{row.organization.name}</span>,
      cellText: (r: SessionRow) => r.organization.name,
    },
    {
      key: 'opened_at',
      sortField: 'openedAt',
      header: t('opened_at'),
      width: '140px',
      sortable: true,
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(row.openedAt)}</span>
      ),
      cellText: (r: SessionRow) => formatDate(r.openedAt),
    },
    {
      key: 'closed_at',
      header: t('closed_at'),
      width: '140px',
      cell: (row) =>
        row.closedAt ? (
          <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(row.closedAt)}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (r: SessionRow) => (r.closedAt ? formatDate(r.closedAt) : '—'),
    },
    {
      key: 'state',
      header: tCommon('status'),
      width: '100px',
      cell: (row) => (
        <Badge tone={documentStateTone(row.state, RETAIL_SESSION_STATE_TONE)}>
          {t(`statuses.${row.state}` as 'statuses.open' | 'statuses.closed')}
        </Badge>
      ),
      cellText: (r: SessionRow) => r.state,
    },
    {
      key: 'sales',
      sortField: 'salesSumMinor',
      header: t('sales'),
      width: '120px',
      align: 'right',
      sortable: true,
      cell: (row) => (
        <span className="text-sm tabular-nums">
          {row.salesCount} (
          {formatMoney(row.salesSumMinor, row.cashDesk.currency, { displayAs: 'none' })})
        </span>
      ),
      cellText: (r: SessionRow) =>
        `${r.salesCount} (${formatMoney(r.salesSumMinor, r.cashDesk.currency, { displayAs: 'none' })})`,
    },
    {
      key: 'discrepancy',
      header: t('discrepancy'),
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
      cellText: (r: SessionRow) =>
        r.discrepancyMinor === null
          ? '—'
          : formatMoney(r.discrepancyMinor, r.cashDesk.currency, { displayAs: 'none' }),
    },
  ];

  return (
    <ListView
      testId="sessions-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(d: SessionRow) => `session-row-${d.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      hasNext={!!data?.nextCursor}
      hasPrevious={!!cursor}
      onNext={() => setCursor(data?.nextCursor)}
      onPrevious={() => setCursor(undefined)}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={stateFilter ? tCommon('no_results') : t('empty_title')}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
        setCursor(undefined);
      }}
    />
  );
}
