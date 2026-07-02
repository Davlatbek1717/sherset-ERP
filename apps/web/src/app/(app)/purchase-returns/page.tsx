'use client';

import { ColumnSettings } from '@/components/column-settings';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { PurchaseReturnBulkActionsDropdown } from '@/components/purchase-returns/bulk-actions-dropdown';
import { PurchaseReturnPrintDropdown } from '@/components/purchase-returns/print-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
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
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface PurchaseReturnRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  // moysklad parity (v2.2 audit): backend Prisma scalars surfaced.
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  moment: string;
  reason: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  supply: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: PurchaseReturnRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

type PurchaseReturnStateKey = 'draft' | 'posted' | 'cancelled';

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

/** «Статус» single-select — PurchaseReturn's FSM surfaces 3 states; moysklad
 *  renders it as a plain dropdown (no multi-tag picker, like supplies). */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: PurchaseReturnStateKey) => string;
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
          {labeler(s)}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * PurchaseReturn-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here —
 * purchase-returns mirrors the supplies / invoices-in inline-field gold
 * standard).
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
  supplyId?: string;
  supplyLabel?: string;
};

export default function PurchaseReturnsPage() {
  const t = useTranslations('pages.purchase_returns');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tPo = useTranslations('pages.purchase_orders');
  const tStates = useTranslations('states.purchase_return');

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
    | 'agentAccount'
    | 'orgAccount'
    | 'group'
    | 'project'
    | 'contract'
    | 'supply'
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
    ...(filterValues.agentAccountId ? { agentAccountId: filterValues.agentAccountId } : {}),
    ...(filterValues.organizationAccountId
      ? { organizationAccountId: filterValues.organizationAccountId }
      : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.projectId ? { projectId: filterValues.projectId } : {}),
    ...(filterValues.contractId ? { contractId: filterValues.contractId } : {}),
    ...(filterValues.supplyId ? { supplyId: filterValues.supplyId } : {}),
  });

  const listQueryKey = [
    'purchase-returns',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/purchase-returns?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('purchase-returns', listQueryKey, {
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
  // PurchaseReturnBulkActionsDropdown — disable Provedeno when every selected
  // row is already posted (mirrors moysklad's gwt-MenuItem-disabled).
  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const r of data.items) {
      if (bulk.selectedIds.has(r.id) && r.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);
  // moysklad parity (C4 audit, 2026-05-21): /purchasereturn default
  // columns are № · Время · Со склада · Контрагент · Организация ·
  // Сумма · Валюта · Отправлено · Напечатано · Комментарий. state +
  // supply removed from defaults (available via gear). Backend scalar
  // fields surfaced from Prisma defaults.
  const cols = useColumnVisibility('purchase-returns', [
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
    'published',
    'printed',
    'description',
  ]);
  const colWidths = useColumnWidths('purchase-returns');

  // moysklad's "Возвраты поставщикам" list has no status pill sub-tabs
  // (shared GWT list chrome). Status filtering is the "Статус" select
  // inside the inline filter panel below.

  const columns: DataTableColumn<PurchaseReturnRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/purchase-returns/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r: PurchaseReturnRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r: PurchaseReturnRow) => formatDate(r.moment),
    },
    {
      // moysklad parity: «Со склада» on /purchasereturn (C4 audit).
      key: 'store',
      header: tFields('store_from'),
      width: '160px',
      sortable: true,
      cell: (r) => <span className="max-w-[160px] truncate text-sm">{r.store?.name ?? '—'}</span>,
      cellText: (r: PurchaseReturnRow) => r.store?.name ?? '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="max-w-[300px] truncate font-medium">{r.agent.name}</div>
          {r.agent.legalTitle && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-xs">
              {r.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r: PurchaseReturnRow) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      // moysklad parity: «Организация» on /purchasereturn (C4 audit).
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="max-w-[180px] truncate text-sm">{r.organization?.name ?? '—'}</span>
      ),
      cellText: (r: PurchaseReturnRow) => r.organization?.name ?? '',
    },
    {
      key: 'supply',
      header: tFields('linked_supply'),
      width: '130px',
      cell: (r) =>
        r.supply ? (
          <a
            href={`/supplies/${r.supply.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {r.supply.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">{tCommon('none')}</span>
        ),
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>
          {tStates(r.state as PurchaseReturnStateKey)}
        </Badge>
      ),
      cellText: (r: PurchaseReturnRow) => r.state,
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium tabular-nums">
          {formatMoney(r.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: PurchaseReturnRow) => (r.sumMinor ? formatMoney(r.sumMinor) : ''),
    },
    {
      key: 'positions',
      header: tFields('positions_count'),
      width: '70px',
      align: 'right',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {r._count.positions}
        </span>
      ),
      cellText: (r: PurchaseReturnRow) => String(r._count?.positions ?? ''),
    },
    // moysklad parity (v2.2 audit): «Валюта» · «Отправлено» ·
    // «Напечатано» · «Комментарий».
    {
      key: 'currency',
      header: tFields('currency'),
      width: '90px',
      align: 'center',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs uppercase">{r.currency}</span>
      ),
      cellText: (r: PurchaseReturnRow) => r.currency,
    },
    {
      key: 'published',
      header: tFields('published'),
      width: '120px',
      align: 'center',
      cell: (r) => (r.published ? <Badge tone="info">{tCommon('yes')}</Badge> : <span>—</span>),
      cellText: (r: PurchaseReturnRow) => (r.published ? 'yes' : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '120px',
      align: 'center',
      cell: (r) => (r.printed ? <Badge tone="info">{tCommon('yes')}</Badge> : <span>—</span>),
      cellText: (r: PurchaseReturnRow) => (r.printed ? 'yes' : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      width: '220px',
      cell: (r) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-xs">
          {r.description ?? ''}
        </span>
      ),
      cellText: (r: PurchaseReturnRow) => r.description ?? '',
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    !!filterValues.agentId ||
    !!filterValues.organizationId ||
    !!filterValues.storeId ||
    !!filterValues.ownerId ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    !!filterValues.agentGroupId ||
    !!filterValues.agentAccountId ||
    !!filterValues.organizationAccountId ||
    !!filterValues.groupId ||
    !!filterValues.projectId ||
    !!filterValues.contractId ||
    !!filterValues.supplyId ||
    filterValues.sumMinorFrom !== undefined ||
    filterValues.sumMinorTo !== undefined;

  // moysklad-parity inline filter panel — fields ordered exactly as the
  // captured DOM at docs/moysklad-reference/visual-captures/02-module/
  // purchasereturn/dom/01-default.html: Период · Контрагент ·
  // Группа контрагента · Договор · Организация · Склад · Проект · Статус ·
  // Приемка · Проведено · Напечатано · Отправлено · Владелец-сотрудник ·
  // Владелец-отдел · Сумма · Когда изменен.
  // «Кто изменил» is SKIPPED — PurchaseReturn has no updatedById column.
  // «Приемка» → supplyId (the original Supply back-link; Supply picker).
  // «Счёт контрагента» / «Счёт организации» mirror the gold standard
  // (disabled until the parent FK is picked) — backed by the
  // agentAccountId / organizationAccountId columns.
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
      testId="purchase-returns-inline-filter"
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
      <InlineFilterPanel.Field label={tPo('filter_agent_group')} expandable>
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
      <InlineFilterPanel.Field label={tPo('filter_agent_account')} expandable>
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
          disabledHint={tPo('filter_agent_account_disabled_hint')}
          testId="filter-agent-account"
        />
      </InlineFilterPanel.Field>
      {/* 5. Договор */}
      <InlineFilterPanel.Field label={tPo('filter_contract')} expandable>
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
      {/* 6. Организация */}
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
      <InlineFilterPanel.Field label={tPo('filter_org_account')} expandable>
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
          disabledHint={tPo('filter_org_account_disabled_hint')}
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
      <InlineFilterPanel.Field label={tPo('filter_project')} expandable>
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
      <InlineFilterPanel.Field label={tPo('filter_status_multi')} expandable>
        <StateSelect
          value={stateFilter ?? undefined}
          onChange={(v) => {
            setStateFilter(v ?? null);
            onResetCursor();
          }}
          labeler={(s) => tStates(s)}
          testId="filter-state"
        />
      </InlineFilterPanel.Field>
      {/* 11. Приемка (supplyId) */}
      <InlineFilterPanel.Field label={tFields('linked_supply')} expandable>
        <CatalogPickerField
          value={
            filterValues.supplyId
              ? {
                  id: filterValues.supplyId,
                  label: filterValues.supplyLabel ?? filterValues.supplyId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('supply')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              supplyId: undefined,
              supplyLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-supply"
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
      <InlineFilterPanel.Field label={tPo('filter_owner_employee')} expandable>
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
      <InlineFilterPanel.Field label={tPo('filter_owner_group')} expandable>
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
        label={`${tPo('filter_updated_period')}:`}
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
        testId="purchase-returns-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/purchase-returns', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/purchase-returns/new"
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
        rowTestId={(r) => `purchase-return-row-${r.id}`}
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
        emptyTitle={hasFilter ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasFilter}
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
        headerSlot={filterPanel}
        extraActionsLeft={filterToggleButton}
        extraActions={
          <>
            <PurchaseReturnBulkActionsDropdown
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
            {/* no page-level CSV exporter yet — list_export stays disabled */}
            <PurchaseReturnPrintDropdown selectedIds={bulk.selectedIds} />
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
        title={tPo('filter_agent_group')}
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
        open={pickerOpen === 'agentAccount'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_agent_account')}
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
        title={tPo('filter_contract')}
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
        title={tPo('filter_org_account')}
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
        title={tPo('filter_project')}
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
        open={pickerOpen === 'supply'}
        onClose={() => setPickerOpen(null)}
        title={tFields('linked_supply')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/supplies?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            supplyId: item.id,
            supplyLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_owner_employee')}
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
        title={tPo('filter_owner_group')}
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
