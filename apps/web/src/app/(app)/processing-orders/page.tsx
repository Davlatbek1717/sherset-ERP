'use client';

/**
 * /processing-orders — Qayta ishlash buyurtmalari ro'yxati.
 *
 * Columns: №, Sana, Yetkazib berish sanasi, Maqsad ombor, BOM/Retsept nomi,
 *          Output mahsulot, Miqdor, Holat, Summa
 *
 * Planning-only document — no stock cascade. Actual material consumption
 * happens via Processing operation (linked in v2).
 *
 * moysklad-parity inline filter panel — mirrors the InternalOrder E5
 * gold-standard (apps/web/src/app/(app)/internal-orders/page.tsx) plus
 * the two production-specific FKs «Тех. карта» (processingPlanId) and
 * «Производство» (productionId). ProcessingOrder has NO agent /
 * contract / sales-channel (internal production-planning doc), so
 * those fields are intentionally absent.
 */

import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { filterFromQueryString } from '@/lib/filter-from-query';
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
import { useState } from 'react';

interface ProcessingPlanRef {
  id: string;
  name: string;
  product: { id: string; name: string } | null;
}

interface ProcessingOrderRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  /** microqty ×1000 — e.g. "5000" = 5 units */
  quantity: string;
  sumMinor: string;
  moment: string;
  deliveryPlannedMoment: string | null;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  processingPlan: ProcessingPlanRef | null;
}

interface ListResponse {
  items: ProcessingOrderRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 100;

type ProcessingOrderStateKey = 'draft' | 'posted' | 'cancelled';

/**
 * BigInt-safe microqty (×1000) → whole-unit string. Avoids Number precision
 * loss for very large quantities by walking digits manually (mirrors the
 * processings sibling implementation).
 */
function microqtyToWhole(microqty: string): string {
  if (!/^-?\d+$/.test(microqty)) return '—';
  const negative = microqty.startsWith('-');
  const abs = negative ? microqty.slice(1) : microqty;
  if (abs.length <= 3) {
    const padded = abs.padStart(4, '0'); // ensures at least "0xxx"
    const fracTrim = padded.slice(1).replace(/0+$/, '');
    return fracTrim ? `${negative ? '-' : ''}0.${fracTrim}` : '0';
  }
  const whole = abs.slice(0, -3);
  const frac = abs.slice(-3).replace(/0+$/, '');
  const literal = frac ? `${whole}.${frac}` : whole;
  return negative ? `-${literal}` : literal;
}

/** Tri-state Yes/No/All select for boolean filter fields — mirrors the
 *  internal-orders gold-standard control (✓ / — / unset). */
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

/** «Статус» single-select — ProcessingOrder's FSM has exactly 3 states
 *  (draft / posted / cancelled); moysklad surfaces it as a plain
 *  dropdown (mirrors internal-orders). */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: ProcessingOrderStateKey) => string;
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
 * ProcessingOrder-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here —
 * ProcessingOrder mirrors the internal-orders E5 inline-field gold
 * standard plus the production-specific FK pair).
 *
 * NOTE: ProcessingOrder is an internal production-planning doc — NO
 * agentId / agentAccountId / contractId / organizationAccountId /
 * salesChannelId. Production-specific extras: processingPlanId
 * (Тех. карта) + productionId (Производство).
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  updatedFrom?: string;
  updatedTo?: string;
  groupId?: string;
  groupLabel?: string;
  projectId?: string;
  projectLabel?: string;
  processingPlanId?: string;
  processingPlanLabel?: string;
  productionId?: string;
  productionLabel?: string;
};

