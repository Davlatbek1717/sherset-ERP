'use client';

/**
 * /processing-orders/[id] — Qayta ishlash buyurtmasi detail page.
 *
 * Planning-only document. No stock cascade on transition.
 * Shows BOM info as read-only card with components materials table.
 * Clone available; soft delete blocked on posted (must unpost first).
 *
 * Fulfilment: movedSumMinor counter on the row is bumped/decremented by
 * Processing operations linked via processingOrderId. The detail page
 * surfaces this as a progress bar so the operator sees how much of the
 * planned cost has been realised on the shop floor.
 */

import { AttachmentsSection } from '@/components/attachments-section';
import {
  type CreateMenuItem,
  DetailContentTabs,
  DetailHeader,
  DetailToolbar,
  DetailTotalsSidebar,
} from '@/components/document-detail';
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

interface ProcessingPlanDetail {
  id: string;
  name: string;
  standardCostMinor: string;
  outputQty: string;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
  components: BomComponent[];
}

interface ProcessingOrderDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  deliveryPlannedMoment: string | null;
  description: string | null;
  /** microqty ×1000 string */
  quantity: string;
  sumMinor: string;
  /** Aggregate cost of Processing ops linked to this order. Bumped by
   *  Processing.post; decremented by unpost/cancel. */
  movedSumMinor: string;
  organizationId: string;
  storeId: string;
  processingPlanId: string | null;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  project: { id: string; name: string } | null;
  owner: { id: string; name: string; email: string } | null;
  processingPlan: ProcessingPlanDetail | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  projectId: string | null;
  projectLabel: string;
  processingPlanId: string | null;
  processingPlanLabel: string;
  quantity: string;
  deliveryPlannedMoment: string;
  description: string;
}

// =========================================================================
// Helpers
// =========================================================================

function formFromData(d: ProcessingOrderDetail): FormState {
  return {
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    processingPlanId: d.processingPlanId,
    processingPlanLabel: d.processingPlan?.name ?? '',
    // microqty → whole units
    quantity: (Number(d.quantity) / 1_000).toString(),
    deliveryPlannedMoment: d.deliveryPlannedMoment ? d.deliveryPlannedMoment.slice(0, 10) : '',
    description: d.description ?? '',
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    organizationId: s.organizationId,
    storeId: s.storeId,
    projectId: s.projectId,
    processingPlanId: s.processingPlanId,
    quantity: s.quantity,
    deliveryPlannedMoment: s.deliveryPlannedMoment,
    description: s.description,
  });
}

// =========================================================================
// Component
// =========================================================================

