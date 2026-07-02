'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import {
  useDocEditMenuItems,
  useMoneyPrintMenuItems,
} from '@/components/money/document-toolbar-menus';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  Input,
  ListView,
  MassEditModal,
  MoneyInput,
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
import { useState } from 'react';

interface CashOutRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  moment: string;
  currency: string;
  paymentPurpose: string | null;
  updatedAt: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  cashDesk: { id: string; name: string; currency: string };
  owner: { id: string; name: string } | null;
  _count: { operations: number };
}

interface ListResponse {
  items: CashOutRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

/** Tri-state ✓ / — / (unset) select — mirrors cash-in's YesNoSelect for
 *  the boolean flag filter (Проведено). The empty option clears the filter
 *  exactly like moysklad. */
function YesNoSelect({
  value,
  onChange,
  testId,
}: {
  value: 'true' | 'false' | undefined;
  onChange: (v: 'true' | 'false' | undefined) => void;
  testId?: string;
}) {
  const tCommon = useTranslations('common');
  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? undefined : (v as 'true' | 'false'));
      }}
      data-test-id={testId}
    >
      <option value="" />
      <option value="false">{tCommon('no')}</option>
      <option value="true">{tCommon('yes')}</option>
    </NativeSelect>
  );
}

export default function CashOutListPage() {
  const t = useTranslations('pages.cash_out');
  const tPrintMenu = useTranslations('print_menu');
  const tBulkActions = useTranslations('bulk_actions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.cash_out');
  const tMass = useTranslations('mass_edit_modal');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort — mirrors purchase-orders pattern. Default: newest first.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'agent'
    | 'org'
    | 'owner'
    | 'project'
    | 'contract'
    | 'agentGroup'
    | 'agentOwner'
    | 'group'
    | 'cashDesk'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);
  // moysklad «Массовое редактирование» (Изменить dropdown) — owner / project /
  // description patch across selected rows. Backend: POST /cash-out/mass-edit.
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );
  // Extended filter state — fields beyond what FilterDrawerValues covers
  // (moysklad «Расходные ордера» parity: Группа контрагента / Договор /
  // Проект / Касса / Статус / Назначение платежа / Статья расходов /
  // Проведено / Владелец-отдел / Когда изменен). Mirrors the cash-in gold
  // standard, plus expenseItem (cash-out carries an expense item).
  const [extFilter, setExtFilter] = useState<{
    state?: string;
    projectId?: string;
    projectLabel?: string;
    contractId?: string;
    contractLabel?: string;
    agentGroupId?: string;
    agentGroupLabel?: string;
    // «Владелец контрагента» — the agent (Counterparty)'s owner employee.
    // Distinct from `ownerId` (the cash order's own owner) in filterValues.
    agentOwnerId?: string;
    agentOwnerLabel?: string;
    groupId?: string;
    groupLabel?: string;
    cashDeskId?: string;
    cashDeskLabel?: string;
    paymentPurpose?: string;
    // «Статья расходов» — text-contains on expenseItem (cash-out only).
    expenseItem?: string;
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
  if (filterValues.sumMinorFrom !== undefined)
    paramsRecord.sumMinorFrom = String(filterValues.sumMinorFrom);
  if (filterValues.sumMinorTo !== undefined)
    paramsRecord.sumMinorTo = String(filterValues.sumMinorTo);
  if (filterValues.agentId) paramsRecord.agentId = filterValues.agentId;
  if (filterValues.organizationId) paramsRecord.organizationId = filterValues.organizationId;
  if (filterValues.ownerId) paramsRecord.ownerId = filterValues.ownerId;
  if (extFilter.state) paramsRecord.state = extFilter.state;
  if (extFilter.projectId) paramsRecord.projectId = extFilter.projectId;
  if (extFilter.contractId) paramsRecord.contractId = extFilter.contractId;
  if (extFilter.agentGroupId) paramsRecord.agentGroupId = extFilter.agentGroupId;
  if (extFilter.agentOwnerId) paramsRecord.agentOwnerId = extFilter.agentOwnerId;
  if (extFilter.groupId) paramsRecord.groupId = extFilter.groupId;
  if (extFilter.cashDeskId) paramsRecord.cashDeskId = extFilter.cashDeskId;
  if (extFilter.paymentPurpose) paramsRecord.paymentPurpose = extFilter.paymentPurpose;
  if (extFilter.expenseItem) paramsRecord.expenseItem = extFilter.expenseItem;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.updatedFrom) paramsRecord.updatedFrom = extFilter.updatedFrom;
  if (extFilter.updatedTo) paramsRecord.updatedTo = extFilter.updatedTo;
  const params = new URLSearchParams(paramsRecord);

  const listQueryKey = [
    'cash-out',
    search,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    extFilter,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/cash-out?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('cash-out', listQueryKey, { hasFSM: true });
  // moysklad parity (B4 audit, 2026-05-21): `updatedAt`/`owner` removed
  // from defaults (available via gear).
  const cols = useColumnVisibility('cash-out', [
    'name',
    'moment',
    'organization',
    'agent',
    'cashDesk',
    'sum',
    'purpose',
  ]);
  const colWidths = useColumnWidths('cash-out');
  const hasActiveFilter =
    !!search ||
    Object.values(filterValues).some((v) => v !== undefined && v !== '') ||
    Object.values(extFilter).some((v) => v !== undefined && v !== '');

  const columns: DataTableColumn<CashOutRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '150px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/cash-out/${r.id}`}
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
      width: '170px',
      cell: (r) => (
        <span className="block max-w-[170px] truncate text-sm">{r.organization.name}</span>
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
            <div className="max-w-[280px] truncate text-[var(--ms-text-muted)] text-xs">
              {r.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.agent.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : r.agent.name,
    },
    {
      key: 'cashDesk',
      header: t('cash_desk'),
      width: '160px',
      cell: (r) => <span className="text-sm">{r.cashDesk.name}</span>,
      cellText: (r) => r.cashDesk.name,
    },
    {
      // moysklad «Расход» — disbursement amount, right-aligned bold.
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('expense'),
      align: 'right',
      width: '170px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium tabular-nums">
          {formatMoney(r.sumMinor, r.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => formatMoney(r.sumMinor),
    },
    {
      key: 'purpose',
      header: tFields('payment_purpose'),
      cell: (r) => (
        <span className="block max-w-[200px] truncate text-[var(--ms-text-muted)] text-xs">
          {r.paymentPurpose ?? tCommon('none')}
        </span>
      ),
      cellText: (r) => r.paymentPurpose ?? '',
    },
    {
      key: 'updatedAt',
      sortField: 'updatedAt',
      header: tFields('updated'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
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

  const openMassEdit = (ids: string[]) => {
    setMassEditIds(ids);
    setMassEditOwner(null);
    setMassEditProject(null);
    setMassEditOpen(true);
  };
  // moysklad «Изменить» / «Печать» parity — items, order and disabled
  // state mirror docs/moysklad-reference/cash-out/states/metadata.json
  // (Phase 2 audit, 2026-05-30). Shared with the other money documents.
  const editMenuItems = useDocEditMenuItems({
    selectedIds: bulk.selectedIds,
    onBulkDelete: (ids) => bulk.bulkDelete.mutate(ids),
    deletePending: bulk.bulkDelete.isPending,
    onMassEdit: openMassEdit,
  });
  const printMenuItems = useMoneyPrintMenuItems();

  return (
    <>
      <ListView
        testId="cash-out-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/cash-out', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/cash-out/new"
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
        rowTestId={(r) => `cash-out-row-${r.id}`}
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
        editMenu={{ label: tBulkActions('trigger'), items: editMenuItems }}
        printMenu={{ label: tPrintMenu('trigger'), items: printMenuItems }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        {...bulk.listViewProps}
        // bulkActionBar omitted — toolbar dropdowns replace it.
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setExtFilter({});
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="cashout"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  setCursor(undefined);
                }}
              />
            }
            testId="cash-out-inline-filter"
          >
            {/* Inline filter panel — moysklad «Расходные ордера» parity,
               ordered to match the cashout filter reference
               (07-module/cashout/dom/01-default.html): Период · Контрагент ·
               Группа контрагента · Договор · Организация · Касса · Проект ·
               Статус · Назначение платежа · Статья расходов · Проведено ·
               Владелец-сотрудник · Владелец-отдел · Сумма · Когда изменен.
               «Касса» (cashDeskId) is the cash-doc money source (no bank
               account). «Основание» is SKIPPED — it shares the `paymentPurpose`
               column with Назначение платежа; a second filter would duplicate
               it. «Статья расходов» (expenseItem) IS present here — the KEY
               difference vs cash-in (cash-out carries an expense item). «Кто
               изменил» SKIPPED — no updatedById column. */}
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
            {/* 2. Контрагент */}
            <InlineFilterPanel.Field label={tFilters('agent')} expandable>
              <CatalogPickerField
                value={
                  filterValues.agentId
                    ? {
                        id: filterValues.agentId,
                        label: filterValues.agentLabel ?? filterValues.agentId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agent')}
                onClear={() => {
                  setFilterValues({ ...filterValues, agentId: undefined, agentLabel: undefined });
                  setCursor(undefined);
                }}
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
            {/* Владелец контрагента — the agent (Counterparty)'s owner employee
               (agent.ownerId). §4-grounded on the cashout filter capture
               (07-module/cashout/dom/00-clean-default.html, ordered Договор →
               Владелец контрагента → Организация). Distinct from «Владелец-
               сотрудник» (the cash order's own owner). NOTE: moysklad's unified
               money filter also lists «Счёт организации» here, but CashOut has
               NO organizationAccountId column (cash docs use «Касса», a cash
               desk — not a bank account), so surfacing it would be a dead
               filter — it is deliberately omitted (see cash-out.schema.ts). */}
            <InlineFilterPanel.Field label={tFilters('agent_owner')} expandable>
              <CatalogPickerField
                value={
                  extFilter.agentOwnerId
                    ? {
                        id: extFilter.agentOwnerId,
                        label: extFilter.agentOwnerLabel ?? extFilter.agentOwnerId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agentOwner')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    agentOwnerId: undefined,
                    agentOwnerLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-agent-owner"
              />
            </InlineFilterPanel.Field>
            {/* 5. Организация */}
            <InlineFilterPanel.Field label={tFilters('organization')} expandable>
              <CatalogPickerField
                value={
                  filterValues.organizationId
                    ? {
                        id: filterValues.organizationId,
                        label: filterValues.organizationLabel ?? filterValues.organizationId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('org')}
                onClear={() => {
                  setFilterValues({
                    ...filterValues,
                    organizationId: undefined,
                    organizationLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-org"
              />
            </InlineFilterPanel.Field>
            {/* 6. Касса — cash-doc money source (cashDeskId). */}
            <InlineFilterPanel.Field label={tFilters('cash_desk')} expandable>
              <CatalogPickerField
                value={
                  extFilter.cashDeskId
                    ? {
                        id: extFilter.cashDeskId,
                        label: extFilter.cashDeskLabel ?? extFilter.cashDeskId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('cashDesk')}
                onClear={() => {
                  setExtFilter({ ...extFilter, cashDeskId: undefined, cashDeskLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-cash-desk"
              />
            </InlineFilterPanel.Field>
            {/* 7. Проект */}
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
            {/* 8. Статус — FSM state filter (moysklad surfaces this as a
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
            {/* 9. Назначение платежа — text-contains on paymentPurpose.
              «Основание» SKIPPED — same column. */}
            <InlineFilterPanel.Field label={tFilters('payment_purpose')} expandable>
              <Input
                value={extFilter.paymentPurpose ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setExtFilter({ ...extFilter, paymentPurpose: v === '' ? undefined : v });
                  setCursor(undefined);
                }}
                data-test-id="filter-payment-purpose"
              />
            </InlineFilterPanel.Field>
            {/* 10. Статья расходов — text-contains on expenseItem (cash-out
              only; the KEY difference vs cash-in). */}
            <InlineFilterPanel.Field label={tFilters('expense_item')} expandable>
              <Input
                value={extFilter.expenseItem ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setExtFilter({ ...extFilter, expenseItem: v === '' ? undefined : v });
                  setCursor(undefined);
                }}
                data-test-id="filter-expense-item"
              />
            </InlineFilterPanel.Field>
            {/* 11. Проведено */}
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
            {/* 12. Владелец-сотрудник */}
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
            {/* 13. Владелец-отдел */}
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
            {/* 14. Сумма — from / to bounds. */}
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
            {/* 15. Когда изменен — updatedAt range. */}
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
      />
      <CatalogPicker
        open={pickerOpen === 'agent'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            agentId: item.id,
            agentLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'org'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('organization')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/organizations?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            organizationId: item.id,
            organizationLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
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
        open={pickerOpen === 'agentOwner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent_owner')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            agentOwnerId: item.id,
            agentOwnerLabel: String(item.primary),
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
        open={pickerOpen === 'cashDesk'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('cash_desk')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/cash-desks?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            cashDeskId: item.id,
            cashDeskLabel: String(item.primary),
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
        labels={{
          title: tMass('title'),
          ownerLabel: tFilters('owner_employee'),
          projectLabel: tFilters('project'),
          descriptionLabel: tMass('description_label'),
          apply: tMass('apply'),
          cancel: tMass('cancel'),
          hint: tMass('hint', { count: massEditIds.length }),
        }}
        onSubmit={async (patch) => {
          await bulk.massEdit.mutateAsync({ ids: massEditIds, ...patch });
          setMassEditOpen(false);
        }}
      />
    </>
  );
}
