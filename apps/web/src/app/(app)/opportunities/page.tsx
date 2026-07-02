'use client';

import { ColumnSettings } from '@/components/column-settings';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { opportunityStatusTone } from '@/lib/domain-status-tone';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  formatDate,
  formatDateOnly,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type StatusValue = 'open' | 'won' | 'lost';

interface Opportunity {
  id: string;
  number: string;
  name: string;
  amount: string;
  currency: string;
  status: StatusValue;
  archived: boolean;
  expectedCloseDate: string | null;
  closedAt: string | null;
  source: string | null;
  createdAt: string;
  pipeline: { id: string; name: string };
  stage: { id: string; name: string; type: StatusValue; color: string | null };
  counterparty: { id: string; name: string; legalTitle: string | null } | null;
  contactPerson: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
}

interface ListResponse {
  items: Opportunity[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function OpportunitiesPage() {
  const t = useTranslations('pages.opportunities');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [statusFilter, setStatusFilter] = useState<'' | StatusValue>('');
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend (createdAt DESC).
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'pipeline' | 'agent' | 'owner' | 'stage'>(
    null,
  );
  const [pipelineFilter, setPipelineFilter] = useState<{ id?: string; label?: string }>({});
  const [stageFilter, setStageFilter] = useState<{ id?: string; label?: string }>({});
  const [agentFilter, setAgentFilter] = useState<{ id?: string; label?: string }>({});
  const [ownerFilter, setOwnerFilter] = useState<{ id?: string; label?: string }>({});
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [updatedFrom, setUpdatedFrom] = useState<string | undefined>();
  const [updatedTo, setUpdatedTo] = useState<string | undefined>();

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    ...(pipelineFilter.id ? { pipelineId: pipelineFilter.id } : {}),
    ...(stageFilter.id ? { stageId: stageFilter.id } : {}),
    ...(agentFilter.id ? { counterpartyId: agentFilter.id } : {}),
    ...(ownerFilter.id ? { ownerId: ownerFilter.id } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(updatedFrom ? { updatedFrom } : {}),
    ...(updatedTo ? { updatedTo } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const listQueryKey = [
    'opportunities',
    search,
    archived,
    statusFilter,
    pipelineFilter.id,
    stageFilter.id,
    agentFilter.id,
    ownerFilter.id,
    dateFrom,
    dateTo,
    updatedFrom,
    updatedTo,
    cursor,
    sortKey,
    sortDir,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/opportunities?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('opportunities', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
  });
  const cols = useColumnVisibility('opportunities', [
    'number',
    'name',
    'stage',
    'amount',
    'counterparty',
    'expectedCloseDate',
    'owner',
    'createdAt',
    'status',
  ]);
  const colWidths = useColumnWidths('opportunities');

  // moysklad's deal/opportunity list uses moyskladToolbar + Фильтр panel
  // (no pill sub-tabs). Voronka/Kontragent/Holat/Arxiv filtering is the
  // inline panel below, backed by OpportunityFilterSchema. No
  // SavedFiltersPills — not FilterDrawerValues-shaped (no-op otherwise).

  const columns: DataTableColumn<Opportunity>[] = [
    {
      key: 'number',
      header: t('number'),
      width: '140px',
      sortable: true,
      cell: (o) => (
        <a
          href={`/opportunities/${o.id}`}
          className="font-medium text-[var(--ms-text-primary)] tabular-nums underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {o.number}
        </a>
      ),
      cellText: (o) => o.number,
    },
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      cell: (o) => <span className="text-sm">{o.name}</span>,
      cellText: (o) => o.name,
    },
    {
      key: 'stage',
      header: t('stage'),
      width: '160px',
      cell: (o) => (
        <span
          className="inline-flex items-center gap-1.5 rounded-[var(--ms-radius-default)] px-2 py-0.5 font-medium text-xs"
          style={{
            backgroundColor: o.stage.color ? `${o.stage.color}22` : 'var(--ms-bg-muted)',
            color: o.stage.color ?? 'var(--ms-text-primary)',
          }}
        >
          {o.stage.color && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: o.stage.color }}
            />
          )}
          {o.stage.name}
        </span>
      ),
      cellText: (o) => o.stage.name,
    },
    {
      key: 'amount',
      header: t('amount'),
      width: '160px',
      sortable: true,
      // List money cell renders WITHOUT the currency suffix (project-wide
      // convention — cash-in/moves/demands/…); the suffix is kept in
      // cellText for CSV export. Mirrors moves/page.tsx.
      cell: (o) => (
        <span className="font-medium text-sm tabular-nums">
          {formatMoney(BigInt(o.amount), o.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (o) => formatMoney(BigInt(o.amount), o.currency),
    },
    {
      key: 'counterparty',
      header: tFields('agent'),
      cell: (o) =>
        o.counterparty ? (
          <a
            href={`/counterparties/${o.counterparty.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {o.counterparty.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (o) => o.counterparty?.name ?? '',
    },
    {
      key: 'expectedCloseDate',
      header: t('expected_close_date'),
      width: '130px',
      cell: (o) => (
        <span className="text-sm tabular-nums">{formatDateOnly(o.expectedCloseDate)}</span>
      ),
      cellText: (o) => formatDateOnly(o.expectedCloseDate),
    },
    {
      key: 'owner',
      header: t('owner'),
      width: '160px',
      cell: (o) =>
        o.owner ? (
          <span className="text-sm">{o.owner.name}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (o) => o.owner?.name ?? '',
    },
    {
      key: 'createdAt',
      header: tFields('created_at'),
      width: '130px',
      sortable: true,
      // «Создано» shows date+time (shared formatDate) — parity with all
      // sibling lists (counterparties/products/work-orders/…). Planned
      // close date (expectedCloseDate) stays date-only.
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {formatDate(o.createdAt)}
        </span>
      ),
      cellText: (o) => formatDate(o.createdAt),
    },
    {
      key: 'status',
      header: tFields('state'),
      width: '120px',
      cell: (o) =>
        o.archived ? (
          <Badge tone="neutral">{tCommon('archived')}</Badge>
        ) : (
          <Badge tone={opportunityStatusTone(o.status)}>{t(`statuses.${o.status}`)}</Badge>
        ),
      cellText: (o) => (o.archived ? 'archived' : o.status),
    },
  ];

  const hasActiveFilter =
    !!search ||
    archived === 'archived' ||
    !!statusFilter ||
    !!pipelineFilter.id ||
    !!stageFilter.id ||
    !!agentFilter.id ||
    !!ownerFilter.id ||
    !!dateFrom ||
    !!dateTo ||
    !!updatedFrom ||
    !!updatedTo;

  return (
    <>
      <ListView
        testId="opportunities-page"
        moyskladToolbar
        title={t('title')}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        onRefresh={() => refetch()}
        selectionCount={bulk.selectedIds.size}
        createHref="/opportunities/new"
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
        rowTestId={(o) => `opportunity-row-${o.id}`}
        rowActions={(o) => bulk.rowDelete(o.id)}
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
        richEmpty={{
          heading: t('empty_rich_heading'),
          cta: { label: t('create_button'), href: '/opportunities/new' },
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        {...bulk.listViewProps}
        editMenu={bulk.editMenu}
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setArchived('active');
              setStatusFilter('');
              setPipelineFilter({});
              setStageFilter({});
              setAgentFilter({});
              setOwnerFilter({});
              setDateFrom(undefined);
              setDateTo(undefined);
              setUpdatedFrom(undefined);
              setUpdatedTo(undefined);
              setCursor(undefined);
            }}
            testId="opportunities-inline-filter"
          >
            {/* 1. Период (createdAt) */}
            <InlineFilterPanel.Field
              label={`${tFilters('period')}:`}
              expandable
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setDateFrom(from);
                    setDateTo(to);
                    setCursor(undefined);
                  }}
                  labels={{
                    yesterday: tFilters('period_yesterday'),
                    today: tFilters('period_today'),
                    week: tFilters('period_week'),
                    month: tFilters('period_month'),
                  }}
                />
              }
            >
              <PeriodInputs
                from={dateFrom}
                to={dateTo}
                onChange={({ from, to }) => {
                  setDateFrom(from);
                  setDateTo(to);
                  setCursor(undefined);
                }}
                testId="filter-period"
              />
            </InlineFilterPanel.Field>
            {/* 2. Воронка (pipelineId) */}
            <InlineFilterPanel.Field label={t('pipeline')} expandable>
              <CatalogPickerField
                value={
                  pipelineFilter.id
                    ? { id: pipelineFilter.id, label: pipelineFilter.label ?? pipelineFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('pipeline')}
                onClear={() => {
                  setPipelineFilter({});
                  setStageFilter({});
                  setCursor(undefined);
                }}
                testId="filter-pipeline"
              />
            </InlineFilterPanel.Field>
            {/* 3. Этап (stageId) — disabled until pipeline picked */}
            <InlineFilterPanel.Field label={t('stage')} expandable>
              <CatalogPickerField
                value={
                  stageFilter.id
                    ? { id: stageFilter.id, label: stageFilter.label ?? stageFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => pipelineFilter.id && setPickerOpen('stage')}
                onClear={() => {
                  setStageFilter({});
                  setCursor(undefined);
                }}
                disabled={!pipelineFilter.id}
                disabledHint={t('select_pipeline')}
                testId="filter-stage"
              />
            </InlineFilterPanel.Field>
            {/* 4. Контрагент (counterpartyId) */}
            <InlineFilterPanel.Field label={tFields('agent')} expandable>
              <CatalogPickerField
                value={
                  agentFilter.id
                    ? { id: agentFilter.id, label: agentFilter.label ?? agentFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agent')}
                onClear={() => {
                  setAgentFilter({});
                  setCursor(undefined);
                }}
                testId="filter-agent"
              />
            </InlineFilterPanel.Field>
            {/* 5. Состояние (status: open/won/lost) */}
            <InlineFilterPanel.Field label={t('status')} expandable>
              <NativeSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as '' | StatusValue);
                  setCursor(undefined);
                }}
                data-test-id="filter-status"
              >
                <option value="" />
                {(['open', 'won', 'lost'] as StatusValue[]).map((s) => (
                  <option key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 6. Владелец (ownerId) */}
            <InlineFilterPanel.Field label={tFilters('owner')} expandable>
              <CatalogPickerField
                value={
                  ownerFilter.id
                    ? { id: ownerFilter.id, label: ownerFilter.label ?? ownerFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('owner')}
                onClear={() => {
                  setOwnerFilter({});
                  setCursor(undefined);
                }}
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>
            {/* 7. Когда изменен (updatedAt range) */}
            <InlineFilterPanel.Field
              label={`${tFilters('updated_period')}:`}
              expandable
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setUpdatedFrom(from);
                    setUpdatedTo(to);
                    setCursor(undefined);
                  }}
                  labels={{
                    yesterday: tFilters('period_yesterday'),
                    today: tFilters('period_today'),
                    week: tFilters('period_week'),
                    month: tFilters('period_month'),
                  }}
                />
              }
            >
              <PeriodInputs
                from={updatedFrom}
                to={updatedTo}
                onChange={({ from, to }) => {
                  setUpdatedFrom(from);
                  setUpdatedTo(to);
                  setCursor(undefined);
                }}
                testId="filter-updated"
              />
            </InlineFilterPanel.Field>
            {/* 8. Holat (archived) */}
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
        headerEndSlot={
          <ColumnSettings
            columns={columns.map((c) => ({
              key: c.key,
              label: c.header,
              alwaysVisible: c.key === 'number',
            }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
      />
      <CatalogPicker
        open={pickerOpen === 'pipeline'}
        onClose={() => setPickerOpen(null)}
        title={t('stage')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/pipelines?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setPipelineFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'agent'}
        onClose={() => setPickerOpen(null)}
        title={tFields('agent')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setAgentFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setOwnerFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'stage'}
        onClose={() => setPickerOpen(null)}
        title={t('stage')}
        fetcher={async (q): Promise<PickerItem[]> => {
          if (!pipelineFilter.id) return [];
          // Stages come bundled in the pipeline detail response — fetch
          // once and filter client-side by the search term (typical
          // pipeline has <=20 stages).
          const r = await api.get<{ stages: { id: string; name: string }[] }>(
            `/pipelines/${pipelineFilter.id}`,
          );
          const term = q.trim().toLowerCase();
          const stages = term
            ? r.stages.filter((s) => s.name.toLowerCase().includes(term))
            : r.stages;
          return stages.map((s) => ({ id: s.id, primary: s.name }));
        }}
        onSelect={(item) => {
          setStageFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
    </>
  );
}
