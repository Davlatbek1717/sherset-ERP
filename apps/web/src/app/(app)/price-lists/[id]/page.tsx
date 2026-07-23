'use client';

/**
 * /price-lists/[id] — detail/edit view for a PriceList document.
 *
 * PriceList carries no agent, no sumMinor, no balance/stock impact.
 * The body is the PriceMatrixEditor: hydrated from `pricesJson` (plain JS
 * object in API responses — never a stringified string). Locked when
 * `applicable=true`; toggle Provedeno off (POST /transitions/unpost) to
 * re-enable editing.
 */

import { AttachmentsSection } from '@/components/attachments-section';
import { DetailContentTabs, DetailHeader, DetailToolbar } from '@/components/document-detail';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Alert,
  Avatar,
  Button,
  CatalogPicker,
  CatalogPickerField,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  Icons,
  Input,
  type PickerItem,
  StickyHScroll,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type PricesSnapshot = Record<string, Record<string, string>>;

interface PriceListDetail {
  id: string;
  version: number;
  name: string;
  code: string | null;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  currency: string;
  rateValue: string | null;
  description: string | null;
  pricesJson: PricesSnapshot;
  organization: { id: string; name: string };
  priceType: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** A row in the price matrix (one product). */
interface MatrixRow {
  _uid: string;
  productId: string;
  productLabel: string;
  prices: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _uidCounter = 0;
function nextUid(): string {
  _uidCounter += 1;
  return `row-${_uidCounter}`;
}

type PricesSnapshot2 = Record<string, Record<string, string>>;

/**
 * Hydrate pricesJson (from the API) into an array of MatrixRows + a set of
 * active priceTypeIds. We need product labels — those are fetched lazily.
 * Initially productLabel is set to the ID; a reconcile step fills it in once
 * the product list loads.
 */
function hydrateMatrix(pricesJson: PricesSnapshot): {
  rows: MatrixRow[];
  activePriceTypeIds: string[];
} {
  const typeIdSet = new Set<string>();
  for (const cellMap of Object.values(pricesJson)) {
    for (const ptId of Object.keys(cellMap)) {
      typeIdSet.add(ptId);
    }
  }
  const activePriceTypeIds = Array.from(typeIdSet);

  const rows: MatrixRow[] = Object.entries(pricesJson).map(([productId, cellMap]) => {
    const prices: Record<string, string> = {};
    for (const ptId of activePriceTypeIds) {
      prices[ptId] = cellMap[ptId] ?? '';
    }
    return {
      _uid: nextUid(),
      productId,
      // Start with ID as label; reconciled after product labels are fetched.
      productLabel: productId,
      prices,
    };
  });

  return { rows, activePriceTypeIds };
}

function matrixToSnapshot(rows: MatrixRow[], activePriceTypeIds: string[]): PricesSnapshot2 {
  const snapshot: PricesSnapshot2 = {};
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

/**
 * Snapshot of the mutable form state — used for isDirty detection.
 * We exclude productLabel (display-only) from the diff.
 */
interface FormState {
  organizationId: string;
  organizationLabel: string;
  priceTypeId: string;
  priceTypeLabel: string;
  description: string;
}

function formFromData(d: PriceListDetail): FormState {
  return {
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    priceTypeId: d.priceType?.id ?? '',
    priceTypeLabel: d.priceType?.name ?? '',
    description: d.description ?? '',
  };
}

function snapshotForm(s: FormState): string {
  return JSON.stringify(s);
}

// ---------------------------------------------------------------------------
// PriceMatrixEditor (same component, duplicated here to keep the page
// self-contained — mirrors the pattern in other detail pages).
// ---------------------------------------------------------------------------

interface PriceMatrixEditorProps {
  rows: MatrixRow[];
  priceTypes: PriceType[];
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
            <th className="sticky left-0 z-10 min-w-[200px] bg-[var(--ms-bg-muted)] px-3 py-2 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('add_product')}
            </th>
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
              <td className="sticky left-0 z-10 bg-[var(--ms-bg-surface)] px-3 py-1.5">
                <span className="block max-w-[200px] truncate font-medium text-[var(--ms-text-primary)]">
                  {row.productLabel}
                </span>
              </td>
              {activeTypes.map((pt) => (
                <td key={pt.id} className="px-3 py-1.5">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={row.prices[pt.id] ?? ''}
                    onChange={(e) => updateCell(row._uid, pt.id, e.target.value.replace(/\D/g, ''))}
                    disabled={locked}
                    className="w-full text-right tabular-nums"
                    placeholder="0"
                    data-test-id={`cell-${row._uid}-${pt.id}`}
                  />
                </td>
              ))}
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
// Page
// ---------------------------------------------------------------------------

export default function PriceListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('price-lists', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.price_list');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.price_list');

  // ---- Remote data ----
  const { data, isLoading } = useQuery<PriceListDetail>({
    queryKey: ['price-lists', id],
    queryFn: () => api.get(`/price-lists/${id}`),
  });

  const { data: priceTypesData } = useQuery<{ items: PriceType[] }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
  });
  const allPriceTypes = priceTypesData?.items ?? [];

