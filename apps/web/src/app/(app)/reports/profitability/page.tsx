'use client';

/**
 * «Прибыльность» (Profitability) — full moysklad 1:1 report.
 *
 * Four groupings (По товарам / По сотрудникам / По покупателям / По каналам
 * продаж), a 13-field Фильтр panel, a time-bucketed chart (series + granularity
 * + Сравнить), a Печать menu, a column-config gear (+ Разбить по модификациям +
 * Количество строк) and pagination. Data: GET /reports/profitability.
 *
 * Money math (verified to the kopeck against live moysklad):
 *   Прибыль = (salesSum − salesCost) − (returnSum − returnCost)
 *   Рентабельность товара = Прибыль / (salesCost − returnCost)
 *   Рентабельность продаж = Прибыль / (salesSum − returnSum)
 */

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Checkbox,
  Combobox,
  type ComboboxItem,
  Container,
  Icons,
  Input,
  NativeSelect,
  StickyHScroll,
  formatIso,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { type ChartBucket, ProfitabilityChart, type SeriesKey } from './chart.tsx';

// ---------------------------------------------------------------- types
type GroupBy = 'product' | 'employee' | 'counterparty' | 'saleschannel';
type DocType = 'all' | 'demand' | 'retail';
type Accounted = 'all' | 'products' | 'services' | 'bundles';
type Gran = 'hour' | 'day' | 'week' | 'month';
type Compare = 'prev' | 'year' | 'custom';

interface Row {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  uom: string | null;
  channelType?: string | null;
  salesDocuments: number;
  salesQuantity: string;
  salesSumMinor: string;
  salesSumCostMinor: string;
  returnDocuments: number;
  returnQuantity: string;
  returnSumMinor: string;
  returnSumCostMinor: string;
  profitMinor: string;
  profitGoodsPct: string;
  profitSalesPct: string;
}
interface Totals {
  salesDocuments: number;
  salesQuantity: string;
  salesSumMinor: string;
  salesSumCostMinor: string;
  returnDocuments: number;
  returnQuantity: string;
  returnSumMinor: string;
  returnSumCostMinor: string;
  profitMinor: string;
  profitGoodsPct: string;
  profitSalesPct: string;
}
interface Report {
  groupBy: GroupBy;
  rows: Row[];
  totals: Totals;
  count: number;
  chart: { granularity: Gran; buckets: ChartBucket[]; compareBuckets: ChartBucket[] | null };
  channelBanner: { unsetDemands: number; unsetReturns: number } | null;
  currency: string;
  mixedCurrency: boolean;
}

interface DraftFilter {
  dateFrom: string;
  dateTo: string;
  accountedType: Accounted;
  productId: string;
  storeId: string;
  retailStoreId: string;
  projectId: string;
  counterpartyId: string;
  counterpartyGroupId: string;
  contractId: string;
  supplierId: string;
  organizationId: string;
  documentType: DocType;
  salesChannelId: string;
}

// ---------------------------------------------------------------- helpers
const INPUT_CLASS =
  'w-full h-8 px-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] hover:border-[var(--ms-border-strong)]';

