'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { YesNoSelect } from '@/components/filters/filter-fields';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import {
  useDocEditMenuItems,
  useMoneyPrintMenuItems,
} from '@/components/money/document-toolbar-menus';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { filterFromQueryString } from '@/lib/filter-from-query';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
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

interface PaymentRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  moment: string;
  paymentPurpose: string | null;
  updatedAt: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  owner: { id: string; name: string } | null;
  _count: { operations: number };
}

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

// Moysklad parity — 100 rows per page (same as CO list).
const LIMIT = 100;

export default function PaymentsOutPage() {
  const t = useTranslations('pages.payments_out');
  const tPrintMenu = useTranslations('print_menu');
  const tBulkActions = useTranslations('bulk_actions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.payment_out');
  const tMass = useTranslations('mass_edit_modal');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort — mirrors purchase-orders pattern. Default: newest first.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  // «Контрагент» / «Организация» — moysklad-parity inline multi-select checkbox
  // dropdowns (were single-select modals). The «Контрагент» dropdown shows the
  // phone as a sublabel and searches by name OR phone (BE /counterparties?search=
  // already matches both). The dependent «Счёт организации» picker scopes to the
  // FIRST selected organization (organizations[0]) since an account belongs to one.
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'orgAccount'
    | 'owner'
    | 'project'
    | 'contract'
    | 'agentGroup'
    | 'agentOwner'
    | 'group'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);
  // moysklad «Массовое редактирование» (Изменить dropdown) — owner / project /
  // description patch across selected rows. Backend: POST /payments-out/mass-edit.
  const router = useRouter();
  const [massEditOpen, setMassEditOpen] = useState(false);
  // «Владелец-отдел» (groupId) options for the mass-edit wizard — mirrors losses.
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
  // (moysklad «Исходящие платежи» parity: Группа контрагента / Договор /
  // Проект / Статус / Назначение платежа / Статья расходов / Проведено /
  // Владелец-отдел / Когда изменен). Mirrors the payments-in gold standard.
  const [extFilter, setExtFilter] = useState<{
    state?: string;
    projectId?: string;
    projectLabel?: string;
    contractId?: string;
    contractLabel?: string;
    agentGroupId?: string;
    agentGroupLabel?: string;
    // «Владелец контрагента» — the agent (Counterparty)'s owner employee.
    // Distinct from `ownerId` (the payment's own owner) in filterValues.
    agentOwnerId?: string;
    agentOwnerLabel?: string;
    // «Счёт организации» — PaymentOut.organizationAccountId (BE already
    // accepted it; the FE just never surfaced the control).
    organizationAccountId?: string;
    organizationAccountLabel?: string;
    groupId?: string;
    groupLabel?: string;
    paymentPurpose?: string;
    // «Статья расходов» — text-contains on expenseItem (PaymentOut-only col).
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
  if (agents.length) paramsRecord.agentIds = agents.map((x) => x.id).join(',');
  if (organizations.length) paramsRecord.organizationIds = organizations.map((x) => x.id).join(',');
  if (filterValues.ownerId) paramsRecord.ownerId = filterValues.ownerId;
  if (extFilter.state) paramsRecord.state = extFilter.state;
  if (extFilter.projectId) paramsRecord.projectId = extFilter.projectId;
  if (extFilter.contractId) paramsRecord.contractId = extFilter.contractId;
  if (extFilter.agentGroupId) paramsRecord.agentGroupId = extFilter.agentGroupId;
  if (extFilter.agentOwnerId) paramsRecord.agentOwnerId = extFilter.agentOwnerId;
  if (extFilter.organizationAccountId)
    paramsRecord.organizationAccountId = extFilter.organizationAccountId;
  if (extFilter.groupId) paramsRecord.groupId = extFilter.groupId;
  if (extFilter.paymentPurpose) paramsRecord.paymentPurpose = extFilter.paymentPurpose;
  if (extFilter.expenseItem) paramsRecord.expenseItem = extFilter.expenseItem;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.updatedFrom) paramsRecord.updatedFrom = extFilter.updatedFrom;
  if (extFilter.updatedTo) paramsRecord.updatedTo = extFilter.updatedTo;
  const params = new URLSearchParams(paramsRecord);

  const listQueryKey = [
    'payments-out',
    search,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    extFilter,
    agents,
    organizations,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse<PaymentRow>>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse<PaymentRow>>(`/payments-out?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('payments-out', listQueryKey, { hasFSM: true });
  // moysklad parity (B2 audit, 2026-05-21): /paymentout uses the same
  // unified payments list with Расход amounts. `updatedAt`/`owner`
  // removed from defaults (available via gear).
  const cols = useColumnVisibility('payments-out', [
    'name',
    'moment',
    'organization',
    'agent',
    'sum',
    'purpose',
  ]);
  const colWidths = useColumnWidths('payments-out');
  const hasActiveFilter =
    !!search ||
    agents.length > 0 ||
    organizations.length > 0 ||
    Object.values(filterValues).some((v) => v !== undefined && v !== '') ||
    Object.values(extFilter).some((v) => v !== undefined && v !== '');

  const columns: DataTableColumn<PaymentRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (p) => (
        <a
          href={`/payments-out/${p.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {p.name}
        </a>
      ),
      cellText: (p) => p.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(p.moment)}</span>
      ),
      cellText: (p) => formatDate(p.moment),
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '170px',
      cell: (p) => (
        <span className="block max-w-[170px] truncate text-sm">{p.organization.name}</span>
      ),
      cellText: (p) => p.organization.name,
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (p) => (
        <div>
          <div className="max-w-[300px] truncate font-medium">{p.agent.name}</div>
          {p.agent.legalTitle && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {p.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (p) =>
        p.agent.legalTitle ? `${p.agent.name} (${p.agent.legalTitle})` : p.agent.name,
    },
    {
      // moysklad «Расход» — outgoing payment amount, right-aligned bold.
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('expense'),
      align: 'right',
      width: '170px',
      sortable: true,
      cell: (p) => (
        <span className="font-medium tabular-nums">
          {formatMoney(p.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (p) => (p.sumMinor ? formatMoney(p.sumMinor) : ''),
    },
    {
      key: 'purpose',
      header: tFields('payment_purpose'),
      cell: (p) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {p.paymentPurpose ?? tCommon('none')}
        </span>
      ),
      cellText: (p) => p.paymentPurpose ?? '',
    },
    {
      key: 'updatedAt',
      sortField: 'updatedAt',
      header: tFields('updated'),
      width: '140px',
      sortable: true,
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(p.updatedAt)}
        </span>
      ),
      cellText: (p) => formatDate(p.updatedAt),
    },
    {
      key: 'owner',
      header: tFields('owner'),
      width: '160px',
      cell: (p) => (
        <span className="block max-w-[160px] truncate text-[var(--ms-text-muted)] text-sm">
          {p.owner?.name ?? '—'}
        </span>
      ),
      cellText: (p) => p.owner?.name ?? '',
    },
    {
      key: 'operations',
      header: tFields('operations'),
      width: '60px',
      align: 'right',
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {p._count.operations}
        </span>
      ),
    },
  ];

  const openMassEdit = (ids: string[]) => {
    stashBulkEdit({ entity: 'payments-out', ids, from: '/payments-out' });
    router.push('/bulk-edit');
  };
  // moysklad «Изменить» / «Печать» parity — items, order and disabled
  // state mirror docs/moysklad-reference/payments-out/states/metadata.json
  // (Phase 2 audit, 2026-05-30). Shared with the other money documents.
  const editMenuItems = useDocEditMenuItems({
    selectedIds: bulk.selectedIds,
    allRowIds: (data?.items ?? []).map((r) => r.id),
    onBulkDelete: (ids) => bulk.bulkDelete.mutate(ids),
    deletePending: bulk.bulkDelete.isPending,
    onMassEdit: openMassEdit,
  });
  const printMenuItems = useMoneyPrintMenuItems();

  return (
    <>
      <ListView
        testId="payments-out-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/payments-out', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/payments-out/new"
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
        rowTestId={(p) => `payment-out-row-${p.id}`}
        rowActions={(p) => bulk.rowDelete(p.id)}
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
              setAgents([]);
              setOrganizations([]);
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="paymentout"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  // The saved query string carries the agent/org filters as
                  // `agentIds` / `organizationIds` CSV (ids only — no labels are
                  // persisted, matching the pre-conversion round-trip). Rehydrate
                  // the multi-select arrays so the pill re-applies them.
                  const usp = qs.startsWith('?')
                    ? new URLSearchParams(qs.slice(1))
                    : new URLSearchParams(qs);
                  const parseCsv = (key: string): RefMulti[] =>
                    (usp.get(key) ?? '')
                      .split(',')
                      .filter(Boolean)
                      .map((id) => ({ id, label: id }));
                  setAgents(parseCsv('agentIds'));
                  setOrganizations(parseCsv('organizationIds'));
                  setCursor(undefined);
                }}
              />
            }
            testId="payments-out-inline-filter"
          >
            {/* Inline filter panel — moysklad «Исходящие платежи» parity,
               ordered to match the paymentout filter reference
               (07-module/paymentout/dom/01-default.html): Период · Контрагент ·
               Группа контрагента · Договор · Организация · Проект · Статус ·
               Назначение платежа · Статья расходов · Проведено ·
               Владелец-сотрудник · Владелец-отдел · Сумма · Когда изменен.
               «Статья расходов» is the KEY difference vs «Входящие платежи» —
               PaymentOut has an `expenseItem` VarChar column (an outbound
               payment carries an expense item; an inbound one does not).
               «Кто изменил» SKIPPED — no updatedById column. */}
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
               single-select modal; BE accepts an agentIds CSV. */}
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
            {/* Владелец контрагента — the agent (Counterparty)'s owner employee
               (agent.ownerId). §4-grounded on the filter capture (row 2).
               Distinct from «Владелец-сотрудник» (the payment's own owner). */}
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
               dropdown (was a single-select modal). BE accepts an
               organizationIds CSV. */}
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
            {/* Счёт организации — PaymentOut.organizationAccountId. BE schema +
               buildListWhere already accepted this param; only the FE control
               was missing. Mirrors the demands/payments-in gold standard: the
               picker is disabled until an organization is chosen (accounts
               belong to an org), and fetches /organization-accounts?organizationId=. */}
            <InlineFilterPanel.Field label={tFilters('organization_account')} expandable>
              <CatalogPickerField
                value={
                  extFilter.organizationAccountId
                    ? {
                        id: extFilter.organizationAccountId,
                        label:
                          extFilter.organizationAccountLabel ?? extFilter.organizationAccountId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => organizations[0]?.id && setPickerOpen('orgAccount')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    organizationAccountId: undefined,
                    organizationAccountLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                disabled={!organizations[0]?.id}
                disabledHint={tFilters('org_account_disabled_hint')}
                testId="filter-org-account"
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
            {/* 8. Назначение платежа — text-contains on paymentPurpose. */}
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
            {/* 9. Статья расходов — text-contains on expenseItem (PaymentOut
              has this column; PaymentIn does not). */}
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
            {/* 10. Проведено */}
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
            {/* 11. Владелец-сотрудник */}
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
            {/* 12. Владелец-отдел */}
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
            {/* 13. Сумма — from / to bounds. */}
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
            {/* 14. Когда изменен — updatedAt range. */}
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
            columns={columns.map((c) => ({ key: c.key, label: c.header }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
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
        open={pickerOpen === 'orgAccount'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('organization_account')}
        fetcher={async (q): Promise<PickerItem[]> => {
          // moysklad parity: org accounts come from the flat
          // /organization-accounts?organizationId= route (mirror demands).
          // Guarded by the picker being disabled until an org is chosen; scopes
          // to the FIRST selected organization (accounts belong to one org).
          const orgId = organizations[0]?.id;
          if (!orgId) return [];
          const sp = new URLSearchParams({ search: q, limit: '50' });
          sp.set('organizationId', orgId);
          const r = await api.get<{
            items: {
              id: string;
              name: string;
              accountNumber: string | null;
              bankName: string | null;
            }[];
          }>(`/organization-accounts?${sp.toString()}`);
          return r.items.map((x) => ({
            id: x.id,
            primary: x.accountNumber || x.name,
            secondary: x.bankName ?? undefined,
          }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            organizationAccountId: item.id,
            organizationAccountLabel: String(item.primary),
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
          title: tMass('title'),
          ownerLabel: tFilters('owner_employee'),
          projectLabel: tFilters('project'),
          descriptionLabel: tMass('description_label'),
          apply: tMass('apply'),
          cancel: tMass('cancel'),
          hint: tMass('hint', { count: massEditIds.length }),
          groupLabel: tMass('group_label'),
          sharedLabel: tMass('shared_label'),
          sharedYes: tMass('shared_yes'),
          sharedNo: tMass('shared_no'),
        }}
        onSubmit={async (patch) => {
          await bulk.massEdit.mutateAsync({ ids: massEditIds, ...patch });
          setMassEditOpen(false);
        }}
      />
    </>
  );
}
