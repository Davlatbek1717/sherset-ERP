'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { LossBulkActionsDropdown } from '@/components/losses/bulk-actions-dropdown';
import { LossPrintDropdown } from '@/components/losses/print-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { documentStateTone } from '@/lib/document-state-tone';
import {
  Badge,
  CatalogPicker,
  type CsvColumn,
  type DataTableColumn,
  type FilterDrawerValues,
  Icons,
  InlineFilterPanel,
  ListView,
  MassEditModal,
  type MassEditPickerValue,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  footerMoneyCells,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface LossRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  currency: string;
  // moysklad list columns — Общий доступ / Отправлено / Напечатано /
  // Комментарий (Prisma scalars surfaced by list()'s `include`).
  shared: boolean;
  published: boolean;
  printed: boolean;
  description: string | null;
  moment: string;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: LossRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

/**
 * Currency display map — moysklad-parity short names (mirror invoices-in /
 * purchase-orders). moysklad.uz shows the Russian short forms across the UI
 * («сум» for UZS); the «Валюта» list column reads off this map. Loss is an
 * internal write-off always stored in the account base currency, so in
 * practice every row reads «сум»; unknown currencies fall through unchanged.
 */
const CURRENCY_LABEL: Record<string, string> = {
  UZS: 'сум',
  USD: 'доллар',
  EUR: 'евро',
  RUB: 'руб',
};

/**
 * Coloured badge for the boolean status columns (Отправлено / Напечатано) —
 * mirror invoices-in / purchase-orders. moysklad shows a cyan pill with the
 * past-participle inside; an EMPTY cell when the flag is false (no «—»).
 */
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

type LossStateKey = 'draft' | 'posted' | 'cancelled';

/** Tri-state Yes/No/All select for boolean filter fields — LIVE-GROUNDED
 *  2026-06-25 against moysklad #loss (tools/capture/ms-loss-filter-selects-
 *  ground.mjs): the options are «» / «Нет» / «Да» (empty = all). moysklad uses
 *  the WORD, not a «—»/«✓» symbol. Shared by Проведено / Напечатано /
 *  Отправлено / Общий доступ. */
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

/** «Статус» single-select — Loss's FSM has exactly 3 states (draft /
 *  posted / cancelled); moysklad surfaces it as a plain dropdown (no
 *  multi-tag picker, mirrors moves). */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: LossStateKey) => string;
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
 * Loss-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (mirror invoices-in). The
 * multi-select reference filters (Товар или группа / Склад / Проект /
 * Организация / Владелец-сотрудник / Владелец-отдел / Кто изменил / Статья
 * расходов) live in dedicated `RefMulti[]` state arrays below, NOT here.
 *
 * NOTE: Loss is an internal warehouse write-off with NO counterparty —
 * deliberately omits agentId / agentAccountId / contractId /
 * organizationAccountId / salesChannelId. It also has NO «Сумма» range filter
 * (moysklad's Списания filter doesn't surface one).
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

