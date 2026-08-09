'use client';

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  Badge,
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  NativeSelect,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TaxRateRow {
  id: string;
  rate: string | number;
  comment: string | null;
  shared: boolean;
  archived: boolean;
}

const LIMIT = 50;

export default function TaxRatesPage() {
  const t = useTranslations('pages.tax_rate_admin');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [sortKey, setSortKey] = useState<string>('rate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(true);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    sortBy: sortKey,
    sortDir,
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse<TaxRateRow>>({
    queryKey: ['tax-rates', search, archived, sortKey, sortDir],
    queryFn: () => api.get<ListResponse<TaxRateRow>>(`/tax-rates?${params.toString()}`),
  });

  // moysklad's tax-rate list uses moyskladToolbar + Фильтр panel (no
  // pill sub-tabs). Holat filtering is the inline panel below, backed by
  // TaxRateFilterSchema (archived/search). No SavedFiltersPills.

  const columns: DataTableColumn<TaxRateRow>[] = [
    {
      key: 'rate',
      header: t('col_rate'),
      sortable: true,
      sortField: 'rate',
      cell: (row) => (
        <a
          href={`/settings/tax-rates/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {Number(row.rate).toFixed(2)}%
        </a>
      ),
      cellText: (row) => `${Number(row.rate).toFixed(2)}%`,
    },
    {
      key: 'comment',
      header: t('col_comment'),
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.comment ?? '—'}</span>
      ),
      cellText: (row) => row.comment ?? '',
    },
    {
      key: 'state',
      header: t('col_state'),
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
      testId="tax-rates-page"
      title={t('title')}
      moyskladToolbar
      subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
      createHref="/settings/tax-rates/new"
      createLabel={t('create_button')}
      createPosition="start"
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => setSearchInput(v)}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `tax-rate-row-${row.id}`}
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
      hasActiveFilter={!!search || archived === 'archived'}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
      }}
      headerSlot={
        <InlineFilterPanel
          hidden={!filterOpen}
          applyLabel={tFilters('find')}
          clearLabel={tFilters('clear')}
          onClear={() => setArchived('active')}
          testId="tax-rates-inline-filter"
        >
          <InlineFilterPanel.Field label={tFields('state')} expandable>
            <NativeSelect
              value={archived}
              onChange={(e) => setArchived(e.target.value as 'active' | 'archived')}
              data-test-id="filter-archived"
            >
              <option value="active">{tCommon('active')}</option>
              <option value="archived">{tCommon('archived')}</option>
            </NativeSelect>
          </InlineFilterPanel.Field>
        </InlineFilterPanel>
      }
      extraActionsLeft={
        <FilterToggleButton
          open={filterOpen}
          onToggle={() => setFilterOpen((v) => !v)}
          label={tFilters('trigger')}
        />
      }
    />
  );
}
