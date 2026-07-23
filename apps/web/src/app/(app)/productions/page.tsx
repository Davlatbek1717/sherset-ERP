'use client';

import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { api } from '@/lib/api-client';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
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
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ProductionRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  vatSumMinor: string;
  currency: string;
  moment: string;
  deliveryPlannedMoment: string | null;
  organization: { id: string; name: string } | null;
  store: { id: string; name: string } | null;
  customerOrder: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  _count: { processingOrders: number };
}

interface ListResponse {
  items: ProductionRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 50;

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function ProductionsListPage() {
  const t = useTranslations('pages.productions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & { applicable?: string }>(
    {},
  );
  const [filterOpen, setFilterOpen] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  const [pickerOpen, setPickerOpen] = useState<null | 'store' | 'owner'>(null);
  // «Организация» — moysklad-parity inline multi-select checkbox dropdown
  // (MultiCombobox), was a single-select modal. Holds the picked {id,label}
  // pairs; on the wire they go out as `organizationIds` CSV.
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);

  const onResetCursor = () => setCursor(undefined);

  const params = new URLSearchParams({ limit: String(LIMIT) });
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (stateFilter) params.set('state', stateFilter);
  params.set('sortBy', sortKey);
  params.set('sortDir', sortDir);
  if (cursor) params.set('cursor', cursor);
  if (filterValues.momentFrom) params.set('momentFrom', filterValues.momentFrom);
  if (filterValues.momentTo) params.set('momentTo', filterValues.momentTo);
  if (filterValues.sumMinorFrom !== undefined)
    params.set('sumMinorFrom', String(filterValues.sumMinorFrom));
  if (filterValues.sumMinorTo !== undefined)
    params.set('sumMinorTo', String(filterValues.sumMinorTo));
  if (organizations.length) params.set('organizationIds', organizations.map((x) => x.id).join(','));
  if (filterValues.storeId) params.set('storeId', filterValues.storeId);
  if (filterValues.ownerId) params.set('ownerId', filterValues.ownerId);
  if (filterValues.applicable) params.set('applicable', filterValues.applicable);

  // Saved-filter round-trip — serialise filterValues + the «Организация» multi-
  // select array as JSON so a re-applied bookmark restores every field INCLUDING
  // the org chip labels (a params-only encoding would drop labels → raw UUIDs).
  // Legacy saves (raw params, no `fv`) still restore via filterFromQueryString.
  const savedFilterQuery = (() => {
    const p = new URLSearchParams();
    p.set('fv', JSON.stringify(filterValues));
    if (organizations.length) p.set('organizations', JSON.stringify(organizations));
    return p.toString();
  })();

  const applySavedFilter = (qs: string) => {
    const p = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
    const fvRaw = p.get('fv');
    if (fvRaw) {
      try {
        setFilterValues(JSON.parse(fvRaw) as typeof filterValues);
      } catch {
        setFilterValues(filterFromQueryString(qs));
      }
    } else {
      setFilterValues(filterFromQueryString(qs));
    }
    const parseList = (key: string): RefMulti[] => {
      try {
        const raw = p.get(key);
        if (!raw) return [];
        const arr: unknown = JSON.parse(raw);
        return Array.isArray(arr)
          ? arr
              .filter(
                (x): x is { id: string; label?: unknown } =>
                  !!x && typeof (x as { id?: unknown }).id === 'string',
              )
              .map((x) => ({ id: x.id, label: String(x.label ?? x.id) }))
          : [];
      } catch {
        return [];
      }
    };
    setOrganizations(parseList('organizations'));
    onResetCursor();
  };