export default function LossesPage() {
  const t = useTranslations('pages.losses');
  const tPO = useTranslations('pages.purchase_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.loss');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // moysklad-parity multi-select reference filters — inline checkbox dropdowns
  // (MultiCombobox), mirroring the invoices-in gold standard. Each holds the
  // picked {id,label} pairs; on the wire they go out as `<field>Ids` CSV.
  const [products, setProducts] = useState<RefMulti[]>([]);
  const [stores, setStores] = useState<RefMulti[]>([]);
  const [projects, setProjects] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);
  const [modifiedBys, setModifiedBys] = useState<RefMulti[]>([]);
  const [expenseItems, setExpenseItems] = useState<RefMulti[]>([]);
  // moysklad parity: the «Списания» list loads with the filter panel COLLAPSED
  // (only the «Фильтр» button shows) — mirror invoices-in (user-confirmed).
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Bookmark («Закладки») + ⚙ field-visibility — moysklad's two round buttons
  // next to «Очистить» (both were dead placeholders; mirror picking-waves).
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const filterHidden = useColumnVisibility('losses-filter-hidden', []);

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
    ...(expenseItems.length ? { expenseItemIds: expenseItems.map((x) => x.id).join(',') } : {}),
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
  // ids (the same accepted compromise as picking-waves — the filter WORKS; the
  // chip text resolves on the next manual pick).
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
    setExpenseItems(multi('expenseItemIds'));
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
    'losses',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/losses?${params.toString()}`),
  });

  // moysklad-parity: the pinned «Итого» footer sums ALL filtered records (not
  // just the visible page), fetched with the SAME filter params minus
  // pagination/sort (which don't change the total). Mirror invoices-in.
  const totalsParams = new URLSearchParams(params);
  totalsParams.delete('cursor');
  totalsParams.delete('limit');
  totalsParams.delete('sortBy');
  totalsParams.delete('sortDir');
  const totalsQs = totalsParams.toString();
  const { data: totals } = useQuery<{ count: number; sumMinor: string; currencies: string[] }>({
    queryKey: ['losses-totals', totalsQs],
    queryFn: () => api.get(`/losses/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });

  const bulk = useBulkDocumentActions('losses', listQueryKey, { hasFSM: true });

  // «Массовое редактирование» — moysklad #bulkEdit wizard for Списания
  // (owner 2026-07-09, matches the live screenshots): Проект · Статья
  // расходов · Владелец-сотрудник · Владелец-отдел · Общий доступ + Комментарий.
  const tMass = useTranslations('mass_edit_modal');
  const router = useRouter();
  const [massEditOpen, setMassEditOpen] = useState(false);
  // Legacy modal state — the wizard now lives on /bulk-edit (setter unused;
  // the dead modal below is removed in the follow-up cleanup sweep).
  const [massEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<MassEditPickerValue>(null);
  const [massEditProject, setMassEditProject] = useState<MassEditPickerValue>(null);
  const [massEditPicker, setMassEditPicker] = useState<null | 'owner' | 'project'>(null);
  // Select options for the wizard's dropdown rows. Small dictionaries — one
  // fetch each, cached; «Статья расходов» submits the item NAME (Loss.expenseItem).
  const { data: massGroupsData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['groups', 'mass-edit'],
    queryFn: () => api.get('/groups?limit=100'),
    enabled: massEditOpen,
    staleTime: 5 * 60 * 1000,
  });
  const { data: massExpenseData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['expense-items', 'mass-edit'],
    queryFn: () => api.get('/expense-items?limit=100'),
    enabled: massEditOpen,
    staleTime: 5 * 60 * 1000,
  });

  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const l of data.items) {
      if (bulk.selectedIds.has(l.id) && l.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);

  const handleListExport = () => {
    const items = data?.items ?? [];
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<LossRow>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`losses_${csvTimestamp()}.csv`, csv);
  };

  // moysklad parity — LIVE-GROUNDED 2026-06-25 (online.moysklad.uz #loss,
  // tools/capture/ms-loss-list-ground.mjs). The default-visible grid is, in
  // order: № · Время · Со склада · Организация · Сумма · Валюта · Отправлено ·
  // Напечатано · Комментарий. `state` stays available in the ⚙ customizer but
  // hidden by default (moysklad surfaces status via the Фильтр panel, not a
  // column). `reason` (our enum) + the positions count are NOT moysklad
  // columns — removed.
  const cols = useColumnVisibility('losses', [
    'name',
    'moment',
    'store',
    'organization',
    'sum',
    'currency',
    'shared',
    'published',
    'printed',
    'description',
  ]);
  const colWidths = useColumnWidths('losses');

  // moysklad's "Списания" list has no status pill sub-tabs (shared GWT
  // list chrome). Status filtering is the "Статус" select inside the
  // inline filter panel below.

  // moysklad-parity columns — LIVE-GROUNDED 2026-06-25 order (#loss). Shared GWT
  // list chrome (mirror invoices-in): № is a brand-blue, always-underlined link;
  // «Валюта» shows the short name; «Отправлено» / «Напечатано» are cyan badges
  // (empty when off); «Комментарий» = the document description. `state` stays in
  // the ⚙ customizer but is not default-visible (moysklad shows it via Фильтр).
  const columns: DataTableColumn<LossRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '110px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/losses/${r.id}`}
          className="text-[var(--ms-text-brand)] underline underline-offset-2"
        >
          {r.name}
        </a>
      ),
      cellText: (r: LossRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(r.moment)}
        </span>
      ),
      cellText: (r: LossRow) => formatDate(r.moment),
    },
    {
      key: 'store',
      header: tFields('store_from'),
      width: '160px',
      sortable: true,
      cell: (r) => (
        <span className="block max-w-[200px] truncate text-sm">{r.store?.name ?? ''}</span>
      ),
      cellText: (r: LossRow) => r.store?.name ?? '',
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '160px',
      sortable: true,
      cell: (r) => (
        <span className="block max-w-[200px] truncate text-sm">{r.organization?.name ?? '—'}</span>
      ),
      cellText: (r: LossRow) => r.organization?.name ?? '',
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium tabular-nums">
          {formatMoney(r.sumMinor, r.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: LossRow) =>
        r.sumMinor ? formatMoney(r.sumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      key: 'currency',
      header: tFields('currency'),
      width: '70px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {CURRENCY_LABEL[r.currency] ?? r.currency}
        </span>
      ),
      cellText: (r: LossRow) => CURRENCY_LABEL[r.currency] ?? r.currency,
    },
    // «Общий доступ» — moysklad shows a green ✓ when the document is shared
    // with other employees, else an empty cell. Positioned between «Валюта»
    // and «Отправлено», matching the user's live moysklad #loss grid
    // (2026-06-28 side-by-side review). Default-VISIBLE per the user's explicit
    // request to mirror their account's column layout; still toggleable via the
    // ⚙ customizer. (moysklad's fresh-account default hides it — we surface it
    // because this clone targets the user's configured view.)
    {
      key: 'shared',
      // «Общий доступ» — reuse the existing pages.purchase_orders.filter_shared
      // message (= «Общий доступ»), already used by this page's filter field, so
      // no new key is needed in the shared messages/*.json (avoids cross-session
      // i18n-file entanglement). `fields.shared` does NOT exist.
      header: tPO('filter_shared'),
      width: '110px',
      cell: (r) =>
        r.shared ? (
          <Icons.check
            className="h-4 w-4 text-[var(--ms-text-success)]"
            aria-label={tPO('filter_shared')}
          />
        ) : null,
      cellText: (r: LossRow) => (r.shared ? '✓' : ''),
    },
    {
      key: 'published',
      header: tFields('published'),
      width: '110px',
      cell: (r) => <StatusBadge on={r.published} label={tFields('published')} />,
      cellText: (r: LossRow) => (r.published ? tFields('published') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '110px',
      cell: (r) => <StatusBadge on={r.printed} label={tFields('printed')} />,
      cellText: (r: LossRow) => (r.printed ? tFields('printed') : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      width: '180px',
      cell: (r) => (
        <span className="block max-w-[240px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {r.description ?? ''}
        </span>
      ),
      cellText: (r: LossRow) => r.description ?? '',
    },
    // Available-but-hidden in the ⚙ customizer (moysklad shows status via Фильтр).
    {
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>{tStates(r.state as LossStateKey)}</Badge>
      ),
      cellText: (r: LossRow) => r.state,
    },
  ];

  // Pinned footer money cell — moysklad currency-guard: «…» while loading, «—»
  // on a mixed-currency set (never happens for Loss — always base currency),
  // else the exact total under «Сумма». Mirror invoices-in.
  const footerRow: Record<string, React.ReactNode> = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
  });

  const hasFilter =
    !!search ||
    !!stateFilter ||
    products.length > 0 ||
    stores.length > 0 ||
    projects.length > 0 ||
    organizations.length > 0 ||
    owners.length > 0 ||
    groups.length > 0 ||
    modifiedBys.length > 0 ||
    expenseItems.length > 0 ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.shared ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo;

  // moysklad-parity inline filter panel — LIVE-GROUNDED 2026-06-25
  // (online.moysklad.uz #loss, tools/capture/ms-loss-list-ground.mjs). 15
  // fields in the grounded order: Период · Товар или группа · Склад · Проект ·
  // Организация · Статус · Проведено · Напечатано · Отправлено ·
  // Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда изменен · Кто
  // изменил · Статья расходов. The reference filters are MULTI-select inline
  // MultiCombobox checkbox-dropdowns (mirror invoices-in). «Кто изменил» is
  // backed via an auditLog approximation (Loss has no modifiedById column);
  // «Статья расходов» picks ExpenseItem ids, resolved BE-side to the
  // Loss.expenseItem names. Loss has NO Контрагент / Договор / Счёт* and NO
  // «Сумма» range (internal write-off, no counterparty) — intentionally absent.
  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      // moysklad parity — #loss filter is a 6-column grid (action cell + 5
      // fields on row 1: Период·Товар·Склад·Проект·Организация; then 6 + 4),
      // mirroring the already-fixed siblings (supplies/payments/demands/
      // commission). The default 5-col layout shifted everything down a row.
      columns={6}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setFilterValues({});
        setStateFilter(null);
        setProducts([]);
        setStores([]);
        setProjects([]);
        setOrganizations([]);
        setOwners([]);
        setGroups([]);
        setModifiedBys([]);
        setExpenseItems([]);
        onResetCursor();
      }}
      // moysklad 🔖 — opens the «Закладки» save-current-filter flow.
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
          entity="loss"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
          showAdd={filterOpen}
        />
      }
      testId="losses-inline-filter"
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
                const ex = prev.find((p) => p.id === id);
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
      <InlineFilterPanel.Field label={tFields('store')} expandable fieldKey="store">
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
      <InlineFilterPanel.Field label={tFields('organization')} expandable fieldKey="organization">
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
      {/* 6. Статус — single StateSelect (Loss FSM 3 states). */}
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
      {/* 15. Статья расходов — multi-select expense-item dropdown. */}
      <InlineFilterPanel.Field label={tFields('expense_item')} expandable fieldKey="expense_item">
        <MultiCombobox
          value={expenseItems.map((x) => x.id)}
          items={expenseItems.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/expense-items?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setExpenseItems((prev) =>
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
          testId="filter-expense-item"
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
        testId="losses-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/losses', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/losses/new"
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
        rowTestId={(r) => `loss-row-${r.id}`}
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
        footerRow={footerRow}
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
            <LossBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              postedCount={postedCount}
              onMassEdit={() => {
                stashBulkEdit({
                  entity: 'losses',
                  ids:
                    bulk.selectedIds.size > 0
                      ? Array.from(bulk.selectedIds)
                      : (data?.items ?? []).map((r) => r.id),
                  from: '/losses',
                });
                router.push('/bulk-edit');
              }}
            />
            <LossPrintDropdown selectedIds={bulk.selectedIds} onExportList={handleListExport} />
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

      {/* Mass-edit pickers (Владелец-сотрудник / Проект) — opened from the modal. */}
      <CatalogPicker
        open={massEditPicker === 'owner'}
        onClose={() => setMassEditPicker(null)}
        title={tMass('owner_label')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMassEditOwner({ id: item.id, label: String(item.primary) });
          setMassEditPicker(null);
        }}
      />
      <CatalogPicker
        open={massEditPicker === 'project'}
        onClose={() => setMassEditPicker(null)}
        title={tMass('project_label')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/projects?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMassEditProject({ id: item.id, label: String(item.primary) });
          setMassEditPicker(null);
        }}
      />
      <MassEditModal
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        selectedCount={massEditIds.length}
        submitting={bulk.massEdit.isPending}
        ownerValue={massEditOwner}
        onOwnerPick={() => setMassEditPicker('owner')}
        onOwnerClear={() => setMassEditOwner(null)}
        projectValue={massEditProject}
        onProjectPick={() => setMassEditPicker('project')}
        onProjectClear={() => setMassEditProject(null)}
        groupOptions={(massGroupsData?.items ?? []).map((g) => ({ value: g.id, label: g.name }))}
        expenseItemOptions={(massExpenseData?.items ?? []).map((e) => ({
          // Loss.expenseItem stores the item NAME (list filter joins on it).
          value: e.name,
          label: e.name,
        }))}
        showShared
        labels={{
          title: tMass('title'),
          ownerLabel: tMass('owner_label'),
          projectLabel: tMass('project_label'),
          descriptionLabel: tMass('description_label'),
          apply: tMass('apply'),
          cancel: tMass('cancel'),
          hint: tMass('hint', { count: massEditIds.length }),
          groupLabel: tMass('group_label'),
          expenseItemLabel: tMass('expense_item_label'),
          sharedLabel: tMass('shared_label'),
          sharedYes: tMass('shared_yes'),
          sharedNo: tMass('shared_no'),
        }}
        onSubmit={async (patch) => {
          await bulk.massEdit.mutateAsync({ ids: massEditIds, ...patch });
          setMassEditOpen(false);
        }}
        testId="loss-mass-edit-modal"
      />
    </>
  );
}
