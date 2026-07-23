'use client';

import { api } from '@/lib/api-client';
import {
  Button,
  Icons,
  Input,
  NativeSelect,
  StickyHScroll,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatIso,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';

interface TurnoverRow {
  assortmentKind: string;
  assortmentId: string;
  productName: string;
  productCode: string | null;
  productArticle: string | null;
  productUom: string | null;
  openingQty: string;
  openingSumMinor: string;
  incomeQty: string;
  incomeSumMinor: string;
  outcomeQty: string;
  outcomeSumMinor: string;
  closingQty: string;
  closingSumMinor: string;
}

interface TurnoverReport {
  filter: { dateFrom: string; dateTo: string; storeId?: string; search?: string };
  items: TurnoverRow[];
  total: number;
  summaries: Omit<
    TurnoverRow,
    | 'assortmentKind'
    | 'assortmentId'
    | 'productName'
    | 'productCode'
    | 'productArticle'
    | 'productUom'
  >;
  currency: string;
}

interface StoreRef {
  id: string;
  name: string;
}

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

function fmtQty(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

/** Minor units (string) → major, ru-RU grouped with 2 decimals (e.g. "3 600 551 009,40"). */
function fmtMoney(minor: string): string {
  const n = Number(minor) / 100;
  if (!Number.isFinite(n)) return minor;
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function firstOfMonthISO(): string {
  const now = new Date();
  return formatIso(new Date(now.getFullYear(), now.getMonth(), 1));
}
function todayISO(): string {
  return formatIso(new Date());
}

export default function TurnoverReportPage() {
  const t = useTranslations('pages.turnover');

  const [dateFrom, setDateFrom] = useState(firstOfMonthISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [storeId, setStoreId] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState({ dateFrom, dateTo, storeId, search });

  const { data: stores } = useQuery<{ items: StoreRef[] }>({
    queryKey: ['stores-active'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/stores?archived=false&limit=50'),
  });

  const { data, isLoading, error, refetch } = useQuery<TurnoverReport>({
    queryKey: ['report-turnover', applied],
    queryFn: () => {
      const qs = new URLSearchParams({
        dateFrom: applied.dateFrom,
        dateTo: applied.dateTo,
        ...(applied.storeId ? { storeId: applied.storeId } : {}),
        ...(applied.search ? { search: applied.search } : {}),
        limit: '500',
      });
      return api.get<TurnoverReport>(`/reports/turnover?${qs.toString()}`);
    },
  });

  const apply = () => setApplied({ dateFrom, dateTo, storeId, search });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv<TurnoverRow>(
      [
        { header: t('product'), cellText: (r) => r.productName },
        { header: t('code'), cellText: (r) => r.productCode ?? '' },
        { header: t('article'), cellText: (r) => r.productArticle ?? '' },
        { header: t('uom'), cellText: (r) => r.productUom ?? '' },
        { header: `${t('opening')} ${t('qty')}`, cellText: (r) => fmtQty(r.openingQty) },
        { header: `${t('opening')} ${t('sum')}`, cellText: (r) => fmtMoney(r.openingSumMinor) },
        { header: `${t('income')} ${t('qty')}`, cellText: (r) => fmtQty(r.incomeQty) },
        { header: `${t('income')} ${t('sum')}`, cellText: (r) => fmtMoney(r.incomeSumMinor) },
        { header: `${t('outcome')} ${t('qty')}`, cellText: (r) => fmtQty(r.outcomeQty) },
        { header: `${t('outcome')} ${t('sum')}`, cellText: (r) => fmtMoney(r.outcomeSumMinor) },
        { header: `${t('closing')} ${t('qty')}`, cellText: (r) => fmtQty(r.closingQty) },
        { header: `${t('closing')} ${t('sum')}`, cellText: (r) => fmtMoney(r.closingSumMinor) },
      ],
      data.items,
    );
    downloadCsv(csv, `turnover-${csvTimestamp()}.csv`);
  };

  const groupHead =
    'h-8 px-3 text-center font-semibold text-[var(--ms-text-primary)] text-xs border-[var(--ms-border-default)] border-l';
  const subHead =
    'h-8 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide';
  const sums = data?.summaries;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-semibold text-2xl text-[var(--ms-text-primary)]">{t('title')}</h1>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data}>
          <Icons.download className="h-4 w-4" />
          {t('export_csv')}
        </Button>
      </div>

      {/* Filter bar */}
      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-5" data-test-id="filter-bar">
          <div>
            <label
              htmlFor="t-from"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_from')}
            </label>
            <Input
              id="t-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-test-id="filter-date-from"
            />
          </div>
          <div>
            <label
              htmlFor="t-to"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_to')}
            </label>
            <Input
              id="t-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-test-id="filter-date-to"
            />
          </div>
          <div>
            <label
              htmlFor="t-store"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('store')}
            </label>
            <NativeSelect
              id="t-store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className={SELECT_CLASS}
              data-test-id="filter-store"
            >
              <option value="">{t('all_stores')}</option>
              {stores?.items?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="t-search"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('search')}
            </label>
            <Input
              id="t-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-test-id="filter-search"
            />
          </div>
          <Button onClick={apply} loading={isLoading} data-test-id="apply-button">
            {t('apply')}
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="mt-4 rounded border border-[var(--ms-border-destructive,#fecaca)] bg-[var(--ms-bg-destructive-soft,#fef2f2)] px-3 py-2 text-[var(--ms-text-destructive)] text-sm"
          role="alert"
        >
          {(error as Error).message}
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-2">
            ↻
          </Button>
        </div>
      )}

      {data && (
        <StickyHScroll className="mt-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th
                  rowSpan={2}
                  className="h-8 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
                >
                  {t('product')}
                </th>
                <th
                  rowSpan={2}
                  className="h-8 w-24 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
                >
                  {t('code')}
                </th>
                <th
                  rowSpan={2}
                  className="h-8 w-24 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
                >
                  {t('article')}
                </th>
                <th
                  rowSpan={2}
                  className="h-8 w-16 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
                >
                  {t('uom')}
                </th>
                <th colSpan={2} className={groupHead}>
                  {t('opening')}
                </th>
                <th colSpan={2} className={groupHead}>
                  {t('income')}
                </th>
                <th colSpan={2} className={groupHead}>
                  {t('outcome')}
                </th>
                <th colSpan={2} className={groupHead}>
                  {t('closing')}
                </th>
              </tr>
              <tr>
                {['opening', 'income', 'outcome', 'closing'].map((g) => (
                  <Fragment key={g}>
                    <th className={`${subHead} border-[var(--ms-border-default)] border-l`}>
                      {t('qty')}
                    </th>
                    <th className={subHead}>{t('sum')}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody data-test-id="report-rows">
              {data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-3 py-12 text-center text-[var(--ms-text-muted)] text-sm"
                    data-test-id="report-empty"
                  >
                    {t('empty_state')}
                  </td>
                </tr>
              ) : (
                data.items.map((row, idx) => (
                  <tr
                    key={`${row.assortmentId}::${idx}`}
                    className="border-[var(--ms-border-default)] border-t"
                  >
                    <td className="px-3 py-2 font-medium">
                      <a
                        href={`/products/${row.assortmentId}`}
                        className="underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
                      >
                        {row.productName}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                      {row.productCode ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                      {row.productArticle ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {row.productUom ?? '—'}
                    </td>
                    <td className="border-[var(--ms-border-default)] border-l px-3 py-2 text-right tabular-nums">
                      {fmtQty(row.openingQty)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                      {fmtMoney(row.openingSumMinor)}
                    </td>
                    <td className="border-[var(--ms-border-default)] border-l px-3 py-2 text-right tabular-nums">
                      {fmtQty(row.incomeQty)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                      {fmtMoney(row.incomeSumMinor)}
                    </td>
                    <td className="border-[var(--ms-border-default)] border-l px-3 py-2 text-right tabular-nums">
                      {fmtQty(row.outcomeQty)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                      {fmtMoney(row.outcomeSumMinor)}
                    </td>
                    <td className="border-[var(--ms-border-default)] border-l px-3 py-2 text-right font-medium tabular-nums">
                      {fmtQty(row.closingQty)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {fmtMoney(row.closingSumMinor)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {sums && data.items.length > 0 && (
              <tfoot className="border-[var(--ms-border-strong)] border-t-2 bg-[var(--ms-bg-muted)] font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={4}>
                    {t('totals')}
                  </td>
                  <td className="border-[var(--ms-border-default)] border-l px-3 py-2 text-right tabular-nums">
                    {fmtQty(sums.openingQty)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(sums.openingSumMinor)}
                  </td>
                  <td className="border-[var(--ms-border-default)] border-l px-3 py-2 text-right tabular-nums">
                    {fmtQty(sums.incomeQty)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(sums.incomeSumMinor)}
                  </td>
                  <td className="border-[var(--ms-border-default)] border-l px-3 py-2 text-right tabular-nums">
                    {fmtQty(sums.outcomeQty)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(sums.outcomeSumMinor)}
                  </td>
                  <td className="border-[var(--ms-border-default)] border-l px-3 py-2 text-right tabular-nums">
                    {fmtQty(sums.closingQty)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(sums.closingSumMinor)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </StickyHScroll>
      )}
    </div>
  );
}
