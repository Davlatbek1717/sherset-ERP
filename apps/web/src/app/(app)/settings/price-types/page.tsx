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

interface PriceTypeRow {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
  archived: boolean;
}

interface ListResponse {
  items: PriceTypeRow[];
  total: number;
}

const LIMIT = 25;

export default function PriceTypesPage() {
  const t = useTranslations('pages.price_type_admin');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [sortKey, setSortKey] = useState<string>('position');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['price-types', search, archived, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/price-types?${params.toString()}`),
  });

  const filters: ListViewFilter[] = [
    {
      key: 'active',
      label: tCommon('active'),
      active: archived === 'active',
      onClick: () => setArchived('active'),
    },
    {
      key: 'archived',
      label: tCommon('archived'),
      active: archived === 'archived',
      onClick: () => setArchived('archived'),
    },
  ];

  const columns: DataTableColumn<PriceTypeRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/price-types/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'currency',
      header: tFields('currency'),
      width: '120px',
      cell: (row) => <span className="text-sm tabular-nums">{row.currency}</span>,
      cellText: (row) => row.currency,
    },
    {
      key: 'isDefault',
      header: t('col_default'),
      width: '140px',
      cell: (row) =>
        row.isDefault ? (
          <Badge tone="brand">{tCommon('default')}</Badge>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (row) => (row.isDefault ? 'default' : ''),
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
      testId="price-types-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      createHref="/settings/price-types/new"
      createLabel={t('create_button')}
      search={searchInput}
      onSearchChange={(v) => setSearchInput(v)}
      searchPlaceholder={t('search_placeholder')}
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `price-type-row-${row.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      hasNext={false}
      hasPrevious={false}
      onNext={() => undefined}
      onPrevious={() => undefined}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={search ? tCommon('no_results') : t('empty_title')}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
      }}
    />
  );
}
