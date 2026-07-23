'use client';

/**
 * /price-lists/new — create a PriceList document.
 *
 * PriceList is simpler than money docs: no agent, no sumMinor, no balance
 * impact. The body is a PriceMatrixEditor: rows = products, columns = price
 * types, cells = minor-unit prices. On save the matrix is serialised into
 * `pricesJson: { [productId]: { [priceTypeId]: minorAmount } }`.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  DocumentTabs,
  Icons,
  Input,
  type PickerItem,
  StickyHScroll,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefItem {
  id: string;
  name: string;
}

interface PriceType {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
}

interface Product {
  id: string;
  name: string;
  code: string | null;
}

/** A row in the price matrix (one product). */
interface MatrixRow {
  /** Stable local key — not the productId, since productId may be empty. */
  _uid: string;
  productId: string;
  productLabel: string;
  /** priceTypeId → minorAmount string */
  prices: Record<string, string>;
}

/** The shape stored/sent as pricesJson. */
type PricesSnapshot = Record<string, Record<string, string>>;

// ---------------------------------------------------------------------------
// PriceMatrixEditor
// ---------------------------------------------------------------------------

interface PriceMatrixEditorProps {
  rows: MatrixRow[];
  priceTypes: PriceType[];
  /** IDs of price-type columns currently visible in the matrix. */
  activePriceTypeIds: string[];
  locked: boolean;
  onRowsChange: (rows: MatrixRow[]) => void;
  onActivePriceTypeIdsChange: (ids: string[]) => void;
  onAddProductPick: () => void;
  onAddPriceTypePick: () => void;
}

