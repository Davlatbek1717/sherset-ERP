'use client';

/**
 * /price-lists — list of PriceList documents (Narx ro'yxatlari).
 *
 * Each PriceList is a snapshot of prices: no balance impact, no stock
 * impact. Columns: name, date, organization, default price type, product
 * count (derived from Object.keys(pricesJson).length), state.
 *
 * moysklad-parity inline filter panel — mirrors Move's full warehouse-doc
 * inline pattern (apps/web/src/app/(app)/moves/page.tsx). PriceList is
 * a snapshot publication artifact — NO agent / contract / store /
 * project / sum / sales-channel (no counterparty, no stock, no money-
 * bearing total). Adds «Тип цены» (priceTypeId) which is PriceList-
 * specific. The «Сумма» column itself does not exist on PriceList
 * (`pricesJson` is a per-product/per-price-type map), so no sum range.
 */

import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { YesNoSelect } from '@/components/filters/filter-fields';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { documentStateTone } from '@/lib/document-state-tone';
import { filterFromQueryString } from '@/lib/filter-from-query';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  Input,
  ListView,
  MassEditModal,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  formatDate,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PriceListRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  moment: string;
  organization: { id: string; name: string };
  priceType: { id: string; name: string } | null;
  pricesJson: Record<string, Record<string, string>>;
}

const LIMIT = 100;

type PriceListStateKey = 'draft' | 'posted' | 'cancelled';

