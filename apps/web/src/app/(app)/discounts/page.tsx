'use client';

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { api } from '@/lib/api-client';
import {
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  NativeSelect,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface DiscountRow {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  archived: boolean;
}

interface ListResponse {
  items: DiscountRow[];
  total: number;
}

const LIMIT = 50;

export default function DiscountsPage() {
  const t = useTranslations('pages.discount_admin');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showArchived, setShowArchived] = useState(false);
  const [kindFilter, setKindFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    archived: String(showArchived),
    sortBy: sortKey,
    sortDir,
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['discounts', search, kindFilter, showArchived, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/discounts?${params.toString()}`),
  });

  const columns: DataTableColumn<DiscountRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/discounts/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'kind',
      header: t('col_kind'),
      width: '160px',
      cell: (row) => <span className="text-sm">{t(`kind_${row.kind}` as 'kind_special')}</span>,
      cellText: (row) => row.kind,
    },
    {
      key: 'active',
      header: t('col_active'),
      width: '100px',
      cell: (row) => (
        <span
          className={`font-medium text-sm ${row.active ? 'text-[var(--ms-success-600)]' : 'text-[var(--ms-text-muted)]'}`}
        >
          {row.active ? tCommon('yes') : tCommon('no')}
        </span>
      ),
      cellText: (row) => String(row.active),
    },
  ];

  // moysklad's discount list uses moyskladToolbar + Фильтр panel (no
  // pill sub-tabs). Holat filtering is the inline panel below. No
  // SavedFiltersPills — not FilterDrawerValues-shaped (no-op otherwise).

  return (
    <ListView
      testId="discounts-page"
      title={t('title')}
      moyskladToolbar
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      createHref="/discounts/new"
      createLabel={t('create_button')}
      createPosition="start"
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => setSearchInput(v)}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `discount-row-${row.id}`}
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
      hasActiveFilter={!!search || !!kindFilter || showArchived}
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
          onClear={() => {
            setShowArchived(false);
            setKindFilter('');
          }}
          testId="discounts-inline-filter"
        >
          <InlineFilterPanel.Field label={t('col_kind')} expandable>
            <NativeSelect
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              data-test-id="filter-kind"
            >
              <option value="" />
              {(['special', 'accumulative', 'personal', 'product', 'agent'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}` as 'kind_special')}
                </option>
              ))}
            </NativeSelect>
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field label={tFields('state')} expandable>
            <NativeSelect
              value={showArchived ? 'archived' : 'active'}
              onChange={(e) => setShowArchived(e.target.value === 'archived')}
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
