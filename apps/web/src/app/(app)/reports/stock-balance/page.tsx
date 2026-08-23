'use client';

import { TruncatedNotice } from '@/components/reports/report-notices';
import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Checkbox,
  Container,
  Icons,
  Input,
  NativeSelect,
  PageHeader,
  StickyHScroll,
  buildCsv,
  csvTimestamp,
  downloadCsv,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type GroupBy = 'none' | 'product' | 'warehouse';

interface StockBalanceRow {
  storeId: string | null;
  storeName: string | null;
  assortmentKind: string;
  assortmentId: string;
  productName: string;
  productCode: string | null;
  productUom: string | null;
  qty: string;
  reservedQty: string;
  inTransitQty: string;
  available: string;
}

interface StockBalanceReport {
  filter: { storeId?: string; groupBy: GroupBy };
  items: StockBalanceRow[];
  total: number;
  /**
   * `PERF-10` (Faza 27a) — the query hit `PRODUCT_SEARCH_CAP`/page cap and the
   * rows below are a PREFIX of the real answer. Reading it is the whole point:
   * a truncated list that says nothing is indistinguishable from a complete one.
   */
  truncated: boolean;
  summaries: {
    totalSku: number;
    totalQty: string;
    totalReserved: string;
    totalInTransit: string;
    totalAvailable: string;
  };
  /**
   * F1 (2026-08-23): `groupBy=warehouse` — yacheyka kodi prefiksi bo'yicha
   * ombor kesimi. Raqamlar sahifalanmagan to'liq DB agregatlari:
   * Σrows.qty + unassigned.qty == totalQty (JAMI).
   */
  warehouses?: {
    rows: Array<{ prefix: string | null; skuCount: number; qty: string }>;
    unassigned: { skuCount: number; qty: string };
    totalQty: string;
    totalSku: number;
  };
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
  // Drop trailing zeros, keep up to 3 decimals
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

export default function StockBalanceReportPage() {
  const t = useTranslations('pages.report_stock_balance');
  const tParent = useTranslations('pages.reports');

  const [storeId, setStoreId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [appliedFilter, setAppliedFilter] = useState({ storeId, search, hideEmpty, groupBy });

  const { data: stores } = useQuery<{ items: StoreRef[] }>({
    queryKey: ['stores-active'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/stores?archived=false&limit=50'),
  });

  const { data, isLoading, error, refetch } = useQuery<StockBalanceReport>({
    queryKey: ['report-stock-balance', appliedFilter],
    queryFn: () => {
      const qs = new URLSearchParams({
        groupBy: appliedFilter.groupBy,
        ...(appliedFilter.storeId ? { storeId: appliedFilter.storeId } : {}),
        ...(appliedFilter.search ? { search: appliedFilter.search } : {}),
        ...(appliedFilter.hideEmpty ? { hideEmpty: 'true' } : {}),
        limit: '500',
      });
      return api.get<StockBalanceReport>(`/reports/stock-balance?${qs.toString()}`);
    },
  });

  const apply = () => {
    setAppliedFilter({ storeId, search, hideEmpty, groupBy });
  };

  // F1: prefiks qatori uchun ko'rinadigan yorliq («Ombor 01» / «Prefikssiz»).
  const warehouseLabel = (prefix: string | null) =>
    prefix !== null ? t('warehouse_row', { prefix }) : t('no_prefix');

  const exportCsv = () => {
    if (!data) return;
    if (appliedFilter.groupBy === 'warehouse' && data.warehouses) {
      const wh = data.warehouses;
      const rows = [
        ...wh.rows.map((r) => ({ label: warehouseLabel(r.prefix), sku: r.skuCount, qty: r.qty })),
        { label: t('unassigned'), sku: wh.unassigned.skuCount, qty: wh.unassigned.qty },
        { label: t('grand_total'), sku: wh.totalSku, qty: wh.totalQty },
      ];
      const csv = buildCsv<(typeof rows)[number]>(
        [
          { header: t('store'), cellText: (r) => r.label },
          { header: t('sku_count'), cellText: (r) => String(r.sku) },
          { header: t('qty'), cellText: (r) => fmtQty(r.qty) },
        ],
        rows,
      );
      downloadCsv(csv, `stock-balance-warehouses-${csvTimestamp()}.csv`);
      return;
    }
    const csv = buildCsv<StockBalanceRow>(
      [
        { header: t('store'), cellText: (r) => r.storeName ?? '—' },
        { header: t('product'), cellText: (r) => r.productName },
        { header: t('code'), cellText: (r) => r.productCode ?? '' },
        { header: t('uom'), cellText: (r) => r.productUom ?? '' },
        { header: t('qty'), cellText: (r) => fmtQty(r.qty) },
        { header: t('reserved'), cellText: (r) => fmtQty(r.reservedQty) },
        { header: t('in_transit'), cellText: (r) => fmtQty(r.inTransitQty) },
        { header: t('available'), cellText: (r) => fmtQty(r.available) },
      ],
      data.items,
    );
    downloadCsv(csv, `stock-balance-${csvTimestamp()}.csv`);
  };

  return (
    <Container size="md" className="py-4">
      <PageHeader
        title={t('title')}
        breadcrumbs={
          <Breadcrumb
            items={[{ label: tParent('title'), href: '/reports' }, { label: t('title') }]}
          />
        }
        actions={
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data}>
            <Icons.download className="h-4 w-4" />
            {t('export_csv')}
          </Button>
        }
      />

      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-5" data-test-id="filter-bar">
          <div>
            <label
              htmlFor="sb-store"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('store')}
            </label>
            <NativeSelect
              id="sb-store"
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
          <div className="md:col-span-2">
            <label
              htmlFor="sb-search"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('search_placeholder')}
            </label>
            <Input
              id="sb-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_placeholder')}
              data-test-id="filter-search"
            />
          </div>
          <div>
            <label
              htmlFor="sb-group-by"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('group_by')}
            </label>
            <NativeSelect
              id="sb-group-by"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className={SELECT_CLASS}
              data-test-id="filter-group-by"
            >
              <option value="none">{t('groups.none')}</option>
              <option value="product">{t('groups.product')}</option>
              <option value="warehouse">{t('groups.warehouse')}</option>
            </NativeSelect>
          </div>
          <Button onClick={apply} loading={isLoading} data-test-id="apply-button">
            {t('apply')}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="hideEmpty"
            className="inline-flex cursor-pointer items-center gap-2 text-sm"
          >
            <Checkbox
              id="hideEmpty"
              checked={hideEmpty}
              onCheckedChange={(v) => setHideEmpty(!!v)}
              data-test-id="filter-hide-empty"
            />
            <span>{t('hide_empty')}</span>
          </label>
        </div>
      </div>

