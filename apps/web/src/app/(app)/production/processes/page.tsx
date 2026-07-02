'use client';

/**
 * /production/processes — «Техпроцесс» (ProcessingProcess) ro'yxati.
 *
 * §112/round-4 unit 1b. Mirrors the proven /production/boms list 1:1
 * (ListView + archived inline filter, no bulk — the API exposes only
 * archive/restore, no /bulk-delete). Backed by the round-4 unit-1 API
 * GET /processing-processes.
 */

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

interface ProcessRow {
  id: string;
  name: string;
  code: string | null;
  externalCode: string | null;
  description: string | null;
  shared: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { positions: number };
}

interface ListResponse {
  items: ProcessRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function ProcessesPage() {
  const t = useTranslations('pages.processes');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(true);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const listQueryKey = [
    'processing-processes',
    search,
    archived,
    cursor,
    sortKey,
    sortDir,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/processing-processes?${params.toString()}`),
  });

  const columns: DataTableColumn<ProcessRow>[] = [
    {
      key: 'name',
      header: tFields('name'),
      sortable: true,
      cell: (p) => (
        <a
          href={`/production/processes/${p.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {p.name}
        </a>
      ),
      cellText: (p) => p.name,
    },
    {
      key: 'description',
      header: t('col_description'),
      cell: (p) => (
        <span className="max-w-[280px] truncate text-[var(--ms-text-muted)] text-sm">
          {p.description ?? '—'}
        </span>
      ),
      cellText: (p) => p.description ?? '',
    },
    {
      key: 'code',
      header: tFields('code'),
      width: '160px',
      cell: (p) => <span className="text-[var(--ms-text-muted)] text-sm">{p.code ?? '—'}</span>,
      cellText: (p) => p.code ?? '',
    },
    {
      key: 'positions',
      header: t('col_positions'),
      align: 'right',
      width: '120px',
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {p._count?.positions ?? 0}
        </span>
      ),
      cellText: (p) => String(p._count?.positions ?? 0),
    },
    {
      key: 'archived',
      header: tFields('state'),
      width: '110px',
      cell: (p) => (
        <Badge tone={archivedTone(p.archived)}>
          {p.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (p) => (p.archived ? 'archived' : 'active'),
    },
  ];

  const hasActiveFilter = !!search || archived === 'archived';

  return (
    <ListView
      testId="processes-page"
      moyskladToolbar
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      onRefresh={() => refetch()}
      createHref="/production/processes/new"
      createLabel={t('create_button')}
      createPosition="start"
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
        setCursor(undefined);
      }}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(p) => `process-row-${p.id}`}
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
      headerSlot={
        <InlineFilterPanel
          hidden={!filterOpen}
          applyLabel={tFilters('find')}
          clearLabel={tFilters('clear')}
          onClear={() => {
            setArchived('active');
            setCursor(undefined);
          }}
          testId="processes-inline-filter"
        >
          <InlineFilterPanel.Field label={tFields('state')} expandable>
            <NativeSelect
              value={archived}
              onChange={(e) => {
                setArchived(e.target.value as 'active' | 'archived');
                setCursor(undefined);
              }}
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