export default function ProcessingOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('processing-orders', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.processing_order');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.processing_order');
  const tDetailTabs = useTranslations('detail_tabs');

  const { data, isLoading } = useQuery<ProcessingOrderDetail>({
    queryKey: ['processing-order', id],
    queryFn: () => api.get(`/processing-orders/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<null | 'org' | 'store' | 'bom' | 'project'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['processing-order', id], () => setForm(null));

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
    mutationFn: (target: string) => api.post(`/processing-orders/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processing-order', id] });
      qc.invalidateQueries({ queryKey: ['processing-orders'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/processing-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processing-orders'] });
      router.push('/processing-orders');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/processing-orders/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['processing-orders'] });
      router.push(`/processing-orders/${clone.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        deliveryPlannedMoment: form.deliveryPlannedMoment || null,
        projectId: form.projectId,
      };
      if (!data.applicable) {
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        payload.processingPlanId = form.processingPlanId ?? null;
        payload.quantity = form.quantity;
      }
      return api.patch(`/processing-orders/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['processing-order', id] });
      qc.invalidateQueries({ queryKey: ['processing-orders'] });
      if (form) setOriginal(snapshot(form));
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const { runDestructive } = useDestructiveMutation();

  // Fetchers
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/organizations?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
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

  if (isLoading || !form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const editable = !data.applicable;

  // BOM components from the (potentially freshly linked) processingPlan
  const bom = data.processingPlan;
  const qtyWhole = Number(form.quantity || '0');
  // moysklad parity — material total = component.qty × recipeRuns, where
  // recipeRuns = orderQty / BOM.outputQty (mirrors processings/[id] + the
  // backend consumption formula). Multiplying by qtyWhole directly over-counts
  // whenever outputQty ≠ 1.
  const outputQty = bom ? Number(bom.outputQty || '1') : 1;
  const recipeRuns = bom && outputQty > 0 ? qtyWhole / outputQty : 0;
  const materialsRows =
    bom?.components.map((c) => ({
      ...c,
      totalQty: (Number(c.qty) * recipeRuns).toFixed(3).replace(/\.?0+$/, ''),
    })) ?? [];

  const sumBig = BigInt(data.sumMinor || '0');
  const totalQty = Number(form.quantity || '0');

  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'processing_op',
      label: tDetailTitles('processing'),
      onSelect: () => router.push(`/processings/new?processingOrderId=${encodeURIComponent(id)}`),
    },
  ];

  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="processing-order-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/processing-orders')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        onClone={() => cloneMut.mutate()}
        onDelete={
          !data.applicable
            ? () =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                  successMessage: tCommon('saved'),
                })
            : undefined
        }
        createMenuItems={createMenuItems}
      />

      <DetailHeader
        titlePrefix={tDetailTitles('processing_order')}
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
            <DocumentMetaField label={t('delivery_planned')}>
              <Input
                type="date"
                value={form.deliveryPlannedMoment}
                onChange={(e) =>
                  setForm((s) => s && { ...s, deliveryPlannedMoment: e.target.value })
                }
                disabled={!editable}
                data-test-id="field-delivery-planned"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('destination_store')} required>
              <CatalogPickerField
                value={form.storeId ? { id: form.storeId, label: form.storeLabel } : null}
                placeholder={t('destination_store')}
                onPick={() => editable && setOpenPicker('store')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, storeId: '', storeLabel: '' })
                }
                disabled={!editable}
                testId="field-store"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('external_code')}>
              <Input
                value={data.externalCode ?? ''}
                disabled
                placeholder="—"
                data-test-id="field-external-code"
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
            <DocumentMetaField label={t('processing_plan')}>
              <CatalogPickerField
                value={
                  form.processingPlanId
                    ? { id: form.processingPlanId, label: form.processingPlanLabel }
                    : null
                }
                placeholder={t('select_processing_plan')}
                onPick={() => editable && setOpenPicker('bom')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, processingPlanId: null, processingPlanLabel: '' })
                }
                disabled={!editable}
                testId="field-bom"
              />
            </DocumentMetaField>
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
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('description')}>
              <Input
                value={form.description}
                onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                disabled={!editable}
                data-test-id="field-description"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="ProcessingOrder"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tDetailTabs('main')}
            filesSlot={<AttachmentsSection entity="ProcessingOrder" entityId={data.id} />}
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-4">
                {/* BOM materials card — read-only, planning reference */}
                {bom ? (
                  <div
                    className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                    data-test-id="bom-materials-card"
                  >
                    <div className="flex items-center gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2 text-xs uppercase tracking-wide">
                      <Icons.production className="h-3.5 w-3.5 text-[var(--ms-text-muted)]" />
                      <span className="font-medium text-[var(--ms-text-muted)]">
                        {t('materials_from_bom')} — {bom.name}
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
                      <span className="text-[var(--ms-text-muted)]">
                        {t('total_materials_cost')}
                      </span>
                      <span className="font-medium tabular-nums">
                        {(Number(data.sumMinor || '0') / 100).toFixed(2)} UZS
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed px-4 py-6 text-center text-[var(--ms-text-muted)] text-sm"
                    data-test-id="bom-materials-empty"
                  >
                    {t('no_bom_selected')}
                  </div>
                )}

                {/* Fulfilment progress — driven by Processing ops linked via processingOrderId */}
                <FulfilmentProgress plannedMinor={data.sumMinor} movedMinor={data.movedSumMinor} />

                <ProcessingOpsList orderId={id} />
              </div>

              <DetailTotalsSidebar
                subtotalMinor={sumBig.toString()}
                vatMinor="0"
                vatEnabled={false}
                vatIncluded={false}
                totalMinor={sumBig.toString()}
                totalQty={totalQty}
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
        title={tForm('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, organizationId: item.id, organizationLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tForm('store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, storeId: item.id, storeLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tForm('project_picker_title')}
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
    </div>
  );
}

