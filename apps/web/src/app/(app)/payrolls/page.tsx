'use client';

/**
 * /payrolls — Ish haqi (per-employee payroll) ro'yxati.
 *
 * Columns: №, Sana, Davr (start-end), Xodim, Lavozim, Satrlar soni,
 *          Holat, Sof to'lov.
 *
 * Payroll is a record-keeping doc. Posting it commits the figures as the
 * official monthly payroll, but the actual cash transfer is a separate
 * CashOut document — same as moysklad's split.
 */

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  InlineFilterPanel,
  Input,
  ListView,
  MassEditModal,
  NativeSelect,
  type PickerItem,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PayrollRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  moment: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  organization: { id: string; name: string };
  employee: {
    id: string;
    name: string;
    fullName: string | null;
    position: string | null;
  };
  owner: { id: string; name: string } | null;
  _count: { lines: number };
}

interface ListResponse {
  items: PayrollRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 100;

/** Render a period range like "01.05.2026 — 31.05.2026" (or "—" if missing). */
function formatPeriod(start: string, end: string): string {
  if (!start || !end) return '—';
  return `${formatDate(start)} — ${formatDate(end)}`;
}

export default function PayrollsPage() {
  const t = useTranslations('pages.payroll');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.payroll');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'org' | 'employee' | 'massEditOwner'>(null);

  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [orgFilter, setOrgFilter] = useState<{ id?: string; label?: string }>({});
  const [employeeFilter, setEmployeeFilter] = useState<{ id?: string; label?: string }>({});
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(stateFilter ? { state: stateFilter } : {}),
    ...(orgFilter.id ? { organizationId: orgFilter.id } : {}),
    ...(employeeFilter.id ? { employeeId: employeeFilter.id } : {}),
    ...(periodFrom ? { periodFrom } : {}),
    ...(periodTo ? { periodTo } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const listQueryKey = [
    'payrolls',
    search,
    stateFilter,
    orgFilter.id,
    employeeFilter.id,
    periodFrom,
    periodTo,
    cursor,
    sortKey,
    sortDir,
  ] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/payrolls?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('payrolls', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditOpen(true);
    },
  });

  // moysklad's payroll list uses moyskladToolbar + Фильтр panel (no
  // pill sub-tabs). Tashkilot/Xodim/Holat filtering is the inline panel
  // below, backed by PayrollFilterSchema (no period/sum — backend omits
  // them). No SavedFiltersPills — not FilterDrawerValues-shaped.