      {/* F1: ombor-kesim rejimi — plitkalar Ombor 01 / 02 / … / Taqsimlanmagan /
        JAMI (to'liq DB agregatlari, sahifalanmagan). */}
      {data?.warehouses && appliedFilter.groupBy === 'warehouse' && (
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5" data-test-id="warehouse-tiles">
          {[
            ...data.warehouses.rows.map((r) => ({
              label: warehouseLabel(r.prefix),
              value: fmtQty(r.qty),
            })),
            { label: t('unassigned'), value: fmtQty(data.warehouses.unassigned.qty) },
            { label: t('grand_total'), value: fmtQty(data.warehouses.totalQty) },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2"
            >
              <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {s.label}
              </div>
              <div className="font-semibold text-base tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {data && appliedFilter.groupBy !== 'warehouse' && (
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            { label: t('totals_sku'), value: String(data.summaries.totalSku) },
            { label: t('totals_qty'), value: fmtQty(data.summaries.totalQty) },
            { label: t('totals_reserved'), value: fmtQty(data.summaries.totalReserved) },
            { label: t('totals_in_transit'), value: fmtQty(data.summaries.totalInTransit) },
            { label: t('totals_available'), value: fmtQty(data.summaries.totalAvailable) },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2"
            >
              <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {s.label}
              </div>
              <div className="font-semibold text-base tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <TruncatedNotice truncated={data?.truncated} testId="sb-truncated-warn" />

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

      {/* F1: ombor-kesim jadvali — Ombor | SKU soni | Qoldiq, oxirida JAMI. */}
      {data?.warehouses && appliedFilter.groupBy === 'warehouse' && (
        <StickyHScroll className="mt-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="h-9 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('store')}
                </th>
                <th className="h-9 w-32 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('sku_count')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('qty')}
                </th>
              </tr>
            </thead>
            <tbody data-test-id="warehouse-rows">
              {data.warehouses.rows.map((r) => (
                <tr
                  key={r.prefix ?? 'no-prefix'}
                  className="border-[var(--ms-border-default)] border-t"
                  data-test-id="warehouse-row"
                >
                  <td className="px-3 py-2 font-medium">{warehouseLabel(r.prefix)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.skuCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtQty(r.qty)}</td>
                </tr>
              ))}
              <tr
                className="border-[var(--ms-border-default)] border-t"
                data-test-id="warehouse-unassigned-row"
              >
                <td className="px-3 py-2 font-medium">{t('unassigned')}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {data.warehouses.unassigned.skuCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtQty(data.warehouses.unassigned.qty)}
                </td>
              </tr>
              <tr
                className="border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)]"
                data-test-id="warehouse-total-row"
              >
                <td className="px-3 py-2 font-semibold">{t('grand_total')}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {data.warehouses.totalSku}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {fmtQty(data.warehouses.totalQty)}
                </td>
              </tr>
            </tbody>
          </table>
        </StickyHScroll>
      )}

      {data && appliedFilter.groupBy !== 'warehouse' && (
        <StickyHScroll className="mt-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                {appliedFilter.groupBy === 'none' && (
                  <th className="h-9 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('store')}
                  </th>
                )}
                <th className="h-9 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('product')}
                </th>
                <th className="h-9 w-32 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('code')}
                </th>
                <th className="h-9 w-20 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('uom')}
                </th>
                <th className="h-9 w-28 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('qty')}
                </th>
                <th className="h-9 w-28 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('reserved')}
                </th>
                <th className="h-9 w-28 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('in_transit')}
                </th>
                <th className="h-9 w-28 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('available')}
                </th>
              </tr>
            </thead>
            <tbody data-test-id="report-rows">
              {data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={appliedFilter.groupBy === 'none' ? 8 : 7}
                    className="px-3 py-12 text-center text-[var(--ms-text-muted)] text-sm"
                    data-test-id="report-empty"
                  >
                    {t('empty_state')}
                  </td>
                </tr>
              ) : (
                data.items.map((row, idx) => (
                  <tr
                    key={`${row.storeId ?? '-'}::${row.assortmentId}::${idx}`}
                    className="border-[var(--ms-border-default)] border-t"
                  >
                    {appliedFilter.groupBy === 'none' && (
                      <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                        {row.storeName ?? '—'}
                      </td>
                    )}
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
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {row.productUom ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.qty)}</td>
                    <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                      {fmtQty(row.reservedQty)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                      {fmtQty(row.inTransitQty)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {fmtQty(row.available)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </StickyHScroll>
      )}
    </Container>
  );
}