function todayIso(): string {
  return formatIso(new Date());
}
function monthAgoIso(): string {
  const d = new Date();
  return formatIso(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
}
function defaultDraft(): DraftFilter {
  return {
    dateFrom: monthAgoIso(),
    dateTo: todayIso(),
    accountedType: 'all',
    productId: '',
    storeId: '',
    retailStoreId: '',
    projectId: '',
    counterpartyId: '',
    counterpartyGroupId: '',
    contractId: '',
    supplierId: '',
    organizationId: '',
    documentType: 'all',
    salesChannelId: '',
  };
}
const money = (minor: string) => formatMoney(minor, 'UZS', { displayAs: 'none' });
/** derived per-unit value (Цена / Себестоимость) = sum / qty, or — when qty=0. */
function perUnit(sumMinor: string, qty: string): string {
  const q = Number(qty);
  if (!q) return '—';
  return money(String(Math.round(Number(sumMinor) / q)));
}
/** Средний чек = sum / documents. */
function avgCheck(sumMinor: string, docs: number): string {
  if (!docs) return '—';
  return money(String(Math.round(Number(sumMinor) / docs)));
}
const pctText = (p: string) => (p === '' ? '—' : `${p}%`);

// module-level list fetchers (stable identity) — {items:[{id,name,code?}]}
const refFetch =
  (path: string) =>
  async (q: string): Promise<ComboboxItem[]> => {
    const r = await api.get<{ items: { id: string; name: string; code?: string | null }[] }>(
      `${path}?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ value: x.id, label: x.name, sublabel: x.code ?? undefined }));
  };

/** Async single-select that remembers the chosen label for its trigger. */
function RefCombobox({
  value,
  onChange,
  fetch,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (id: string) => void;
  fetch: (q: string) => Promise<ComboboxItem[]>;
  placeholder?: string;
  testId?: string;
}) {
  const [items, setItems] = useState<ComboboxItem[]>([]);
  // keep the selected item visible in the trigger even before searching
  const selected = items.find((i) => i.value === value);
  const shown = selected ? items : value ? [{ value, label: value }, ...items] : items;
  return (
    <Combobox
      value={value || undefined}
      onChange={(v) => onChange(v ?? '')}
      items={shown}
      onSearch={async (q) => {
        const r = await fetch(q);
        setItems(r);
        return r;
      }}
      placeholder={placeholder}
      className="h-8"
      testId={testId}
    />
  );
}

/** moysklad-style coloured pill dropdown for the two chart series selectors. */
function SeriesDropdown({
  value,
  onChange,
  options,
  color,
  placeholder,
  allowEmpty,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  color: string;
  placeholder?: string;
  allowEmpty?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const label = current?.label ?? placeholder ?? '';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-test-id={testId}
        className="flex h-9 w-64 items-center justify-between rounded-[var(--ms-radius-default)] pr-1 pl-3 font-medium text-sm text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        <span className="truncate">{label}</span>
        <span
          className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ms-radius-default)]"
          style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}
        >
          <Icons.down className="h-4 w-4" />
        </span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] py-1 shadow-lg">
            {allowEmpty && placeholder && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-muted)] ${value === '' ? 'font-medium' : ''}`}
              >
                {placeholder}
              </button>
            )}
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-muted)] ${value === o.value ? 'font-medium' : ''}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const fetchProducts = refFetch('/products');
const fetchStores = refFetch('/stores');
const fetchProjects = refFetch('/projects');
const fetchCounterparties = refFetch('/counterparties');
const fetchCounterpartyGroups = refFetch('/counterparty-groups');
const fetchContracts = refFetch('/contracts');
const fetchOrganizations = refFetch('/organizations');
const fetchChannels = refFetch('/sales-channels');