  const listQueryKey = [
    'productions',
    debouncedSearch,
    stateFilter,
    sortKey,
    sortDir,
    cursor,
    filterValues,
    organizations,
  ] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/productions?${params.toString()}`),
  });

  // Bulk actions: row selection + bulk-delete + bulk-transition (post/
  // unpost/cancel). Mirrors the processings/processing-orders doc siblings;
  // BE exposes POST /productions/bulk-delete + /productions/bulk-transition
  // (production.controller.ts). No mass-edit (no BE /productions/mass-edit
  // endpoint) and no bulk-print (no endpoint) — those stay unwired.
  const bulk = useBulkDocumentActions('productions', listQueryKey, { hasFSM: true });

  // moysklad's "Производство" list has no status pill sub-tabs (shared
  // GWT list chrome). Status + period/organization/store/sum filtering
  // is the inline filter panel below, backed by ProductionFilterSchema.
  const hasActiveFilter =
    !!debouncedSearch ||
    !!stateFilter ||
    organizations.length > 0 ||
    Object.keys(filterValues).length > 0;

  const columns: DataTableColumn<ProductionRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '160px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/productions/${r.id}`}
          className="font-medium text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    // moysklad #productiontask list has NO «Статус» column (LIVE-grounded
    // 2026-06-29: default grid = №·Время·Организация·Начало производства·
    // Завершение производства·Запланировано·Произведено·Отправлено·Напечатано·
    // Комментарий). FSM state lives only in the «Статус» filter.
    {
      key: 'organization',
      header: t('col_organization'),
      cell: (r) => <span>{r.organization?.name ?? '—'}</span>,
      cellText: (r) => r.organization?.name ?? '',
    },
    {
      key: 'store',
      header: t('col_store'),
      cell: (r) => <span>{r.store?.name ?? '—'}</span>,
      cellText: (r) => r.store?.name ?? '',
    },
    {
      key: 'customerOrder',
      header: t('col_customer_order'),
      cell: (r) =>
        r.customerOrder ? (
          <a
            href={`/customer-orders/${r.customerOrder.id}`}
            className="text-[var(--ms-text-brand)] hover:underline"
          >
            {r.customerOrder.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)]">—</span>
        ),
      cellText: (r) => r.customerOrder?.name ?? '',
    },
    {
      key: 'sumMinor',
      header: t('col_sum'),
      width: '140px',
      align: 'right',
      sortable: true,
      cell: (r) => (
        <span className="tabular-nums">{formatMoney(BigInt(r.sumMinor), r.currency)}</span>
      ),
      cellText: (r) => r.sumMinor,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '130px',
      sortable: true,
      cell: (r) => <span className="text-xs tabular-nums">{formatDate(r.moment)}</span>,
      cellText: (r) => r.moment,
    },
    {
      key: 'processingOrders',
      header: t('col_orders'),
      width: '90px',
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r._count.processingOrders}</span>,
      cellText: (r) => String(r._count.processingOrders),
    },
  ];

  return (
    <>
      <ListView
        {...bulk.listViewProps}
        selectionCount={bulk.selectedIds.size}
        editMenu={bulk.editMenu}
        testId="productions-page"
        moyskladToolbar
        title={t('title')}
        onRefresh={() => refetch()}
        createHref="/productions/new"
        createLabel={t('create_button')}
        createPosition="start"
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          onResetCursor();
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
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
        emptyDescription={t('empty_description')}
        richEmpty={{
          heading: t('empty_rich_heading'),
          helper: { label: t('empty_rich_helper'), href: '/help/productions' },
          cta: { label: t('create_button'), href: '/productions/new' },
        }}
        hasActiveFilter={hasActiveFilter}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          onResetCursor();
        }}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setStateFilter(null);
              setOrganizations([]);
              onResetCursor();
            }}
            pills={
              <SavedFiltersPills
                entity="production"
                currentQueryString={savedFilterQuery}
                onApply={applySavedFilter}
              />
            }
            testId="productions-inline-filter"
          >
            <InlineFilterPanel.Field
              label={tFilters('period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
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
                }}
                testId="filter-period"
              />
            </InlineFilterPanel.Field>
            {/* Организация — moysklad-parity inline multi-select checkbox
              dropdown (was a single-select modal): type a name, results appear
              inline, tick as many organizations as needed. */}
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
                }}
                testId="filter-store"
              />
            </InlineFilterPanel.Field>
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
                }}
                data-test-id="filter-sum-to"
              />
            </InlineFilterPanel.Field>
            {/* Статус — FSM state filter (moysklad surfaces this as a
              dropdown inside the filter panel, not pill sub-tabs). */}
            <InlineFilterPanel.Field label={tFilters('state')} expandable>
              <NativeSelect
                value={stateFilter ?? ''}
                onChange={(e) => {
                  setStateFilter(e.target.value || null);
                }}
                data-test-id="filter-state"
              >
                <option value="" />
                {['draft', 'posted', 'cancelled'].map((s) => (
                  <option key={s} value={s}>
                    {t(`state_${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* Проведено — applicable tri-state (✓ / — / unset), backed by
              ProductionFilterSchema.applicable. */}
            <InlineFilterPanel.Field label={tFields('applicable')} expandable>
              <NativeSelect
                value={filterValues.applicable ?? ''}
                onChange={(e) => {
                  setFilterValues({
                    ...filterValues,
                    applicable: e.target.value || undefined,
                  });
                  onResetCursor();
                }}
                data-test-id="filter-applicable"
              >
                <option value="" />
                <option value="false">{tCommon('no')}</option>
                <option value="true">{tCommon('yes')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* Владелец-сотрудник — owner picker (ownerId was wired into the
              query params but had no UI control before). */}
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
                  onResetCursor();
                }}
                testId="filter-owner"
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
        }}
      />
    </>
  );
}
