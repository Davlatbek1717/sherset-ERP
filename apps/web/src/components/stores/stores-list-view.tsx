'use client';

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import {
  Badge,
  type DataTableColumn,
  ListView,
  type ListViewFilter,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface StoreRow {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  allowNegativeStock: boolean;
  archived: boolean;
}

interface ListResponse {
  items: StoreRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

/**
 * Warehouse (Склады) list — shared by both the Settings-chrome route
 * (`/settings/stores`) and the Склад-section route (`/stores`). The two pages
 * differ ONLY in which top-nav module is active (derived from the URL in the
 * app layout), so the list itself is one component. Create/edit reuse the
 * existing form pages under `formBasePath`.
 */
export function StoresListView({ formBasePath = '/settings/stores' }: { formBasePath?: string }) {
  const t = useTranslations('pages.stores');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

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
    queryKey: ['stores', search, archived, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/admin/stores?${params.toString()}`),
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

  const columns: DataTableColumn<StoreRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`${formBasePath}/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'code',
      header: t('code'),
      width: '120px',
      sortable: true,
      sortField: 'code',
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">{row.code ?? '—'}</span>
      ),
      cellText: (row) => row.code ?? '',
    },
    {
      key: 'address',
      header: t('address'),
      cell: (row) => (
        <span className="block max-w-[280px] truncate text-[var(--ms-text-muted)] text-sm">
          {row.address ?? '—'}
        </span>
      ),
      cellText: (row) => row.address ?? '',
    },
    {
      key: 'allowNegativeStock',
      header: t('allow_negative_stock'),
      width: '180px',
      cell: (row) =>
        row.allowNegativeStock ? (
          <Badge tone="warning">{t('allow_negative_stock')}</Badge>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (row) => (row.allowNegativeStock ? 'yes' : 'no'),
    },
    {
      key: 'archived',
      header: tFields('state'),
      width: '120px',
      cell: (row) => (
        <Badge tone={archivedTone(row.archived)}>
          {row.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (row) => (row.archived ? 'archived' : 'active'),
    },
  ];

  return (
    <ListView
      testId="settings-stores-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      createHref={`${formBasePath}/new`}
      createLabel={t('create_button')}
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
      rowTestId={(row) => `store-row-${row.id}`}
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
