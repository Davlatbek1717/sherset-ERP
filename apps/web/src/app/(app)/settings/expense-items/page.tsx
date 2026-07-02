'use client';

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
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

interface ExpenseItemRow {
  id: string;
  name: string;
  code: string | null;
  archived: boolean;
}

interface ListResponse {
  items: ExpenseItemRow[];
  total: number;
}

const LIMIT = 50;

export default function ExpenseItemsPage() {
  const t = useTranslations('pages.expense_item_admin');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(true);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    sortBy: sortKey,
    sortDir,
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['expense-items', search, archived, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/expense-items?${params.toString()}`),
  });

  // moysklad's expense-item list uses moyskladToolbar + Фильтр panel (no
  // pill sub-tabs). Holat filtering is the inline panel below, backed by
  // ExpenseItemFilterSchema (archived/search). No SavedFiltersPills.

  const columns: DataTableColumn<ExpenseItemRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/expense-items/${row.id}`}
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
      width: '120px',
      cell: (row) => (
        <span className="font-mono text-[var(--ms-text-muted)] text-sm">{row.code ?? '—'}</span>
      ),
      cellText: (row) => row.code ?? '',
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
      testId="expense-items-page"
      title={t('title')}
      moyskladToolbar
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      createHref="/settings/expense-items/new"
      createLabel={t('create_button')}
      createPosition="start"
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => setSearchInput(v)}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `expense-item-row-${row.id}`}
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
          testId="expense-items-inline-filter"
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
