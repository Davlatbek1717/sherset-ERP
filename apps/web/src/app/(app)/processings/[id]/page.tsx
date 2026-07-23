'use client';

/**
 * /processings/[id] — Texoperatsiya detail page.
 *
 * Unlike ProcessingOrder, posting triggers a real stock cascade via
 * StockService.applyDeltas — materials consumed, output produced, all in
 * one Serializable transaction. The detail page surfaces this via:
 *   - "Stock ta'siri" card showing what will be consumed + produced
 *   - Locked editor while applicable=true (must unpost to edit)
 *   - Cancel button that reverses the cascade when used from posted
 */

import { AttachmentsSection } from '@/components/attachments-section';
import {
  DetailContentTabs,
  DetailHeader,
  DetailToolbar,
  DetailTotalsSidebar,
} from '@/components/document-detail';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { usePositionEditorLabels } from '@/hooks/use-position-editor-labels';
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
  Checkbox,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  Icons,
  Input,
  type PickerItem,
  PositionEditor,
  type PositionRow,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

// =========================================================================
// Types
// =========================================================================

interface BomComponent {
  id: string;
  productId: string;
  qty: string;
  position: number;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

/** §88/§89 explicit per-op line (materials[] / products[]). */
interface ProcessingLine {
  id: string;
  productId: string;
  qty: string;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface ProcessingPlanDetail {
  id: string;
  name: string;
  standardCostMinor: string;
  outputQty: string;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
  components: BomComponent[];
}

interface ProcessingDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
  /** microqty ×1000 string */
  quantity: string;
  costSumMinor: string;
  organizationId: string;
  materialsStoreId: string;
  productsStoreId: string;
  processingPlanId: string | null;
  processingOrderId: string | null;
  organization: { id: string; name: string };
  materialsStore: { id: string; name: string };
  productsStore: { id: string; name: string };
  project: { id: string; name: string } | null;
  owner: { id: string; name: string; email: string } | null;
  processingPlan: ProcessingPlanDetail | null;
  processingOrder: { id: string; name: string } | null;
  /** §88/§89 — explicit overrides (empty ⇒ BOM-driven). */
  materials: ProcessingLine[];
  products: ProcessingLine[];
  /** §117 — moysklad «Выполнение этапа производства» extensions. */
  processingStageId: string | null;
  processingStage: { id: string; name: string; materialMarkup: number } | null;
  performer: { id: string; name: string } | null;
  defect: boolean;
  enableHourAccounting: boolean;
  labourUnitCostMinor: string;
  standardHourUnit: string;
  standardHourCostMinor: string;
  createdAt: string;
  updatedAt: string;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
}

interface FormState {
  organizationId: string;
  organizationLabel: string;
  materialsStoreId: string;
  materialsStoreLabel: string;
  productsStoreId: string;
  productsStoreLabel: string;
  projectId: string | null;
  projectLabel: string;
  processingPlanId: string | null;
  processingPlanLabel: string;
  processingOrderId: string | null;
  processingOrderLabel: string;
  quantity: string;
  description: string;
  /** §92 — explicit per-op overrides (empty ⇒ BOM-driven default). */
  materials: PositionRow[];
  products: PositionRow[];
  /** §117 — stage-completion cost-engine inputs (so'm in the UI). */
  defect: boolean;
  enableHourAccounting: boolean;
  labourUnitCost: string;
  standardHourUnit: string;
  standardHourCost: string;
  /** §126/round-6c — editable stage (standalone Этап) + performer link. */
  processingStageId: string | null;
  processingStageLabel: string;
  performerId: string | null;
  performerLabel: string;
}

/** §92 — map an explicit ProcessingLine to a qty-only PositionRow. */
function lineToRow(l: ProcessingLine): PositionRow {
  return {
    _uid: l.id,
    assortmentId: l.productId,
    productLabel: l.product?.name ?? '—',
    productUom: l.product?.uom ?? null,
    quantity: l.qty,
    priceMinor: '0',
    discount: '0',
    vat: '',
    vatEnabled: false,
  };
}

// =========================================================================
// Helpers
// =========================================================================

/** §117 — tiyin string → so'm display (trim trailing .00). */
function tiyinToSom(tiyin: string): string {
  const n = Number(tiyin);
  if (!Number.isFinite(n)) return '0';
  const som = n / 100;
  return Number.isInteger(som) ? String(som) : som.toFixed(2);
}
/** §117 — so'm string → integer-tiyin string (money discipline). */
function somToTiyin(som: string): string {
  const n = Number(som);
  if (!Number.isFinite(n) || n < 0) return '0';
  return String(Math.round(n * 100));
}

function formFromData(d: ProcessingDetail): FormState {
  // microqty (BigInt string) → whole units. Walk digits to avoid Number rounding.
  const microStr = d.quantity || '0';
  let quantityWhole: string;
  if (microStr === '0') {
    quantityWhole = '0';
  } else {
    const neg = microStr.startsWith('-');
    const abs = neg ? microStr.slice(1) : microStr;
    if (abs.length <= 3) {
      const padded = abs.padStart(4, '0');
      const fracTrim = padded.slice(1).replace(/0+$/, '');
      quantityWhole = (neg ? '-' : '') + (fracTrim ? `0.${fracTrim}` : '0');
    } else {
      const whole = abs.slice(0, -3);
      const frac = abs.slice(-3).replace(/0+$/, '');
      quantityWhole = (neg ? '-' : '') + (frac ? `${whole}.${frac}` : whole);
    }
  }
  return {
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    materialsStoreId: d.materialsStore.id,
    materialsStoreLabel: d.materialsStore.name,
    productsStoreId: d.productsStore.id,
    productsStoreLabel: d.productsStore.name,
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    processingPlanId: d.processingPlanId,
    processingPlanLabel: d.processingPlan?.name ?? '',
    processingOrderId: d.processingOrderId,
    processingOrderLabel: d.processingOrder?.name ?? '',
    quantity: quantityWhole,
    description: d.description ?? '',
    materials: (d.materials ?? []).map(lineToRow),
    products: (d.products ?? []).map(lineToRow),
    defect: d.defect ?? false,
    enableHourAccounting: d.enableHourAccounting ?? false,
    labourUnitCost: tiyinToSom(d.labourUnitCostMinor ?? '0'),
    standardHourUnit: d.standardHourUnit ?? '0',
    standardHourCost: tiyinToSom(d.standardHourCostMinor ?? '0'),
    processingStageId: d.processingStage?.id ?? null,
    processingStageLabel: d.processingStage?.name ?? '',
    performerId: d.performer?.id ?? null,
    performerLabel: d.performer?.name ?? '',
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    organizationId: s.organizationId,
    materialsStoreId: s.materialsStoreId,
    productsStoreId: s.productsStoreId,
    projectId: s.projectId,
    processingPlanId: s.processingPlanId,
    processingOrderId: s.processingOrderId,
    quantity: s.quantity,
    description: s.description,
    materials: s.materials.map((p) => ({ a: p.assortmentId, q: p.quantity })),
    products: s.products.map((p) => ({ a: p.assortmentId, q: p.quantity })),
    defect: s.defect,
    enableHourAccounting: s.enableHourAccounting,
    labourUnitCost: s.labourUnitCost,
    standardHourUnit: s.standardHourUnit,
    standardHourCost: s.standardHourCost,
  });
}