/** «Статус» single-select — PriceList's FSM has exactly 3 states. */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: PriceListStateKey) => string;
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
 * PriceList-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here).
 *
 * NOTE: PriceList is a snapshot publication artifact — NO agentId /
 * contractId / storeId / projectId / salesChannelId / sumMinor. Adds
 * priceTypeId («Тип цены») which is PriceList-specific.
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  updatedFrom?: string;
  updatedTo?: string;
  groupId?: string;
  groupLabel?: string;
  priceTypeId?: string;
  priceTypeLabel?: string;
  currency?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function PriceListPage() {
  const t = useTranslations('pages.price_list');
  const tPO = useTranslations('pages.purchase_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.price_list');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // «Организация» — moysklad-parity inline multi-select checkbox dropdown
  // (MultiCombobox), was a single-select modal. Holds the picked {id,label}
  // pairs; on the wire it goes out as `organizationIds` CSV.
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    null | 'priceType' | 'owner' | 'group' | 'massEditOwner'
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
    ...(organizations.length ? { organizationIds: organizations.map((x) => x.id).join(',') } : {}),
    ...(filterValues.priceTypeId ? { priceTypeId: filterValues.priceTypeId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.currency ? { currency: filterValues.currency } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
  });

  const listQueryKey = [
    'price-lists',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse<PriceListRow>>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse<PriceListRow>>(`/price-lists?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('price-lists', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      stashBulkEdit({ entity: 'price-lists', ids, from: '/price-lists' });
      router.push('/bulk-edit');
    },
  });

  // moysklad's "Прайс-листы" list has no status pill sub-tabs (shared
  // GWT list chrome). All filtering is the inline filter panel below,
  // backed by PriceListFilterSchema (no agent/store/sum — snapshot
  // publication doc).

  const columns: DataTableColumn<PriceListRow>[] = [
    {
      key: 'name',
      header: tFields('name'),
      width: '220px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/price-lists/${r.id}`}
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
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'organization',
      sortField: 'organization',
      header: tFields('organization'),
      sortable: true,
      cell: (r) => (
        <span className="block max-w-[220px] truncate font-medium">{r.organization.name}</span>
      ),
      cellText: (r) => r.organization.name,
    },
    {
      key: 'priceType',
      header: t('default_price_type'),
      width: '180px',
      cell: (r) =>
        r.priceType ? (
          <span className="text-sm">{r.priceType.name}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (r) => r.priceType?.name ?? '',
    },
    {
      key: 'productsCount',
      header: t('products_count'),
      width: '140px',
      align: 'right',
      cell: (r) => (
        <span className="text-sm tabular-nums">{Object.keys(r.pricesJson ?? {}).length}</span>
      ),
      cellText: (r) => String(Object.keys(r.pricesJson ?? {}).length),
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '140px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>{tStates(r.state as PriceListStateKey)}</Badge>
      ),
      cellText: (r) => r.state,
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    organizations.length > 0 ||
    !!filterValues.priceTypeId ||
    !!filterValues.ownerId ||
    !!filterValues.groupId ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.currency ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo;

  // moysklad-parity inline filter panel — fields ordered to mirror the
  // Move gold-standard. Order: Период · Организация · Тип цены · Валюта ·
  // Статус · Проведено · Напечатано · Отправлено · Владелец-сотрудник ·
  // Владелец-отдел · Когда изменен.
  // SKIPPED: «Кто изменил» (no updatedById col); «Сумма» (no sum col on
  // PriceList — pricesJson is a per-product map, no aggregate); «Склад»
  // / «Проект» (no col on PriceList — snapshot artifact); Контрагент /
  // Договор / Канал продаж / Счёт * (no counterparty on snapshot doc).
  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setFilterValues({});
        setOrganizations([]);
        setStateFilter(null);
        onResetCursor();
      }}
      pills={
        <SavedFiltersPills
          entity="pricelist"
          currentQueryString={params.toString()}
          onApply={(qs) => {
            setFilterValues(filterFromQueryString(qs));
            // «Организация» is now a multi-select array (organizationIds CSV);
            // restore it from the saved query string. Fall back to a legacy
            // single `organizationId` param. Labels aren't in the server query
            // string (never were), so chips show the id until re-searched.
            const usp = qs.startsWith('?')
              ? new URLSearchParams(qs.slice(1))
              : new URLSearchParams(qs);
            const orgIds = (usp.get('organizationIds') ?? usp.get('organizationId') ?? '')
              .split(',')
              .filter(Boolean);
            setOrganizations(orgIds.map((id) => ({ id, label: id })));
            onResetCursor();
          }}
        />
      }
      testId="price-lists-inline-filter"
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
      {/* 2. Организация — moysklad-parity inline multi-select checkbox dropdown
          (was a single-select modal). */}
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
            onResetCursor();
          }}
          placeholder=""
          testId="filter-org"
        />
      </InlineFilterPanel.Field>
      {/* 3. Тип цены — PriceList-specific */}
      <InlineFilterPanel.Field label={t('default_price_type')} expandable>
        <CatalogPickerField
          value={
            filterValues.priceTypeId
              ? {
                  id: filterValues.priceTypeId,
                  label: filterValues.priceTypeLabel ?? filterValues.priceTypeId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('priceType')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              priceTypeId: undefined,
              priceTypeLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-price-type"
        />
      </InlineFilterPanel.Field>
      {/* 4. Валюта */}
      <InlineFilterPanel.Field label={tFields('currency')} expandable>
        <Input
          type="text"
          maxLength={3}
          value={filterValues.currency ?? ''}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setFilterValues({ ...filterValues, currency: v === '' ? undefined : v });
            onResetCursor();
          }}
          data-test-id="filter-currency"
          className="uppercase"
          placeholder="UZS"
        />
      </InlineFilterPanel.Field>
      {/* 5. Статус */}
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
      {/* 6. Проведено */}
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
      {/* 7. Напечатано */}
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
      {/* 8. Отправлено */}
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
      {/* 9. Владелец-сотрудник */}
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
      {/* 10. Владелец-отдел */}
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
      {/* 11. Когда изменен */}
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
        testId="price-lists-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        createHref="/price-lists/new"
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
        rowTestId={(r) => `price-list-row-${r.id}`}
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
        open={pickerOpen === 'priceType'}
        onClose={() => setPickerOpen(null)}
        title={t('default_price_type')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/price-types?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            priceTypeId: item.id,
            priceTypeLabel: String(item.primary),
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
