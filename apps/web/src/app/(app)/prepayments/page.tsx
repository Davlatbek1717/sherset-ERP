'use client';

/**
 * /prepayments — list of prepayment (avans / Предоплата) documents.
 *
 * 1:1 with moysklad «Предоплаты» (reference: visual-captures/07-module/
 * prepayment + api-docs-official/_prepayment.md):
 *   - Columns: №, Время, Организация, Контрагент, Сумма, Заказ,
 *     Комментарий, Когда изменил, Кто изменил
 *   - No state column (moysklad's Prepayment has only `applicable`)
 *   - «Фильтр» InlineFilterPanel (period/agent/org/sum), not state pills
 *   - Sum shows leading «−» (prepayment always reduces customer balance)
 *
 * NOTE: in moysklad this lives under «Розница» (retail, POS-generated).
 * We keep it under «Pul» for now + allow manual create — superset of
 * moysklad. Sub-nav relocation tracked in docs/PARITY-AUDIT.md.
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

interface PrepaymentRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  moment: string;
  currency: string;
  description: string | null;
  updatedAt: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  customerOrder: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
}

interface ListResponse {
  items: PrepaymentRow[];
  nextCursor?: string;
  total: number;
}

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

export default function PrepaymentListPage() {
  const t = useTranslations('pages.prepayment');
  const tBulkActions = useTranslations('bulk_actions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.prepayment');
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
  // already matches both). On the wire they go out as `<field>Ids` CSV.
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<
    null | 'owner' | 'agentGroup' | 'group' | 'massEditOwner' | 'massEditProject'
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
  // Extended filter state — moysklad «Предоплаты» (retail variant) parity:
  // fields beyond what FilterDrawerValues covers (Группа контрагента / Статус /
  // Проведено / Владелец-отдел / Когда изменен). Mirrors the payment-in gold
  // standard. The reference panel has NO Договор / Проект / Счёт организации /
  // Счёт контрагента, so those are intentionally absent.
  const [extFilter, setExtFilter] = useState<{
    state?: string;
    agentGroupId?: string;
    agentGroupLabel?: string;
    groupId?: string;
    groupLabel?: string;
    // tri-state flag filters ('true' | 'false')
    applicable?: 'true' | 'false';
    printed?: 'true' | 'false';
    published?: 'true' | 'false';
    shared?: 'true' | 'false';
    // «Когда изменен» period
    updatedFrom?: string;
    updatedTo?: string;
  }>({});

  const paramsRecord: Record<string, string> = {
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
  };
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
  if (extFilter.agentGroupId) paramsRecord.agentGroupId = extFilter.agentGroupId;
  if (extFilter.groupId) paramsRecord.groupId = extFilter.groupId;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.printed) paramsRecord.printed = extFilter.printed;
  if (extFilter.published) paramsRecord.published = extFilter.published;
  if (extFilter.shared) paramsRecord.shared = extFilter.shared;
  if (extFilter.updatedFrom) paramsRecord.updatedFrom = extFilter.updatedFrom;
  if (extFilter.updatedTo) paramsRecord.updatedTo = extFilter.updatedTo;
  const params = new URLSearchParams(paramsRecord);

  const listQueryKey = [
    'prepayments',
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
    queryFn: () => api.get<ListResponse>(`/prepayments?${params.toString()}`),
  });

  const openMassEdit = (ids: string[]) => {
    stashBulkEdit({ entity: 'prepayments', ids, from: '/prepayments' });
    router.push('/bulk-edit');
  };
  const bulk = useBulkDocumentActions('prepayments', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: openMassEdit,
  });

  // moysklad parity (B7 audit, 2026-05-21): `updatedAt`/`owner` removed
  // from defaults (available via gear). customerOrder kept — moysklad
  // prepayments shows linked order column by default.
  const cols = useColumnVisibility('prepayments', [
    'name',
    'moment',
    'organization',
    'agent',
    'sum',
    'customerOrder',
    'description',
  ]);
  const colWidths = useColumnWidths('prepayments');
  const hasActiveFilter =
    !!search ||
    agents.length > 0 ||
    organizations.length > 0 ||
    Object.values(filterValues).some((v) => v !== undefined && v !== '') ||
    Object.values(extFilter).some((v) => v !== undefined && v !== '');

  const columns: DataTableColumn<PrepaymentRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '150px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/prepayments/${r.id}`}
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
          <div className="max-w-[240px] truncate font-medium">{r.agent.name}</div>
          {r.agent.legalTitle && (
            <div className="max-w-[240px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {r.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.agent.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : r.agent.name,
    },
    {
      // Prepayment always reduces customer balance → leading «−».
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '170px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium text-[var(--ms-text-brand)] tabular-nums">
          {'−'}
          {formatMoney(r.sumMinor, r.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => `-${formatMoney(r.sumMinor)}`,
    },
    {
      key: 'customerOrder',
      header: tFields('customer_order'),
      width: '180px',
      cell: (r) =>
        r.customerOrder ? (
          <a
            href={`/customer-orders/${r.customerOrder.id}`}
            className="text-[var(--ms-text-brand)] text-xs underline-offset-2 hover:underline"
          >
            {r.customerOrder.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (r) => r.customerOrder?.name ?? '',
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (r) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {r.description ?? tCommon('none')}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
    {
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
        testId="prepayments-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        createHref="/prepayments/new"
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
        rowTestId={(r) => `prepayment-row-${r.id}`}
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
                entity="prepayment"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  // The multi-select reference chips (agent/org) aren't carried
                  // by the lightweight query-string round-trip — clear them so an
                  // applied saved filter replaces (not stacks onto) prior state.
                  setAgents([]);
                  setOrganizations([]);
                  setCursor(undefined);
                }}
              />
            }
            testId="prepayment-inline-filter"
          >
            {/* Inline filter panel — moysklad «Предоплаты» (retail variant)
               parity, ordered to match the prepayment list filter reference
               (07-module/prepayment/dom/00-clean-default.html): Период ·
               Контрагент · Группа контрагента · Организация · Статус ·
               Проведено · Владелец-сотрудник · Владелец-отдел · Когда изменен ·
               Сумма. SKIPPED retail-POS facets «Тип оплаты» / «Товар или
               группа» / «Точка продаж» (no list-picker route, outside the
               money-page pattern) and «Напечатано» / «Отправлено» / «Общий
               доступ» (printed/published/shared flags — out of FK/range scope).
               «Кто изменил» SKIPPED — no updatedById column. No Договор /
               Проект / Счёт организации / Счёт контрагента — absent from the
               reference panel. */}
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
            {/* 4. Организация — moysklad-parity inline multi-select checkbox
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
            {/* 5. Статус — FSM state filter (moysklad surfaces this as a
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
            {/* 6. Проведено */}
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
            {/* 6a. Напечатано */}
            <InlineFilterPanel.Field label={tFilters('printed')} expandable>
              <YesNoSelect
                value={extFilter.printed}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, printed: v });
                  setCursor(undefined);
                }}
                testId="filter-printed"
              />
            </InlineFilterPanel.Field>
            {/* 6b. Отправлено */}
            <InlineFilterPanel.Field label={tFilters('published')} expandable>
              <YesNoSelect
                value={extFilter.published}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, published: v });
                  setCursor(undefined);
                }}
                testId="filter-published"
              />
            </InlineFilterPanel.Field>
            {/* 6c. Общий доступ */}
            <InlineFilterPanel.Field label={tFilters('shared')} expandable>
              <YesNoSelect
                value={extFilter.shared}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, shared: v });
                  setCursor(undefined);
                }}
                testId="filter-shared"
              />
            </InlineFilterPanel.Field>
            {/* 7. Владелец-сотрудник */}
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
            {/* 8. Владелец-отдел */}
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
            {/* 9. Когда изменен — updatedAt range. */}
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
            {/* 10. Сумма — from / to bounds. */}
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
