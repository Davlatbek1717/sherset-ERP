'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { SupplyBulkActionsDropdown } from '@/components/supplies/bulk-actions-dropdown';
import { SupplyPrintDropdown } from '@/components/supplies/print-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type CsvColumn,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MassEditModal,
  MoneyInput,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface SupplyRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  // moysklad parity (v2.2 audit): backend Prisma scalars surfaced.
  payedSumMinor: string;
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  incomingDate: string | null;
  moment: string;
  incomingNumber: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: SupplyRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

/** Tri-state Yes/No/All select for boolean filter fields — mirrors the
 *  purchase-orders gold-standard control (✓ / — / unset). */
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

/** «Статус» single-select — Supply's FSM has exactly 3 states
 *  (draft / posted / cancelled); moysklad surfaces it as a plain dropdown
 *  (no multi-tag picker, unlike purchase-orders' 7-state set). */
function StateSelect({
  value,
  onChange,
  labels,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labels: Record<string, string>;
  testId?: string;
}) {
  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      data-test-id={testId}
    >
      <option value="" />
      {(['draft', 'posted', 'cancelled'] as const).map((s) => (
        <option key={s} value={s}>
          {labels[s] ?? s}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * Supply-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here — supplies
 * mirrors the purchase-orders inline-field gold standard instead).
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  ownerId?: string;
  ownerLabel?: string;
  updatedFrom?: string;
  updatedTo?: string;
  // FK pickers
  agentGroupId?: string;
  agentGroupLabel?: string;
  // «Владелец контрагента» — the agent (Counterparty)'s owner employee
  // (agent.ownerId), distinct from «Владелец-сотрудник» (ownerId, the supply's
  // own owner).
  agentOwnerId?: string;
  agentOwnerLabel?: string;
  agentAccountId?: string;
  agentAccountLabel?: string;
  organizationAccountId?: string;
  organizationAccountLabel?: string;
  groupId?: string;
  groupLabel?: string;
  projectId?: string;
  projectLabel?: string;
  contractId?: string;
  contractLabel?: string;
  purchaseOrderId?: string;
  purchaseOrderLabel?: string;
};

export default function SuppliesPage() {
  const t = useTranslations('pages.supplies');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.supply');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'owner'
    | 'agentGroup'
    | 'agentOwner'
    | 'agentAccount'
    | 'orgAccount'
    | 'group'
    | 'project'
    | 'contract'
    | 'purchaseOrder'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);

  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const onResetCursor = () => setCursor(undefined);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(stateFilter ? { state: stateFilter } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(filterValues.momentFrom ? { momentFrom: filterValues.momentFrom } : {}),
    ...(filterValues.momentTo ? { momentTo: filterValues.momentTo } : {}),
    ...(filterValues.sumMinorFrom !== undefined
      ? { sumMinorFrom: String(filterValues.sumMinorFrom) }
      : {}),
    ...(filterValues.sumMinorTo !== undefined
      ? { sumMinorTo: String(filterValues.sumMinorTo) }
      : {}),
    ...(filterValues.agentId ? { agentId: filterValues.agentId } : {}),
    ...(filterValues.organizationId ? { organizationId: filterValues.organizationId } : {}),
    ...(filterValues.storeId ? { storeId: filterValues.storeId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
    ...(filterValues.agentGroupId ? { agentGroupId: filterValues.agentGroupId } : {}),
    ...(filterValues.agentOwnerId ? { agentOwnerId: filterValues.agentOwnerId } : {}),
    ...(filterValues.agentAccountId ? { agentAccountId: filterValues.agentAccountId } : {}),
    ...(filterValues.organizationAccountId
      ? { organizationAccountId: filterValues.organizationAccountId }
      : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.projectId ? { projectId: filterValues.projectId } : {}),
    ...(filterValues.contractId ? { contractId: filterValues.contractId } : {}),
    ...(filterValues.purchaseOrderId ? { purchaseOrderId: filterValues.purchaseOrderId } : {}),
  });

  const listQueryKey = [
    'supplies',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/supplies?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('supplies', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditProject(null);
      setMassEditOpen(true);
    },
  });

  // postedCount drives the Provedeno / Snyat-provedenie gating in the
  // SupplyBulkActionsDropdown — disable Provedeno when every selected
  // row is already posted (mirrors moysklad's gwt-MenuItem-disabled).
  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const s of data.items) {
      if (bulk.selectedIds.has(s.id) && s.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);

  // Programmatic CSV export — reused by SupplyPrintDropdown's "Список приемок".
  const handleListExport = () => {
    const items = data?.items ?? [];
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<SupplyRow>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`supplies_${csvTimestamp()}.csv`, csv);
  };

  // moysklad parity (C2 audit, 2026-05-21): /supply default columns
  // are № · Время · На склад · Контрагент · Организация · Сумма ·
  // Валюта · Оплачено · Входящая дата · Входящий номер · Отправлено ·
  // Напечатано · Комментарий. `state` removed from defaults (still
  // available via gear). All scalar fields surfaced from Prisma —
  // backend already returns them.
  const cols = useColumnVisibility('supplies', [
    'all',
    'draft',
    'posted',
    'cancelled',
    'name',
    'moment',
    'store',
    'agent',
    'organization',
    'sum',
    'paid',
    'incomingDate',
    'incomingNumber',
    'state',
    'published',
    'printed',
    'description',
  ]);
  const colWidths = useColumnWidths('supplies');

  // moysklad's "Приёмки" list has no status pill sub-tabs (shared GWT
  // list chrome). Status filtering is the "Статус" select inside the
  // inline filter panel below.

  const columns: DataTableColumn<SupplyRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (s) => (
        <a
          href={`/supplies/${s.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {s.name}
        </a>
      ),
      cellText: (r: SupplyRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(s.moment)}</span>
      ),
      cellText: (r: SupplyRow) => formatDate(r.moment),
    },
    {
      // moysklad parity: «На склад» column on /supply (verified C2 audit).
      key: 'store',
      header: tFields('store_to'),
      width: '160px',
      sortable: true,
      cell: (s) => <span className="max-w-[160px] truncate text-sm">{s.store?.name ?? '—'}</span>,
      cellText: (r: SupplyRow) => r.store?.name ?? '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (s) => (
        <div>
          <div className="max-w-[300px] truncate font-medium">{s.agent.name}</div>
          {s.agent.legalTitle && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-xs">
              {s.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r: SupplyRow) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      // moysklad parity: «Организация» column on /supply.
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (s) => (
        <span className="max-w-[180px] truncate text-sm">{s.organization?.name ?? '—'}</span>
      ),
      cellText: (r: SupplyRow) => r.organization?.name ?? '',
    },
    {
      key: 'incomingNumber',
      header: tFields('incoming_number'),
      width: '140px',
      cell: (s) => <span className="text-xs">{s.incomingNumber ?? '—'}</span>,
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (s) => (
        <Badge tone={documentStateTone(s.state)}>
          {tStates(s.state as 'draft' | 'posted' | 'cancelled')}
        </Badge>
      ),
      cellText: (r: SupplyRow) => r.state,
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '180px',
      sortable: true,
      cell: (s) => (
        <span className="font-medium tabular-nums">
          {formatMoney(s.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: SupplyRow) => (r.sumMinor ? formatMoney(r.sumMinor) : ''),
    },
    {
      key: 'positions',
      header: tFields('positions_count'),
      width: '70px',
      align: 'right',
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {s._count.positions}
        </span>
      ),
      cellText: (r: SupplyRow) => String(r._count?.positions ?? ''),
    },
    // moysklad parity (v2.2 audit): «Валюта» · «Оплачено» · «Входящая
    // дата» · «Отправлено» · «Напечатано» · «Комментарий» — backend
    // scalar fields surfaced from the Prisma model.
    {
      key: 'currency',
      header: tFields('currency'),
      width: '90px',
      align: 'center',
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-xs uppercase">{s.currency}</span>
      ),
      cellText: (r: SupplyRow) => r.currency,
    },
    {
      key: 'paid',
      sortField: 'payedSumMinor',
      header: tFields('paid'),
      align: 'right',
      width: '160px',
      sortable: true,
      cell: (s) => (
        <span className="font-medium tabular-nums">
          {formatMoney(s.payedSumMinor, s.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: SupplyRow) => formatMoney(r.payedSumMinor),
    },
    {
      key: 'incomingDate',
      header: tFields('incoming_date'),
      width: '140px',
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {s.incomingDate ? formatDate(s.incomingDate) : '—'}
        </span>
      ),
      cellText: (r: SupplyRow) => (r.incomingDate ? formatDate(r.incomingDate) : ''),
    },
    {
      key: 'published',
      header: tFields('published'),
      width: '120px',
      align: 'center',
      cell: (s) => (s.published ? <Badge tone="info">{tCommon('yes')}</Badge> : <span>—</span>),
      cellText: (r: SupplyRow) => (r.published ? 'yes' : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '160px',
      align: 'center',
      cell: (s) => (s.printed ? <Badge tone="info">{tCommon('yes')}</Badge> : <span>—</span>),
      cellText: (r: SupplyRow) => (r.printed ? 'yes' : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      width: '220px',
      cell: (s) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-xs">
          {s.description ?? ''}
        </span>
      ),
      cellText: (r: SupplyRow) => r.description ?? '',
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    !!filterValues.agentId ||
    !!filterValues.organizationId ||
    !!filterValues.storeId ||
    !!filterValues.ownerId ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    !!filterValues.agentGroupId ||
    !!filterValues.agentOwnerId ||
    !!filterValues.agentAccountId ||
    !!filterValues.organizationAccountId ||
    !!filterValues.groupId ||
    !!filterValues.projectId ||
    !!filterValues.contractId ||
    !!filterValues.purchaseOrderId ||
    filterValues.sumMinorFrom !== undefined ||
    filterValues.sumMinorTo !== undefined;

  // moysklad-parity inline filter panel — fields ordered as the captured filter
  // DOM at docs/moysklad-reference/visual-captures/02-module/supply/dom/
  // 00-clean-default.html (each `<div class="gwt-Label">` a field label):
  // Период · Контрагент · Группа контрагента · Счёт контрагента · Договор ·
  // Владелец контрагента · Организация · Счёт организации · Склад · Проект ·
  // Статус · Заказ поставщику · Проведено · Напечатано · Отправлено ·
  // Владелец-сотрудник · Владелец-отдел · Сумма · Когда изменен.
  // «Счёт контрагента» mirrors the purchase-orders gold standard (disabled
  // until the agent is picked); the column exists on Supply.
  // DELIBERATE ABSENCES (a "just mirror the gold standard" edit must NOT add
  // them — both would be dead 11h controls):
  //   - «Кто изменил» (modifiedById) — Supply has no `updatedById` column.
  //   - «Общий доступ» (shared) — the `Supply.shared` column EXISTS but is
  //     never written (absent from CreateSupplySchema + mass-edit), so it is
  //     always DEFAULT false; filtering on it would match nothing meaningful.
  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setFilterValues({});
        setStateFilter(null);
        onResetCursor();
      }}
      pills={
        <SavedFiltersPills
          entity="supply"
          currentQueryString={params.toString()}
          onApply={(qs) => {
            setFilterValues(filterFromQueryString(qs));
            onResetCursor();
          }}
        />
      }
      testId="supplies-inline-filter"
    >
      {/* 1. Период */}
      <InlineFilterPanel.Field
        label={`${tFilters('period')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
              onResetCursor();
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
          from={filterValues.momentFrom}
          to={filterValues.momentTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
            onResetCursor();
          }}
          testId="filter-period"
        />
      </InlineFilterPanel.Field>
      {/* 2. Контрагент */}
      <InlineFilterPanel.Field label={tFields('agent')} expandable>
        <CatalogPickerField
          value={
            filterValues.agentId
              ? { id: filterValues.agentId, label: filterValues.agentLabel ?? filterValues.agentId }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('agent')}
          onClear={() => {
            setFilterValues({ ...filterValues, agentId: undefined, agentLabel: undefined });
            onResetCursor();
          }}
          testId="filter-agent"
        />
      </InlineFilterPanel.Field>
      {/* 3. Группа контрагента */}
      <InlineFilterPanel.Field label={t('filter_agent_group')} expandable>
        <CatalogPickerField
          value={
            filterValues.agentGroupId
              ? {
                  id: filterValues.agentGroupId,
                  label: filterValues.agentGroupLabel ?? filterValues.agentGroupId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('agentGroup')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              agentGroupId: undefined,
              agentGroupLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-agent-group"
        />
      </InlineFilterPanel.Field>
      {/* 4. Счёт контрагента — disabled until agent picked */}
      <InlineFilterPanel.Field label={t('filter_agent_account')} expandable>
        <CatalogPickerField
          value={
            filterValues.agentAccountId
              ? {
                  id: filterValues.agentAccountId,
                  label: filterValues.agentAccountLabel ?? filterValues.agentAccountId,
                }
              : null
          }
          placeholder=""
          onPick={() => filterValues.agentId && setPickerOpen('agentAccount')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              agentAccountId: undefined,
              agentAccountLabel: undefined,
            });
            onResetCursor();
          }}
          disabled={!filterValues.agentId}
          disabledHint={t('filter_agent_account_disabled_hint')}
          testId="filter-agent-account"
        />
      </InlineFilterPanel.Field>
      {/* 5. Договор */}
      <InlineFilterPanel.Field label={t('filter_contract')} expandable>
        <CatalogPickerField
          value={
            filterValues.contractId
              ? {
                  id: filterValues.contractId,
                  label: filterValues.contractLabel ?? filterValues.contractId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('contract')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              contractId: undefined,
              contractLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-contract"
        />
      </InlineFilterPanel.Field>
      {/* 6. Владелец контрагента — the agent (Counterparty)'s owner employee
         (agent.ownerId). §4-grounded on the supply filter capture
         (00-clean-default.html, ordered Договор → Владелец контрагента →
         Организация). Distinct from «Владелец-сотрудник» (the supply's own
         owner). Narrows the same `agent` relation as «Группа контрагента»,
         merged server-side into one clause. */}
      <InlineFilterPanel.Field label={tFilters('agent_owner')} expandable>
        <CatalogPickerField
          value={
            filterValues.agentOwnerId
              ? {
                  id: filterValues.agentOwnerId,
                  label: filterValues.agentOwnerLabel ?? filterValues.agentOwnerId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('agentOwner')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              agentOwnerId: undefined,
              agentOwnerLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-agent-owner"
        />
      </InlineFilterPanel.Field>
      {/* 7. Организация */}
      <InlineFilterPanel.Field label={tFields('organization')} expandable>
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
            onResetCursor();
          }}
          testId="filter-org"
        />
      </InlineFilterPanel.Field>
      {/* 7. Счёт организации — disabled until organization picked */}
      <InlineFilterPanel.Field label={t('filter_org_account')} expandable>
        <CatalogPickerField
          value={
            filterValues.organizationAccountId
              ? {
                  id: filterValues.organizationAccountId,
                  label:
                    filterValues.organizationAccountLabel ?? filterValues.organizationAccountId,
                }
              : null
          }
          placeholder=""
          onPick={() => filterValues.organizationId && setPickerOpen('orgAccount')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              organizationAccountId: undefined,
              organizationAccountLabel: undefined,
            });
            onResetCursor();
          }}
          disabled={!filterValues.organizationId}
          disabledHint={t('filter_org_account_disabled_hint')}
          testId="filter-org-account"
        />
      </InlineFilterPanel.Field>
      {/* 8. Склад */}
      <InlineFilterPanel.Field label={tFields('store')} expandable>
        <CatalogPickerField
          value={
            filterValues.storeId
              ? { id: filterValues.storeId, label: filterValues.storeLabel ?? filterValues.storeId }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('store')}
          onClear={() => {
            setFilterValues({ ...filterValues, storeId: undefined, storeLabel: undefined });
            onResetCursor();
          }}
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 9. Проект */}
      <InlineFilterPanel.Field label={t('filter_project')} expandable>
        <CatalogPickerField
          value={
            filterValues.projectId
              ? {
                  id: filterValues.projectId,
                  label: filterValues.projectLabel ?? filterValues.projectId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('project')}
          onClear={() => {
            setFilterValues({ ...filterValues, projectId: undefined, projectLabel: undefined });
            onResetCursor();
          }}
          testId="filter-project"
        />
      </InlineFilterPanel.Field>
      {/* 10. Статус */}
      <InlineFilterPanel.Field label={t('filter_status_multi')} expandable>
        <StateSelect
          value={stateFilter ?? undefined}
          onChange={(v) => {
            setStateFilter(v ?? null);
            onResetCursor();
          }}
          labels={{
            draft: tStates('draft'),
            posted: tStates('posted'),
            cancelled: tStates('cancelled'),
          }}
          testId="filter-state"
        />
      </InlineFilterPanel.Field>
      {/* 11. Заказ поставщику */}
      <InlineFilterPanel.Field label={tFields('linked_purchase_order')} expandable>
        <CatalogPickerField
          value={
            filterValues.purchaseOrderId
              ? {
                  id: filterValues.purchaseOrderId,
                  label: filterValues.purchaseOrderLabel ?? filterValues.purchaseOrderId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('purchaseOrder')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              purchaseOrderId: undefined,
              purchaseOrderLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-purchase-order"
        />
      </InlineFilterPanel.Field>
      {/* 12. Проведено */}
      <InlineFilterPanel.Field label={tFields('applicable')} expandable>
        <YesNoSelect
          value={filterValues.applicable}
          onChange={(v) => {
            setFilterValues({ ...filterValues, applicable: v });
            onResetCursor();
          }}
          testId="filter-applicable"
        />
      </InlineFilterPanel.Field>
      {/* 13. Напечатано */}
      <InlineFilterPanel.Field label={tFields('printed')} expandable>
        <YesNoSelect
          value={filterValues.printed}
          onChange={(v) => {
            setFilterValues({ ...filterValues, printed: v });
            onResetCursor();
          }}
          testId="filter-printed"
        />
      </InlineFilterPanel.Field>
      {/* 14. Отправлено */}
      <InlineFilterPanel.Field label={tFields('published')} expandable>
        <YesNoSelect
          value={filterValues.published}
          onChange={(v) => {
            setFilterValues({ ...filterValues, published: v });
            onResetCursor();
          }}
          testId="filter-published"
        />
      </InlineFilterPanel.Field>
      {/* 15. Владелец-сотрудник */}
      <InlineFilterPanel.Field label={t('filter_owner_employee')} expandable>
        <CatalogPickerField
          value={
            filterValues.ownerId
              ? { id: filterValues.ownerId, label: filterValues.ownerLabel ?? filterValues.ownerId }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('owner')}
          onClear={() => {
            setFilterValues({ ...filterValues, ownerId: undefined, ownerLabel: undefined });
            onResetCursor();
          }}
          testId="filter-owner"
        />
      </InlineFilterPanel.Field>
      {/* 16. Владелец-отдел */}
      <InlineFilterPanel.Field label={t('filter_owner_group')} expandable>
        <CatalogPickerField
          value={
            filterValues.groupId
              ? {
                  id: filterValues.groupId,
                  label: filterValues.groupLabel ?? filterValues.groupId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('group')}
          onClear={() => {
            setFilterValues({ ...filterValues, groupId: undefined, groupLabel: undefined });
            onResetCursor();
          }}
          testId="filter-group"
        />
      </InlineFilterPanel.Field>
      {/* 17. Сумма (range) */}
      <InlineFilterPanel.Field label={`${tFields('sum')}:`} expandable>
        <div className="flex items-center gap-1">
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
              onResetCursor();
            }}
            data-test-id="filter-sum-from"
            className="h-7 w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 text-[var(--ms-text-primary)] text-sm focus:border-[var(--ms-border-focus)] focus:outline-none"
          />
          <span className="text-[var(--ms-text-muted)]">—</span>
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
              onResetCursor();
            }}
            data-test-id="filter-sum-to"
            className="h-7 w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 text-[var(--ms-text-primary)] text-sm focus:border-[var(--ms-border-focus)] focus:outline-none"
          />
        </div>
      </InlineFilterPanel.Field>
      {/* 18. Когда изменен */}
      <InlineFilterPanel.Field
        label={`${t('filter_updated_period')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFilterValues({ ...filterValues, updatedFrom: from, updatedTo: to });
              onResetCursor();
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
          from={filterValues.updatedFrom}
          to={filterValues.updatedTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, updatedFrom: from, updatedTo: to });
            onResetCursor();
          }}
          testId="filter-updated"
        />
      </InlineFilterPanel.Field>
    </InlineFilterPanel>
  );

  const filterToggleButton = (
    <FilterToggleButton
      open={filterOpen}
      onToggle={() => setFilterOpen((v) => !v)}
      label={tFilters('trigger')}
    />
  );

  return (
    <>
      <ListView
        testId="supplies-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/supplies', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/supplies/new"
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
        rowTestId={(s) => `supply-row-${s.id}`}
        rowActions={(s) => bulk.rowDelete(s.id)}
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={!!data?.nextCursor}
        hasPrevious={!!cursor}
        onNext={() => setCursor(data?.nextCursor)}
        onPrevious={() => setCursor(undefined)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={hasFilter ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasFilter}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        emptyDescription={!hasFilter ? t('empty_rich_helper') : undefined}
        {...bulk.listViewProps}
        // bulkActionBar omitted — toolbar dropdowns replace it.
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={filterPanel}
        extraActionsLeft={filterToggleButton}
        extraActions={
          <>
            <SupplyBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              postedCount={postedCount}
              onMassEdit={() => {
                setMassEditIds(Array.from(bulk.selectedIds));
                setMassEditOwner(null);
                setMassEditProject(null);
                setMassEditOpen(true);
              }}
            />
            <SupplyPrintDropdown selectedIds={bulk.selectedIds} onExportList={handleListExport} />
          </>
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
          setFilterValues({
            ...filterValues,
            agentId: item.id,
            agentLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'agentGroup'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_agent_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            agentGroupId: item.id,
            agentGroupLabel: String(item.primary),
          });
          onResetCursor();
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
          setFilterValues({
            ...filterValues,
            agentOwnerId: item.id,
            agentOwnerLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'agentAccount'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_agent_account')}
        fetcher={async (q): Promise<PickerItem[]> => {
          if (!filterValues.agentId) return [];
          // moysklad parity: counterparty bank accounts have only the nested
          // /counterparties/:id/bank-accounts route (raw array, no search param) —
          // mirror the detail-form agentAccountFetcher and client-filter by search.
          const d = await api.get<
            Array<{ id: string; accountNumber: string; bankName: string | null }>
          >(`/counterparties/${filterValues.agentId}/bank-accounts`);
          const k = q.trim().toLowerCase();
          return d
            .filter(
              (x) =>
                !k ||
                x.accountNumber.toLowerCase().includes(k) ||
                (x.bankName ?? '').toLowerCase().includes(k),
            )
            .map((x) => ({
              id: x.id,
              primary: x.accountNumber,
              secondary: x.bankName ?? undefined,
            }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            agentAccountId: item.id,
            agentAccountLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'contract'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_contract')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/contracts?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            contractId: item.id,
            contractLabel: String(item.primary),
          });
          onResetCursor();
        }}
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
          setFilterValues({
            ...filterValues,
            organizationId: item.id,
            organizationLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'orgAccount'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_org_account')}
        fetcher={async (q): Promise<PickerItem[]> => {
          if (!filterValues.organizationId) return [];
          // moysklad parity: organization accounts come from the flat
          // /organization-accounts?organizationId= route (mirror the detail-form
          // organizationAccountFetcher). Default accounts have accountNumber=null,
          // so fall back to the account name for the headline.
          const params = new URLSearchParams({ search: q, limit: '50' });
          params.set('organizationId', filterValues.organizationId);
          const r = await api.get<{
            items: {
              id: string;
              name: string;
              accountNumber: string | null;
              bankName: string | null;
            }[];
          }>(`/organization-accounts?${params.toString()}`);
          return r.items.map((x) => ({
            id: x.id,
            primary: x.accountNumber || x.name,
            secondary: x.bankName ?? undefined,
          }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            organizationAccountId: item.id,
            organizationAccountLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'store'}
        onClose={() => setPickerOpen(null)}
        title={tFields('store')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/stores?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            storeId: item.id,
            storeLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'project'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_project')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/projects?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            projectId: item.id,
            projectLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'purchaseOrder'}
        onClose={() => setPickerOpen(null)}
        title={tFields('linked_purchase_order')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/purchase-orders?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            purchaseOrderId: item.id,
            purchaseOrderLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_owner_employee')}
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
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'group'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_owner_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            groupId: item.id,
            groupLabel: String(item.primary),
          });
          onResetCursor();
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
