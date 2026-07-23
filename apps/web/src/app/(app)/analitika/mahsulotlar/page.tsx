'use client';

import { api } from '@/lib/api-client';
import {
  Button,
  Input,
  NativeSelect,
  StickyHScroll,
  Switch,
  useConfirm,
  useDebounce,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { type ItemGroupNode, type TreeNode, buildTree, flattenForRender } from './_lib/group-tree';

interface ItemRow {
  id: string;
  code: string | null;
  name: string;
  unitName: string | null;
  groupId: string | null;
  groupName: string | null;
  country: string | null;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  soldQty: number;
  soldInPeriod: number;
  lastPartnerName: string | null;
}
interface ItemsResponse {
  items: ItemRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
interface ItemsStatsData {
  totalItems: number;
  lowStockCount: number;
  noPartnerCount: number;
}
interface GroupsResponse {
  groups: ItemGroupNode[];
}

type Sort = 'name' | 'code' | 'stock' | 'soldQty' | 'sellPrice';
type Order = 'asc' | 'desc';

const PAGE_SIZE = 50;

function fmtMoney(minor: number): string {
  return `${(minor / 100).toLocaleString('ru-RU')} so'm`;
}
function fmtQty(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
function stockClass(stock: number): string {
  if (stock < 0) return 'text-[var(--ms-destructive-500)]';
  if (stock === 0) return 'text-amber-600';
  return 'text-emerald-600';
}

export default function AnalitikaProductsPage() {
  const t = useTranslations('pages.analitika_products');
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 300);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('name');
  const [order, setOrder] = useState<Order>('asc');
  const [lowStock, setLowStock] = useState(false);
  const [noPartner, setNoPartner] = useState(false);
  const [onlyInCart, setOnlyInCart] = useState(false);
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Cart-aware filter params for both list + stats.
  const cartIds = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([id]) => id),
    [cart],
  );

  // Reset to page 1 when any filter changes (matches reference behaviour).
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps trigger the reset; body does not read them.
  useEffect(() => {
    setPage(1);
  }, [search, groupId, sort, order, lowStock, noPartner, onlyInCart]);

  const listParams = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(groupId ? { groupId } : {}),
    sort,
    order,
    ...(lowStock ? { lowStock: 'true' } : {}),
    ...(noPartner ? { noPartner: 'true' } : {}),
    ...(onlyInCart && cartIds.length > 0
      ? { onlyInCart: 'true', inCartIds: cartIds.join(',') }
      : {}),
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const { data, isLoading, isFetching } = useQuery<ItemsResponse>({
    queryKey: ['analitika', 'items', listParams.toString()],
    queryFn: () => api.get<ItemsResponse>(`/analitika/items?${listParams.toString()}`),
    placeholderData: (prev) => prev,
  });
  const items = data?.items ?? [];
  const pg = data;

  const statsParams = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(groupId ? { groupId } : {}),
    ...(onlyInCart && cartIds.length > 0
      ? { onlyInCart: 'true', inCartIds: cartIds.join(',') }
      : {}),
  });
  const statsQuery = useQuery<ItemsStatsData>({
    queryKey: ['analitika', 'items-stats', statsParams.toString()],
    queryFn: () => api.get<ItemsStatsData>(`/analitika/items/stats?${statsParams.toString()}`),
  });

  const groupsQuery = useQuery<GroupsResponse>({
    queryKey: ['analitika', 'items-groups'],
    queryFn: () => api.get<GroupsResponse>('/analitika/items/groups'),
    staleTime: 5 * 60 * 1000,
  });
  const tree = useMemo(() => buildTree(groupsQuery.data?.groups ?? []), [groupsQuery.data?.groups]);

  // ---- Cart derivations ----
  const cartCount = cartIds.length;
  const cartTotalMinor = items.reduce((acc, it) => acc + (cart[it.id] ?? 0) * it.buyPrice, 0);

  const createOrder = useMutation({
    mutationFn: () =>
      api.post<{ id: string; number: string }>('/analitika/orders', {
        lines: Object.entries(cart)
          .filter(([, q]) => q > 0)
          .map(([productId, qty]) => ({ productId, qty })),
      }),
    onSuccess: (created) => {
      setCart({});
      qc.invalidateQueries({ queryKey: ['analitika', 'orders'] });
      if (created?.id) router.push(`/analitika/buyurtmalar/${created.id}`);
    },
  });

  const handleClear = async () => {
    if (cartCount === 0) return;
    const ok = await confirm({
      title: t('clear'),
      description: t('clear_confirm'),
      confirmLabel: t('clear'),
      tone: 'destructive',
    });
    if (ok) setCart({});
  };

  const setQty = (productId: string, value: string) => {
    const n = Number(value);
    setCart((prev) => ({ ...prev, [productId]: Number.isFinite(n) && n > 0 ? n : 0 }));
  };

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4 p-6 pb-28">
      <div>
        <h1 className="font-bold text-2xl text-[var(--ms-text-primary)] tracking-tight">
          {t('title')}
        </h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
      </div>

      {/* Stats KPI bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t('kpi_total')} value={String(statsQuery.data?.totalItems ?? 0)} />
        <Kpi
          label={t('kpi_low_stock')}
          value={String(statsQuery.data?.lowStockCount ?? 0)}
          tone="text-amber-600"
        />
        <Kpi
          label={t('kpi_no_partner')}
          value={String(statsQuery.data?.noPartnerCount ?? 0)}
          tone="text-[var(--ms-destructive-500)]"
        />
        <Kpi
          label={t('kpi_in_cart')}
          value={String(cartCount)}
          tone="text-[var(--ms-text-brand)]"
        />
      </div>

      {/* Toolbar */}
      <div className="rounded-lg border border-[var(--ms-border)] bg-white p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] lg:items-end">
          <div className="space-y-1.5">
            <label
              htmlFor="items-search"
              className="block font-medium text-[var(--ms-text-primary)] text-xs"
            >
              {t('search_ph')}
            </label>
            <Input
              id="items-search"
              value={searchInput}
              placeholder={t('search_ph')}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="items-sort"
              className="block font-medium text-[var(--ms-text-primary)] text-xs"
            >
              {t('sort_label')}
            </label>
            <NativeSelect
              id="items-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="name">{t('sort_name')}</option>
              <option value="code">{t('sort_code')}</option>
              <option value="stock">{t('sort_stock')}</option>
              <option value="soldQty">{t('sort_sold')}</option>
              <option value="sellPrice">{t('sort_price')}</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <span className="block font-medium text-[var(--ms-text-primary)] text-xs">↑↓</span>
            <NativeSelect value={order} onChange={(e) => setOrder(e.target.value as Order)}>
              <option value="asc">{t('order_asc')}</option>
              <option value="desc">{t('order_desc')}</option>
            </NativeSelect>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ToggleLabel
              id="items-low"
              checked={lowStock}
              onChange={setLowStock}
              label={t('filter_low_stock')}
            />
            <ToggleLabel
              id="items-nop"
              checked={noPartner}
              onChange={setNoPartner}
              label={t('filter_no_partner')}
            />
            <ToggleLabel
              id="items-cart"
              checked={onlyInCart}
              onChange={setOnlyInCart}
              label={t('filter_in_cart')}
            />
          </div>
        </div>
      </div>

      <p className="text-[var(--ms-text-muted)] text-xs">
        {isLoading
          ? t('loading')
          : pg
            ? `${t('total_count', { total: pg.total })}${isFetching ? ' …' : ''}`
            : ''}
      </p>

      {/* Layout: tree sidebar + items table */}
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Group tree sidebar (lg+) */}
        <aside className="hidden rounded-lg border border-[var(--ms-border)] bg-white p-3 lg:block">
          <h3 className="mb-2 font-semibold text-[var(--ms-text-primary)] text-xs uppercase tracking-wider">
            {t('groups_title')}
          </h3>
          <button
            type="button"
            onClick={() => setGroupId(null)}
            className={`block w-full rounded px-2 py-1 text-left text-sm ${
              groupId === null
                ? 'bg-[var(--ms-text-brand)]/10 font-semibold text-[var(--ms-text-brand)]'
                : 'text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-subtle)]'
            }`}
          >
            {t('all_groups')}
          </button>
          <ul className="mt-1 space-y-0.5">
            {flattenForRender(tree, expanded).map(({ node, depth }) => (
              <TreeRow
                key={node.key}
                node={node}
                depth={depth}
                active={node.groupId !== null && groupId === node.groupId}
                isExpanded={expanded.has(node.key)}
                onToggle={() => toggleExpanded(node.key)}
                onSelect={() => node.groupId && setGroupId(node.groupId)}
              />
            ))}
          </ul>
        </aside>

        {/* Items table */}
        <StickyHScroll className="rounded-lg border border-[var(--ms-border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs uppercase">
              <tr>
                <th className="w-20 px-3 py-2 text-left font-semibold">{t('col_code')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('col_product')}</th>
                <th className="w-32 px-3 py-2 text-left font-semibold">{t('col_group')}</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">{t('col_buy_price')}</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">{t('col_sell_price')}</th>
                <th className="w-24 px-3 py-2 text-right font-semibold">{t('col_stock')}</th>
                <th className="w-24 px-3 py-2 text-right font-semibold">{t('col_sold')}</th>
                <th className="w-40 px-3 py-2 text-left font-semibold">{t('col_last_supplier')}</th>
                <th className="w-32 px-3 py-2 text-center font-semibold">{t('col_qty')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ms-border)]">
              {items.map((row) => {
                const qty = cart[row.id] ?? 0;
                const isActive = qty > 0;
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-[var(--ms-bg-subtle)] ${isActive ? 'bg-[var(--ms-text-brand)]/5' : ''}`}
                  >
                    <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                      {row.code ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--ms-text-primary)]">{row.name}</div>
                      {row.unitName && (
                        <div className="text-[10px] text-[var(--ms-text-muted)]">
                          {row.unitName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {row.groupName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(row.buyPrice)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600 tabular-nums">
                      {fmtMoney(row.sellPrice)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${stockClass(row.stock)}`}
                    >
                      {fmtQty(row.stock)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                      {fmtQty(row.soldQty)}
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {row.lastPartnerName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Input
                        type="number"
                        value={qty === 0 ? '' : String(qty)}
                        placeholder="0"
                        onChange={(e) => setQty(row.id, e.target.value)}
                        className="mx-auto w-24 text-right"
                      />
                    </td>
                  </tr>
                );
              })}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-[var(--ms-text-muted)]">
                    {t('no_products')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </StickyHScroll>
      </div>

      {/* Pagination */}
      {pg && pg.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            disabled={isFetching || page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-[var(--ms-border)] bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            ← {t('prev_page')}
          </button>
          <span className="text-[var(--ms-text-muted)] text-xs">
            {t('page_of', { page: pg.page, total: pg.totalPages })}
          </span>
          <button
            type="button"
            disabled={isFetching || page >= pg.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-[var(--ms-border)] bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t('next_page')} →
          </button>
        </div>
      )}

      {/* Sticky cart bar */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-[var(--ms-border)] border-t bg-white px-6 py-3 shadow-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <span className="text-[var(--ms-text-primary)] text-sm">
              {t('cart_summary', { count: cartCount, sum: fmtMoney(cartTotalMinor) })}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleClear} disabled={createOrder.isPending}>
                {t('clear')}
              </Button>
              <Button onClick={() => createOrder.mutate()} disabled={createOrder.isPending}>
                {t('form_order')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[var(--ms-border)] bg-white p-3">
      <div className="text-[10px] text-[var(--ms-text-muted)] uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`mt-1 font-semibold text-lg tabular-nums ${tone ?? 'text-[var(--ms-text-primary)]'}`}
      >
        {value}
      </div>
    </div>
  );
}

function ToggleLabel({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <label htmlFor={id} className="cursor-pointer text-[var(--ms-text-muted)] text-xs">
        {label}
      </label>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  active,
  isExpanded,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  active: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded px-1 py-1 text-sm ${
          active
            ? 'bg-[var(--ms-text-brand)]/10 font-semibold text-[var(--ms-text-brand)]'
            : 'text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-subtle)]'
        }`}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            className="w-4 shrink-0 text-[var(--ms-text-muted)] text-xs"
            aria-label={isExpanded ? 'collapse' : 'expand'}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={onSelect}
          disabled={node.groupId === null}
          className="flex-1 truncate text-left disabled:cursor-default"
          title={node.label}
        >
          {node.label}
        </button>
        <span className="text-[10px] text-[var(--ms-text-muted)] tabular-nums">
          {node.itemCount}
        </span>
      </div>
    </li>
  );
}
