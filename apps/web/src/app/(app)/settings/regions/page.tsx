'use client';

import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import { type DataTableColumn, ListView, type ListViewFilter, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface RegionRow {
  id: string;
  name: string;
  code: string | null;
  externalCode: string | null;
}

const LIMIT = 50;

export default function RegionsPage() {
  const t = useTranslations('pages.region_admin');
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

  const { data, isLoading, error, refetch } = useQuery<ListResponse<RegionRow>>({
    queryKey: ['regions', search, sortKey, sortDir],
    queryFn: () => api.get<ListResponse<RegionRow>>(`/regions?${params.toString()}`),
  });

  const columns: DataTableColumn<RegionRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/regions/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'code',
      header: t('col_code'),
      width: '140px',
      sortable: true,
      sortField: 'code',
      cell: (row) => (
        <span className="font-mono text-[var(--ms-text-muted)] text-sm">{row.code ?? '—'}</span>
      ),
      cellText: (row) => row.code ?? '',
    },
    {
      key: 'externalCode',
      header: t('col_external_code'),
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.externalCode ?? '—'}</span>
      ),
      cellText: (row) => row.externalCode ?? '',
    },
  ];

  const filters: ListViewFilter[] = [];

  return (
    <ListView
      testId="regions-page"
      title={t('title')}
      moyskladToolbar
      subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
      createHref="/settings/regions/new"
      createLabel={t('create_button')}
      createPosition="start"
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => setSearchInput(v)}
      searchPlaceholder={t('search_placeholder')}
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `region-row-${row.id}`}
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
