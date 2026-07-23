'use client';

/**
 * «Счета-фактуры выданные» (FactureOut) — moysklad-parity issued
 * tax-invoice list. Sprint 5 ships read-only list — the create /
 * post / cancel / soliq.uz e-facture sync flow is reserved for the
 * dedicated VAT integration sprint.
 */

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MoneyInput,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  footerMoneyCells,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface FactureOutRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  vatSumMinor: string;
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  moment: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  owner: { id: string; name: string } | null;
  demand: { id: string; name: string } | null;
}

interface ListResponse {
  items: FactureOutRow[];
  nextCursor?: string;
  total: number;
}

const CURRENCY_LABEL: Record<string, string> = {
  UZS: 'сум',
  USD: 'доллар',
  EUR: 'евро',
  RUB: 'руб',
};
const LIMIT = 100;

function StatusBadge({ on, label }: { on: boolean; label: string }) {
  if (!on) return null;
  return (
    <span
      className="inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 font-medium text-[11px] text-white"
      style={{ backgroundColor: '#00bfe6' }}
    >
      {label}
    </span>
  );
}

/** Tri-state Yes/No/All select for boolean filter fields — mirrors the
 *  invoices-in / purchase-orders gold-standard control (✓ / — / unset). */
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

/**
 * FactureOut-specific filter-panel fields stored alongside the shared
 * FilterDrawerValues shape (local to this page — the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here; this mirrors
 * the invoices-in inline gold standard). Only fields with a backing
 * Prisma column are present (Договор / Проект / Склад / Дата добавления /
 * Кто изменил are SKIPPED — FactureOut has no such column).
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  ownerId?: string;
  ownerLabel?: string;
  groupId?: string;
  groupLabel?: string;
  agentGroupId?: string;
  agentGroupLabel?: string;
  demandId?: string;
  demandLabel?: string;
  updatedFrom?: string;
  updatedTo?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function FacturesOutPage() {
  const t = useTranslations('pages.factures_out');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.facture');
  const tFilters = useTranslations('filters');
  const tPo = useTranslations('pages.purchase_orders');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend default.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // «Контрагент» / «Организация» — moysklad-parity inline multi-select checkbox
  // dropdowns (were single-select modals). The «Контрагент» dropdown shows the
  // phone as a sublabel and searches by name OR phone (BE /counterparties?search=
  // already matches both). Each holds the picked {id,label} pairs; on the wire
  // they go out as `<field>Ids` CSV.
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    null | 'generate' | 'agentGroup' | 'owner' | 'group' | 'demand'
  >(null);

  // moysklad parity (C6 audit, 2026-05-21): /factureout defaults are
  // № · Дата · Контрагент · Организация · Сумма · НДС · Валюта ·
  // Отгрузка · Напечатано. state removed from defaults (available via gear).
  const cols = useColumnVisibility('factures-out', [
    'name',
    'moment',
    'agent',
    'organization',
    'sum',
    'vatSum',
    'demand',
    'printed',
  ]);
  const colWidths = useColumnWidths('factures-out');

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
    ...(agents.length ? { agentIds: agents.map((x) => x.id).join(',') } : {}),
    ...(filterValues.agentGroupId ? { agentGroupId: filterValues.agentGroupId } : {}),
    ...(organizations.length ? { organizationIds: organizations.map((x) => x.id).join(',') } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.demandId ? { demandId: filterValues.demandId } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
  });

  // moysklad list footer «Итого» — totals across the WHOLE filtered set (not just
  // the visible page; the old page-sum under-counted past row 100). Mirror invoices-out.
  const totalsParams = new URLSearchParams(params);
  for (const k of ['cursor', 'limit', 'sortBy', 'sortDir']) totalsParams.delete(k);
  const totalsQs = totalsParams.toString();
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    vatSumMinor: string;
    currencies: string[];
  }>({
    queryKey: ['factures-out-totals', totalsQs],
    queryFn: () => api.get(`/factures-out/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });

  const listQueryKey = [
    'factures-out',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    agents,
    organizations,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/factures-out?${params.toString()}`),
  });

  // Generate a draft Счёт-фактура from a posted Demand (moysklad parity:
  // the realization is the basis; idempotent server-side — one Demand →
  // one FactureOut). On success the new draft appears in the refreshed list.
  const generateMut = useMutation({
    mutationFn: (demandId: string) =>
      api.post<{ id: string }>('/factures-out/generate', { demandId }),
    onSuccess: () => {
      setCursor(undefined);
      void refetch();
    },
  });

  // moysklad's "Счета-фактуры выданные" list has no status pill sub-tabs
  // (shared GWT list chrome). Status + period/agent/org/sum filtering is
  // surfaced through the inline filter panel below, backed by
  // FactureOutFilterSchema. Matches the customer-orders gold standard.

  const columns: DataTableColumn<FactureOutRow>[] = [
    {
      key: 'name',
      header: '№',
      width: '120px',
      sortable: true,
      cell: (o) => (
        <a
          href={`/factures-out/${o.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {o.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: t('col_time'),
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(o.moment)}
        </span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (o) => (
        <div>
          <div className="max-w-[260px] truncate font-medium">{o.agent.name}</div>
          {o.agent.legalTitle && (
            <div className="max-w-[260px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {o.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (o) => (
        <div className="max-w-[180px] truncate text-[var(--ms-text-primary)] text-sm">
          {o.organization.name}
        </div>
      ),
      cellText: (r) => r.organization?.name ?? '',
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="font-medium tabular-nums">
          {formatMoney(o.sumMinor, o.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) =>
        r.sumMinor ? formatMoney(r.sumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      key: 'vatSum',
      sortField: 'vatSumMinor',
      header: tFields('vat_sum'),
      align: 'right',
      width: '120px',
      sortable: true,
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] tabular-nums">
          {formatMoney(o.vatSumMinor, o.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => formatMoney(r.vatSumMinor, r.currency, { displayAs: 'none' }),
    },
    {
      key: 'currency',
      header: tFields('currency'),
      width: '70px',
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {CURRENCY_LABEL[o.currency] ?? o.currency}
        </span>
      ),
      cellText: (r) => CURRENCY_LABEL[r.currency] ?? r.currency,
    },
    {
      key: 'demand',
      header: t('col_demand'),
      width: '120px',
      cell: (o) =>
        o.demand ? (
          <a
            href={`/demands/${o.demand.id}`}
            className="text-[var(--ms-text-brand)] text-sm hover:underline"
          >
            {o.demand.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-sm">—</span>
        ),
      cellText: (r) => r.demand?.name ?? '',
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '120px',
      cell: (o) => (
        <Badge tone={documentStateTone(o.state)}>
          {tStates(o.state as 'draft' | 'posted' | 'cancelled')}
        </Badge>
      ),
      cellText: (r) => r.state,
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '110px',
      align: 'left',
      cell: (o) => <StatusBadge on={o.printed} label={tStates('printed_badge')} />,
      cellText: (r) => (r.printed ? '✓' : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (o) => (
        <span className="block max-w-[260px] truncate text-[var(--ms-text-muted)] text-sm">
          {o.description ?? ''}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
  ];

  // Footer totals (Σ Сумма + Σ НДС across the WHOLE filtered set); footerMoneyCells
  // keeps moysklad's currency-guard («—» when the set mixes currencies, «…» until loaded).
  const footerRow = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
    vatSum: totals?.vatSumMinor ?? '0',
  });

  const hasFilter =
    !!search ||
    !!stateFilter ||
    agents.length > 0 ||
    organizations.length > 0 ||
    Object.keys(filterValues).length > 0;

  return (
    <>
      <ListView
        testId="factures-out-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        selectionCount={0}
        // Create flow deferred to a dedicated soliq-integration sprint;
        // until then there's no «+ Schyot-faktura» CTA — list is read-only.
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(o) => `facture-out-row-${o.id}`}
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
        footerRow={footerRow}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setAgents([]);
              setOrganizations([]);
              setStateFilter(null);
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="factureout"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  // Multi-select reference filters ride the saved query string as
                  // `agentIds`/`organizationIds` CSV (ids only — labels aren't
                  // serialized here, so chips show the id until reopened, matching
                  // the prior single-select behavior). Restore them into the arrays.
                  const usp = qs.startsWith('?')
                    ? new URLSearchParams(qs.slice(1))
                    : new URLSearchParams(qs);
                  const parseIds = (key: string): RefMulti[] =>
                    (usp.get(key) ?? '')
                      .split(',')
                      .filter(Boolean)
                      .map((id) => ({ id, label: id }));
                  setAgents(parseIds('agentIds'));
                  setOrganizations(parseIds('organizationIds'));
                  setCursor(undefined);
                }}
              />
            }
            testId="factures-out-inline-filter"
          >
            {/* moysklad-parity inline filter panel — fields ordered as the
              captured DOM (factureout mirrors facturein): Период ·
              Контрагент · Группа контрагента · Организация · Статус ·
              Отгрузка · Проведено · Напечатано · Отправлено ·
              Владелец-сотрудник · Владелец-отдел · Сумма · Когда изменен.
              SKIPPED (no backing column on FactureOut): Договор · Проект ·
              Склад · Дата добавления · Кто изменил. */}
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
            {/* 5. Статус */}
            <InlineFilterPanel.Field label={tPo('filter_status_multi')} expandable>
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
            {/* 6. Отгрузка (linked Demand) */}
            <InlineFilterPanel.Field label={tFields('linked_demand')} expandable>
              <CatalogPickerField
                value={
                  filterValues.demandId
                    ? {
                        id: filterValues.demandId,
                        label: filterValues.demandLabel ?? filterValues.demandId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('demand')}
                onClear={() => {
                  setFilterValues({ ...filterValues, demandId: undefined, demandLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-demand"
              />
            </InlineFilterPanel.Field>
            {/* 7. Проведено */}
            <InlineFilterPanel.Field label={tFields('applicable')} expandable>
              <YesNoSelect
                value={filterValues.applicable}
                onChange={(v) => {
                  setFilterValues({ ...filterValues, applicable: v });
                  setCursor(undefined);
                }}
                testId="filter-applicable"
              />
            </InlineFilterPanel.Field>
            {/* 8. Напечатано */}
            <InlineFilterPanel.Field label={tFields('printed')} expandable>
              <YesNoSelect
                value={filterValues.printed}
                onChange={(v) => {
                  setFilterValues({ ...filterValues, printed: v });
                  setCursor(undefined);
                }}
                testId="filter-printed"
              />
            </InlineFilterPanel.Field>
            {/* 9. Отправлено */}
            <InlineFilterPanel.Field label={tFields('published')} expandable>
              <YesNoSelect
                value={filterValues.published}
                onChange={(v) => {
                  setFilterValues({ ...filterValues, published: v });
                  setCursor(undefined);
                }}
                testId="filter-published"
              />
            </InlineFilterPanel.Field>
            {/* 10. Владелец-сотрудник */}
            <InlineFilterPanel.Field label={tPo('filter_owner_employee')} expandable>
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
            {/* 11. Владелец-отдел */}
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
                  setCursor(undefined);
                }}
                testId="filter-group"
              />
            </InlineFilterPanel.Field>
            {/* 12. Сумма (from) */}
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
            {/* 13. Сумма (to) */}
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
            {/* 14. Когда изменен (updatedAt range) */}
            <InlineFilterPanel.Field
              label={tPo('filter_updated_period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setFilterValues({ ...filterValues, updatedFrom: from, updatedTo: to });
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
                from={filterValues.updatedFrom}
                to={filterValues.updatedTo}
                onChange={({ from, to }) => {
                  setFilterValues({ ...filterValues, updatedFrom: from, updatedTo: to });
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
        extraActions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setPickerOpen('generate')}
            loading={generateMut.isPending}
            data-test-id="generate-facture-out"
          >
            {t('generate_button')}
          </Button>
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
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'demand'}
        onClose={() => setPickerOpen(null)}
        title={tFields('linked_demand')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/demands?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            demandId: item.id,
            demandLabel: String(item.primary),
          });
          setCursor(undefined);
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
          setCursor(undefined);
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
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'generate'}
        onClose={() => setPickerOpen(null)}
        title={t('generate_picker_title')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/demands?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          generateMut.mutate(item.id);
        }}
      />
    </>
  );
}
