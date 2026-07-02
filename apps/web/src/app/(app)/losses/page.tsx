'use client';

import { ColumnSettings } from '@/components/column-settings';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { LossBulkActionsDropdown } from '@/components/losses/bulk-actions-dropdown';
import { LossPrintDropdown } from '@/components/losses/print-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import {
  Badge,
  type CsvColumn,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
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
import { useMemo, useState } from 'react';

interface LossRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  currency: string;
  // moysklad list columns — Отправлено / Напечатано / Комментарий (Prisma
  // scalars surfaced by list()'s `include`).
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
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
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
        <span className="block max-w-[240px] truncate text-[var(--ms-text-muted)] text-xs">
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
      testId="losses-inline-filter"
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
      {/* 2. Товар или группа — multi-select product dropdown. */}
      <InlineFilterPanel.Field label={tPO('filter_product_or_group')} expandable>
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
      <InlineFilterPanel.Field label={tFields('store')} expandable>
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
      <InlineFilterPanel.Field label={tPO('filter_project')} expandable>
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
      <InlineFilterPanel.Field label={tFields('organization')} expandable>
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
      {/* 7. Проведено */}
      <InlineFilterPanel.Field label={tFields('applicable')} expandable={false}>
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
      <InlineFilterPanel.Field label={tFields('printed')} expandable={false}>
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
      <InlineFilterPanel.Field label={tFields('published')} expandable={false}>
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
      <InlineFilterPanel.Field label={tPO('filter_owner_employee')} expandable>
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
      <InlineFilterPanel.Field label={tPO('filter_owner_group')} expandable>
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
      <InlineFilterPanel.Field label={tPO('filter_shared')} expandable={false}>
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
      <InlineFilterPanel.Field label={tPO('filter_modified_by')} expandable>
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
      <InlineFilterPanel.Field label={tFields('expense_item')} expandable>
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
    </>
  );
}
