'use client';

import { api } from '@/lib/api-client';
import { type DataTableColumn, ListView, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CustomEntityRow {
  id: string;
  name: string;
  _count: { values: number };
}

interface ListResponse {
  items: CustomEntityRow[];
  total: number;
}

const LIMIT = 50;

export default function CustomEntitiesPage() {
  const t = useTranslations('pages.custom_entity_admin');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    sortBy: sortKey,
    sortDir,
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['custom-entities', search, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/custom-entities?${params.toString()}`),
  });

  const columns: DataTableColumn<CustomEntityRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/custom-entities/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'values_count',
      header: t('col_values_count'),
      width: '120px',
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {row._count.values}
        </span>
      ),
      cellText: (row) => String(row._count.values),
    },
  ];

  return (
    <ListView
      testId="custom-entities-page"
      title={t('title')}
      moyskladToolbar
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      createHref="/settings/custom-entities/new"
      createLabel={t('create_button')}
      createPosition="start"
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => setSearchInput(v)}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `custom-entity-row-${row.id}`}
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
