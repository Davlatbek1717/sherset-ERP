'use client';

import { ColumnSettings } from '@/components/column-settings';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { resolveDefaultSalePrice } from '@/lib/sale-price';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  NativeSelect,
  type PickerItem,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Characteristic {
  name: string;
  value: string;
}

interface Variant {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  characteristics: Characteristic[];
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  buyPrice: string | null;
  archived: boolean;
  product: { id: string; name: string; uom: string | null; vat: number | null };
}

interface VariantListResponse {
  items: Variant[];
  nextCursor?: string;
  total: number;
}

function getDefaultSalePrice(v: Variant): string | null {
  return resolveDefaultSalePrice(v.salePrices);
}

const LIMIT = 25;

export default function VariantsPage() {
  const t = useTranslations('pages.variants');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'product'>(null);
  const [productFilter, setProductFilter] = useState<{ id?: string; label?: string }>({});

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(productFilter.id ? { productId: productFilter.id } : {}),
  });

  const listQueryKey = [
    'variants',
    search,
    archived,
    cursor,
    sortKey,
    sortDir,
    productFilter.id,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<VariantListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<VariantListResponse>(`/variants?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('variants', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
  });
  const cols = useColumnVisibility('variants', [
    'name',
    'code',
    'barcode',
    'characteristics',
    'product',
    'price',
  ]);
  const colWidths = useColumnWidths('variants');

  // Parity finding (2026-05-30): moysklad has NO standalone variant list —
  // `#variant` resolves to the sector onboarding splash; modifications live as
  // the «Модификации» sub-tab of the Товар card (and as child rows in `#good`).
  // So this standalone page deliberately gets NO catalog «Изменить»/«Печать»
  // dropdowns: unlike services/bundles (which ARE products served by
  // /products/bulk-*), variants are a separate `Variant` entity with their own
  // /variants/bulk-* endpoints — the assortment dropdown (POSTs to
  // /products/bulk-*) would be wrong here. We keep moyskladToolbar + Фильтр
  // panel + bulk delete/archive (via /variants/bulk-*) only. Full rationale +
  // evidence: docs/moysklad-reference/variants/FINDING.md.
  //
  // moyskladToolbar + Фильтр panel chrome (shared catalog chrome), not
  // active/archive pill sub-tabs. Mahsulot/Holat filtering is the inline panel
  // below, backed by VariantFilterSchema (productId/archived/search). No
  // SavedFiltersPills — not FilterDrawerValues-shaped, a saved-filter row
  // would be a no-op.
  //
  // moysklad parity (D6 audit, 2026-05-28): Variants intentionally have
  // a SMALLER filter set than the products D2 panel — the Variant Prisma
  // model has no ownerId / supplierId / productFolderId / country /
  // trackingType / minimumBalance column, so those fields are SKIPPED
  // (would be dead controls). The 04-module reference DOM was unreliable
  // on prior audits (D1/D2/D3 mislabels), so this falls back to the
  // well-known moysklad set scoped to schema-backed columns:
  //   1. Основной товар  → productId        (CatalogPicker via /products)
  //   2. Состояние (Архив) → archived       (active/archived select)
  // «Ниже минимума» is intentionally NOT offered: Variant has minimumBalanceMinor
  // but no denormalized stock column, so `stockMinor < minimumBalanceMinor` cannot
  // be expressed in a VariantWhereInput. The old control built `where.stockMinor`
  // (a non-existent column) → GET /variants 500. moysklad has no standalone
  // variant list, so there is no parity requirement; a re-order view would need a
  // Stock-ledger aggregation (future feature).
  // SKIPPED — no backing column on Variant in packages/db/prisma:
  //   - Владелец (ownerId)            — not on Variant
  //   - Группа товаров (productFolderId) — inherited via parent; filter
  //     via Основной товар instead
  //   - Поставщик (supplierId)        — not on Variant (inherited)
  //   - Страна (country)              — not on Variant (inherited)
  //   - Тип учёта (trackingType)      — not on Variant (inherited)

  const columns: DataTableColumn<Variant>[] = [
    {
      key: 'name',
      header: tFields('name'),
      sortable: true,
      cell: (v) => (
        <a
          href={`/variants/${v.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {v.name}
        </a>
      ),
      cellText: (v) => v.name,
    },
    {
      key: 'code',
      header: tFields('code'),
      width: '140px',
      sortable: true,
      cell: (v) => <span className="text-[var(--ms-text-muted)] text-xs">{v.code ?? '—'}</span>,
      cellText: (v) => v.code ?? '',
    },
    {
      key: 'barcode',
      header: t('barcode'),
      width: '140px',
      cell: (v) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {v.barcode ?? '—'}
        </span>
      ),
      cellText: (v) => v.barcode ?? '',
    },
    {
      key: 'characteristics',
      header: t('characteristics'),
      cell: (v) => (
        <div className="flex flex-wrap gap-1">
          {v.characteristics.map((c) => (
            <Badge key={c.name} tone="neutral">
              {c.name}: {c.value}
            </Badge>
          ))}
        </div>
      ),
      cellText: (v) => v.characteristics.map((c) => `${c.name}: ${c.value}`).join('; '),
    },
    {
      key: 'product',
      header: t('parent_product'),
      cell: (v) => (
        <a
          href={`/products/${v.product.id}`}
          className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
        >
          {v.product.name}
        </a>
      ),
      cellText: (v) => v.product.name,
    },
    {
      key: 'price',
      header: tFields('price'),
      align: 'right',
      width: '160px',
      cell: (v) => {
        const price = getDefaultSalePrice(v);
        return (
          <span className="font-medium tabular-nums">
            {price ? (
              formatMoney(price, 'UZS', { displayAs: 'none' })
            ) : (
              <span className="text-[var(--ms-text-muted)]">—</span>
            )}
          </span>
        );
      },
      cellText: (v) => {
        const p = getDefaultSalePrice(v);
        return p ? formatMoney(p, 'UZS', { displayAs: 'none' }) : '';
      },
    },
  ];

  const hasActiveFilter = !!search || archived === 'archived' || !!productFilter.id;

  return (
    <>
      <ListView
        testId="variants-page"
        moyskladToolbar
        title={t('title')}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        createHref="/variants/new"
        createLabel={t('create_button')}
        createPosition="start"
        onRefresh={() => refetch()}
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(v) => `variant-row-${v.id}`}
        rowActions={(v) => bulk.rowDelete(v.id)}
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={!!data?.nextCursor}
        hasPrevious={!!cursor}
        onNext={() => setCursor(data?.nextCursor)}
        onPrevious={() => setCursor(undefined)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={search ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasActiveFilter}
        {...bulk.listViewProps}
        selectionCount={bulk.selectedIds.size}
        editMenu={bulk.editMenu}
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setArchived('active');
              setProductFilter({});
              setCursor(undefined);
            }}
            testId="variants-inline-filter"
          >
            <InlineFilterPanel.Field label={t('parent_product')} expandable>
              <CatalogPickerField
                value={
                  productFilter.id
                    ? { id: productFilter.id, label: productFilter.label ?? productFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('product')}
                onClear={() => {
                  setProductFilter({});
                  setCursor(undefined);
                }}
                testId="filter-product"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFields('state')} expandable>
              <NativeSelect
                value={archived}
                onChange={(e) => {
                  setArchived(e.target.value as 'active' | 'archived');
                  setCursor(undefined);
                }}
                data-test-id="filter-archived"
              >
                <option value="active">{tCommon('active')}</option>
                <option value="archived">{tCommon('archived')}</option>
              </NativeSelect>
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
        headerEndSlot={
          <ColumnSettings
            columns={columns.map((c) => ({
              key: c.key,
              label: c.header,
              alwaysVisible: c.key === 'name',
            }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
      />
      <CatalogPicker
        open={pickerOpen === 'product'}
        onClose={() => setPickerOpen(null)}
        title={t('parent_product')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/products?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setProductFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
    </>
  );
}
