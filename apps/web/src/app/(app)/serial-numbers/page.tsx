'use client';

import { AssortmentPrintDropdown } from '@/components/assortment/print-dropdown';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { api } from '@/lib/api-client';
import {
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  DatePicker,
  InlineFilterPanel,
  ListView,
  NativeSelect,
  type PickerItem,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Серийные номера — read-only serial-number registry under the «Товары»
 * section (3rd tab, 1:1 with online.moysklad.uz grounded 2026-06-17).
 *
 * Columns and the 8-field Фильтр panel mirror moysklad exactly. The list is
 * empty until a serial-accounting subsystem (serial entry on serial-tracked
 * document positions) populates it — moysklad's own account shows «1-1 из 0»
 * here too. Filters are wired to the query params and become functional the
 * moment serial records exist; today they operate over an empty set. The five
 * entity filters are real autocomplete pickers (matching moysklad), the «На
 * дату» field is a dd.MM.yyyy DatePicker.
 */

interface SerialNumberRow {
  id: string;
  serialNumber: string;
  code: string | null;
  article: string | null;
  productName: string | null;
  batch: string | null;
  store: string | null;
  documentType: string | null;
  documentNumber: string | null;
  description: string | null;
  counterparty: string | null;
}

interface ListResponse {
  items: SerialNumberRow[];
  nextCursor?: string;
  total: number;
}

type Ref = { id?: string; label?: string };
type PickerKey = 'productOrGroup' | 'store' | 'counterparty' | 'counterpartyGroup' | 'supplier';

const LIMIT = 100;

export default function SerialNumbersPage() {
  const t = useTranslations('pages.serial_numbers');
  const tCommon = useTranslations('common');
  const tFilters = useTranslations('filters');

  const [filterOpen, setFilterOpen] = useState(true);
  const [asOfDate, setAsOfDate] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [outsideStore, setOutsideStore] = useState('');
  const [productOrGroup, setProductOrGroup] = useState<Ref>({});
  const [store, setStore] = useState<Ref>({});
  const [counterparty, setCounterparty] = useState<Ref>({});
  const [counterpartyGroup, setCounterpartyGroup] = useState<Ref>({});
  const [supplier, setSupplier] = useState<Ref>({});
  const [pickerOpen, setPickerOpen] = useState<PickerKey | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();

  const params = new URLSearchParams({
    ...(asOfDate ? { asOfDate } : {}),
    ...(serialNumber ? { serialNumber } : {}),
    ...(outsideStore ? { outsideStore } : {}),
    ...(productOrGroup.id ? { productFolderId: productOrGroup.id } : {}),
    ...(store.id ? { storeId: store.id } : {}),
    ...(counterparty.id ? { counterpartyId: counterparty.id } : {}),
    ...(counterpartyGroup.id ? { counterpartyGroupId: counterpartyGroup.id } : {}),
    ...(supplier.id ? { supplierId: supplier.id } : {}),
    limit: String(LIMIT),
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: [
      'serial-numbers',
      asOfDate,
      serialNumber,
      outsideStore,
      productOrGroup.id,
      store.id,
      counterparty.id,
      counterpartyGroup.id,
      supplier.id,
      cursor,
    ],
    queryFn: () => api.get<ListResponse>(`/serial-numbers?${params.toString()}`),
  });

  const muted = (value: string | null) => <span className="text-sm">{value ?? '—'}</span>;

  const columns: DataTableColumn<SerialNumberRow>[] = [
    {
      key: 'serialNumber',
      header: t('col_serial_number'),
      cell: (row) => <span className="font-medium font-mono text-sm">{row.serialNumber}</span>,
      cellText: (row) => row.serialNumber,
    },
    { key: 'code', header: t('col_code'), width: '110px', cell: (row) => muted(row.code) },
    { key: 'article', header: t('col_article'), width: '110px', cell: (row) => muted(row.article) },
    { key: 'product', header: t('col_product'), cell: (row) => muted(row.productName) },
    { key: 'batch', header: t('col_batch'), width: '120px', cell: (row) => muted(row.batch) },
    { key: 'store', header: t('col_store'), width: '140px', cell: (row) => muted(row.store) },
    {
      key: 'documentType',
      header: t('col_document_type'),
      width: '140px',
      cell: (row) => muted(row.documentType),
    },
    {
      key: 'documentNumber',
      header: t('col_document_number'),
      width: '110px',
      cell: (row) => muted(row.documentNumber),
    },
    { key: 'description', header: t('col_description'), cell: (row) => muted(row.description) },
    { key: 'counterparty', header: t('col_counterparty'), cell: (row) => muted(row.counterparty) },
  ];

  const hasActiveFilter =
    !!asOfDate ||
    !!serialNumber ||
    !!outsideStore ||
    !!productOrGroup.id ||
    !!store.id ||
    !!counterparty.id ||
    !!counterpartyGroup.id ||
    !!supplier.id;

  // A picker filter field: button-style reference control + «По умолчанию
  // содержит» help tooltip (moysklad parity).
  const pickerField = (
    label: string,
    key: PickerKey,
    ref: Ref,
    clear: () => void,
    testId: string,
  ) => (
    <InlineFilterPanel.Field label={label} tooltip="По умолчанию содержит" expandable>
      <CatalogPickerField
        value={ref.id ? { id: ref.id, label: ref.label ?? ref.id } : null}
        placeholder=""
        onPick={() => setPickerOpen(key)}
        onClear={() => {
          clear();
          setCursor(undefined);
        }}
        testId={testId}
      />
    </InlineFilterPanel.Field>
  );

  // Shared fetcher for the {id,name}-list endpoints behind the pickers.
  const refFetcher =
    (path: string) =>
    async (q: string): Promise<PickerItem[]> => {
      const r = await api.get<{ items: { id: string; name: string }[] }>(
        `${path}?search=${encodeURIComponent(q)}&limit=20`,
      );
      return r.items.map((x) => ({ id: x.id, primary: x.name }));
    };

  return (
    <>
      <ListView
        testId="serial-numbers-page"
        title={t('title')}
        moyskladToolbar
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        onRefresh={() => refetch()}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(row) => `serial-number-row-${row.id}`}
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={!!data?.nextCursor}
        hasPrevious={!!cursor}
        onNext={() => setCursor(data?.nextCursor)}
        onPrevious={() => setCursor(undefined)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={t('empty_title')}
        hasActiveFilter={hasActiveFilter}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setAsOfDate('');
              setSerialNumber('');
              setOutsideStore('');
              setProductOrGroup({});
              setStore({});
              setCounterparty({});
              setCounterpartyGroup({});
              setSupplier({});
              setCursor(undefined);
            }}
            testId="serial-numbers-inline-filter"
          >
            <InlineFilterPanel.Field label={t('filter_as_of_date')} expandable>
              <DatePicker
                value={asOfDate || null}
                onChange={(next) => {
                  setAsOfDate(next ?? '');
                  setCursor(undefined);
                }}
                clearable
                testId="filter-as-of-date"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={t('filter_serial_number')} expandable>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => {
                  setSerialNumber(e.target.value);
                  setCursor(undefined);
                }}
                className="h-[var(--ms-control-h)] w-full rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-2 text-sm"
                data-test-id="filter-serial-number"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={t('filter_outside_store')} expandable>
              <NativeSelect
                value={outsideStore}
                onChange={(e) => {
                  setOutsideStore(e.target.value);
                  setCursor(undefined);
                }}
                data-test-id="filter-outside-store"
              >
                <option value="">{tCommon('all')}</option>
                <option value="true">{tCommon('yes')}</option>
                <option value="false">{tCommon('no')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            {pickerField(
              t('filter_product_or_group'),
              'productOrGroup',
              productOrGroup,
              () => setProductOrGroup({}),
              'filter-product-or-group',
            )}
            {pickerField(t('filter_store'), 'store', store, () => setStore({}), 'filter-store')}
            {pickerField(
              t('filter_counterparty'),
              'counterparty',
              counterparty,
              () => setCounterparty({}),
              'filter-counterparty',
            )}
            {pickerField(
              t('filter_counterparty_group'),
              'counterpartyGroup',
              counterpartyGroup,
              () => setCounterpartyGroup({}),
              'filter-counterparty-group',
            )}
            {pickerField(
              t('filter_supplier'),
              'supplier',
              supplier,
              () => setSupplier({}),
              'filter-supplier',
            )}
          </InlineFilterPanel>
        }
        extraActionsLeft={
          <FilterToggleButton
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            label={tFilters('trigger')}
          />
        }
        extraActions={<AssortmentPrintDropdown />}
      />

      {/* Entity pickers — real autocomplete references (moysklad parity). */}
      <CatalogPicker
        open={pickerOpen === 'productOrGroup'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_product_or_group')}
        fetcher={refFetcher('/product-folders')}
        onSelect={(item) => {
          setProductOrGroup({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'store'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_store')}
        fetcher={refFetcher('/stores')}
        onSelect={(item) => {
          setStore({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'counterparty'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_counterparty')}
        fetcher={refFetcher('/counterparties')}
        onSelect={(item) => {
          setCounterparty({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'counterpartyGroup'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_counterparty_group')}
        fetcher={refFetcher('/groups')}
        onSelect={(item) => {
          setCounterpartyGroup({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'supplier'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_supplier')}
        fetcher={refFetcher('/counterparties')}
        onSelect={(item) => {
          setSupplier({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
    </>
  );
}