  // ---- Meta form ----
  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState('');

  // ---- Matrix state ----
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);
  const [activePriceTypeIds, setActivePriceTypeIds] = useState<string[]>([]);
  const [matrixInitialised, setMatrixInitialised] = useState(false);
  const [originalMatrix, setOriginalMatrix] = useState('');

  // ---- Picker ----
  const [openPicker, setOpenPicker] = useState<
    'org' | 'priceType' | 'matrixPriceType' | 'product' | null
  >(null);

  const [saveError, setSaveError] = useState<string | null>(null);

  // Optimistic-lock conflict (409) → re-hydrate from the now-fresh query data.
  // This page seeds BOTH the meta form (`if (data && !form)`) AND the price
  // matrix (`if (data && !matrixInitialised)`), so the reload callback must
  // reset BOTH gates so each re-seeds from the refetched `data`.
  const onConflict = useConflictReload(['price-lists', id], () => {
    setForm(null);
    setMatrixInitialised(false);
  });

  // ---- Hydrate form + matrix on first load ----
  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshotForm(initial));
    }
  }, [data, form]);

  useEffect(() => {
    if (data && !matrixInitialised) {
      const { rows, activePriceTypeIds: ptIds } = hydrateMatrix(data.pricesJson ?? {});
      setMatrixRows(rows);
      setActivePriceTypeIds(ptIds);
      setOriginalMatrix(
        JSON.stringify({ rows: rows.map((r) => ({ ...r, productLabel: '' })), ptIds }),
      );
      setMatrixInitialised(true);
    }
  }, [data, matrixInitialised]);

  // Once allPriceTypes loads, reconcile product labels for hydrated rows.
  // Products: we need to fetch labels for the product IDs in pricesJson.
  // We lazily fetch them in a single batch query when the matrix is hydrated.
  const productIds = matrixRows
    .filter((r) => r.productId && r.productLabel === r.productId)
    .map((r) => r.productId);

  const { data: productLabelsData } = useQuery<{ items: Product[] }>({
    queryKey: ['products-batch', productIds],
    queryFn: () =>
      productIds.length > 0
        ? api.get<{ items: Product[] }>(
            `/products?ids=${productIds.join(',')}&limit=${productIds.length}`,
          )
        : Promise.resolve({ items: [] }),
    enabled: productIds.length > 0,
  });

  useEffect(() => {
    if (!productLabelsData?.items.length) return;
    const labelMap: Record<string, string> = {};
    for (const p of productLabelsData.items) {
      labelMap[p.id] = p.name;
    }
    setMatrixRows((prev) =>
      prev.map((r) =>
        labelMap[r.productId] ? { ...r, productLabel: labelMap[r.productId] ?? r.productLabel } : r,
      ),
    );
  }, [productLabelsData]);

  // ---- Dirty detection ----
  const formDirty = useMemo(
    () => (form ? snapshotForm(form) !== original : false),
    [form, original],
  );
  const matrixDirty = useMemo(() => {
    const cur = JSON.stringify({
      rows: matrixRows.map((r) => ({ ...r, productLabel: '' })),
      ptIds: activePriceTypeIds,
    });
    return cur !== originalMatrix;
  }, [matrixRows, activePriceTypeIds, originalMatrix]);
  const isDirty = formDirty || matrixDirty;
  useUnsavedGuard(isDirty);

  // ---- Mutations ----
  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/price-lists/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists', id] });
      qc.invalidateQueries({ queryKey: ['price-lists'] });
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error(t('err_not_loaded'));
      const pricesJson = matrixToSnapshot(matrixRows, activePriceTypeIds);
      return api.patch(`/price-lists/${id}`, {
        // Optimistic-lock token — the version this form loaded (from the
        // server query `data`, NOT `form`, which has no version field).
        version: data.version,
        organizationId: form.organizationId,
        priceTypeId: form.priceTypeId || null,
        description: form.description || null,
        pricesJson,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists', id] });
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      setForm(null);
      setMatrixInitialised(false);
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/price-lists/${id}/clone`, {}),
    onSuccess: (cloned) => router.push(`/price-lists/${cloned.id}`),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/price-lists/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      router.push('/price-lists');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  // ---- Add price-type column ----
  const handleAddPriceTypeColumn = useCallback(
    (ptId: string) => {
      if (activePriceTypeIds.includes(ptId)) return;
      const newIds = [...activePriceTypeIds, ptId];
      setActivePriceTypeIds(newIds);
      setMatrixRows((prev) =>
        prev.map((r) => ({
          ...r,
          prices: { ...r.prices, [ptId]: r.prices[ptId] ?? '' },
        })),
      );
    },
    [activePriceTypeIds],
  );

  // ---- Fetchers ----
  const orgFetcher = useCallback(async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: { id: string; name: string }[] }>(
      `/organizations?search=${encodeURIComponent(s)}`,
    );
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

  // ---- Guards ----
  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data || !form) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const locked = data.applicable;
  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="price-list-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => {
          setSaveError(null);
          saveMut.mutate();
        }}
        onClose={() => router.push('/price-lists')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        onClone={() => cloneMut.mutate()}
        onDelete={
          !locked
            ? () =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                  successMessage: tCommon('saved'),
                })
            : undefined
        }
      />

      <DetailHeader
        titlePrefix={tDetailTitles('price_list')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(data.state as 'draft' | 'posted' | 'cancelled')}
        stateTone={documentStateTone(data.state)}
        stateSlug={data.state}
        applicable={data.applicable}
        onToggleApplicable={onToggleApplicable}
        applicableBusy={transitionMut.isPending}
        authorSlot={
          <div className="flex flex-col items-end gap-1 text-xs">
            <div className="flex items-center gap-2">
              <Avatar
                name={data.owner?.name ?? '—'}
                size="md"
                data-test-id="detail-header-author-avatar"
              />
              <div className="flex flex-col leading-tight">
                <div
                  className="font-medium text-[var(--ms-text-primary)]"
                  data-test-id="detail-header-owner"
                >
                  {data.owner?.name ?? '—'}
                </div>
                <div
                  className="text-[var(--ms-text-muted)]"
                  data-test-id="detail-header-owner-role"
                >
                  {tDetailHeader('role_primary')}
                </div>
              </div>
            </div>
            <div className="text-[var(--ms-text-muted)]" data-test-id="detail-header-updated">
              {tDetailHeader('changed')}: {data.owner?.name ?? '—'} {formatDate(data.updatedAt)}
            </div>
          </div>
        }
      />

      <main className="flex-1 px-4 py-4">
        {locked && (
          <Alert tone="info" className="mb-3">
            {tCommon('locked_when_posted')}
          </Alert>
        )}
        {saveError && (
          <Alert tone="destructive" className="mb-3">
            {saveError}
          </Alert>
        )}
        {transitionMut.error && (
          <Alert tone="destructive" className="mb-3">
            {(transitionMut.error as Error).message}
          </Alert>
        )}

        {/* Meta panel */}
        <DocumentMetaPanel>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('organization')} required>
              <CatalogPickerField
                value={
                  form.organizationId
                    ? { id: form.organizationId, label: form.organizationLabel }
                    : null
                }
                placeholder={tFields('organization')}
                onPick={() => !locked && setOpenPicker('org')}
                onClear={() =>
                  !locked && setForm({ ...form, organizationId: '', organizationLabel: '' })
                }
                disabled={locked}
                testId="field-organization"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('default_price_type')}>
              <CatalogPickerField
                value={
                  form.priceTypeId ? { id: form.priceTypeId, label: form.priceTypeLabel } : null
                }
                placeholder="—"
                onPick={() => !locked && setOpenPicker('priceType')}
                onClear={() => !locked && setForm({ ...form, priceTypeId: '', priceTypeLabel: '' })}
                disabled={locked}
                testId="field-price-type"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('description')}>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={locked}
                data-test-id="field-description"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('products_count')}>
              <Input
                value={String(Object.keys(data.pricesJson ?? {}).length)}
                disabled
                data-test-id="field-products-count"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        {/* Price matrix */}
        <div className="mt-4">
          <PriceMatrixEditor
            rows={matrixRows}
            priceTypes={allPriceTypes}
            activePriceTypeIds={activePriceTypeIds}
            locked={locked}
            onRowsChange={setMatrixRows}
            onActivePriceTypeIdsChange={setActivePriceTypeIds}
            onAddProductPick={() => setOpenPicker('product')}
            onAddPriceTypePick={() => setOpenPicker('matrixPriceType')}
          />
        </div>

        {/* Detail content tabs (audit history + files) */}
        <div className="mt-6">
          <DetailContentTabs
            auditEntity="PriceList"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={t('products_count')}
            filesSlot={<AttachmentsSection entity="PriceList" entityId={data.id} />}
          >
            {/* Summary card shown in the "Mahsulotlar" tab */}
            <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ms-text-muted)]">{t('products_count')}</span>
                <span className="font-medium tabular-nums">
                  {Object.keys(data.pricesJson ?? {}).length}
                </span>
              </div>
              {data.priceType && (
                <div className="mt-2 flex items-center justify-between border-[var(--ms-border-default)] border-t pt-2">
                  <span className="text-[var(--ms-text-muted)]">{t('default_price_type')}</span>
                  <span className="font-medium">{data.priceType.name}</span>
                </div>
              )}
            </div>
          </DetailContentTabs>
        </div>
      </main>

      {/* Org picker */}
      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setForm({ ...form, organizationId: item.id, organizationLabel: String(item.primary) });
        }}
      />

      {/* Default price type picker (meta field) */}
      <CatalogPicker
        open={openPicker === 'priceType'}
        onClose={() => setOpenPicker(null)}
        title={t('default_price_type')}
        fetcher={priceTypeFetcher}
        onSelect={(item) => {
          setForm({ ...form, priceTypeId: item.id, priceTypeLabel: String(item.primary) });
        }}
      />

      {/* Add price type column */}
      <CatalogPicker
        open={openPicker === 'matrixPriceType'}
        onClose={() => setOpenPicker(null)}
        title={t('add_price_type_title')}
        fetcher={priceTypeFetcher}
        onSelect={(item) => {
          handleAddPriceTypeColumn(item.id);
        }}
      />

      {/* Add product row */}
      <CatalogPicker
        open={openPicker === 'product'}
        onClose={() => setOpenPicker(null)}
        title={t('add_product')}
        fetcher={productFetcher}
        onSelect={(item) => {
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
    </div>
  );
}
