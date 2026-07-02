'use client';

import { api } from '@/lib/api-client';
import { channelKindTone, syncStatusTone } from '@/lib/domain-status-tone';
import {
  Badge,
  type DataTableColumn,
  ListView,
  type ListViewFilter,
  formatDate,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ChannelRow {
  id: string;
  name: string;
  kind: string;
  externalRef: string | null;
  archived: boolean;
  lastSyncedAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncMsg: string | null;
  createdAt: string;
  _count: { orders: number };
}

interface ListResponse {
  items: ChannelRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function SalesChannelsPage() {
  const t = useTranslations('pages.sales_channels');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['sales-channels', search, archived, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/sales-channels?${params.toString()}`),
  });

  const filters: ListViewFilter[] = [
    {
      key: 'active',
      label: tCommon('active'),
      active: archived === 'active',
      onClick: () => {
        setArchived('active');
        setCursor(undefined);
      },
    },
    {
      key: 'archived',
      label: tCommon('archived'),
      active: archived === 'archived',
      onClick: () => {
        setArchived('archived');
        setCursor(undefined);
      },
    },
  ];

  const columns: DataTableColumn<ChannelRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      cell: (row) => (
        <a
          href={`/ecommerce/channels/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'kind',
      header: t('kind'),
      width: '160px',
      cell: (row) => (
        <Badge tone={channelKindTone(row.kind)}>
          {t(`kinds.${row.kind}` as Parameters<typeof t>[0])}
        </Badge>
      ),
      cellText: (row) => row.kind,
    },
    {
      key: 'externalRef',
      header: t('external_ref'),
      cell: (row) => (
        <span className="block max-w-xs truncate text-[var(--ms-text-muted)] text-sm">
          {row.externalRef ?? '—'}
        </span>
      ),
      cellText: (row) => row.externalRef ?? '',
    },
    {
      key: 'orders',
      header: t('orders_count'),
      width: '100px',
      cell: (row) => <span className="text-sm tabular-nums">{row._count.orders}</span>,
      cellText: (row) => String(row._count.orders),
    },
    {
      key: 'sync',
      header: t('last_sync'),
      width: '160px',
      cell: (row) => {
        if (!row.lastSyncedAt)
          return <span className="text-[var(--ms-text-muted)] text-sm">—</span>;
        const tone = syncStatusTone(row.lastSyncOk);
        // lastSyncOk === null (never evaluated) → no badge: unknown is not an
        // error (mirrors the channel detail page's `!== null` guard).
        if (tone === null) {
          return (
            <span className="text-[var(--ms-text-muted)] text-sm">
              {formatDate(row.lastSyncedAt)}
            </span>
          );
        }
        return <Badge tone={tone}>{formatDate(row.lastSyncedAt)}</Badge>;
      },
      cellText: (row) => (row.lastSyncedAt ? formatDate(row.lastSyncedAt) : ''),
    },
  ];

  return (
    <ListView
      testId="sales-channels-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      createHref="/ecommerce/channels/new"
      createLabel={t('create_button')}
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
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `channel-row-${row.id}`}
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
