'use client';

import { AssortmentBulkActionsDropdown } from '@/components/assortment/bulk-actions-dropdown';
import { AssortmentPrintDropdown } from '@/components/assortment/print-dropdown';
import { ColumnSettings } from '@/components/column-settings';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { resolveDefaultSalePrice } from '@/lib/sale-price';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  InlineFilterPanel,
  Input,
  ListView,
  NativeSelect,
  type PickerItem,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Bundle {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
  archived: boolean;
  productFolder: { id: string; name: string; pathName: string | null } | null;
}

interface BundleListResponse {
  items: Bundle[];
  nextCursor?: string;
  total: number;
}

function getDefaultSalePrice(b: Bundle): string | null {
  return resolveDefaultSalePrice(b.salePrices);
}

const LIMIT = 25;

export default function BundlesPage() {
  const t = useTranslations('pages.bundles');
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
  const [pickerOpen, setPickerOpen] = useState<null | 'folder' | 'supplier' | 'owner'>(null);
  const [folderFilter, setFolderFilter] = useState<{ id?: string; label?: string }>({});
  const [supplierFilter, setSupplierFilter] = useState<{ id?: string; label?: string }>({});
  // moysklad parity (D5 audit, 2026-05-28): additional filter state from
  // ProductFilterSchema. Bundles share the products filter backend
  // (kind=bundle); fields mirror the products D2 panel MINUS Тип товара
  // (fixed by kind=bundle in the query) and MINUS Тип учёта (bundles
  // are virtual composites — markirovka belongs on their components,
  // not on the bundle itself). country = «Страна» (ISO2, normalised
  // upper case in URL); ownerId = «Владелец»; belowMinimum = «Ниже
  // минимума» (tri-state — '' = ignore, 'true' / 'false'). Captured
  // 04-module reference DOM was unreliable on prior audits (mislabeled
  // categories), so order falls back to the well-known moysklad set:
  // folder → supplier → country → owner → archived → belowMinimum.
  const [countryInput, setCountryInput] = useState<string>('');
  const country = useDebounce(countryInput, 300);
  const [ownerId, setOwnerId] = useState<string>('');
  const [ownerLabel, setOwnerLabel] = useState<string>('');
  const [belowMinimum, setBelowMinimum] = useState<'' | 'true' | 'false'>('');

  const params = new URLSearchParams({
    kind: 'bundle',
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(folderFilter.id ? { productFolderId: folderFilter.id } : {}),
    ...(supplierFilter.id ? { supplierId: supplierFilter.id } : {}),
    ...(country.trim().length === 2 ? { country: country.trim().toUpperCase() } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(belowMinimum ? { belowMinimum } : {}),
  });

  const listQueryKey = [
    'bundles',
    search,
    archived,
    cursor,
    sortKey,
    sortDir,
    folderFilter.id,
    supplierFilter.id,
    country,
    ownerId,
    belowMinimum,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<BundleListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<BundleListResponse>(`/products?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('products', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
  });
  const cols = useColumnVisibility('bundles', ['name', 'code', 'folder', 'vat', 'price']);
  const colWidths = useColumnWidths('bundles');

  // moysklad's bundle list uses moyskladToolbar + Фильтр panel chrome
  // (shared catalog chrome), not active/archive pill sub-tabs. The full
  // inline panel below is backed by ProductFilterSchema. No
  // SavedFiltersPills — not FilterDrawerValues-shaped, a saved-filter row
  // would be a no-op.

  const columns: DataTableColumn<Bundle>[] = [
    {
      key: 'name',
      header: tFields('name'),
      sortable: true,
      cell: (b) => (
        <a
          href={`/bundles/${b.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {b.name}
        </a>
      ),
      cellText: (b) => b.name,
    },
    {
      key: 'code',
      header: tFields('code'),
      width: '140px',
      sortable: true,
      cell: (b) => <span className="text-[var(--ms-text-muted)] text-xs">{b.code ?? '—'}</span>,
      cellText: (b) => b.code ?? '',
    },
    {
      key: 'folder',
      header: t('folder'),
      cell: (b) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {b.productFolder?.pathName ?? b.productFolder?.name ?? '—'}
        </span>
      ),
      cellText: (b) => b.productFolder?.pathName ?? b.productFolder?.name ?? '',
    },
    {
      key: 'vat',
      header: tFields('vat'),
      align: 'right',
      width: '80px',
      cell: (b) => <span className="text-sm">{b.vat != null ? `${b.vat}%` : '—'}</span>,
      cellText: (b) => (b.vat != null ? `${b.vat}%` : ''),
    },
    {
      key: 'price',
      header: tFields('price'),
      align: 'right',
      width: '160px',
      cell: (b) => {
        const price = getDefaultSalePrice(b);
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
      cellText: (b) => {
        const price = getDefaultSalePrice(b);
        return price ? formatMoney(price, 'UZS', { displayAs: 'none' }) : '';
      },
    },
    {
      key: 'archived',
      header: tFields('state'),
      width: '110px',
      cell: (b) => (
        <Badge tone={archivedTone(b.archived)}>
          {b.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (b) => (b.archived ? 'archived' : 'active'),
    },
  ];

  const hasActiveFilter =
    !!search ||
    archived === 'archived' ||
    !!folderFilter.id ||
    !!supplierFilter.id ||
    country.trim().length === 2 ||
    !!ownerId ||
    !!belowMinimum;

  return (
    <>
      <ListView
        testId="bundles-page"
        moyskladToolbar
        onRefresh={() => refetch()}
        selectionCount={bulk.selectedIds.size}
        title={t('title')}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        createHref="/bundles/new"
        createLabel={t('create_button')}
        createPosition="start"
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
        rowTestId={(b) => `bundle-row-${b.id}`}
        rowActions={(b) => bulk.rowDelete(b.id)}
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
        editMenu={bulk.editMenu}
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          /* Inline filter panel — moysklad-parity for the Комплекты
             master list. Field order mirrors moysklad's Фильтр panel for
             product-kind views (D5 audit, 2026-05-28; 04-module reference
             DOM was unreliable on prior audits, so order falls back to
             the well-known moysklad set MINUS Тип товара (fixed by
             kind=bundle) and MINUS Тип учёта (bundles don't carry
             markirovka):
               1. Группа товаров   → productFolderId
               2. Поставщик        → supplierId
               3. Страна           → country (ISO2)
               4. Владелец         → ownerId
               5. Состояние (Архив) → archived
               6. Ниже минимума    → belowMinimum (tri-state)
             «Тег» is intentionally omitted — Product has no `tags`
             column in Prisma, so surfacing it would be a dead control. */
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setArchived('active');
              setFolderFilter({});
              setSupplierFilter({});
              setCountryInput('');
              setOwnerId('');
              setOwnerLabel('');
              setBelowMinimum('');
              setCursor(undefined);
            }}
            testId="bundles-inline-filter"
          >
            {/* 1. Группа товаров */}
            <InlineFilterPanel.Field label={tFilters('product_folder')} expandable>
              <CatalogPickerField
                value={
                  folderFilter.id
                    ? { id: folderFilter.id, label: folderFilter.label ?? folderFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('folder')}
                onClear={() => {
                  setFolderFilter({});
                  setCursor(undefined);
                }}
                testId="filter-folder"
              />
            </InlineFilterPanel.Field>
            {/* 2. Поставщик */}
            <InlineFilterPanel.Field label={tFields('supplier')} expandable>
              <CatalogPickerField
                value={
                  supplierFilter.id
                    ? { id: supplierFilter.id, label: supplierFilter.label ?? supplierFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('supplier')}
                onClear={() => {
                  setSupplierFilter({});
                  setCursor(undefined);
                }}
                testId="filter-supplier"
              />
            </InlineFilterPanel.Field>
            {/* 3. Страна — ISO 3166-1 alpha-2 (e.g. UZ, CN, RU). Free
                 text; only 2-char inputs are forwarded to the API. */}
            <InlineFilterPanel.Field label={tCommon('country')} expandable>
              <Input
                value={countryInput}
                onChange={(e) => {
                  setCountryInput(e.target.value);
                  setCursor(undefined);
                }}
                maxLength={2}
                placeholder="UZ"
                data-test-id="filter-country"
              />
            </InlineFilterPanel.Field>
            {/* 4. Владелец — Employee picker via /employees. */}
            <InlineFilterPanel.Field label={tFilters('owner_employee')} expandable>
              <CatalogPickerField
                value={ownerId ? { id: ownerId, label: ownerLabel || ownerId } : null}
                placeholder=""
                onPick={() => setPickerOpen('owner')}
                onClear={() => {
                  setOwnerId('');
                  setOwnerLabel('');
                  setCursor(undefined);
                }}
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>
            {/* 5. Состояние (Архив) */}
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
            {/* 6. Ниже минимума — tri-state. Empty = ignore;
                 true = stock < minimumBalance (re-order suggestions);
                 false = stock ≥ minimumBalance (sufficiently stocked). */}
            <InlineFilterPanel.Field label={tFilters('below_minimum')} expandable>
              <NativeSelect
                value={belowMinimum}
                onChange={(e) => {
                  setBelowMinimum(e.target.value as '' | 'true' | 'false');
                  setCursor(undefined);
                }}
                data-test-id="filter-below-minimum"
              >
                <option value="">{tCommon('all')}</option>
                <option value="true">{tCommon('yes')}</option>
                <option value="false">{tCommon('no')}</option>
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
        extraActions={
          <>
            <AssortmentBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
            />
            <AssortmentPrintDropdown />
          </>
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
        open={pickerOpen === 'folder'}
        onClose={() => setPickerOpen(null)}
        title={t('folder')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/product-folders?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFolderFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'supplier'}
        onClose={() => setPickerOpen(null)}
        title="Поставщик"
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setSupplierFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      {/* Владелец picker — Employee reference (mirrors D2 products). */}
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
          setOwnerId(item.id);
          setOwnerLabel(String(item.primary));
          setCursor(undefined);
        }}
      />
    </>
  );
}
