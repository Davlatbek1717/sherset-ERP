'use client';

/**
 * /internal-orders — Ichki buyurtmalar list.
 *
 * Columns: №, Sana, Yetkazib berish sanasi, Maqsad ombor,
 * Pozitsiyalar soni, Holat, Summa.
 *
 * No counterparty (agent) — this is a purely internal document.
 * State pills: draft / posted / cancelled (same as Move).
 *
 * moysklad-parity inline filter panel — mirrors Move's full warehouse-doc
 * inline pattern (apps/web/src/app/(app)/moves/page.tsx). InternalOrder
 * has NO agent / contract / sales-channel (internal stock-transfer
 * request), so those fields are intentionally absent.
 */

import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { YesNoSelect } from '@/components/filters/filter-fields';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import {
  CatalogPicker,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MassEditModal,
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

interface InternalOrderRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  currency: string;
  moment: string;
  deliveryPlannedMoment: string | null;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: InternalOrderRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 100;

type InternalOrderStateKey = 'draft' | 'posted' | 'cancelled';

/** «Статус» single-select — InternalOrder's FSM has exactly 3 states
 *  (draft / posted / cancelled); moysklad surfaces it as a plain
 *  dropdown (mirrors moves). */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: InternalOrderStateKey) => string;
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
 * InternalOrder-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here —
 * InternalOrder mirrors the losses inline-field gold standard).
 *
 * NOTE: InternalOrder is an internal stock-transfer request — NO
 * agentId / agentAccountId / contractId / organizationAccountId /
 * salesChannelId. Single store (storeId = destination/target store).
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  shared?: 'true' | 'false';
  updatedFrom?: string;
  updatedTo?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function InternalOrdersPage() {
  const t = useTranslations('pages.internal_order');
  const tPO = useTranslations('pages.purchase_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.internal_order');
  const tFilters = useTranslations('filters');
  const tMass = useTranslations('mass_edit_modal');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // moysklad-parity reference filters — inline multi-select checkbox dropdowns
  // (MultiCombobox), each holding {id,label} pairs that go out as `*Ids` CSVs
  // (mirror losses). «Кто изменил» is auditLog-approximated BE-side.
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [products, setProducts] = useState<RefMulti[]>([]);
  const [stores, setStores] = useState<RefMulti[]>([]);
  const [projects, setProjects] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);
  const [modifiedBys, setModifiedBys] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(true);
  // moysklad 🔖 «Закладки» — controlled open-state for the save-filter modal.
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  // moysklad ⚙ — persisted set of HIDDEN filter-field keys (default: none).
  const filterHidden = useColumnVisibility('internal-orders-filter-hidden', []);
  const [pickerOpen, setPickerOpen] = useState<null | 'massEditOwner' | 'massEditProject'>(null);

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
    ...(products.length ? { productIds: products.map((x) => x.id).join(',') } : {}),
    ...(stores.length ? { storeIds: stores.map((x) => x.id).join(',') } : {}),
    ...(projects.length ? { projectIds: projects.map((x) => x.id).join(',') } : {}),
    ...(organizations.length ? { organizationIds: organizations.map((x) => x.id).join(',') } : {}),
    ...(owners.length ? { ownerIds: owners.map((x) => x.id).join(',') } : {}),
    ...(groups.length ? { groupIds: groups.map((x) => x.id).join(',') } : {}),
    ...(modifiedBys.length ? { modifiedByIds: modifiedBys.map((x) => x.id).join(',') } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.shared ? { shared: filterValues.shared } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
  });

  // «Закладки» — the saved-filter payload is the CURRENT filter set (everything
  // in `params` except pagination/sort/search). Applying a bookmark parses it
  // back into the page's filter state. Reference labels restore as their raw
  // ids (the same accepted compromise as losses/picking-waves — the filter
  // WORKS; the chip text resolves on the next manual pick).
  const savedFilterQuery = (() => {
    const p = new URLSearchParams(params);
    for (const k of ['limit', 'sortBy', 'sortDir', 'cursor', 'search']) p.delete(k);
    return p.toString();
  })();
  const applySavedFilter = (qs: string) => {
    const p = new URLSearchParams(qs);
    const multi = (key: string): RefMulti[] =>
      (p.get(key) ?? '')
        .split(',')
        .filter(Boolean)
        .map((id) => ({ id, label: id }));
    setProducts(multi('productIds'));
    setStores(multi('storeIds'));
    setProjects(multi('projectIds'));
    setOrganizations(multi('organizationIds'));
    setOwners(multi('ownerIds'));
    setGroups(multi('groupIds'));
    setModifiedBys(multi('modifiedByIds'));
    setStateFilter(p.get('state'));
    const yn = (key: string) => (p.get(key) ?? undefined) as 'true' | 'false' | undefined;
    setFilterValues({
      momentFrom: p.get('momentFrom') ?? undefined,
      momentTo: p.get('momentTo') ?? undefined,
      updatedFrom: p.get('updatedFrom') ?? undefined,
      updatedTo: p.get('updatedTo') ?? undefined,
      applicable: yn('applicable'),
      printed: yn('printed'),
      published: yn('published'),
      shared: yn('shared'),
    });
    onResetCursor();
  };

  const listQueryKey = [
    'internal-orders',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/internal-orders?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('internal-orders', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      stashBulkEdit({ entity: 'internal-orders', ids, from: '/internal-orders' });
      router.push('/bulk-edit');
    },
  });

  // moysklad's "Внутренние заказы" list has no status pill sub-tabs
  // (shared GWT list chrome) and no agent field (purely internal doc).
  // Status + period/organization/store/sum/owner/group/project/booleans
  // filtering is the inline filter panel below, backed by
  // InternalOrderFilterSchema.

  const columns: DataTableColumn<InternalOrderRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '150px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/internal-orders/${r.id}`}
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
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
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
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
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
      cell: (r) => <span className="max-w-[200px] truncate text-sm">{r.store.name}</span>,
      cellText: (r) => r.store.name,
    },
    {
      key: 'positions',
      header: tFields('positions_count'),
      width: '100px',
      align: 'right',
      cell: (r) => <span className="text-sm tabular-nums">{r._count.positions}</span>,
      cellText: (r) => String(r._count.positions),
    },
    // moysklad #internalorder list has NO «Статус» column (LIVE-grounded
    // 2026-06-29: default grid = №·Время·Организация·Сумма·Валюта·Отгружено·
    // Отправлено·Напечатано·Комментарий). The FSM state lives only in the
    // «Статус» filter + the «Проведено» flag, never as a column.
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '160px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium tabular-nums">
          {formatMoney(r.sumMinor, r.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => formatMoney(r.sumMinor, r.currency),
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    organizations.length > 0 ||
    products.length > 0 ||
    stores.length > 0 ||
    projects.length > 0 ||
    owners.length > 0 ||
    groups.length > 0 ||
    modifiedBys.length > 0 ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.shared ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo;

  // moysklad-parity inline filter panel — LIVE-GROUNDED against the user's
  // #internalorder screenshots (2026-07-14): 14 fields in the grounded order
  // Период · Товар или группа · Склад · Проект · Организация · Статус ·
  // Проведено · Напечатано · Отправлено · Владелец-сотрудник · Владелец-отдел ·
  // Общий доступ · Когда изменен · Кто изменил. Reference filters are
  // MULTI-select inline MultiCombobox checkbox-dropdowns (mirror losses).
  // «Кто изменил» is auditLog-approximated BE-side (no modifiedById column).
  // moysklad has NO «Сумма» range on this panel — intentionally absent.
  // No Контрагент / Договор / Канал продаж / Счёт * — internal doc.
  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setFilterValues({});
        setStateFilter(null);
        setOrganizations([]);
        setProducts([]);
        setStores([]);
        setProjects([]);
        setOwners([]);
        setGroups([]);
        setModifiedBys([]);
        onResetCursor();
      }}
      // moysklad 🔖 — opens the «Закладки» save-current-filter modal.
      onBookmarkClick={() => setSaveFilterOpen(true)}
      // moysklad ⚙ — a checklist of every filter field (show/hide), keyed by
      // fieldKey; the persisted set holds the HIDDEN keys (default: none).
      fieldVisibility={{
        hidden: filterHidden.visibleKeys,
        onToggle: (k) => {
          const next = new Set(filterHidden.visibleKeys);
          if (next.has(k)) next.delete(k);
          else next.add(k);
          filterHidden.setVisibleKeys(next);
        },
      }}
      pills={
        <SavedFiltersPills
          entity="internalorder"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
          showAdd={filterOpen}
        />
      }
      testId="internal-orders-inline-filter"
    >
      {/* 1. Период */}
      <InlineFilterPanel.Field
        label={`${tFilters('period')}:`}
        expandable
        fieldKey="period"
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
      {/* 2. Товар или группа — multi-select product dropdown. */}
      <InlineFilterPanel.Field label={tPO('filter_product_or_group')} expandable fieldKey="product">
        <MultiCombobox
          value={products.map((x) => x.id)}
          items={products.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{
              items: { id: string; name: string; code: string | null }[];
            }>(`/products?search=${encodeURIComponent(q)}&limit=20`);
            return r.items.map((x) => ({
              value: x.id,
              label: x.name,
              sublabel: x.code ?? undefined,
            }));
          }}
          onChange={(nextIds, toggled) => {
            setProducts((prev) =>
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
          testId="filter-product"
        />
      </InlineFilterPanel.Field>
      {/* 3. Склад — multi-select store dropdown. */}
      <InlineFilterPanel.Field label={tFilters('store')} expandable fieldKey="store">
        <MultiCombobox
          value={stores.map((x) => x.id)}
          items={stores.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/stores?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setStores((prev) =>
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
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 4. Проект — multi-select project dropdown. */}
      <InlineFilterPanel.Field label={tPO('filter_project')} expandable fieldKey="project">
        <MultiCombobox
          value={projects.map((x) => x.id)}
          items={projects.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/projects?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setProjects((prev) =>
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
          testId="filter-project"
        />
      </InlineFilterPanel.Field>
      {/* 5. Организация — multi-select organization dropdown. */}
      <InlineFilterPanel.Field label={tFilters('organization')} expandable fieldKey="organization">
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
      {/* 6. Статус */}
      <InlineFilterPanel.Field label={tPO('filter_status_multi')} expandable fieldKey="status">
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
      {/* 7. Проведено */}
      <InlineFilterPanel.Field
        label={tFields('applicable')}
        expandable={false}
        fieldKey="applicable"
      >
        <YesNoSelect
          value={filterValues.applicable}
          onChange={(v) => {
            setFilterValues({ ...filterValues, applicable: v });
            onResetCursor();
          }}
          testId="filter-applicable"
        />
      </InlineFilterPanel.Field>
      {/* 8. Напечатано */}
      <InlineFilterPanel.Field label={tFields('printed')} expandable={false} fieldKey="printed">
        <YesNoSelect
          value={filterValues.printed}
          onChange={(v) => {
            setFilterValues({ ...filterValues, printed: v });
            onResetCursor();
          }}
          testId="filter-printed"
        />
      </InlineFilterPanel.Field>
      {/* 9. Отправлено */}
      <InlineFilterPanel.Field label={tFields('published')} expandable={false} fieldKey="published">
        <YesNoSelect
          value={filterValues.published}
          onChange={(v) => {
            setFilterValues({ ...filterValues, published: v });
            onResetCursor();
          }}
          testId="filter-published"
        />
      </InlineFilterPanel.Field>
      {/* 10. Владелец-сотрудник — multi-select employee dropdown. */}
      <InlineFilterPanel.Field label={tPO('filter_owner_employee')} expandable fieldKey="owner">
        <MultiCombobox
          value={owners.map((x) => x.id)}
          items={owners.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/employees?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setOwners((prev) =>
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
          testId="filter-owner"
        />
      </InlineFilterPanel.Field>
      {/* 11. Владелец-отдел — multi-select department (group) dropdown. */}
      <InlineFilterPanel.Field label={tPO('filter_owner_group')} expandable fieldKey="group">
        <MultiCombobox
          value={groups.map((x) => x.id)}
          items={groups.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/groups?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setGroups((prev) =>
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
          testId="filter-group"
        />
      </InlineFilterPanel.Field>
      {/* 12. Общий доступ */}
      <InlineFilterPanel.Field label={tPO('filter_shared')} expandable={false} fieldKey="shared">
        <YesNoSelect
          value={filterValues.shared}
          onChange={(v) => {
            setFilterValues({ ...filterValues, shared: v });
            onResetCursor();
          }}
          testId="filter-shared"
        />
      </InlineFilterPanel.Field>
      {/* 13. Когда изменен */}
      <InlineFilterPanel.Field
        label={`${tPO('filter_updated_period')}:`}
        expandable
        fieldKey="updated"
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
      {/* 14. Кто изменил — multi-select employee dropdown (auditLog-approximated). */}
      <InlineFilterPanel.Field label={tPO('filter_modified_by')} expandable fieldKey="modified_by">
        <MultiCombobox
          value={modifiedBys.map((x) => x.id)}
          items={modifiedBys.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/employees?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setModifiedBys((prev) =>
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
          testId="filter-modified-by"
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
        testId="internal-orders-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        createHref="/internal-orders/new"
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
        rowTestId={(r) => `internal-order-row-${r.id}`}
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
          helper: { label: t('empty_rich_helper'), href: '/help/internal-orders' },
          cta: { label: t('create_button'), href: '/internal-orders/new' },
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
