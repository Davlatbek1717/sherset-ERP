'use client';

/**
 * /counterparty-adjustments — list of manual debt corrections.
 *
 * 1:1 with moysklad «Корректировка взаиморасчётов» list (reference:
 * docs/moysklad-reference/visual-captures/07-module/counterpartyadjustment/
 * screenshots/00-clean-default.png):
 *   - Columns: №, Время, Организация, Контрагент, Сумма коррект.,
 *     Комментарий, Когда изменил, Кто изменил
 *   - Direction folded into the sign of the «Сумма» column — moysklad
 *     has no separate direction column, and no state column.
 *   - Filtering via the «Фильтр» inline panel (period / agent / org /
 *     sum range), NOT inline state pills — matches the reference toolbar.
 */

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { YesNoSelect } from '@/components/filters/filter-fields';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useDocEditMenuItems } from '@/components/money/document-toolbar-menus';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MassEditModal,
  MoneyInput,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface AdjustmentRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  direction: 'INCREASE' | 'DECREASE';
  sumMinor: string;
  moment: string;
  currency: string;
  description: string | null;
  updatedAt: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  owner: { id: string; name: string } | null;
}

interface ListResponse {
  items: AdjustmentRow[];
  nextCursor?: string;
  total: number;
}

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

export default function CounterpartyAdjustmentListPage() {
  const t = useTranslations('pages.counterparty_adjustment');
  const tBulkActions = useTranslations('bulk_actions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.counterparty_adjustment');
  const tPrintMenu = useTranslations('print_menu');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  // «Контрагент» / «Организация» — moysklad-parity inline multi-select checkbox
  // dropdowns (were single-select modals). The «Контрагент» dropdown shows the
  // phone as a sublabel and searches by name OR phone (BE /counterparties?search=
  // already matches both); on the wire they go out as `agentIds`/`organizationIds`
  // CSV.
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'owner'
    | 'project'
    | 'contract'
    | 'agentGroup'
    | 'group'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);

  const router = useRouter();

  const [massEditOpen, setMassEditOpen] = useState(false);

  // «Владелец-отдел» options for the mass-edit wizard — mirrors losses/cash-in.

  const { data: massGroupsData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['groups', 'mass-edit'],

    queryFn: () => api.get('/groups?limit=100'),

    enabled: massEditOpen,

    staleTime: 5 * 60 * 1000,
  });
  const [massEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );
  // Extended filter state — fields beyond what FilterDrawerValues covers
  // (moysklad «Корректировки взаиморасчётов» parity: Группа контрагента /
  // Договор / Проект / Статус / Проведено / Владелец-отдел / Когда изменен).
  // Mirrors the cash-in gold standard.
  const [extFilter, setExtFilter] = useState<{
    state?: string;
    projectId?: string;
    projectLabel?: string;
    contractId?: string;
    contractLabel?: string;
    agentGroupId?: string;
    agentGroupLabel?: string;
    groupId?: string;
    groupLabel?: string;
    // tri-state flag filter ('true' | 'false')
    applicable?: 'true' | 'false';
    // «Когда изменен» period
    updatedFrom?: string;
    updatedTo?: string;
  }>({});

  const paramsRecord: Record<string, string> = { limit: String(LIMIT), sortBy: sortKey, sortDir };
  if (search) paramsRecord.search = search;
  if (cursor) paramsRecord.cursor = cursor;
  if (filterValues.momentFrom) paramsRecord.momentFrom = filterValues.momentFrom;
  if (filterValues.momentTo) paramsRecord.momentTo = filterValues.momentTo;
  if (agents.length) paramsRecord.agentIds = agents.map((x) => x.id).join(',');
  if (organizations.length) paramsRecord.organizationIds = organizations.map((x) => x.id).join(',');
  if (filterValues.ownerId) paramsRecord.ownerId = filterValues.ownerId;
  if (filterValues.sumMinorFrom !== undefined)
    paramsRecord.sumMinorFrom = String(filterValues.sumMinorFrom);
  if (filterValues.sumMinorTo !== undefined)
    paramsRecord.sumMinorTo = String(filterValues.sumMinorTo);
  if (extFilter.state) paramsRecord.state = extFilter.state;
  if (extFilter.projectId) paramsRecord.projectId = extFilter.projectId;
  if (extFilter.contractId) paramsRecord.contractId = extFilter.contractId;
  if (extFilter.agentGroupId) paramsRecord.agentGroupId = extFilter.agentGroupId;
  if (extFilter.groupId) paramsRecord.groupId = extFilter.groupId;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.updatedFrom) paramsRecord.updatedFrom = extFilter.updatedFrom;
  if (extFilter.updatedTo) paramsRecord.updatedTo = extFilter.updatedTo;
  const params = new URLSearchParams(paramsRecord);

  const listQueryKey = [
    'counterparty-adjustments',
    search,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    extFilter,
    agents,
    organizations,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/counterparty-adjustments?${params.toString()}`),
  });

  const openMassEdit = (ids: string[]) => {
    stashBulkEdit({ entity: 'counterparty-adjustments', ids, from: '/counterparty-adjustments' });
    router.push('/bulk-edit');
  };
  const bulk = useBulkDocumentActions('counterparty-adjustments', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: openMassEdit,
  });

  // moysklad parity (B6 audit, 2026-05-21): `updatedAt`/`owner` removed
  // from defaults (available via gear).
  const cols = useColumnVisibility('counterparty-adjustments', [
    'name',
    'moment',
    'organization',
    'agent',
    'sum',
    'description',
  ]);
  const colWidths = useColumnWidths('counterparty-adjustments');
  const hasActiveFilter =
    !!search ||
    agents.length > 0 ||
    organizations.length > 0 ||
    Object.values(filterValues).some((v) => v !== undefined && v !== '') ||
    Object.values(extFilter).some((v) => v !== undefined && v !== '');

  const columns: DataTableColumn<AdjustmentRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '150px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/counterparty-adjustments/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      // moysklad column «Организация» — between Время and Контрагент
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      cell: (r) => (
        <span className="block max-w-[180px] truncate text-sm">{r.organization.name}</span>
      ),
      cellText: (r) => r.organization.name,
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="max-w-[280px] truncate font-medium">{r.agent.name}</div>
          {r.agent.legalTitle && (
            <div className="max-w-[280px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {r.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.agent.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : r.agent.name,
    },
    {
      // moysklad «Сумма коррект.» — signed, no separate direction column.
      // The +/− prefix IS the direction (moysklad folds direction into
      // the sign of this single column; there is no «Yo'nalish» column
      // in the reference capture).
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '170px',
      sortable: true,
      cell: (r) => {
        const sign = r.direction === 'INCREASE' ? '+' : '−';
        return (
          <span
            className={`font-medium tabular-nums ${r.direction === 'INCREASE' ? 'text-[var(--ms-text-warning,#b15c00)]' : 'text-[var(--ms-text-brand)]'}`}
          >
            {sign}
            {formatMoney(r.sumMinor, r.currency, { displayAs: 'none' })}
          </span>
        );
      },
      cellText: (r) => `${r.direction === 'INCREASE' ? '+' : '-'}${formatMoney(r.sumMinor)}`,
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (r) => (
        <span className="block max-w-[260px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {r.description ?? tCommon('none')}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
    {
      // moysklad «Когда изменил» — last-modified timestamp (datetime).
      key: 'updatedAt',
      sortField: 'updatedAt',
      header: tFields('updated'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(r.updatedAt)}
        </span>
      ),
      cellText: (r) => formatDate(r.updatedAt),
    },
    {
      // moysklad «Кто изменил» — owner / last editor.
      key: 'owner',
      header: tFields('owner'),
      width: '160px',
      cell: (r) => (
        <span className="block max-w-[160px] truncate text-[var(--ms-text-muted)] text-sm">
          {r.owner?.name ?? '—'}
        </span>
      ),
      cellText: (r) => r.owner?.name ?? '',
    },
  ];

  // Moysklad-parity toolbar dropdowns. Order matches the reference
  // capture (07-module/counterpartyadjustment/screenshots/00-clean-default):
  //   Изменить ▾ → Создать ▾ → Печать ▾ → Отправить ▾
  // Sub-items inside each menu come from the corresponding *-dropdown-*.png
  // captures when those screenshots are clean. For this entity the
  // dropdowns use the shared money-doc edit menu (the same i18n-clean hook the
  // 4 cash/payment lists use) so labels stay localized in ru+uz.
  const editMenuItems = useDocEditMenuItems({
    selectedIds: bulk.selectedIds,
    allRowIds: (data?.items ?? []).map((r) => r.id),
    onBulkDelete: (ids) => bulk.bulkDelete.mutate(ids),
    deletePending: bulk.bulkDelete.isPending,
    onMassEdit: openMassEdit,
  });
  const printMenuItems = [
    { id: 'print', label: tPrintMenu('document_blank'), onSelect: () => window.print() },
  ];

  return (
    <>
      <ListView
        testId="counterparty-adjustments-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        createHref="/counterparty-adjustments/new"
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
        rowTestId={(r) => `cp-adj-row-${r.id}`}
        rowActions={(r) => bulk.rowDelete(r.id)}
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
        selectionCount={bulk.selectedIds.size}
        editMenu={{ label: tBulkActions('trigger'), items: editMenuItems }}
        printMenu={{ label: tPrintMenu('trigger'), items: printMenuItems }}
        visibleColumnKeys={cols.visibleKeys}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        {...bulk.listViewProps}
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
              alwaysVisible: c.key === 'name',
            }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setExtFilter({});
              setAgents([]);
              setOrganizations([]);
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="counterpartyadjustment"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  // The multi-select reference filters ride the query string as
                  // `agentIds`/`organizationIds` CSV (see paramsRecord); restore
                  // them into their arrays. Labels aren't carried in the params,
                  // so the id doubles as the label until the user re-searches.
                  const usp = qs.startsWith('?')
                    ? new URLSearchParams(qs.slice(1))
                    : new URLSearchParams(qs);
                  const csvToRefs = (key: string): RefMulti[] =>
                    (usp.get(key) ?? '')
                      .split(',')
                      .filter(Boolean)
                      .map((id) => ({ id, label: id }));
                  setAgents(csvToRefs('agentIds'));
                  setOrganizations(csvToRefs('organizationIds'));
                  setCursor(undefined);
                }}
              />
            }
            testId="cp-adj-inline-filter"
          >
            {/* Inline filter panel — moysklad «Корректировки взаиморасчётов»
               parity, ordered to match the filter reference
               (07-module/counterpartyadjustment/dom/01-default.html): Период ·
               Контрагент · Группа контрагента · Договор · Организация ·
               Проект · Статус · Проведено · Владелец-сотрудник ·
               Владелец-отдел · Сумма · Когда изменен. «Кто изменил» SKIPPED —
               no `updatedById` column (only ownerId → Владелец-сотрудник).
               «Тип документа» SKIPPED — in the reference DOM that select is a
               linked source-document-kind enum (PurchaseOrder / InvoiceIn /
               Supply / …), NOT this doc's `direction`; no column backs it. */}
            {/* 1. Период */}
            <InlineFilterPanel.Field
              label={tFilters('period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
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
              expandable
            >
              <PeriodInputs
                from={filterValues.momentFrom}
                to={filterValues.momentTo}
                onChange={({ from, to }) => {
                  setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
                  setCursor(undefined);
                }}
                testId="filter-period"
              />
            </InlineFilterPanel.Field>
            {/* 2. Контрагент — moysklad-parity inline multi-select checkbox
               dropdown: type a name OR phone, results appear inline (each row
               shows the phone as a sublabel), tick as many as needed. Was a
               single-select modal. */}
            <InlineFilterPanel.Field label={tFilters('agent')} expandable>
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
            {/* 3. Группа контрагента */}
            <InlineFilterPanel.Field label={tFilters('agent_group')} expandable>
              <CatalogPickerField
                value={
                  extFilter.agentGroupId
                    ? {
                        id: extFilter.agentGroupId,
                        label: extFilter.agentGroupLabel ?? extFilter.agentGroupId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agentGroup')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    agentGroupId: undefined,
                    agentGroupLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-agent-group"
              />
            </InlineFilterPanel.Field>
            {/* 4. Договор */}
            <InlineFilterPanel.Field label={tFilters('contract')} expandable>
              <CatalogPickerField
                value={
                  extFilter.contractId
                    ? {
                        id: extFilter.contractId,
                        label: extFilter.contractLabel ?? extFilter.contractId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('contract')}
                onClear={() => {
                  setExtFilter({ ...extFilter, contractId: undefined, contractLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-contract"
              />
            </InlineFilterPanel.Field>
            {/* 5. Организация — moysklad-parity inline multi-select checkbox
               dropdown (was a single-select modal). */}
            <InlineFilterPanel.Field label={tFilters('organization')} expandable>
              <MultiCombobox
                value={organizations.map((x) => x.id)}
                items={organizations.map((x) => ({ value: x.id, label: x.label }))}
                onSearch={async (q) => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/organizations?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ value: x.id, label: x.name }));
                }}
                onChange={(nextIds, toggled) => {
                  setOrganizations((prev) =>
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
                testId="filter-org"
              />
            </InlineFilterPanel.Field>
            {/* 6. Проект */}
            <InlineFilterPanel.Field label={tFilters('project')} expandable>
              <CatalogPickerField
                value={
                  extFilter.projectId
                    ? {
                        id: extFilter.projectId,
                        label: extFilter.projectLabel ?? extFilter.projectId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('project')}
                onClear={() => {
                  setExtFilter({ ...extFilter, projectId: undefined, projectLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-project"
              />
            </InlineFilterPanel.Field>
            {/* 7. Статус — FSM state filter (moysklad surfaces this as a
              dropdown, not pill sub-tabs). */}
            <InlineFilterPanel.Field label={tFilters('state')} expandable>
              <NativeSelect
                value={extFilter.state ?? ''}
                onChange={(e) => {
                  setExtFilter({ ...extFilter, state: e.target.value || undefined });
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
            {/* 8. Проведено */}
            <InlineFilterPanel.Field label={tFilters('applicable')} expandable>
              <YesNoSelect
                value={extFilter.applicable}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, applicable: v });
                  setCursor(undefined);
                }}
                testId="filter-applicable"
              />
            </InlineFilterPanel.Field>
            {/* 9. Владелец-сотрудник */}
            <InlineFilterPanel.Field label={tFilters('owner_employee')} expandable>
              <CatalogPickerField
                value={
                  filterValues.ownerId
                    ? {
                        id: filterValues.ownerId,
                        label: filterValues.ownerLabel ?? filterValues.ownerId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('owner')}
                onClear={() => {
                  setFilterValues({ ...filterValues, ownerId: undefined, ownerLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>
            {/* 10. Владелец-отдел */}
            <InlineFilterPanel.Field label={tFilters('owner_group')} expandable>
              <CatalogPickerField
                value={
                  extFilter.groupId
                    ? {
                        id: extFilter.groupId,
                        label: extFilter.groupLabel ?? extFilter.groupId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('group')}
                onClear={() => {
                  setExtFilter({ ...extFilter, groupId: undefined, groupLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-group"
              />
            </InlineFilterPanel.Field>
            {/* 11. Сумма — from / to bounds. */}
            <InlineFilterPanel.Field label={tFilters('sum_from')} expandable>
              <MoneyInput
                allowEmpty
                valueMinor={
                  filterValues.sumMinorFrom !== undefined ? String(filterValues.sumMinorFrom) : ''
                }
                onChangeMinor={(minor) => {
                  setFilterValues({
                    ...filterValues,
                    sumMinorFrom: minor === '' ? undefined : Number(minor),
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-sum-from"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('sum_to')} expandable>
              <MoneyInput
                allowEmpty
                valueMinor={
                  filterValues.sumMinorTo !== undefined ? String(filterValues.sumMinorTo) : ''
                }
                onChangeMinor={(minor) => {
                  setFilterValues({
                    ...filterValues,
                    sumMinorTo: minor === '' ? undefined : Number(minor),
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-sum-to"
              />
            </InlineFilterPanel.Field>
            {/* 12. Когда изменен — updatedAt range. */}
            <InlineFilterPanel.Field
              label={tFilters('updated_period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setExtFilter({ ...extFilter, updatedFrom: from, updatedTo: to });
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
              expandable
            >
              <PeriodInputs
                from={extFilter.updatedFrom}
                to={extFilter.updatedTo}
                onChange={({ from, to }) => {
                  setExtFilter({ ...extFilter, updatedFrom: from, updatedTo: to });
                  setCursor(undefined);
                }}
                testId="filter-updated"
              />
            </InlineFilterPanel.Field>
          </InlineFilterPanel>
        }
      />
      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            ownerId: item.id,
            ownerLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'project'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('project')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/projects?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            projectId: item.id,
            projectLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'contract'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('contract')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/contracts?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            contractId: item.id,
            contractLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'agentGroup'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            agentGroupId: item.id,
            agentGroupLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'group'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            groupId: item.id,
            groupLabel: String(item.primary),
          });
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
      <CatalogPicker
        open={pickerOpen === 'massEditProject'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('project')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/projects?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMassEditProject({ id: item.id, label: String(item.primary) });
          setPickerOpen(null);
        }}
      />

      <MassEditModal
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        selectedCount={massEditIds.length}
        submitting={bulk.massEdit.isPending}
        ownerValue={massEditOwner}
        onOwnerPick={() => setPickerOpen('massEditOwner')}
        onOwnerClear={() => setMassEditOwner(null)}
        projectValue={massEditProject}
        onProjectPick={() => setPickerOpen('massEditProject')}
        onProjectClear={() => setMassEditProject(null)}
        groupOptions={(massGroupsData?.items ?? []).map((g) => ({ value: g.id, label: g.name }))}
        showShared
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
