'use client';

import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
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

type SaleState = 'draft' | 'posted' | 'refunded' | 'cancelled';

interface SaleRow {
  id: string;
  name: string;
  state: SaleState;
  moment: string;
  sumMinor: string;
  cashAmountMinor: string;
  cardAmountMinor: string;
  agent: { id: string; name: string } | null;
  session: {
    id: string;
    state: string;
    // SetNull relation — null after the cash desk is deleted.
    cashDesk: { id: string; name: string; currency: string } | null;
  };
  _count: { positions: number };
}

interface ListResponse {
  items: SaleRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function RetailSalesListPage() {
  const t = useTranslations('pages.retail_sales');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<SaleState | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend default.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const params = new URLSearchParams({
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(search ? { search } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['retail-sales', stateFilter, search, cursor, sortKey, sortDir] as const,
    queryFn: () => api.get<ListResponse>(`/retail-sales?${params.toString()}`),
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
    ...(['posted', 'refunded', 'draft', 'cancelled'] as SaleState[]).map((s) => ({
      key: s,
      label: t(`statuses.${s}`),
      active: stateFilter === s,
      onClick: () => {
        setStateFilter(s);
        setCursor(undefined);
      },
    })),
  ];

  const columns: DataTableColumn<SaleRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      cell: (row) => (
        <a
          href={`/retail/sales/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: t('moment'),
      width: '160px',
      sortable: true,
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(row.moment)}</span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'agent',
      header: t('agent'),
      cell: (row) => <span className="text-sm">{row.agent?.name ?? t('no_agent')}</span>,
      cellText: (r) => r.agent?.name ?? '—',
    },
    {
      key: 'cash_desk',
      header: t('cash_desk'),
      cell: (row) => <span className="text-sm">{row.session.cashDesk?.name ?? '—'}</span>,
      cellText: (r) => r.session.cashDesk?.name ?? '—',
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: t('sum'),
      width: '140px',
      align: 'right',
      sortable: true,
      cell: (row) => (
        <span className="font-semibold text-sm tabular-nums">
          {formatMoney(row.sumMinor, row.session.cashDesk?.currency ?? 'UZS', {
            displayAs: 'none',
          })}
        </span>
      ),
      cellText: (r) => formatMoney(r.sumMinor, r.session.cashDesk?.currency ?? 'UZS'),
    },
    {
      key: 'state',
      header: t('state'),
      width: '120px',
      cell: (row) => (
        <Badge tone={documentStateTone(row.state)}>{t(`statuses.${row.state}`)}</Badge>
      ),
      cellText: (r) => r.state,
    },
  ];

  return (
    <ListView
      testId="retail-sales-page"
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
      rowTestId={(d) => `retail-sale-row-${d.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      hasNext={!!data?.nextCursor}
      hasPrevious={!!cursor}
      onNext={() => setCursor(data?.nextCursor)}
      onPrevious={() => setCursor(undefined)}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={stateFilter || search ? tCommon('no_results') : t('empty_title')}
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
