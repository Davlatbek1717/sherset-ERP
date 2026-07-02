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

interface PipelineRow {
  id: string;
  name: string;
  isDefault: boolean;
  archived: boolean;
  stages: { id: string; name: string; type: 'open' | 'won' | 'lost'; color: string | null }[];
  _count: { opportunities: number };
}

interface ListResponse {
  items: PipelineRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function PipelinesPage() {
  const t = useTranslations('pages.pipelines');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [filterOpen, setFilterOpen] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort. Default: name asc (master-data convention).
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
    queryKey: ['pipelines', search, archived, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/pipelines?${params.toString()}`),
  });

  // moysklad's pipeline list uses moyskladToolbar + Фильтр panel (no
  // pill sub-tabs). Holat filtering is the inline panel below, backed
  // by PipelineFilterSchema (archived/search only). No SavedFiltersPills
  // — not FilterDrawerValues-shaped (no-op otherwise).

  const columns: DataTableColumn<PipelineRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      cell: (p) => (
        <a
          href={`/pipelines/${p.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {p.name}
        </a>
      ),
      cellText: (p) => p.name,
    },
    {
      key: 'isDefault',
      header: t('is_default'),
      width: '140px',
      cell: (p) =>
        p.isDefault ? (
          <Badge tone="brand">{tCommon('default')}</Badge>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (p) => (p.isDefault ? 'default' : ''),
    },
    {
      key: 'stages',
      header: t('stages'),
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.stages.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-[var(--ms-radius-default)] px-1.5 py-0.5 text-xs"
              style={{
                backgroundColor: s.color ? `${s.color}22` : 'var(--ms-bg-muted)',
                color: s.color ?? 'var(--ms-text-primary)',
              }}
            >
              {s.color && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
              )}
              {s.name}
            </span>
          ))}
        </div>
      ),
      cellText: (p) => p.stages.map((s) => s.name).join(' → '),
    },
    {
      key: 'opportunity_count',
      header: t('opportunity_count'),
      width: '140px',
      cell: (p) => <span className="text-sm tabular-nums">{p._count?.opportunities ?? 0}</span>,
      cellText: (p) => String(p._count?.opportunities ?? 0),
    },
    {
      key: 'archived',
      header: tFields('state'),
      width: '120px',
      cell: (p) => (
        <Badge tone={archivedTone(p.archived)}>
          {p.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (p) => (p.archived ? 'archived' : 'active'),
    },
  ];

  return (
    <ListView
      testId="pipelines-page"
      moyskladToolbar
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      onRefresh={() => refetch()}
      createHref="/pipelines/new"
      createLabel={t('create_button')}
      createPosition="start"
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(p) => `pipeline-row-${p.id}`}
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
      hasActiveFilter={!!search || archived === 'archived'}
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
            setArchived('active');
            setCursor(undefined);
          }}
          testId="pipelines-inline-filter"
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