// ---------------------------------------------------------------- page
export default function ProfitabilityReportPage() {
  const t = useTranslations('pages.report_profitability');

  const [groupBy, setGroupBy] = useState<GroupBy>('product');
  const [filterOpen, setFilterOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(true);
  const [printOpen, setPrintOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);

  const [draft, setDraft] = useState<DraftFilter>(defaultDraft);
  const [applied, setApplied] = useState<DraftFilter>(defaultDraft);

  // chart + grid controls (applied immediately)
  const [granularity, setGranularity] = useState<Gran>('day');
  const [compareOn, setCompareOn] = useState(false);
  const [comparePeriod, setComparePeriod] = useState<Compare>('prev');
  // comparison window (moysklad: two date fields next to «Сравнить»). Auto-filled
  // from the mode + main window unless the user picks «Настроить» (custom).
  const [compareFrom, setCompareFrom] = useState<string>('');
  const [compareTo, setCompareTo] = useState<string>('');
  const [series1, setSeries1] = useState<SeriesKey>('salesDocuments');
  const [series2, setSeries2] = useState<SeriesKey | ''>('');
  const [splitByVariants, setSplitByVariants] = useState(false);
  const [limit, setLimit] = useState(100);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<string>('profit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [visibleCols, setVisibleCols] = useState<Set<string>>(defaultCols());

  // reset page on any query-shaping change
  // biome-ignore lint/correctness/useExhaustiveDependencies: page reset only
  useEffect(() => setPage(0), [applied, groupBy, splitByVariants, limit]);

  // Auto-fill the comparison window from the mode + applied period (prev/year);
  // «custom» leaves whatever the user typed into the two date fields.
  useEffect(() => {
    if (comparePeriod === 'custom') return;
    const from = new Date(applied.dateFrom);
    const to = new Date(applied.dateTo);
    if (comparePeriod === 'year') {
      setCompareFrom(shiftYear(applied.dateFrom, -1));
      setCompareTo(shiftYear(applied.dateTo, -1));
    } else {
      const spanDays = Math.round((to.getTime() - from.getTime()) / 86400000);
      const cTo = new Date(from.getTime() - 86400000);
      const cFrom = new Date(cTo.getTime() - spanDays * 86400000);
      setCompareFrom(formatIso(cFrom));
      setCompareTo(formatIso(cTo));
    }
  }, [comparePeriod, applied.dateFrom, applied.dateTo]);

  const params = new URLSearchParams({
    groupBy,
    dateFrom: applied.dateFrom,
    dateTo: applied.dateTo,
    accountedType: applied.accountedType,
    documentType: applied.documentType,
    granularity,
    compare: compareOn ? comparePeriod : 'none',
    splitByVariants: String(splitByVariants),
    limit: String(limit),
    offset: String(page * limit),
    sortBy,
    sortDir,
  });
  if (compareOn && compareFrom && compareTo) {
    params.set('compareFrom', compareFrom);
    params.set('compareTo', compareTo);
  }
  for (const [k, v] of [
    ['productId', applied.productId],
    ['storeId', applied.storeId],
    ['retailStoreId', applied.retailStoreId],
    ['projectId', applied.projectId],
    ['counterpartyId', applied.counterpartyId],
    ['counterpartyGroupId', applied.counterpartyGroupId],
    ['contractId', applied.contractId],
    ['supplierId', applied.supplierId],
    ['organizationId', applied.organizationId],
    ['salesChannelId', applied.salesChannelId],
  ] as const) {
    if (v) params.set(k, v);
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery<Report>({
    queryKey: ['reports', 'profitability', params.toString()],
    queryFn: () => api.get<Report>(`/reports/profitability?${params}`),
  });

  const onSort = (key: string) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('desc');
    }
  };
  const glyph = (key: string) => (sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const isProduct = groupBy === 'product';
  const isChannel = groupBy === 'saleschannel';
  const total = data?.count ?? 0;
  const from = total === 0 ? 0 : page * limit + 1;
  const to = Math.min((page + 1) * limit, total);
  const lastPage = Math.max(0, Math.ceil(total / limit) - 1);

  const seriesOptions: { value: SeriesKey; label: string }[] = [
    { value: 'salesDocuments', label: t('series_sales_documents') },
    { value: 'salesQuantity', label: t('series_sales_quantity') },
    { value: 'salesSum', label: t('series_sales_sum') },
    { value: 'salesSumCost', label: t('series_sales_sumcost') },
    { value: 'returnDocuments', label: t('series_returns_documents') },
    { value: 'returnQuantity', label: t('series_returns_quantity') },
    { value: 'returnSum', label: t('series_returns_sum') },
    { value: 'returnSumCost', label: t('series_returns_sumcost') },
    { value: 'profit', label: t('series_profit') },
    { value: 'profitGoodsPct', label: t('series_profit_goods') },
    { value: 'profitSalesPct', label: t('series_profit_sales') },
    { value: 'avgCheck', label: t('series_avg_check') },
  ];

  const printItems = [
    t('print_by_products'),
    t('print_by_products_detail'),
    t('print_by_employees'),
    t('print_by_employees_detail'),
    t('print_by_customers'),
    t('print_by_customers_detail'),
    t('print_configure'),
  ];

  const firstColLabel = isProduct
    ? t('col_product')
    : groupBy === 'employee'
      ? t('col_employee')
      : groupBy === 'counterparty'
        ? t('col_customer')
        : t('col_channels');

  // number of body columns for empty/colspan sizing
  const bodyColCount = isProduct ? 5 + 6 + 6 + 3 : (isChannel ? 2 : 1) + 4 + 4 + 3;

  return (
    <Container size="full" className="py-3">
      <Breadcrumb
        items={[{ label: t('breadcrumb_reports'), href: '/reports' }, { label: t('title') }]}
      />

      {/* ---- toolbar ---- */}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[var(--ms-text-muted)]" title={t('help')}>
          <Icons.help className="h-4 w-4" />
        </span>
        <h1 className="mr-1 font-semibold text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>
        <button
          type="button"
          onClick={() => refetch()}
          className="mr-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
          title={t('refresh')}
          data-test-id="prof-refresh"
        >
          <Icons.refresh className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>

        {/* tab segmented */}
        <div className="inline-flex overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          {(
            [
              ['product', t('tab_by_products')],
              ['employee', t('tab_by_employees')],
              ['counterparty', t('tab_by_customers')],
              ['saleschannel', t('tab_by_channels')],
            ] as [GroupBy, string][]
          ).map(([g, label], i) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              data-test-id={`prof-tab-${g}`}
              className={`h-8 px-3 text-sm ${i > 0 ? 'border-[var(--ms-border-default)] border-l' : ''} ${
                groupBy === g
                  ? 'bg-[var(--ms-bg-muted)] font-medium text-[var(--ms-text-primary)]'
                  : 'bg-[var(--ms-bg-surface)] text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-muted)]/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Button
          variant={filterOpen ? 'secondary' : 'tertiary'}
          size="sm"
          onClick={() => setFilterOpen((v) => !v)}
          data-test-id="prof-filter-toggle"
        >
          {t('filter')}
        </Button>

        {/* Печать dropdown */}
        <div className="relative">
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setPrintOpen((v) => !v)}
            data-test-id="prof-print"
          >
            <Icons.print className="h-4 w-4" />
            {t('print')} ▾
          </Button>
          {printOpen && (
            <>
              <button
                type="button"
                aria-label={t('close')}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setPrintOpen(false)}
              />
              <div className="absolute left-0 z-20 mt-1 w-72 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] py-1 shadow-lg">
                {printItems.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setPrintOpen(false);
                      window.print();
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-muted)]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <Button
          variant={chartOpen ? 'secondary' : 'tertiary'}
          size="sm"
          onClick={() => setChartOpen((v) => !v)}
          data-test-id="prof-chart-toggle"
        >
          <Icons.chart className="h-4 w-4" />
          {t('chart')}
        </Button>
      </div>

      {/* ---- filter panel ---- */}
      {filterOpen && (
        <div className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]/40 p-3">
          <div className="mb-3 flex items-center gap-2">
            <Button size="sm" onClick={() => setApplied(draft)} data-test-id="prof-find">
              {t('find')}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => {
                const d = defaultDraft();
                setDraft(d);
                setApplied(d);
              }}
              data-test-id="prof-clear"
            >
              {t('clear')}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-3 lg:grid-cols-5">
            {/* Период */}
            <div className="lg:col-span-2">
              <div className="mb-1 flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
                <span>{t('period')}:</span>
                <button
                  type="button"
                  className="text-[var(--ms-text-brand)] hover:underline"
                  onClick={() =>
                    setDraft((d) => ({ ...d, dateFrom: todayIso(), dateTo: todayIso() }))
                  }
                >
                  {t('period_today')}
                </button>
                <button
                  type="button"
                  className="text-[var(--ms-text-brand)] hover:underline"
                  onClick={() =>
                    setDraft((d) => ({ ...d, dateFrom: addDays(-1), dateTo: addDays(-1) }))
                  }
                >
                  {t('period_yesterday')}
                </button>
                <button
                  type="button"
                  className="text-[var(--ms-text-brand)] hover:underline"
                  onClick={() =>
                    setDraft((d) => ({ ...d, dateFrom: addDays(-7), dateTo: todayIso() }))
                  }
                >
                  {t('period_week')}
                </button>
                <button
                  type="button"
                  className="text-[var(--ms-text-brand)] hover:underline"
                  onClick={() =>
                    setDraft((d) => ({ ...d, dateFrom: monthAgoIso(), dateTo: todayIso() }))
                  }
                >
                  {t('period_month')}
                </button>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={draft.dateFrom}
                  onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                  className={INPUT_CLASS}
                  data-test-id="prof-date-from"
                />
                <span className="text-[var(--ms-text-muted)]">–</span>
                <Input
                  type="date"
                  value={draft.dateTo}
                  onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                  className={INPUT_CLASS}
                  data-test-id="prof-date-to"
                />
              </div>
            </div>
            <Field label={t('accounted')}>
              <NativeSelect
                value={draft.accountedType}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, accountedType: e.target.value as Accounted }))
                }
                className={INPUT_CLASS}
                data-test-id="prof-accounted"
              >
                <option value="all">{t('accounted_all')}</option>
                <option value="products">{t('accounted_products')}</option>
                <option value="services">{t('accounted_services')}</option>
                <option value="bundles">{t('accounted_bundles')}</option>
              </NativeSelect>
            </Field>
            <Field label={t('field_product')}>
              <RefCombobox
                value={draft.productId}
                onChange={(id) => setDraft((d) => ({ ...d, productId: id }))}
                fetch={fetchProducts}
                placeholder={t('any')}
                testId="prof-product"
              />
            </Field>
            <Field label={t('field_store')}>
              <RefCombobox
                value={draft.storeId}
                onChange={(id) => setDraft((d) => ({ ...d, storeId: id }))}
                fetch={fetchStores}
                placeholder={t('any')}
                testId="prof-store"
              />
            </Field>
            <Field label={t('field_retail_store')}>
              <RefCombobox
                value={draft.retailStoreId}
                onChange={(id) => setDraft((d) => ({ ...d, retailStoreId: id }))}
                fetch={fetchStores}
                placeholder={t('any')}
                testId="prof-retail-store"
              />
            </Field>
            <Field label={t('field_project')}>
              <RefCombobox
                value={draft.projectId}
                onChange={(id) => setDraft((d) => ({ ...d, projectId: id }))}
                fetch={fetchProjects}
                placeholder={t('any')}
                testId="prof-project"
              />
            </Field>
            <Field label={t('field_counterparty')}>
              <RefCombobox
                value={draft.counterpartyId}
                onChange={(id) => setDraft((d) => ({ ...d, counterpartyId: id }))}
                fetch={fetchCounterparties}
                placeholder={t('any')}
                testId="prof-counterparty"
              />
            </Field>
            <Field label={t('field_counterparty_group')}>
              <RefCombobox
                value={draft.counterpartyGroupId}
                onChange={(id) => setDraft((d) => ({ ...d, counterpartyGroupId: id }))}
                fetch={fetchCounterpartyGroups}
                placeholder={t('any')}
                testId="prof-cp-group"
              />
            </Field>
            <Field label={t('field_contract')}>
              <RefCombobox
                value={draft.contractId}
                onChange={(id) => setDraft((d) => ({ ...d, contractId: id }))}
                fetch={fetchContracts}
                placeholder={t('any')}
                testId="prof-contract"
              />
            </Field>
            <Field label={t('field_supplier')}>
              <RefCombobox
                value={draft.supplierId}
                onChange={(id) => setDraft((d) => ({ ...d, supplierId: id }))}
                fetch={fetchCounterparties}
                placeholder={t('any')}
                testId="prof-supplier"
              />
            </Field>
            <Field label={t('field_organization')}>
              <RefCombobox
                value={draft.organizationId}
                onChange={(id) => setDraft((d) => ({ ...d, organizationId: id }))}
                fetch={fetchOrganizations}
                placeholder={t('any')}
                testId="prof-organization"
              />
            </Field>
            <Field label={t('field_doctype')}>
              <NativeSelect
                value={draft.documentType}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, documentType: e.target.value as DocType }))
                }
                className={INPUT_CLASS}
                data-test-id="prof-doctype"
              >
                <option value="all">{t('doctype_all')}</option>
                <option value="demand">{t('doctype_demand')}</option>
                <option value="retail">{t('doctype_retail')}</option>
              </NativeSelect>
            </Field>
            <Field label={t('field_channel')}>
              <RefCombobox
                value={draft.salesChannelId}
                onChange={(id) => setDraft((d) => ({ ...d, salesChannelId: id }))}
                fetch={fetchChannels}
                placeholder={t('any')}
                testId="prof-channel"
              />
            </Field>
          </div>
        </div>
      )}

      {/* ---- channel banner ---- */}
      {isChannel &&
        data?.channelBanner &&
        (data.channelBanner.unsetDemands > 0 || data.channelBanner.unsetReturns > 0) && (
          <div
            className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d9a441)] bg-[var(--ms-bg-warning,#fffbe6)] px-3 py-2 text-[var(--ms-text-primary)] text-sm"
            data-test-id="prof-channel-banner"
          >
            <div className="mb-1 font-medium">{t('channel_incomplete')}</div>
            <div className="text-[var(--ms-text-secondary)] text-xs">{t('channel_hint')}</div>
          </div>
        )}

      {/* ---- chart panel ---- */}
      {chartOpen && (
        <div className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex select-none items-center gap-2 text-sm">
              <Checkbox
                checked={compareOn}
                onCheckedChange={(v) => setCompareOn(v === true)}
                data-test-id="prof-compare"
              />
              {t('compare')}
            </label>
            {/* moysklad: mode dropdown + two comparison-date fields are ALWAYS
                interactive; the «Сравнить» checkbox toggles whether the second
                line is drawn — it does NOT gate these controls. */}
            <NativeSelect
              value={comparePeriod}
              onChange={(e) => setComparePeriod(e.target.value as Compare)}
              className={`${INPUT_CLASS} w-52`}
              data-test-id="prof-compare-period"
            >
              <option value="prev">{t('compare_prev')}</option>
              <option value="year">{t('compare_year')}</option>
              <option value="custom">{t('compare_custom')}</option>
            </NativeSelect>
            <Input
              type="date"
              value={compareFrom}
              onChange={(e) => {
                setCompareFrom(e.target.value);
                setComparePeriod('custom');
              }}
              className={`${INPUT_CLASS} w-36`}
              data-test-id="prof-compare-from"
            />
            <span className="text-[var(--ms-text-muted)]">–</span>
            <Input
              type="date"
              value={compareTo}
              onChange={(e) => {
                setCompareTo(e.target.value);
                setComparePeriod('custom');
              }}
              className={`${INPUT_CLASS} w-36`}
              data-test-id="prof-compare-to"
            />
            <div className="ml-auto inline-flex overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
              {(
                [
                  ['hour', t('gran_hour')],
                  ['day', t('gran_day')],
                  ['week', t('gran_week')],
                  ['month', t('gran_month')],
                ] as [Gran, string][]
              ).map(([g, label], i) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  data-test-id={`prof-gran-${g}`}
                  className={`h-7 px-2.5 text-xs ${i > 0 ? 'border-[var(--ms-border-default)] border-l' : ''} ${granularity === g ? 'bg-[var(--ms-bg-muted)] font-medium' : 'bg-[var(--ms-bg-surface)] text-[var(--ms-text-secondary)]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setChartOpen(false)}
              className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
              title={t('close')}
            >
              <Icons.close className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
            <SeriesDropdown
              value={series1}
              onChange={(v) => setSeries1(v as SeriesKey)}
              options={seriesOptions}
              color="#2eb6d8"
              testId="prof-series1"
            />
            <SeriesDropdown
              value={series2}
              onChange={(v) => setSeries2(v as SeriesKey | '')}
              options={seriesOptions}
              color="#e8862a"
              placeholder={t('series_pick')}
              allowEmpty
              testId="prof-series2"
            />
          </div>
          {data && (
            <ProfitabilityChart
              buckets={data.chart.buckets}
              compareBuckets={compareOn ? data.chart.compareBuckets : null}
              primary={series1}
              secondary={series2 || null}
            />
          )}
        </div>
      )}

      {/* ---- states ---- */}
      {isLoading && <div className="mt-6 text-[var(--ms-text-muted)] text-sm">{t('loading')}</div>}
      {error && (
        <div className="mt-6 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message}
        </div>
      )}

      {/* ---- table ---- */}
      {data && (
        <div className="relative mt-2">
          {/* gear — kept OUTSIDE the horizontal-scroll wrapper below so its
              dropdown is never clipped by overflow-x (the page scrolls naturally). */}
          <div className="absolute top-1.5 right-1.5 z-30">
            <button
              type="button"
              onClick={() => setGearOpen((v) => !v)}
              className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
              title={t('columns')}
              data-test-id="prof-gear"
            >
              <Icons.settings className="h-4 w-4" />
            </button>
            {gearOpen && (
              <>
                <button
                  type="button"
                  aria-label={t('close')}
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setGearOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1 max-h-96 w-64 overflow-y-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-2 shadow-lg">
                  {columnGroups(isProduct, isChannel, t).map((grp) => (
                    <div key={grp.label} className="mb-1">
                      {grp.label && (
                        <div className="px-1 py-1 font-medium text-[var(--ms-text-muted)] text-xs">
                          {grp.label}
                        </div>
                      )}
                      {grp.items.map((c) => (
                        <label
                          key={c.key}
                          className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-sm hover:bg-[var(--ms-bg-muted)]"
                        >
                          <Checkbox
                            checked={visibleCols.has(c.key)}
                            onCheckedChange={(v) =>
                              setVisibleCols((s) => toggle(s, c.key, v === true))
                            }
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  ))}
                  {isProduct && (
                    <label className="mt-1 flex cursor-pointer items-center gap-2 border-[var(--ms-border-subtle)] border-t px-1 pt-2 text-sm">
                      <Checkbox
                        checked={splitByVariants}
                        onCheckedChange={(v) => setSplitByVariants(v === true)}
                        data-test-id="prof-split-variants"
                      />
                      {t('split_variants')}
                    </label>
                  )}
                  <div className="mt-2 flex items-center gap-2 border-[var(--ms-border-subtle)] border-t px-1 pt-2 text-sm">
                    <span className="text-[var(--ms-text-muted)]">{t('rows_count')}:</span>
                    {[25, 50, 100].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setLimit(n)}
                        className={`rounded px-2 py-0.5 ${limit === n ? 'bg-[var(--ms-bg-muted)] font-medium' : 'text-[var(--ms-text-secondary)]'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <StickyHScroll className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
            <table className="w-full text-sm">
              {/* grouped header */}
              <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-secondary)]">
                <tr className="border-[var(--ms-border-default)] border-b text-center">
                  <th className="px-2 py-1" colSpan={isProduct ? 5 : isChannel ? 2 : 1} />
                  <th
                    className="border-[var(--ms-border-subtle)] border-x px-2 py-1 font-semibold"
                    colSpan={isProduct ? 6 : 4}
                  >
                    {t('group_sales')}
                  </th>
                  <th
                    className="border-[var(--ms-border-subtle)] border-r px-2 py-1 font-semibold"
                    colSpan={isProduct ? 6 : 4}
                  >
                    {t('group_returns')}
                  </th>
                  <th className="px-2 py-1 font-semibold" colSpan={3}>
                    {t('group_profitability')}
                  </th>
                </tr>
                <tr className="border-[var(--ms-border-default)] border-b">
                  {/* first cols */}
                  <Th onClick={() => onSort('name')} align="left" testId="prof-sort-name">
                    {firstColLabel}
                    {glyph('name')}
                  </Th>
                  {isChannel && <Th align="left">{t('col_type')}</Th>}
                  {isProduct && visibleCols.has('code') && <Th align="left">{t('col_code')}</Th>}
                  {isProduct && visibleCols.has('article') && (
                    <Th align="left">{t('col_article')}</Th>
                  )}
                  {isProduct && visibleCols.has('uom') && <Th align="left">{t('col_uom')}</Th>}
                  {/* sales */}
                  <Th onClick={() => onSort('salesDocuments')}>
                    {t('col_documents')}
                    {glyph('salesDocuments')}
                  </Th>
                  {isProduct ? (
                    <Th onClick={() => onSort('salesQuantity')}>
                      {t('col_quantity')}
                      {glyph('salesQuantity')}
                    </Th>
                  ) : (
                    <Th>{t('col_avg_check')}</Th>
                  )}
                  {isProduct && <Th>{t('col_price')}</Th>}
                  {isProduct && <Th>{t('col_costprice')}</Th>}
                  <Th onClick={() => onSort('salesSum')}>
                    {t('col_sum')}
                    {glyph('salesSum')}
                  </Th>
                  <Th onClick={() => onSort('salesSumCost')}>
                    {t('col_sumcost')}
                    {glyph('salesSumCost')}
                  </Th>
                  {/* returns */}
                  <Th>{t('col_documents')}</Th>
                  {isProduct ? <Th>{t('col_quantity')}</Th> : <Th>{t('col_avg_check')}</Th>}
                  {isProduct && <Th>{t('col_price')}</Th>}
                  {isProduct && <Th>{t('col_costprice')}</Th>}
                  <Th onClick={() => onSort('returnSum')}>
                    {t('col_sum')}
                    {glyph('returnSum')}
                  </Th>
                  <Th>{t('col_sumcost')}</Th>
                  {/* profitability */}
                  <Th onClick={() => onSort('profitGoodsPct')}>
                    {t('col_goods')}
                    {glyph('profitGoodsPct')}
                  </Th>
                  <Th onClick={() => onSort('profitSalesPct')}>
                    {t('col_sales')}
                    {glyph('profitSalesPct')}
                  </Th>
                  <Th onClick={() => onSort('profit')}>
                    {t('col_profit')}
                    {glyph('profit')}
                  </Th>
                </tr>
              </thead>

              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={bodyColCount}
                      className="px-3 py-8 text-center text-[var(--ms-text-muted)] text-sm"
                    >
                      {t('empty')}
                    </td>
                  </tr>
                )}
                {data.rows.map((r) => {
                  const negative = BigInt(r.profitMinor) < 0n;
                  return (
                    <tr
                      key={r.id}
                      className="border-[var(--ms-border-subtle)] border-b last:border-b-0 hover:bg-[var(--ms-bg-muted)]/40"
                      data-test-id={`prof-row-${r.id}`}
                    >
                      <td className="px-2 py-1.5">
                        {isProduct ? (
                          <a
                            href={`/products/${r.id}`}
                            className="text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                          >
                            {r.name}
                          </a>
                        ) : groupBy === 'counterparty' ? (
                          <a
                            href={`/counterparties/${r.id}`}
                            className="text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                          >
                            {r.name}
                          </a>
                        ) : (
                          <span className="text-[var(--ms-text-primary)]">{r.name}</span>
                        )}
                      </td>
                      {isChannel && (
                        <td className="px-2 py-1.5 text-[var(--ms-text-muted)] text-xs">
                          {r.channelType ?? ''}
                        </td>
                      )}
                      {isProduct && visibleCols.has('code') && (
                        <td className="px-2 py-1.5 text-[var(--ms-text-muted)] text-xs">
                          {r.code ?? ''}
                        </td>
                      )}
                      {isProduct && visibleCols.has('article') && (
                        <td className="px-2 py-1.5 text-[var(--ms-text-muted)] text-xs">
                          {r.article ?? ''}
                        </td>
                      )}
                      {isProduct && visibleCols.has('uom') && (
                        <td className="px-2 py-1.5 text-[var(--ms-text-muted)] text-xs">
                          {r.uom ?? ''}
                        </td>
                      )}
                      {/* sales */}
                      <Td>{r.salesDocuments || 0}</Td>
                      {isProduct ? (
                        <Td>{trimQty(r.salesQuantity)}</Td>
                      ) : (
                        <Td>{avgCheck(r.salesSumMinor, r.salesDocuments)}</Td>
                      )}
                      {isProduct && <Td>{perUnit(r.salesSumMinor, r.salesQuantity)}</Td>}
                      {isProduct && <Td muted>{perUnit(r.salesSumCostMinor, r.salesQuantity)}</Td>}
                      <Td>{money(r.salesSumMinor)}</Td>
                      <Td muted>{money(r.salesSumCostMinor)}</Td>
                      {/* returns */}
                      <Td>{r.returnDocuments || 0}</Td>
                      {isProduct ? (
                        <Td>{trimQty(r.returnQuantity)}</Td>
                      ) : (
                        <Td>{avgCheck(r.returnSumMinor, r.returnDocuments)}</Td>
                      )}
                      {isProduct && <Td>{perUnit(r.returnSumMinor, r.returnQuantity)}</Td>}
                      {isProduct && (
                        <Td muted>{perUnit(r.returnSumCostMinor, r.returnQuantity)}</Td>
                      )}
                      <Td>{money(r.returnSumMinor)}</Td>
                      <Td muted>{money(r.returnSumCostMinor)}</Td>
                      {/* profitability */}
                      <Td>{pctText(r.profitGoodsPct)}</Td>
                      <Td>{pctText(r.profitSalesPct)}</Td>
                      <Td
                        className={
                          negative
                            ? 'font-medium text-[var(--ms-text-destructive)]'
                            : 'font-medium text-[var(--ms-text-success)]'
                        }
                      >
                        {money(r.profitMinor)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>

              {data.rows.length > 0 && (
                <tfoot className="border-[var(--ms-border-strong)] border-t-2 bg-[var(--ms-bg-muted)] font-semibold">
                  <tr>
                    <td
                      className="px-2 py-1.5"
                      colSpan={isProduct ? colspanFirst(visibleCols) : isChannel ? 2 : 1}
                    />
                    <Td>{data.totals.salesDocuments}</Td>
                    {isProduct ? (
                      <Td>{trimQty(data.totals.salesQuantity)}</Td>
                    ) : (
                      <Td>{avgCheck(data.totals.salesSumMinor, data.totals.salesDocuments)}</Td>
                    )}
                    {isProduct && <Td> </Td>}
                    {isProduct && <Td> </Td>}
                    <Td>{money(data.totals.salesSumMinor)}</Td>
                    <Td>{money(data.totals.salesSumCostMinor)}</Td>
                    <Td>{data.totals.returnDocuments}</Td>
                    {isProduct ? (
                      <Td>{trimQty(data.totals.returnQuantity)}</Td>
                    ) : (
                      <Td>{avgCheck(data.totals.returnSumMinor, data.totals.returnDocuments)}</Td>
                    )}
                    {isProduct && <Td> </Td>}
                    {isProduct && <Td> </Td>}
                    <Td>{money(data.totals.returnSumMinor)}</Td>
                    <Td>{money(data.totals.returnSumCostMinor)}</Td>
                    <Td>{pctText(data.totals.profitGoodsPct)}</Td>
                    <Td>{pctText(data.totals.profitSalesPct)}</Td>
                    <Td>{money(data.totals.profitMinor)}</Td>
                  </tr>
                </tfoot>
              )}
            </table>
          </StickyHScroll>
        </div>
      )}

      {/* ---- pagination ---- */}
      {data && total > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[var(--ms-text-secondary)] text-sm">
          <PagerBtn disabled={page === 0} onClick={() => setPage(0)} title={t('first_page')}>
            «
          </PagerBtn>
          <PagerBtn
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            title={t('prev_page')}
          >
            ‹
          </PagerBtn>
          <span data-test-id="prof-pager">{t('pager', { from, to, total })}</span>
          <PagerBtn
            disabled={page >= lastPage}
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            title={t('next_page')}
          >
            ›
          </PagerBtn>
          <PagerBtn
            disabled={page >= lastPage}
            onClick={() => setPage(lastPage)}
            title={t('last_page')}
          >
            »
          </PagerBtn>
          {isChannel && (
            <a
              href="/ecommerce/channels"
              className="ml-3 text-[var(--ms-text-brand)] hover:underline"
            >
              {t('go_to_channels')}
            </a>
          )}
          {data.mixedCurrency && (
            <span className="ml-3 text-[var(--ms-text-warning,#92400e)] text-xs">
              {t('currency_mixed_warn')}
            </span>
          )}
        </div>
      )}
    </Container>
  );
}

// ---------------------------------------------------------------- small parts
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{label}</div>
      {children}
    </div>
  );
}
function Th({
  children,
  onClick,
  align = 'right',
  testId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  align?: 'left' | 'right';
  testId?: string;
}) {
  return (
    <th
      className={`px-2 py-1.5 font-medium ${align === 'left' ? 'text-left' : 'text-right'} ${onClick ? 'cursor-pointer select-none' : ''}`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      data-test-id={testId}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  muted,
  className,
}: { children: React.ReactNode; muted?: boolean; className?: string }) {
  return (
    <td
      className={`px-2 py-1.5 text-right tabular-nums ${muted ? 'text-[var(--ms-text-muted)]' : ''} ${className ?? ''}`}
    >
      {children}
    </td>
  );
}
function PagerBtn({
  children,
  disabled,
  onClick,
  title,
}: { children: React.ReactNode; disabled?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ms-border-default)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function addDays(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return formatIso(d);
}
function shiftYear(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return formatIso(d);
}
function trimQty(q: string): string {
  const n = Number(q);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
}
function toggle(s: Set<string>, key: string, on: boolean): Set<string> {
  const next = new Set(s);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}
function defaultCols(): Set<string> {
  return new Set(['code', 'article', 'uom']);
}
function colspanFirst(cols: Set<string>): number {
  // product tab first block: name + code? + article? + uom? (name always)
  return 1 + (cols.has('code') ? 1 : 0) + (cols.has('article') ? 1 : 0) + (cols.has('uom') ? 1 : 0);
}
function columnGroups(
  isProduct: boolean,
  _isChannel: boolean,
  t: (k: string) => string,
): { label: string; items: { key: string; label: string }[] }[] {
  if (!isProduct) return [];
  return [
    {
      label: '',
      items: [
        { key: 'code', label: t('col_code') },
        { key: 'article', label: t('col_article') },
        { key: 'uom', label: t('col_uom') },
      ],
    },
  ];
}