// =========================================================================
// Component
// =========================================================================

type PickerKey =
  | null
  | 'org'
  | 'matStore'
  | 'prodStore'
  | 'bom'
  | 'order'
  | 'project'
  | 'stage'
  | 'performer';

export default function ProcessingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const positionLabels = usePositionEditorLabels();
  const detailNav = useDetailNavigation('processings', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.processing');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.processing');
  const tDetailTabs = useTranslations('detail_tabs');

  const { data, isLoading } = useQuery<ProcessingDetail>({
    queryKey: ['processing', id],
    queryFn: () => api.get(`/processings/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<PickerKey>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // This form hydrates ONCE via `if (data && !form) setForm(...)` below, so
  // after the conflict reload re-fetches we must clear `form` to re-seed it
  // from the now-fresh `data` (the local-edit-state hydration pattern).
  const onConflict = useConflictReload(['processing', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/processings/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processing', id] });
      qc.invalidateQueries({ queryKey: ['processings'] });
      // Stock ta'siri — refresh stock balances views
      qc.invalidateQueries({ queryKey: ['stock-balance'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/processings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processings'] });
      router.push('/processings');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/processings/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['processings'] });
      router.push(`/processings/${clone.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        // Optimistic-lock: send the version we LOADED (from the GET query),
        // not the form — a stale value makes the API reply 409.
        version: data.version,
        description: form.description || null,
        projectId: form.projectId,
      };
      if (data && !data.applicable) {
        payload.organizationId = form.organizationId;
        payload.materialsStoreId = form.materialsStoreId;
        payload.productsStoreId = form.productsStoreId;
        payload.processingPlanId = form.processingPlanId;
        payload.processingOrderId = form.processingOrderId;
        payload.quantity = form.quantity;
        // §92 — only send explicit lists when the user actually has
        // rows; sending [] would clear+replace (§88/§89 semantics) and
        // silently drop a BOM-driven op back to "no source".
        const mat = form.materials
          .filter((p) => p.assortmentId)
          .map((p) => ({ productId: p.assortmentId as string, qty: String(p.quantity) }));
        const prod = form.products
          .filter((p) => p.assortmentId)
          .map((p) => ({ productId: p.assortmentId as string, qty: String(p.quantity) }));
        if (mat.length > 0) payload.materials = mat;
        if (prod.length > 0) payload.products = prod;
        // §117 — stage-completion cost inputs (so'm → tiyin). `defect`
        // is intentionally NOT sent: moysklad immutable-after-create
        // (the API's .strict() Update schema rejects the key).
        payload.enableHourAccounting = form.enableHourAccounting;
        payload.labourUnitCostMinor = somToTiyin(form.labourUnitCost);
        payload.standardHourCostMinor = somToTiyin(form.standardHourCost);
        payload.standardHourUnit = form.standardHourUnit || '0';
        // §118-full — editable stage/performer link.
        payload.processingStageId = form.processingStageId;
        payload.performerId = form.performerId;
      }
      return api.patch(`/processings/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['processing', id] });
      qc.invalidateQueries({ queryKey: ['processings'] });
      if (form) setOriginal(snapshot(form));
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const { runDestructive } = useDestructiveMutation();

  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/organizations?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
  };
  // §126/round-6c — direct flat Этап catalog + Исполнитель pickers.
  const stageFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/processing-stages?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({ id: p.id, primary: p.name }));
  };
  const performerFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/employees?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((e) => ({ id: e.id, primary: e.name }));
  };
  // §92 — product picker for the explicit materials/products editors.
  const productFetcher = async (s: string): Promise<Array<PickerItem & { raw: ProductItem }>> => {
    const d = await api.get<{ items: ProductItem[] }>(
      `/products?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
      raw: p,
    }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/stores?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((st) => ({
      id: st.id,
      primary: st.name,
      secondary: st.code ?? undefined,
    }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const bomFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; product: { name: string } | null }>;
    }>(`/boms?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((b) => ({
      id: b.id,
      primary: b.name,
      secondary: b.product?.name ?? undefined,
    }));
  };
  const orderFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        processingPlan: { id: string; name: string } | null;
      }>;
    }>(`/processing-orders?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.processingPlan?.name ?? undefined,
    }));
  };

  if (isLoading || !form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const editable = !data.applicable;

  const bom = data.processingPlan;
  const qtyWhole = Number(form.quantity || '0');
  const outputQty = bom ? Number(bom.outputQty || '1') : 1;
  const recipeRuns = bom && outputQty > 0 ? qtyWhole / outputQty : 0;
  const materialsRows =
    bom?.components.map((c) => ({
      ...c,
      totalQty: (Number(c.qty) * recipeRuns).toFixed(3).replace(/\.?0+$/, ''),
    })) ?? [];

  const costSumBig = BigInt(data.costSumMinor || '0');

  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="processing-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/processings')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        onClone={() => cloneMut.mutate()}
        onDelete={
          editable
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
        titlePrefix={tDetailTitles('processing')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(data.state as 'draft' | 'posted' | 'cancelled')}
        stateTone={documentStateTone(data.state)}
        stateSlug={data.state}
        applicable={data.applicable}
        onToggleApplicable={onToggleApplicable}
        applicableBusy={transitionMut.isPending}
        pillsSlot={
          data.state !== 'cancelled' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => transitionMut.mutate('cancel')}
              data-test-id="btn-cancel"
            >
              {tCommon('cancel')}
            </Button>
          ) : undefined
        }
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
        {transitionMut.error && (
          <Alert tone="destructive" className="mb-3">
            {(transitionMut.error as Error).message}
          </Alert>
        )}
        {saveError && (
          <Alert tone="destructive" className="mb-3">
            {saveError}
          </Alert>
        )}
        {data.applicable && (
          <Alert tone="info" className="mb-3">
            {tCommon('locked_when_posted')}
          </Alert>
        )}

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
                onPick={() => editable && setOpenPicker('org')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, organizationId: '', organizationLabel: '' })
                }
                disabled={!editable}
                testId="field-organization"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('processing_plan')} required>
              <CatalogPickerField
                value={
                  form.processingPlanId
                    ? { id: form.processingPlanId, label: form.processingPlanLabel }
                    : null
                }
                placeholder={t('processing_plan')}
                onPick={() => editable && setOpenPicker('bom')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, processingPlanId: null, processingPlanLabel: '' })
                }
                disabled={!editable}
                testId="field-bom"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('materials_store')} required>
              <CatalogPickerField
                value={
                  form.materialsStoreId
                    ? { id: form.materialsStoreId, label: form.materialsStoreLabel }
                    : null
                }
                placeholder={t('materials_store')}
                onPick={() => editable && setOpenPicker('matStore')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, materialsStoreId: '', materialsStoreLabel: '' })
                }
                disabled={!editable}
                testId="field-materials-store"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('products_store')} required>
              <CatalogPickerField
                value={
                  form.productsStoreId
                    ? { id: form.productsStoreId, label: form.productsStoreLabel }
                    : null
                }
                placeholder={t('products_store')}
                onPick={() => editable && setOpenPicker('prodStore')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, productsStoreId: '', productsStoreLabel: '' })
                }
                disabled={!editable}
                testId="field-products-store"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('project')}>
              <CatalogPickerField
                value={form.projectId ? { id: form.projectId, label: form.projectLabel } : null}
                placeholder={tFields('project')}
                onPick={() => editable && setOpenPicker('project')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, projectId: null, projectLabel: '' })
                }
                disabled={!editable}
                testId="field-project"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('output_quantity')} required>
              <Input
                type="number"
                min="0.001"
                step="1"
                value={form.quantity}
                onChange={(e) => setForm((s) => s && { ...s, quantity: e.target.value })}
                disabled={!editable}
                data-test-id="field-quantity"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('source_processing_order')}>
              <CatalogPickerField
                value={
                  form.processingOrderId
                    ? { id: form.processingOrderId, label: form.processingOrderLabel }
                    : null
                }
                placeholder={t('select_processing_order')}
                onPick={() => editable && setOpenPicker('order')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, processingOrderId: null, processingOrderLabel: '' })
                }
                disabled={!editable}
                testId="field-order"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tDetailForm('external_code')}>
              <Input
                value={data.externalCode ?? ''}
                disabled
                placeholder="—"
                data-test-id="field-external-code"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('description')}>
              <Input
                value={form.description}
                onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                disabled={!editable}
                data-test-id="field-description"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          {/* §126/round-6c — moysklad «Выполнение этапа производства»:
              editable stage + performer link. Stage is now picked
              directly from the STANDALONE Этап catalog (/processing-
              stages flat endpoint — the §118 «no flat endpoint»
              2-level limitation is fully removed). Performer = employee
              CatalogPicker. `defect` stays read-only (immutable). */}
          <DocumentMetaRow>
            <DocumentMetaField label={t('production_stage')}>
              <CatalogPickerField
                value={
                  form.processingStageId
                    ? { id: form.processingStageId, label: form.processingStageLabel }
                    : null
                }
                placeholder={t('select_processing_stage')}
                onPick={() => editable && setOpenPicker('stage')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, processingStageId: null, processingStageLabel: '' })
                }
                disabled={!editable}
                testId="field-processing-stage"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('performer')}>
              <CatalogPickerField
                value={
                  form.performerId ? { id: form.performerId, label: form.performerLabel } : null
                }
                placeholder={tForm('select_employee')}
                onPick={() => editable && setOpenPicker('performer')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, performerId: null, performerLabel: '' })
                }
                disabled={!editable}
                testId="field-performer"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('hour_accounting')}>
              <label className="flex h-8 items-center gap-2 text-sm">
                <Checkbox
                  checked={form.enableHourAccounting}
                  onCheckedChange={(v) =>
                    setForm((s) => s && { ...s, enableHourAccounting: v === true })
                  }
                  disabled={!editable}
                  data-test-id="field-hour-accounting"
                />
                <span className="text-[var(--ms-text-muted)]">{t('normo_hour')}</span>
              </label>
            </DocumentMetaField>
            <DocumentMetaField label={t('defect')}>
              <label className="flex h-8 items-center gap-2 text-sm">
                <Checkbox checked={form.defect} disabled data-test-id="field-defect" />
                <span className="text-[var(--ms-text-muted)]">
                  {form.defect ? t('defect') : '—'}
                </span>
              </label>
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('labour_cost_per_unit')}>
              <Input
                type="text"
                inputMode="decimal"
                value={form.labourUnitCost}
                onChange={(e) => setForm((s) => s && { ...s, labourUnitCost: e.target.value })}
                disabled={!editable || form.enableHourAccounting}
                className="text-right"
                data-test-id="field-labour-unit-cost"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('normo_hours_per_unit')}>
              <Input
                type="text"
                inputMode="decimal"
                value={form.standardHourUnit}
                onChange={(e) => setForm((s) => s && { ...s, standardHourUnit: e.target.value })}
                disabled={!editable}
                className="text-right"
                data-test-id="field-standard-hour-unit"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('normo_hour_cost')}>
              <Input
                type="text"
                inputMode="decimal"
                value={form.standardHourCost}
                onChange={(e) => setForm((s) => s && { ...s, standardHourCost: e.target.value })}
                disabled={!editable}
                className="text-right"
                data-test-id="field-standard-hour-cost"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="Processing"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tDetailTabs('positions')}
            filesSlot={<AttachmentsSection entity="Processing" entityId={data.id} />}
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-4">
                {/* §92 — explicit per-op materials override. Empty ⇒ the
                    BOM-driven default below applies (§88). */}
                <div data-test-id="explicit-materials-card">
                  <div className="mb-1 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('materials_to_consume')} — {t('manual_hint')}
                  </div>
                  <PositionEditor<ProductItem>
                    labels={positionLabels}
                    positions={form.materials}
                    onChange={(next) => setForm((s) => s && { ...s, materials: next })}
                    vatEnabled={false}
                    vatIncluded={false}
                    productFetcher={productFetcher}
                    onPickProduct={(raw) => ({ productUom: raw?.uom ?? null })}
                    readOnly={!editable}
                    mode="qty-only"
                  />
                </div>

                {/* §92/§89 — explicit outputs (multi/by-product). Empty ⇒
                    single BOM product. */}
                <div data-test-id="explicit-products-card">
                  <div className="mb-1 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                    {t('products_manual')}
                  </div>
                  <PositionEditor<ProductItem>
                    labels={positionLabels}
                    positions={form.products}
                    onChange={(next) => setForm((s) => s && { ...s, products: next })}
                    vatEnabled={false}
                    vatIncluded={false}
                    productFetcher={productFetcher}
                    onPickProduct={(raw) => ({ productUom: raw?.uom ?? null })}
                    readOnly={!editable}
                    mode="qty-only"
                  />
                </div>

                {/* BOM-driven default (read-only) — what posts when no
                    explicit override above. */}
                {bom ? (
                  <div
                    className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                    data-test-id="bom-materials-card"
                  >
                    <div className="flex items-center gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2 text-xs uppercase tracking-wide">
                      <Icons.production className="h-3.5 w-3.5 text-[var(--ms-text-muted)]" />
                      <span className="font-medium text-[var(--ms-text-muted)]">
                        {t('materials_to_consume')} — {bom.name}
                        {bom.product ? ` → ${bom.product.name}` : ''}
                      </span>
                    </div>

                    {materialsRows.length === 0 ? (
                      <div className="px-4 py-3 text-[var(--ms-text-muted)] text-sm">
                        {t('components_empty')}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1fr_80px_80px_100px] gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-1.5 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                          <div>{t('component')}</div>
                          <div className="text-right">{t('unit_qty')}</div>
                          <div className="text-right">{t('total_qty')}</div>
                          <div className="text-right">{tFields('uom')}</div>
                        </div>
                        {materialsRows.map((c) => (
                          <div
                            key={c.id}
                            className="grid grid-cols-[1fr_80px_80px_100px] gap-2 border-[var(--ms-border-default)] border-b px-4 py-2 text-sm last:border-b-0"
                          >
                            <div className="truncate font-medium">
                              {c.product?.name ?? c.productId}
                            </div>
                            <div className="text-right text-[var(--ms-text-muted)] tabular-nums">
                              {c.qty}
                            </div>
                            <div className="text-right font-medium tabular-nums">{c.totalQty}</div>
                            <div className="text-right text-[var(--ms-text-muted)] text-xs">
                              {c.product?.uom ?? '—'}
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="flex items-center justify-between border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-4 py-2 text-sm">
                      <span className="text-[var(--ms-text-muted)]">{t('cost_basis')}</span>
                      <span className="font-medium tabular-nums">
                        {(Number(costSumBig) / 100).toFixed(2)} UZS
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed px-4 py-6 text-center text-[var(--ms-text-muted)] text-sm"
                    data-test-id="bom-empty"
                  >
                    {t('bom_empty')}
                  </div>
                )}

                {/* Stock impact summary card — visible only when posted */}
                {data.applicable && (
                  <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-sm">
                    <div className="mb-2 font-medium text-[var(--ms-text-primary)]">
                      {t('stock_impact')}
                    </div>
                    <div className="space-y-1 text-[var(--ms-text-muted)]">
                      <div>
                        ↓ <strong>{data.materialsStore.name}</strong> — {t('materials_written_off')}
                      </div>
                      <div>
                        ↑ <strong>{data.productsStore.name}</strong> — {t('output_received')}
                      </div>
                      {data.postedAt && (
                        <div className="text-xs">
                          {t('posted_at')}: {formatDate(data.postedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <DetailTotalsSidebar
                subtotalMinor={costSumBig.toString()}
                vatMinor="0"
                vatEnabled={false}
                vatIncluded={false}
                totalMinor={costSumBig.toString()}
                totalQty={qtyWhole}
                readOnly
                onToggleVatEnabled={() => {}}
                onToggleVatIncluded={() => {}}
              />
            </div>
          </DetailContentTabs>
        </div>
      </main>

      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, organizationId: item.id, organizationLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'matStore'}
        onClose={() => setOpenPicker(null)}
        title={t('materials_store')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && { ...s, materialsStoreId: item.id, materialsStoreLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'prodStore'}
        onClose={() => setOpenPicker(null)}
        title={t('products_store')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && { ...s, productsStoreId: item.id, productsStoreLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tFields('project')}
        fetcher={projectFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, projectId: item.id, projectLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'bom'}
        onClose={() => setOpenPicker(null)}
        title={t('processing_plan_picker')}
        fetcher={bomFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && {
                ...s,
                processingPlanId: item.id,
                processingPlanLabel: String(item.primary),
              },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'order'}
        onClose={() => setOpenPicker(null)}
        title={t('processing_order_picker')}
        fetcher={orderFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && {
                ...s,
                processingOrderId: item.id,
                processingOrderLabel: String(item.primary),
              },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'stage'}
        onClose={() => setOpenPicker(null)}
        title={t('production_stage')}
        fetcher={stageFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && {
                ...s,
                processingStageId: item.id,
                processingStageLabel: String(item.primary),
              },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'performer'}
        onClose={() => setOpenPicker(null)}
        title={tFields('performer')}
        fetcher={performerFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, performerId: item.id, performerLabel: String(item.primary) })
        }
      />
    </div>
  );
}