// =========================================================================
// FulfilmentProgress — visual bar showing movedSumMinor / sumMinor
// =========================================================================

function FulfilmentProgress({
  plannedMinor,
  movedMinor,
}: {
  plannedMinor: string;
  movedMinor: string;
}) {
  const t = useTranslations('pages.processing_order');
  const planned = BigInt(plannedMinor || '0');
  const moved = BigInt(movedMinor || '0');
  // Percent: scale via Number only AFTER BigInt division to keep precision.
  // movedShare = clamp(moved / planned, 0..1) — but only if planned > 0.
  let pct = 0;
  if (planned > 0n) {
    // Multiply moved by 10000 first so we get 2-decimal % precision via integer div
    const scaled = Number((moved * 10_000n) / planned);
    pct = Math.max(0, Math.min(100, scaled / 100));
  }
  const remaining = planned > moved ? planned - moved : 0n;
  const isComplete = planned > 0n && moved >= planned;

  return (
    <div
      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
      data-test-id="fulfilment-progress"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-[var(--ms-text-primary)] text-sm">
          {t('fulfilment_progress')}
        </span>
        <span
          className={`font-medium text-sm tabular-nums ${
            isComplete ? 'text-[var(--ms-text-success)]' : 'text-[var(--ms-text-muted)]'
          }`}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--ms-bg-muted)]">
        <div
          className={`h-full transition-all ${
            isComplete ? 'bg-[var(--ms-success-500)]' : 'bg-[var(--ms-brand-500)]'
          }`}
          style={{ width: `${pct}%` }}
          data-test-id="fulfilment-progress-bar"
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[var(--ms-text-muted)] text-xs">
        <div>
          <div>{t('planned')}</div>
          <div className="font-medium text-[var(--ms-text-primary)] tabular-nums">
            {(Number(planned) / 100).toFixed(2)} UZS
          </div>
        </div>
        <div>
          <div>{t('fulfilled')}</div>
          <div className="font-medium text-[var(--ms-text-primary)] tabular-nums">
            {(Number(moved) / 100).toFixed(2)} UZS
          </div>
        </div>
        <div>
          <div>{t('remaining')}</div>
          <div className="font-medium text-[var(--ms-text-primary)] tabular-nums">
            {(Number(remaining) / 100).toFixed(2)} UZS
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// ProcessingOpsList — linked Processing operations for this order
// =========================================================================

interface LinkedProcessing {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  quantity: string;
  costSumMinor: string;
  moment: string;
}

function ProcessingOpsList({ orderId }: { orderId: string }) {
  const t = useTranslations('pages.processing_order');
  const tStates = useTranslations('states.processing');
  const { data } = useQuery<{ items: LinkedProcessing[] }>({
    queryKey: ['processings', 'by-order', orderId],
    queryFn: () =>
      api.get<{ items: LinkedProcessing[] }>(
        `/processings?processingOrderId=${encodeURIComponent(orderId)}&limit=100&sortBy=moment&sortDir=desc`,
      ),
  });

  const items = data?.items ?? [];

  return (
    <div
      className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
      data-test-id="processing-ops-list"
    >
      <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
        {t('linked_processings')} — {items.length}
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[var(--ms-text-muted)] text-sm">
          {t('linked_processings_empty')}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">№</th>
              <th className="px-3 py-1.5 text-left font-medium">{t('col_date')}</th>
              <th className="px-3 py-1.5 text-right font-medium">{t('col_quantity')}</th>
              <th className="px-3 py-1.5 text-right font-medium">{t('col_cost')}</th>
              <th className="px-3 py-1.5 text-left font-medium">{t('col_status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-[var(--ms-border-default)] border-b last:border-b-0">
                <td className="px-3 py-2">
                  <a
                    href={`/processings/${p.id}`}
                    className="font-medium text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
                  >
                    {p.name}
                  </a>
                </td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs tabular-nums">
                  {formatDate(p.moment)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(Number(p.quantity) / 1_000).toString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(Number(p.costSumMinor) / 100).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span
                    className={
                      p.state === 'posted'
                        ? 'text-[var(--ms-text-success)]'
                        : p.state === 'cancelled'
                          ? 'text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-muted)]'
                    }
                  >
                    {tStates(p.state as 'draft' | 'posted' | 'cancelled')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
