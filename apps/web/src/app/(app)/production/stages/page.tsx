'use client';

/**
 * /production/stages — «Этап производства» (standalone ProcessingStage)
 * catalog. §126/round-6c. moysklad-parity flat Этап catalog (the
 * §118 «no flat stage endpoint» limitation is now removed — backed by
 * GET /processing-stages). Mirrors the proven /production/processes
 * list 1:1 (ListView + archived inline filter, no bulk).
 */

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
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface StageRow {
  id: string;
  name: string;
  code: string | null;
  laborCostMinor: string;
  materialMarkup: number;
  allPerformers: boolean;
  archived: boolean;
  _count: { positions: number };
}

const LIMIT = 25;

export default function StagesPage() {
  const t = useTranslations('pages.stages');
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

  const listQueryKey = ['processing-stages', search, archived, cursor, sortKey, sortDir] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse<StageRow>>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse<StageRow>>(`/processing-stages?${params.toString()}`),
  });

  const columns: DataTableColumn<StageRow>[] = [
    {
      key: 'name',
      header: tFields('name'),
      sortable: true,
      cell: (s) => (
        <a
          href={`/production/stages/${s.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {s.name}
        </a>
      ),
      cellText: (s) => s.name,
    },
    {
      key: 'code',
      header: tFields('code'),
      width: '140px',
      cell: (s) => <span className="text-[var(--ms-text-muted)] text-sm">{s.code ?? '—'}</span>,
      cellText: (s) => s.code ?? '',
    },
    {
      key: 'laborCost',
      header: t('labor_cost'),
      align: 'right',
      width: '160px',
      cell: (s) => (
        <span className="text-sm tabular-nums">
          {s.laborCostMinor !== '0' ? (
            formatMoney(s.laborCostMinor)
          ) : (
            <span className="text-[var(--ms-text-muted)]">—</span>
          )}
        </span>
      ),
      cellText: (s) => (s.laborCostMinor !== '0' ? formatMoney(s.laborCostMinor) : ''),
    },
    {
      key: 'usedIn',
      header: t('used_in'),
      align: 'right',
      width: '120px',
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {s._count?.positions ?? 0}
        </span>
      ),
      cellText: (s) => String(s._count?.positions ?? 0),
    },
    {
      key: 'archived',
      header: tFields('state'),
      width: '110px',
      cell: (s) => (
        <Badge tone={archivedTone(s.archived)}>
          {s.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (s) => (s.archived ? 'archived' : 'active'),
    },
  ];

  const hasActiveFilter = !!search || archived === 'archived';

  return (
    <ListView
      testId="stages-page"
      moyskladToolbar
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
      onRefresh={() => refetch()}
      createHref="/production/stages/new"
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
      rowTestId={(s) => `stage-row-${s.id}`}
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
          testId="stages-inline-filter"
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
