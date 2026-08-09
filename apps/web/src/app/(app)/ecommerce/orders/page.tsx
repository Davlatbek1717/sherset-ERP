'use client';

import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
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

interface OnlineOrderRow {
  id: string;
  externalOrderId: string;
  customerName: string | null;
  customerPhone: string | null;
  sumMinor: string;
  currency: string;
  state: string;
  receivedAt: string;
  channel: { id: string; name: string; kind: string } | null;
}

const LIMIT = 25;

type OrderState = 'pending' | 'accepted' | 'rejected' | 'converted';

export default function OnlineOrdersPage() {
  const t = useTranslations('pages.online_orders');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<OrderState | 'all'>('all');
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend (receivedAt DESC).
  const [sortKey, setSortKey] = useState<string>('receivedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(stateFilter !== 'all' ? { state: stateFilter } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse<OnlineOrderRow>>({
    queryKey: ['online-orders', search, stateFilter, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse<OnlineOrderRow>>(`/online-orders?${params.toString()}`),
  });

  const STATE_FILTERS: Array<OrderState | 'all'> = [
    'all',
    'pending',
    'accepted',
    'rejected',
    'converted',
  ];

  const filters: ListViewFilter[] = STATE_FILTERS.map((s) => ({
    key: s,
    label: s === 'all' ? tCommon('all') : t(`statuses.${s}`),
    active: stateFilter === s,
    onClick: () => {
      setStateFilter(s);
      setCursor(undefined);
    },
  }));

  const columns: DataTableColumn<OnlineOrderRow>[] = [
    {
      key: 'id',
      header: '#',
      width: '160px',
      cell: (row) => (
        <a
          href={`/ecommerce/orders/${row.id}`}
          className="font-mono text-[var(--ms-text-primary)] text-xs underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.externalOrderId}
        </a>
      ),
      cellText: (row) => row.externalOrderId,
    },
    {
      key: 'state',
      header: t('state'),
      width: '120px',
      cell: (row) => (
        <Badge tone={documentStateTone(row.state as OrderState)}>
          {t(`statuses.${row.state}` as Parameters<typeof t>[0])}
        </Badge>
      ),
      cellText: (row) => row.state,
    },
    {
      key: 'customer',
      header: t('customer_name'),
      cell: (row) => (
        <div>
          <div className="text-sm">{row.customerName ?? '—'}</div>
          {row.customerPhone && (
            <div className="text-[var(--ms-text-muted)] text-xs">{row.customerPhone}</div>
          )}
        </div>
      ),
      cellText: (row) => row.customerName ?? '',
    },
    {
      key: 'channel',
      header: t('channel'),
      width: '160px',
      cell: (row) =>
        row.channel ? (
          <a
            href={`/ecommerce/channels/${row.channel.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {row.channel.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-sm">—</span>
        ),
      cellText: (row) => row.channel?.name ?? '',
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: t('sum'),
      width: '140px',
      sortable: true,
      cell: (row) => (
        <span className="font-semibold text-sm tabular-nums">
          {formatMoney(row.sumMinor, row.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (row) => (row.sumMinor ? formatMoney(row.sumMinor, row.currency) : ''),
    },
    {
      key: 'receivedAt',
      sortField: 'receivedAt',
      header: t('received_at'),
      width: '140px',
      sortable: true,
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{formatDate(row.receivedAt)}</span>
      ),
      cellText: (row) => formatDate(row.receivedAt),
    },
  ];

  return (
    <ListView
      testId="online-orders-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
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
      rowTestId={(row) => `order-row-${row.id}`}
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