function PriceMatrixEditor({
  rows,
  priceTypes,
  activePriceTypeIds,
  locked,
  onRowsChange,
  onActivePriceTypeIdsChange,
  onAddProductPick,
  onAddPriceTypePick,
}: PriceMatrixEditorProps) {
  const t = useTranslations('pages.price_list');
  const tCommon = useTranslations('common');

  const activeTypes = priceTypes.filter((pt) => activePriceTypeIds.includes(pt.id));

  const updateCell = useCallback(
    (uid: string, priceTypeId: string, value: string) => {
      onRowsChange(
        rows.map((r) =>
          r._uid === uid ? { ...r, prices: { ...r.prices, [priceTypeId]: value } } : r,
        ),
      );
    },
    [rows, onRowsChange],
  );

  const removeRow = useCallback(
    (uid: string) => {
      onRowsChange(rows.filter((r) => r._uid !== uid));
    },
    [rows, onRowsChange],
  );

  const removePriceTypeColumn = useCallback(
    (priceTypeId: string) => {
      onActivePriceTypeIdsChange(activePriceTypeIds.filter((id) => id !== priceTypeId));
    },
    [activePriceTypeIds, onActivePriceTypeIdsChange],
  );

  if (rows.length === 0 && activePriceTypeIds.length === 0) {
    return (
      <div
        className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-8 text-center"
        data-test-id="price-matrix-empty"
      >
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ms-bg-muted)]">
          <Icons.priceTypes className="h-5 w-5 text-[var(--ms-text-muted)]" />
        </div>
        <p className="font-medium text-[var(--ms-text-primary)] text-sm">{t('no_products')}</p>
        <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('empty_rich_helper')}</p>
        {!locked && (
          <div className="mt-4 flex justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onAddProductPick}
              data-test-id="matrix-add-product"
            >
              <Icons.create className="h-4 w-4" />
              {t('add_product')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <StickyHScroll
      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
      data-test-id="price-matrix"
    >
      <table className="w-full text-sm">
        <thead className="bg-[var(--ms-bg-muted)]">
          <tr>
            {/* Product column header */}
            <th className="sticky left-0 z-10 min-w-[200px] bg-[var(--ms-bg-muted)] px-3 py-2 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('add_product')}
            </th>
            {/* One column per active price type */}
            {activeTypes.map((pt) => (
              <th
                key={pt.id}
                className="min-w-[140px] px-3 py-2 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>{pt.name}</span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => removePriceTypeColumn(pt.id)}
                      className="rounded p-0.5 opacity-50 hover:bg-[var(--ms-bg-destructive-subtle)] hover:text-[var(--ms-text-destructive)] hover:opacity-100"
                      aria-label={t('remove_column_aria', { name: pt.name })}
                      data-test-id={`remove-col-${pt.id}`}
                    >
                      <Icons.close className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </th>
            ))}
            {/* Remove-row column header */}
            {!locked && <th className="w-10 px-2 py-2" aria-label={tCommon('actions')} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row._uid}
              className="border-[var(--ms-border-default)] border-t"
              data-test-id={`matrix-row-${row._uid}`}
            >
              {/* Product label cell — read-only once picked */}
              <td className="sticky left-0 z-10 bg-[var(--ms-bg-surface)] px-3 py-1.5">
                {row.productId ? (
                  <span className="block max-w-[200px] truncate font-medium text-[var(--ms-text-primary)]">
                    {row.productLabel}
                  </span>
                ) : (
                  <span className="text-[var(--ms-text-muted)] text-xs">—</span>
                )}
              </td>
              {/* Price cells — one per active price type */}
              {activeTypes.map((pt) => (
                <td key={pt.id} className="px-3 py-1.5">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={row.prices[pt.id] ?? ''}
                    onChange={(e) => updateCell(row._uid, pt.id, e.target.value.replace(/\D/g, ''))}
                    disabled={locked || !row.productId}
                    className="w-full text-right tabular-nums"
                    placeholder="0"
                    data-test-id={`cell-${row._uid}-${pt.id}`}
                  />
                </td>
              ))}
              {/* Remove row button */}
              {!locked && (
                <td className="px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeRow(row._uid)}
                    className="hover:bg-[var(--ms-bg-destructive-subtle)] hover:text-[var(--ms-text-destructive)]"
                    aria-label={tCommon('delete_row')}
                    data-test-id={`remove-row-${row._uid}`}
                  >
                    <Icons.close className="h-4 w-4" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer actions */}
      {!locked && (
        <div className="flex gap-2 border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-3 py-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAddProductPick}
            data-test-id="matrix-add-product"
          >
            <Icons.create className="h-4 w-4" />
            {t('add_product')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAddPriceTypePick}
            data-test-id="matrix-add-price-type"
          >
            <Icons.create className="h-4 w-4" />
            {t('add_price_type')}
          </Button>
        </div>
      )}
    </StickyHScroll>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _uidCounter = 0;
function nextUid(): string {
  _uidCounter += 1;
  return `row-${_uidCounter}`;
}

function matrixToSnapshot(rows: MatrixRow[], activePriceTypeIds: string[]): PricesSnapshot {
  const snapshot: PricesSnapshot = {};
  for (const row of rows) {
    if (!row.productId) continue;
    const cellMap: Record<string, string> = {};
    for (const ptId of activePriceTypeIds) {
      const val = row.prices[ptId];
      if (val && val !== '0') {
        cellMap[ptId] = val;
      }
    }
    snapshot[row.productId] = cellMap;
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewPriceListPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.price_list');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tTabs = useTranslations('detail_tabs');
  const tStates = useTranslations('states.price_list');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const docEditorLabels = useDocumentEditorLabels();

  // Status quick-picker options — labels localised from the shared state
  // namespace (was a module-level const with hardcoded Latin-uz labels).
  const statusOptions = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  // ---- Remote data ----
  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });

  const { data: priceTypesData } = useQuery<{ items: PriceType[] }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
  });

  const allPriceTypes = priceTypesData?.items ?? [];

  // ---- Header fields ----
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(true);

  // ---- Meta fields ----
  const [docName, setDocName] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [priceTypeId, setPriceTypeId] = useState<string | null>(null);
  const [priceTypeLabel, setPriceTypeLabel] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ---- Matrix state ----
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);
  const [activePriceTypeIds, setActivePriceTypeIds] = useState<string[]>([]);

  // ---- Picker state ----
  // 'product' | 'org' | 'priceType' | 'matrixPriceType' | null
  const [openPicker, setOpenPicker] = useState<
    'product' | 'org' | 'priceType' | 'matrixPriceType' | null
  >(null);

  // Auto-select first org
  useEffect(() => {
    if (orgsData?.items[0] && !organizationId) {
      setOrganizationId(orgsData.items[0].id);
      setOrganizationLabel(orgsData.items[0].name);
    }
  }, [orgsData, organizationId]);

  // ---- Handlers: adding a price-type column ----
  const handleAddPriceTypeColumn = useCallback(
    (ptId: string) => {
      if (activePriceTypeIds.includes(ptId)) return;
      const newIds = [...activePriceTypeIds, ptId];
      setActivePriceTypeIds(newIds);
      // Ensure every existing row has an entry for the new column
      setMatrixRows((prev) =>
        prev.map((r) => ({
          ...r,
          prices: { ...r.prices, [ptId]: r.prices[ptId] ?? '' },
        })),
      );
    },
    [activePriceTypeIds],
  );

  // ---- Create mutation ----
  const createMut = useMutation({
    mutationFn: async () => {
      if (!docName.trim()) throw new Error("Nom maydoni bo'sh bo'lmasin");
      if (!organizationId)
        throw new Error(tCommon('field_required', { field: tFields('organization') }));
      const pricesJson = matrixToSnapshot(matrixRows, activePriceTypeIds);
      return api.post<{ id: string }>('/price-lists', {
        name: docName.trim(),
        organizationId,
        priceTypeId: priceTypeId ?? undefined,
        description: description || undefined,
        moment: docDate,
        applicable,
        pricesJson,
      });
    },
    onSuccess: (created) => router.push(`/price-lists/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  // ---- Fetchers ----
  const orgFetcher = useCallback(async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
  }, []);

  const priceTypeFetcher = useCallback(async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: PriceType[] }>(`/price-types?search=${encodeURIComponent(s)}`);
    return d.items.map((pt) => ({ id: pt.id, primary: pt.name, secondary: pt.currency }));
  }, []);

  const productFetcher = useCallback(async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Product[] }>(
      `/products?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
    }));
  }, []);

  // ---- Tabs ----
  const tabs = [
    {
      key: 'main',
      label: tTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel compact>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('name')} required>
                <Input
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder={t('name_placeholder')}
                  data-test-id="field-name"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('organization')} required>
                <CatalogPickerField
                  value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                  placeholder={tForm('select_organization')}
                  onPick={() => setOpenPicker('org')}
                  onClear={() => {
                    setOrganizationId(null);
                    setOrganizationLabel('');
                  }}
                  testId="field-organization"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('default_price_type')}>
                <CatalogPickerField
                  value={priceTypeId ? { id: priceTypeId, label: priceTypeLabel } : null}
                  placeholder="—"
                  onPick={() => setOpenPicker('priceType')}
                  onClear={() => {
                    setPriceTypeId(null);
                    setPriceTypeLabel('');
                  }}
                  testId="field-price-type"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('description')}>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={tFields('description')}
                  data-test-id="field-description"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          {/* Price matrix */}
          <PriceMatrixEditor
            rows={matrixRows}
            priceTypes={allPriceTypes}
            activePriceTypeIds={activePriceTypeIds}
            locked={false}
            onRowsChange={setMatrixRows}
            onActivePriceTypeIdsChange={setActivePriceTypeIds}
            onAddProductPick={() => setOpenPicker('product')}
            onAddPriceTypePick={() => setOpenPicker('matrixPriceType')}
          />

          <DocumentDisclosurePanel
            title={tTabs('files')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_file')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('files_after_save_hint')}</p>
          </DocumentDisclosurePanel>
        </div>
      ),
    },
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="price-list-new-page"
        documentTypeLabel={tDetailTitles('price_list')}
        number={docName}
        onNumberChange={setDocName}
        date={docDate}
        onDateChange={setDocDate}
        status={status}
        statusOptions={statusOptions}
        onStatusChange={setStatus}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/price-lists')}
        modifyMenu={[]}
        createDocMenu={[]}
        printMenu={[]}
        sendMenu={[]}
        rightSlot={
          user ? (
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-[var(--ms-text-primary)]">{user.name}</div>
              <div className="text-[var(--ms-text-muted)]">
                {user.position ?? tDetailHeader('role_primary')}
              </div>
            </div>
          ) : null
        }
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

      {/* Org picker */}
      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tForm('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />

      {/* Default price type picker (meta field) */}
      <CatalogPicker
        open={openPicker === 'priceType'}
        onClose={() => setOpenPicker(null)}
        title={t('default_price_type_picker_title')}
        fetcher={priceTypeFetcher}
        onSelect={(item) => {
          setPriceTypeId(item.id);
          setPriceTypeLabel(String(item.primary));
        }}
      />

      {/* Add price type column to matrix */}
      <CatalogPicker
        open={openPicker === 'matrixPriceType'}
        onClose={() => setOpenPicker(null)}
        title={t('add_price_type_title')}
        fetcher={priceTypeFetcher}
        onSelect={(item) => {
          handleAddPriceTypeColumn(item.id);
          // Eagerly label — allPriceTypes may already have it but we ensure it
          const existing = allPriceTypes.find((pt) => pt.id === item.id);
          if (!existing) {
            // Not in cache yet; the column header will show once priceTypes refetches.
            // This is fine — we store the id, the label comes from the allPriceTypes list.
          }
        }}
      />

      {/* Add product row to matrix */}
      <CatalogPicker
        open={openPicker === 'product'}
        onClose={() => setOpenPicker(null)}
        title={t('add_product')}
        fetcher={productFetcher}
        onSelect={(item) => {
          // Don't add duplicate product rows
          if (matrixRows.some((r) => r.productId === item.id)) return;
          const emptyPrices: Record<string, string> = {};
          for (const ptId of activePriceTypeIds) {
            emptyPrices[ptId] = '';
          }
          setMatrixRows((prev) => [
            ...prev,
            {
              _uid: nextUid(),
              productId: item.id,
              productLabel: String(item.primary),
              prices: emptyPrices,
            },
          ]);
        }}
      />
    </>
  );
}
