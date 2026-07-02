'use client';

import { ColumnSettings } from '@/components/column-settings';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { callDirectionTone, callStatusTone } from '@/lib/domain-status-tone';
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
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Call {
  id: string;
  direction: 'in' | 'out';
  channel: 'call' | 'sms' | 'email' | 'meeting';
  status: 'completed' | 'missed' | 'cancelled' | 'scheduled';
  startedAt: string;
  durationSec: number | null;
  externalNumber: string | null;
  summary: string | null;
  archived: boolean;
  counterparty: { id: string; name: string; legalTitle: string | null } | null;
  contactPerson: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
}

interface ListResponse {
  items: Call[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} с`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CallsPage() {
  const t = useTranslations('pages.calls');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [directionFilter, setDirectionFilter] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort. Default: newest call first.
  const [sortKey, setSortKey] = useState<string>('startedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'agent' | 'owner'>(null);
  const [agentFilter, setAgentFilter] = useState<{ id?: string; label?: string }>({});
  const [ownerFilter, setOwnerFilter] = useState<{ id?: string; label?: string }>({});
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [updatedFrom, setUpdatedFrom] = useState<string | undefined>();
  const [updatedTo, setUpdatedTo] = useState<string | undefined>();

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    ...(directionFilter ? { direction: directionFilter } : {}),
    ...(channelFilter ? { channel: channelFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
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
    'calls',
    search,
    archived,
    directionFilter,
    channelFilter,
    statusFilter,
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
    queryFn: () => api.get<ListResponse>(`/calls?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('calls', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
  });
  const cols = useColumnVisibility('calls', [
    'startedAt',
    'direction',
    'channel',
    'counterparty',
    'contactPerson',
    'externalNumber',
    'durationSec',
    'status',
    'summary',
  ]);
  const colWidths = useColumnWidths('calls');

  // moysklad's call/activity list uses moyskladToolbar + Фильтр panel
  // (no pill sub-tabs). Yo'nalish/Kanal/Holat/Kontragent/Arxiv filtering
  // is the inline panel below, backed by CallFilterSchema. No
  // SavedFiltersPills — not FilterDrawerValues-shaped (no-op otherwise).

  const columns: DataTableColumn<Call>[] = [
    {
      key: 'startedAt',
      header: t('started_at'),
      width: '170px',
      sortable: true,
      cell: (c) => (
        <a
          href={`/calls/${c.id}`}
          className="font-medium text-[var(--ms-text-primary)] tabular-nums underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {formatDateTime(c.startedAt)}
        </a>
      ),
      cellText: (c) => formatDateTime(c.startedAt),
    },
    {
      key: 'direction',
      header: t('direction'),
      width: '110px',
      cell: (c) => (
        <Badge tone={callDirectionTone(c.direction)}>{t(`directions.${c.direction}`)}</Badge>
      ),
      cellText: (c) => c.direction,
    },
    {
      key: 'channel',
      header: t('channel'),
      width: '110px',
      cell: (c) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{t(`channels.${c.channel}`)}</span>
      ),
      cellText: (c) => c.channel,
    },
    {
      key: 'counterparty',
      header: tFields('agent'),
      cell: (c) =>
        c.counterparty ? (
          <a
            href={`/counterparties/${c.counterparty.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {c.counterparty.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (c) => c.counterparty?.name ?? '',
    },
    {
      key: 'contactPerson',
      header: t('contact_person'),
      cell: (c) =>
        c.contactPerson ? (
          <a
            href={`/contact-persons/${c.contactPerson.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {c.contactPerson.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (c) => c.contactPerson?.name ?? '',
    },
    {
      key: 'externalNumber',
      header: t('external_number'),
      width: '180px',
      cell: (c) =>
        c.externalNumber ? (
          <span className="text-sm tabular-nums">{c.externalNumber}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (c) => c.externalNumber ?? '',
    },
    {
      key: 'durationSec',
      header: t('duration'),
      width: '110px',
      sortable: true,
      cell: (c) => <span className="text-sm tabular-nums">{formatDuration(c.durationSec)}</span>,
      cellText: (c) => formatDuration(c.durationSec),
    },
    {
      key: 'status',
      header: t('status'),
      width: '140px',
      cell: (c) => <Badge tone={callStatusTone(c.status)}>{t(`statuses.${c.status}`)}</Badge>,
      cellText: (c) => c.status,
    },
    {
      key: 'summary',
      header: t('summary'),
      cell: (c) =>
        c.summary ? (
          <span className="block max-w-[400px] truncate text-[var(--ms-text-muted)] text-sm">
            {c.summary}
          </span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (c) => c.summary ?? '',
    },
  ];

  const hasActiveFilter =
    !!search ||
    archived === 'archived' ||
    !!directionFilter ||
    !!channelFilter ||
    !!statusFilter ||
    !!agentFilter.id ||
    !!ownerFilter.id ||
    !!dateFrom ||
    !!dateTo ||
    !!updatedFrom ||
    !!updatedTo;

  return (
    <>
      <ListView
        testId="calls-page"
        moyskladToolbar
        title={t('title')}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        createHref="/calls/new"
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
        rowTestId={(c) => `call-row-${c.id}`}
        rowActions={(c) => bulk.rowDelete(c.id)}
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
        {...bulk.listViewProps}
        selectionCount={bulk.selectedIds.size}
        editMenu={bulk.editMenu}
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setArchived('active');
              setDirectionFilter('');
              setChannelFilter('');
              setStatusFilter('');
              setAgentFilter({});
              setOwnerFilter({});
              setDateFrom(undefined);
              setDateTo(undefined);
              setUpdatedFrom(undefined);
              setUpdatedTo(undefined);
              setCursor(undefined);
            }}
            testId="calls-inline-filter"
          >
            {/* 1. Период (startedAt) */}
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
            {/* 2. Yo'nalish / Тип (direction) */}
            <InlineFilterPanel.Field label={t('direction')} expandable>
              <NativeSelect
                value={directionFilter}
                onChange={(e) => {
                  setDirectionFilter(e.target.value);
                  setCursor(undefined);
                }}
                data-test-id="filter-direction"
              >
                <option value="" />
                {['in', 'out'].map((d) => (
                  <option key={d} value={d}>
                    {t(`directions.${d}`)}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 3. Kanal (channel) */}
            <InlineFilterPanel.Field label={t('channel')} expandable>
              <NativeSelect
                value={channelFilter}
                onChange={(e) => {
                  setChannelFilter(e.target.value);
                  setCursor(undefined);
                }}
                data-test-id="filter-channel"
              >
                <option value="" />
                {['call', 'sms', 'email', 'meeting'].map((c) => (
                  <option key={c} value={c}>
                    {t(`channels.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 4. Kontragent */}
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
            {/* 5. Holat (status) */}
            <InlineFilterPanel.Field label={t('status')} expandable>
              <NativeSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCursor(undefined);
                }}
                data-test-id="filter-status"
              >
                <option value="" />
                {['completed', 'missed', 'cancelled', 'scheduled'].map((s) => (
                  <option key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 6. Mas'ul (ownerId) */}
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
              alwaysVisible: c.key === 'startedAt',
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
    </>
  );
}