export default function ProcessingOrdersPage() {
  const t = useTranslations('pages.processing_order');
  const tPO = useTranslations('pages.purchase_orders');
  const tProductions = useTranslations('pages.productions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.processing_order');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'org'
    | 'store'
    | 'owner'
    | 'group'
    | 'project'
    | 'plan'
    | 'production'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);

  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );

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
    ...(filterValues.organizationId ? { organizationId: filterValues.organizationId } : {}),
    ...(filterValues.storeId ? { storeId: filterValues.storeId } : {}),
    ...(filterValues.projectId ? { projectId: filterValues.projectId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.processingPlanId ? { processingPlanId: filterValues.processingPlanId } : {}),
    ...(filterValues.productionId ? { productionId: filterValues.productionId } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
  });

  const listQueryKey = [
    'processing-orders',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/processing-orders?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('processing-orders', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditProject(null);
      setMassEditOpen(true);
    },
  });

  // moysklad's "Заказы на переработку" list has no status pill sub-tabs
  // (shared GWT list chrome) and no agent field (purely internal
  // production-planning doc). Status + period/organization/store/project/
  // sum/owner/group/booleans/processingPlan/production filtering is the
  // inline filter panel below, backed by ProcessingOrderFilterSchema.

  const columns: DataTableColumn<ProcessingOrderRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '160px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/processing-orders/${r.id}`}
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
      width: '130px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {formatDate(r.moment)}
        </span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'deliveryPlannedMoment',
      sortField: 'deliveryPlannedMoment',
      header: t('delivery_planned'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {r.deliveryPlannedMoment ? formatDate(r.deliveryPlannedMoment) : '—'}
        </span>
      ),
      cellText: (r) => (r.deliveryPlannedMoment ? formatDate(r.deliveryPlannedMoment) : ''),
    },
    {
      key: 'store',
      sortField: 'store',
      header: t('destination_store'),
      sortable: true,
      cell: (r) => <span className="max-w-[180px] truncate text-sm">{r.store.name}</span>,
      cellText: (r) => r.store.name,
    },
    {
      key: 'processingPlan',
      header: t('processing_plan'),
      cell: (r) => (
        <span className="max-w-[180px] truncate text-[var(--ms-text-muted)] text-sm">
          {r.processingPlan?.name ?? '—'}
        </span>
      ),
      cellText: (r) => r.processingPlan?.name ?? '',
    },
    {
      key: 'outputProduct',
      header: t('output_product'),
      cell: (r) => (
        <span className="max-w-[180px] truncate text-[var(--ms-text-muted)] text-sm">
          {r.processingPlan?.product?.name ?? '—'}
        </span>
      ),
      cellText: (r) => r.processingPlan?.product?.name ?? '',
    },
    {
      key: 'quantity',
      sortField: 'quantity',
      header: t('output_quantity'),
      width: '100px',
      align: 'right',
      cell: (r) => <span className="text-sm tabular-nums">{microqtyToWhole(r.quantity)}</span>,
      cellText: (r) => microqtyToWhole(r.quantity),
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '140px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>
          {tStates(r.state as ProcessingOrderStateKey)}
        </Badge>
      ),
      cellText: (r) => r.state,
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '160px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium tabular-nums">
          {formatMoney(r.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => formatMoney(r.sumMinor, 'UZS'),
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    !!filterValues.organizationId ||
    !!filterValues.storeId ||
    !!filterValues.projectId ||
    !!filterValues.ownerId ||
    !!filterValues.groupId ||
    !!filterValues.processingPlanId ||
    !!filterValues.productionId ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    filterValues.sumMinorFrom !== undefined ||
    filterValues.sumMinorTo !== undefined;

  // moysklad-parity inline filter panel — fields ordered to mirror the
  // InternalOrder E5 gold-standard (apps/web/src/app/(app)/internal-orders/
  // page.tsx) plus the two production-specific FKs «Тех. карта» +
  // «Производство». Order: Период · Склад · Организация · Проект ·
  // Тех. карта · Производство · Статус · Проведено · Напечатано ·
  // Отправлено · Владелец-сотрудник · Владелец-отдел · Сумма ·
  // Когда изменен.
  // «Кто изменил» SKIPPED — no updatedById column. No Контрагент /
  // Договор / Канал продаж / Счёт * — production doc, no counterparty.
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
          entity="processingorder"
          currentQueryString={params.toString()}
          onApply={(qs) => {
            setFilterValues(filterFromQueryString(qs));
            onResetCursor();
          }}
        />
      }
      testId="processing-orders-inline-filter"
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
      {/* 2. Склад */}
      <InlineFilterPanel.Field label={tFilters('store')} expandable>
        <CatalogPickerField
          value={
            filterValues.storeId
              ? {
                  id: filterValues.storeId,
                  label: filterValues.storeLabel ?? filterValues.storeId,
                }
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
      {/* 3. Организация */}
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
            onResetCursor();
          }}
          testId="filter-org"
        />
      </InlineFilterPanel.Field>
      {/* 4. Проект */}
      <InlineFilterPanel.Field label={tPO('filter_project')} expandable>
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
      {/* 5. Тех. карта (production-specific FK) */}
      <InlineFilterPanel.Field label={t('processing_plan')} expandable>
        <CatalogPickerField
          value={
            filterValues.processingPlanId
              ? {
                  id: filterValues.processingPlanId,
                  label: filterValues.processingPlanLabel ?? filterValues.processingPlanId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('plan')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              processingPlanId: undefined,
              processingPlanLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-processing-plan"
        />
      </InlineFilterPanel.Field>
      {/* 6. Производство (production-specific FK) */}
      <InlineFilterPanel.Field label={tProductions('title')} expandable>
        <CatalogPickerField
          value={
            filterValues.productionId
              ? {
                  id: filterValues.productionId,
                  label: filterValues.productionLabel ?? filterValues.productionId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('production')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              productionId: undefined,
              productionLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-production"
        />
      </InlineFilterPanel.Field>
      {/* 7. Статус */}
      <InlineFilterPanel.Field label={tPO('filter_status_multi')} expandable>
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
      {/* 8. Проведено */}
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
      {/* 9. Напечатано */}
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
      {/* 10. Отправлено */}
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
      {/* 11. Владелец-сотрудник */}
      <InlineFilterPanel.Field label={tPO('filter_owner_employee')} expandable>
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
      {/* 12. Владелец-отдел */}
      <InlineFilterPanel.Field label={tPO('filter_owner_group')} expandable>
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
      {/* 13. Сумма (range) */}
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
      {/* 14. Когда изменен */}
      <InlineFilterPanel.Field
        label={`${tPO('filter_updated_period')}:`}
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

  return (
    <>
      <ListView
        {...bulk.listViewProps}
        selectionCount={bulk.selectedIds.size}
        editMenu={bulk.editMenu}
        testId="processing-orders-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        createHref="/processing-orders/new"
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
        rowTestId={(r) => `processing-order-row-${r.id}`}
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
        richEmpty={{
          heading: t('empty_rich_heading'),
          helper: { label: t('empty_rich_helper'), href: '/help/processing-orders' },
          cta: { label: t('create_button'), href: '/processing-orders/new' },
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        headerSlot={filterPanel}
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
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'store'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('store')}
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
        title={tPO('filter_project')}
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
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_owner_employee')}
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
        title={tPO('filter_owner_group')}
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
      {/* «Тех. карта» picker — BOM list endpoint = /boms (mirrors
          processing-orders/new + processings/new fetcher). */}
      <CatalogPicker
        open={pickerOpen === 'plan'}
        onClose={() => setPickerOpen(null)}
        title={t('processing_plan')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{
            items: { id: string; name: string; product: { name: string } | null }[];
          }>(`/boms?search=${encodeURIComponent(q)}&limit=20`);
          return r.items.map((x) => ({
            id: x.id,
            primary: x.name,
            secondary: x.product?.name ?? undefined,
          }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            processingPlanId: item.id,
            processingPlanLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      {/* «Производство» picker — Production list endpoint = /productions. */}
      <CatalogPicker
        open={pickerOpen === 'production'}
        onClose={() => setPickerOpen(null)}
        title={tProductions('title')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/productions?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            productionId: item.id,
            productionLabel: String(item.primary),
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
