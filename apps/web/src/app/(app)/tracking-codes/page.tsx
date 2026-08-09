'use client';

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  NativeSelect,
  formatDate,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TrackingCodeRow {
  id: string;
  cis: string;
  type: string;
  status: string;
  productId: string | null;
  createdAt: string;
}

const LIMIT = 50;

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-[var(--ms-success-600)]',
  RETIRED: 'text-[var(--ms-text-muted)]',
  TRANSFERRED: 'text-[var(--ms-warning-600)]',
};

export default function TrackingCodesPage() {
  const t = useTranslations('pages.tracking_code_admin');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    sortBy: sortKey,
    sortDir,
    limit: String(LIMIT),
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse<TrackingCodeRow>>({
    queryKey: ['tracking-codes', search, typeFilter, statusFilter, sortKey, sortDir, cursor],
    queryFn: () => api.get<ListResponse<TrackingCodeRow>>(`/tracking-codes?${params.toString()}`),
  });

  const columns: DataTableColumn<TrackingCodeRow>[] = [
    {
      key: 'cis',
      header: t('col_cis'),
      cell: (row) => (
        <a
          href={`/tracking-codes/${row.id}`}
          className="font-medium font-mono text-[var(--ms-text-primary)] text-sm underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.cis}
        </a>
      ),
      cellText: (row) => row.cis,
    },
    {
      key: 'type',
      header: t('col_type'),
      width: '140px',
      cell: (row) => (
        <span className="text-sm">{t(`type_${row.type.toLowerCase()}` as 'type_shoes')}</span>
      ),
      cellText: (row) => row.type,
    },
    {
      key: 'status',
      header: t('col_status'),
      width: '140px',
      cell: (row) => (
        <span className={`font-medium text-sm ${STATUS_COLORS[row.status] ?? ''}`}>
          {t(`status_${row.status.toLowerCase()}` as 'status_active')}
        </span>
      ),
      cellText: (row) => row.status,
    },
    {
      // moysklad parity (products list reference): a sortable Создано column so
      // the default sortKey='createdAt' is both visible and clickable (was a
      // dead sort — no createdAt column rendered + no column sortable).
      key: 'createdAt',
      header: tCommon('created'),
      width: '160px',
      sortable: true,
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(row.createdAt)}</span>
      ),
      cellText: (row) => row.createdAt,
    },
  ];

  // moysklad's marking/CIS list uses moyskladToolbar + Фильтр panel (no
  // pill sub-tabs, no out-of-panel filter strip). Тип + Holat (status)
  // filtering is the inline panel below. No SavedFiltersPills — not
  // FilterDrawerValues-shaped (no-op otherwise).
  const hasActiveFilter = !!search || !!typeFilter || !!statusFilter;

  return (
    <ListView
      testId="tracking-codes-page"
      title={t('title')}
      moyskladToolbar
      subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
      createHref="/tracking-codes/new"
      createLabel={t('create_button')}
      createPosition="start"
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `tracking-code-row-${row.id}`}
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
      hasActiveFilter={hasActiveFilter}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
        setCursor(undefined);
      }}
      headerSlot={
        <InlineFilterPanel
          hidden={!filterOpen}
          applyLabel={tFilters('find')}
          clearLabel={tFilters('clear')}
          onClear={() => {
            setTypeFilter('');
            setStatusFilter('');
            setCursor(undefined);
          }}
          testId="tracking-codes-inline-filter"
        >
          <InlineFilterPanel.Field label={t('col_type')} expandable>
            <NativeSelect
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCursor(undefined);
              }}
              data-test-id="filter-type"
            >
              <option value="" />
              {['SHOES', 'TOBACCO', 'MEDICINES', 'PERFUME', 'TIRES', 'DAIRY', 'WATER', 'BEER'].map(
                (ty) => (
                  <option key={ty} value={ty}>
                    {t(`type_${ty.toLowerCase()}` as 'type_shoes')}
                  </option>
                ),
              )}
            </NativeSelect>
          </InlineFilterPanel.Field>
          <InlineFilterPanel.Field label={tFields('state')} expandable>
            <NativeSelect
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCursor(undefined);
              }}
              data-test-id="filter-status"
            >
              <option value="" />
              {['ACTIVE', 'RETIRED', 'TRANSFERRED'].map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s.toLowerCase()}` as 'status_active')}
                </option>
              ))}
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
