'use client';

import { ColumnSettings } from '@/components/column-settings';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { taskStatusTone } from '@/lib/domain-status-tone';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  type ListViewFilter,
  MultiCombobox,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  formatDate,
  formatDateOnly,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
type Ownership = 'mine' | 'team' | 'all';

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  archived: boolean;
  createdAt: string;
  author: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
}

interface ListResponse {
  items: Task[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function TasksPage() {
  const t = useTranslations('pages.tasks');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tTaskCreate = useTranslations('task_create');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [ownership, setOwnership] = useState<Ownership>('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort. Default: newest task first.
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'assignee' | 'type'>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<{ id?: string; label?: string }>({});
  // «Контрагент» — moysklad-parity inline multi-select checkbox dropdown
  // (MultiCombobox), was a single-select modal. Shows the phone as a sublabel
  // and searches by name OR phone (BE /counterparties?search= matches both).
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [typeFilter, setTypeFilter] = useState<{ id?: string; label?: string }>({});
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [dueFrom, setDueFrom] = useState<string | undefined>();
  const [dueTo, setDueTo] = useState<string | undefined>();
  const [updatedFrom, setUpdatedFrom] = useState<string | undefined>();
  const [updatedTo, setUpdatedTo] = useState<string | undefined>();

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    ...(ownership !== 'all' ? { ownership } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(assigneeFilter.id ? { assigneeId: assigneeFilter.id } : {}),
    ...(agents.length ? { agentIds: agents.map((x) => x.id).join(',') } : {}),
    ...(typeFilter.id ? { stateId: typeFilter.id } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(dueFrom ? { dueFrom } : {}),
    ...(dueTo ? { dueTo } : {}),
    ...(updatedFrom ? { updatedFrom } : {}),
    ...(updatedTo ? { updatedTo } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const listQueryKey = [
    'tasks',
    search,
    archived,
    ownership,
    statusFilter,
    assigneeFilter.id,
    agents.map((x) => x.id).join(','),
    typeFilter.id,
    dateFrom,
    dateTo,
    dueFrom,
    dueTo,
    updatedFrom,
    updatedTo,
    cursor,
    sortKey,
    sortDir,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/tasks?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('tasks', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
  });
  const cols = useColumnVisibility('tasks', [
    'title',
    'assignee',
    'status',
    'priority',
    'dueAt',
    'createdAt',
  ]);
  const colWidths = useColumnWidths('tasks');

  const filters: ListViewFilter[] = [
    {
      key: 'active',
      label: tCommon('active'),
      active: archived === 'active',
      onClick: () => {
        setArchived('active');
        setCursor(undefined);
      },
    },
    {
      key: 'archived',
      label: tCommon('archived'),
      active: archived === 'archived',
      onClick: () => {
        setArchived('archived');
        setCursor(undefined);
      },
    },
    {
      key: 'sep1',
      label: '|',
      active: false,
      onClick: () => {},
    },
    {
      key: 'own-all',
      label: t('ownership.all'),
      active: ownership === 'all',
      onClick: () => {
        setOwnership('all');
        setCursor(undefined);
      },
    },
    {
      key: 'own-mine',
      label: t('ownership.mine'),
      active: ownership === 'mine',
      onClick: () => {
        setOwnership('mine');
        setCursor(undefined);
      },
    },
    {
      key: 'own-team',
      label: t('ownership.team'),
      active: ownership === 'team',
      onClick: () => {
        setOwnership('team');
        setCursor(undefined);
      },
    },
    {
      key: 'sep2',
      label: '|',
      active: false,
      onClick: () => {},
    },
    {
      key: 'status-all',
      label: t('statuses.all'),
      active: statusFilter === '',
      onClick: () => {
        setStatusFilter('');
        setCursor(undefined);
      },
    },
    {
      key: 'status-open',
      label: t('statuses.open'),
      active: statusFilter === 'open',
      onClick: () => {
        setStatusFilter('open');
        setCursor(undefined);
      },
    },
    {
      key: 'status-in_progress',
      label: t('statuses.in_progress'),
      active: statusFilter === 'in_progress',
      onClick: () => {
        setStatusFilter('in_progress');
        setCursor(undefined);
      },
    },
    {
      key: 'status-done',
      label: t('statuses.done'),
      active: statusFilter === 'done',
      onClick: () => {
        setStatusFilter('done');
        setCursor(undefined);
      },
    },
    {
      key: 'status-cancelled',
      label: t('statuses.cancelled'),
      active: statusFilter === 'cancelled',
      onClick: () => {
        setStatusFilter('cancelled');
        setCursor(undefined);
      },
    },
  ];

  const columns: DataTableColumn<Task>[] = [
    {
      key: 'title',
      header: t('fields.title'),
      sortable: true,
      cell: (task) => (
        <a
          href={`/tasks/${task.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {task.title}
        </a>
      ),
      cellText: (task) => task.title,
    },
    {
      key: 'assignee',
      header: t('fields.assignee'),
      width: '160px',
      cell: (task) =>
        task.assignee ? (
          <span className="text-sm">{task.assignee.name}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (task) => task.assignee?.name ?? '',
    },
    {
      key: 'status',
      header: t('fields.status'),
      width: '140px',
      cell: (task) => (
        <Badge tone={taskStatusTone(task.status)}>{t(`statuses.${task.status}`)}</Badge>
      ),
      cellText: (task) => task.status,
    },
    {
      key: 'priority',
      header: t('fields.priority'),
      width: '110px',
      cell: (task) => {
        const cls =
          task.priority === 'urgent'
            ? 'text-xs font-semibold text-[var(--ms-text-destructive)]'
            : task.priority === 'high'
              ? 'text-xs font-semibold text-[var(--ms-text-warning)]'
              : task.priority === 'low'
                ? 'text-xs text-[var(--ms-text-muted)]'
                : 'text-xs text-[var(--ms-text-secondary)]';
        return <span className={cls}>{t(`priorities.${task.priority}`)}</span>;
      },
      cellText: (task) => task.priority,
    },
    {
      key: 'dueAt',
      header: t('fields.due_at'),
      width: '130px',
      sortable: true,
      cell: (task) => {
        if (!task.dueAt) return <span className="text-[var(--ms-text-muted)] text-xs">—</span>;
        const isOverdue = task.status === 'open' && new Date(task.dueAt) < new Date();
        return (
          <span
            className={`text-sm tabular-nums ${isOverdue ? 'font-medium text-[var(--ms-text-destructive)]' : ''}`}
          >
            {formatDateOnly(task.dueAt)}
          </span>
        );
      },
      cellText: (task) => formatDateOnly(task.dueAt),
    },
    {
      key: 'createdAt',
      header: tCommon('created'),
      width: '130px',
      sortable: true,
      // «Создано» shows date+time (shared formatDate) — parity with every
      // sibling list; due date (dueAt) above stays date-only.
      cell: (task) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {formatDate(task.createdAt)}
        </span>
      ),
      cellText: (task) => formatDate(task.createdAt),
    },
  ];

  const hasActiveFilter =
    !!search ||
    archived === 'archived' ||
    ownership !== 'all' ||
    !!statusFilter ||
    !!assigneeFilter.id ||
    agents.length > 0 ||
    !!typeFilter.id ||
    !!dateFrom ||
    !!dateTo ||
    !!dueFrom ||
    !!dueTo ||
    !!updatedFrom ||
    !!updatedTo;

  return (
    <>
      <ListView
        testId="tasks-page"
        moyskladToolbar
        title={t('title')}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        onRefresh={() => refetch()}
        selectionCount={bulk.selectedIds.size}
        createHref="/tasks/new"
        createLabel={t('create_button')}
        createPosition="start"
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        filters={filters}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(task) => `task-row-${task.id}`}
        rowActions={(task) => bulk.rowDelete(task.id)}
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
          cta: { label: t('create_button'), href: '/tasks/new' },
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
              setAssigneeFilter({});
              setAgents([]);
              setTypeFilter({});
              setDateFrom(undefined);
              setDateTo(undefined);
              setDueFrom(undefined);
              setDueTo(undefined);
              setUpdatedFrom(undefined);
              setUpdatedTo(undefined);
              setCursor(undefined);
            }}
            testId="tasks-inline-filter"
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
            {/* 2. Срок / Muddat (dueAt range) */}
            <InlineFilterPanel.Field label={`${t('fields.due_at')}:`} expandable>
              <PeriodInputs
                from={dueFrom}
                to={dueTo}
                onChange={({ from, to }) => {
                  setDueFrom(from);
                  setDueTo(to);
                  setCursor(undefined);
                }}
                testId="filter-due"
              />
            </InlineFilterPanel.Field>
            {/* 3. Тип задачи (typeId) */}
            <InlineFilterPanel.Field label={tTaskCreate('type')} expandable>
              <CatalogPickerField
                value={
                  typeFilter.id
                    ? { id: typeFilter.id, label: typeFilter.label ?? typeFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('type')}
                onClear={() => {
                  setTypeFilter({});
                  setCursor(undefined);
                }}
                testId="filter-type"
              />
            </InlineFilterPanel.Field>
            {/* 4. Исполнитель (assigneeId) */}
            <InlineFilterPanel.Field label={t('fields.assignee')} expandable>
              <CatalogPickerField
                value={
                  assigneeFilter.id
                    ? { id: assigneeFilter.id, label: assigneeFilter.label ?? assigneeFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('assignee')}
                onClear={() => {
                  setAssigneeFilter({});
                  setCursor(undefined);
                }}
                testId="filter-assignee"
              />
            </InlineFilterPanel.Field>
            {/* 5. Контрагент (Task.agentId) — moysklad-parity inline multi-select
                checkbox dropdown: type a name OR phone, results appear inline
                (each row shows the phone as a sublabel), tick as many as needed.
                Was a single-select modal. */}
            <InlineFilterPanel.Field label={tFields('agent')} expandable>
              <MultiCombobox
                value={agents.map((x) => x.id)}
                items={agents.map((x) => ({ value: x.id, label: x.label }))}
                onSearch={async (q) => {
                  const r = await api.get<{
                    items: { id: string; name: string; phone?: string | null }[];
                  }>(`/counterparties?search=${encodeURIComponent(q)}&limit=20`);
                  return r.items.map((x) => ({
                    value: x.id,
                    label: x.name,
                    sublabel: x.phone || undefined,
                  }));
                }}
                onChange={(nextIds, toggled) => {
                  setAgents((prev) =>
                    nextIds.map((id) => {
                      const ex = prev.find((s) => s.id === id);
                      if (ex) return ex;
                      if (toggled?.value === id) return { id, label: String(toggled.label) };
                      return { id, label: id };
                    }),
                  );
                  setCursor(undefined);
                }}
                placeholder=""
                testId="filter-agent"
              />
            </InlineFilterPanel.Field>
            {/* 6. Когда изменен (updatedAt range) */}
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
              alwaysVisible: c.key === 'title',
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
        open={pickerOpen === 'assignee'}
        onClose={() => setPickerOpen(null)}
        title={t('fields.assignee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setAssigneeFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'type'}
        onClose={() => setPickerOpen(null)}
        title={tTaskCreate('type')}
        fetcher={async (q): Promise<PickerItem[]> => {
          // moysklad «Тип задачи» = the task's `state` (State, entityType="task").
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            '/states?entityType=task&archived=false&limit=200',
          );
          const ql = q.trim().toLowerCase();
          return r.items
            .filter((x) => !ql || x.name.toLowerCase().includes(ql))
            .map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setTypeFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
    </>
  );
}