  const columns: DataTableColumn<PayrollRow>[] = [
    {
      key: 'name',
      header: '№',
      width: '150px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/payrolls/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: tFields('moment'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {formatDate(r.moment)}
        </span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'period',
      sortField: 'periodStart',
      header: t('period'),
      width: '200px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {formatPeriod(r.periodStart, r.periodEnd)}
        </span>
      ),
      cellText: (r) => formatPeriod(r.periodStart, r.periodEnd),
    },
    {
      key: 'employee',
      header: t('employee'),
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.employee.fullName || r.employee.name}</div>
          {r.employee.position && (
            <div className="truncate text-[var(--ms-text-muted)] text-xs">
              {r.employee.position}
            </div>
          )}
        </div>
      ),
      cellText: (r) => r.employee.fullName || r.employee.name,
    },
    {
      key: 'lines',
      header: t('lines'),
      width: '90px',
      align: 'right',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">{r._count.lines}</span>
      ),
      cellText: (r) => String(r._count.lines),
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '140px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>
          {tStates(r.state as 'draft' | 'posted' | 'cancelled')}
        </Badge>
      ),
      cellText: (r) => r.state,
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: t('net_total'),
      align: 'right',
      width: '180px',
      sortable: true,
      cell: (r) => {
        const big = BigInt(r.sumMinor || '0');
        const negative = big < 0n;
        return (
          <span
            className={`font-medium tabular-nums ${
              negative ? 'text-[var(--ms-text-destructive)]' : 'text-[var(--ms-text-primary)]'
            }`}
          >
            {formatMoney(r.sumMinor, r.currency, { displayAs: 'none' })}
          </span>
        );
      },
      cellText: (r) => formatMoney(r.sumMinor, r.currency),
    },
  ];

  const hasActiveFilter =
    !!search ||
    !!stateFilter ||
    !!orgFilter.id ||
    !!employeeFilter.id ||
    !!periodFrom ||
    !!periodTo;

  return (
    <>
      <ListView
        {...bulk.listViewProps}
        selectionCount={bulk.selectedIds.size}
        editMenu={bulk.editMenu}
        testId="payrolls-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        createHref="/payrolls/new"
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
        rowTestId={(r) => `payroll-row-${r.id}`}
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={!!data?.nextCursor}
        hasPrevious={!!cursor}
        onNext={() => setCursor(data?.nextCursor)}
        onPrevious={() => setCursor(undefined)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={hasActiveFilter ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasActiveFilter}
        richEmpty={{
          heading: t('empty_rich_heading'),
          helper: { label: t('empty_rich_helper'), href: '/help/payrolls' },
          cta: { label: t('create_button'), href: '/payrolls/new' },
        }}
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
              setStateFilter(null);
              setOrgFilter({});
              setEmployeeFilter({});
              setPeriodFrom('');
              setPeriodTo('');
              setCursor(undefined);
            }}
            testId="payrolls-inline-filter"
          >
            <InlineFilterPanel.Field label={t('period')} expandable>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => {
                    setPeriodFrom(e.target.value);
                    setCursor(undefined);
                  }}
                  aria-label={t('period_start')}
                  data-test-id="filter-period-from"
                />
                <span className="text-[var(--ms-text-muted)] text-sm">—</span>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => {
                    setPeriodTo(e.target.value);
                    setCursor(undefined);
                  }}
                  aria-label={t('period_end')}
                  data-test-id="filter-period-to"
                />
              </div>
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFields('organization')} expandable>
              <CatalogPickerField
                value={
                  orgFilter.id ? { id: orgFilter.id, label: orgFilter.label ?? orgFilter.id } : null
                }
                placeholder=""
                onPick={() => setPickerOpen('org')}
                onClear={() => {
                  setOrgFilter({});
                  setCursor(undefined);
                }}
                testId="filter-org"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={t('employee')} expandable>
              <CatalogPickerField
                value={
                  employeeFilter.id
                    ? { id: employeeFilter.id, label: employeeFilter.label ?? employeeFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('employee')}
                onClear={() => {
                  setEmployeeFilter({});
                  setCursor(undefined);
                }}
                testId="filter-employee"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFields('state')} expandable>
              <NativeSelect
                value={stateFilter ?? ''}
                onChange={(e) => {
                  setStateFilter(e.target.value || null);
                  setCursor(undefined);
                }}
                data-test-id="filter-state"
              >
                <option value="" />
                {['draft', 'posted', 'cancelled'].map((s) => (
                  <option key={s} value={s}>
                    {tStates(s)}
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
      <CatalogPicker
        open={pickerOpen === 'org'}
        onClose={() => setPickerOpen(null)}
        title={tFields('organization')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/organizations?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setOrgFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'employee'}
        onClose={() => setPickerOpen(null)}
        title={t('employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setEmployeeFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />

      <CatalogPicker
        open={pickerOpen === 'massEditOwner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMassEditOwner({ id: item.id, label: String(item.primary) });
          setPickerOpen(null);
        }}
      />

      <MassEditModal
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        selectedCount={massEditIds.length}
        submitting={bulk.massEdit.isPending}
        hideProject
        ownerValue={massEditOwner}
        onOwnerPick={() => setPickerOpen('massEditOwner')}
        onOwnerClear={() => setMassEditOwner(null)}
        projectValue={null}
        onProjectPick={() => undefined}
        onProjectClear={() => undefined}
        labels={{
          title: t('mass_edit_title'),
          ownerLabel: tFilters('owner_employee'),
          projectLabel: tFilters('project'),
          descriptionLabel: t('mass_edit_description_label'),
          apply: t('mass_edit_apply'),
          cancel: t('mass_edit_cancel'),
          hint: t('mass_edit_hint', { count: massEditIds.length }),
        }}
        onSubmit={async (patch) => {
          await bulk.massEdit.mutateAsync({ ids: massEditIds, ...patch });
          setMassEditOpen(false);
        }}
      />
    </>
  );
}
