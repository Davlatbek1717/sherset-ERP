'use client';

/**
 * /internal-orders/[id] — Ichki buyurtma detail page.
 *
 * Differences vs. purchase-orders/[id]:
 *  - No agent (counterparty) field
 *  - No bank account / contract picker (internal doc, no counterparty)
 *  - Проект (project) supported — moysklad parity for internal stock docs
 *  - No discount on positions
 *  - movedQuantity column shown (read-only server-derived progress)
 *  - deliveryPlannedMoment: date-only input
 *  - Positions PATCH uses replace-all semantics
 *  - UZS-only currency (no rate adjustment)
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
import { usePositionEditorLabels } from '@/hooks/use-position-editor-labels';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { DOC_STATE_VERB, buildDocStateMenu } from '@/lib/doc-state-dropdown';
import { docTotals } from '@/lib/doc-totals';
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
  PositionEditor,
  type PositionRow,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface PositionDetail {
  id: string;
  position: number;
  assortmentKind: string;
  assortmentId: string;
  /** Decimal string — qty ordered */
  quantity: string;
  /** Decimal string — qty already moved (fulfilled via linked Move docs) */
  movedQuantity: string;
  priceMinor: string;
  vat: number | null;
  vatEnabled: boolean;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface InternalOrderDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  deliveryPlannedMoment: string | null;
  description: string | null;
  sumMinor: string;
  vatSumMinor: string;
  movedSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  currency: string;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  project: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  positions: PositionDetail[];
  createdAt: string;
  updatedAt: string;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  vat: number | null;
}

interface FormState {
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  projectId: string | null;
  projectLabel: string;
  description: string;
  externalCode: string;
  deliveryPlannedMoment: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  positions: PositionRow[];
}

function formFromData(d: InternalOrderDetail): FormState {
  return {
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    description: d.description ?? '',
    externalCode: d.externalCode ?? '',
    deliveryPlannedMoment: d.deliveryPlannedMoment ? d.deliveryPlannedMoment.slice(0, 10) : '',
    vatEnabled: d.vatEnabled,
    vatIncluded: d.vatIncluded,
    positions: d.positions
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        _uid: p.id,
        assortmentId: p.assortmentId,
        productLabel: p.product?.name ?? '—',
        productUom: p.product?.uom ?? null,
        quantity: p.quantity,
        priceMinor: p.priceMinor,
        // No discount on InternalOrder
        discount: '0',
        vat: p.vat != null ? String(p.vat) : '',
        vatEnabled: p.vatEnabled,
      })),
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    organizationId: s.organizationId,
    storeId: s.storeId,
    projectId: s.projectId,
    description: s.description,
    externalCode: s.externalCode,
    deliveryPlannedMoment: s.deliveryPlannedMoment,
    vatEnabled: s.vatEnabled,
    vatIncluded: s.vatIncluded,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      vat: p.vat,
      vatEnabled: p.vatEnabled,
    })),
  });
}

/**
 * Moved-quantity progress cell — shows "movedQty / orderedQty" in a compact
 * format, with a muted colour when fulfilled. This is a read-only server value
 * derived from linked Move documents; it cannot be edited here.
 */
function MovedProgressCell({
  movedQuantity,
  quantity,
  uom,
  title,
}: {
  movedQuantity: string;
  quantity: string;
  uom: string | null;
  /** Pre-localised "{label}: {moved} / {total} {uom}" tooltip (MovedProgressCell
      is module-level so it has no `t` in scope — the caller builds the string). */
  title: string;
}) {
  const moved = Number(movedQuantity || '0');
  const total = Number(quantity || '0');
  const isFull = total > 0 && moved >= total;
  return (
    <span
      className={`text-xs tabular-nums ${isFull ? 'text-[var(--ms-text-success)]' : 'text-[var(--ms-text-muted)]'}`}
      title={title}
    >
      {moved}/{total}
      {uom ? ` ${uom}` : ''}
    </span>
  );
}

export default function InternalOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('internal-orders', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.internal_order');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.internal_order');
  const tDetailTabs = useTranslations('detail_tabs');
  const tTransitions = useTranslations('transitions');
  const positionLabels = usePositionEditorLabels();

  const { data, isLoading } = useQuery<InternalOrderDetail>({
    queryKey: ['internal-order', id],
    queryFn: () => api.get(`/internal-orders/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<null | 'org' | 'store' | 'project'>(null);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['internal-order', id], () => setForm(null));

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
    mutationFn: (target: string) => api.post(`/internal-orders/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-order', id] });
      qc.invalidateQueries({ queryKey: ['internal-orders'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/internal-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-orders'] });
      router.push('/internal-orders');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/internal-orders/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['internal-orders'] });
      router.push(`/internal-orders/${clone.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        externalCode: form.externalCode || null,
        deliveryPlannedMoment: form.deliveryPlannedMoment || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        projectId: form.projectId,
      };
      if (data && !data.applicable) {
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        // Replace-all semantics: send the full positions array
        payload.positions = form.positions.map((p, idx) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: PositionEditor guarantees assortmentId set
          assortmentId: p.assortmentId!,
          quantity: Number(p.quantity),
          priceMinor: p.priceMinor || undefined,
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          position: idx + 1,
        }));
      }
      return api.patch(`/internal-orders/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['internal-order', id] });
      qc.invalidateQueries({ queryKey: ['internal-orders'] });
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
  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: ProductItem[] }>(
      `/products?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
      meta: p.uom ?? undefined,
      raw: p,
    }));
  };

  // 404 (o'chirilgan hujjat yoki record-scope ko'rsatmaydigan yozuv) yuklash
  // TUGAGACH shu yerda tutiladi. Ilgari bu shart quyidagi loading-shoxidan
  // KEYIN turardi va HECH QACHON ishlamasdi (form faqat data kelganda
  // to'ladi) — sahifa abadiy «Yuklanmoqda…» bo'lib qolardi (MK40 brauzer-QA).
  if (!data)
    return isLoading ? (
      <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
    ) : (
      <div className="p-8 text-sm">{tCommon('not_found')}</div>
    );
  if (!form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;

  const editable = !data.applicable;
  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);

  // Create-related: from a posted InternalOrder you can create a Move doc
  const canCreateMove =
    data.state === 'posted' && BigInt(data.movedSumMinor || '0') < BigInt(data.sumMinor || '0');

  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'move',
      // moysklad parity: «Создать» menu uses the singular detail_titles name
      // («Перемещение»); was a hardcoded Uzbek string that leaked into the RU UI.
      label: tDetailTitles('move'),
      onSelect: canCreateMove
        ? () => router.push(`/moves/new?fromInternalOrderId=${id}`)
        : undefined,
      disabled: !canCreateMove,
    },
  ];

  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="internal-order-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/internal-orders')}
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
        titlePrefix={tDetailTitles('internal_order')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(data.state as 'draft' | 'posted' | 'cancelled')}
        stateTone={documentStateTone(data.state)}
        stateSlug={data.state}
        stateMenuItems={buildDocStateMenu(['draft', 'posted', 'cancelled'], (slug) =>
          tStates(slug as 'draft' | 'posted' | 'cancelled'),
        )}
        onStateChange={(slug) => transitionMut.mutate(DOC_STATE_VERB[slug] ?? slug)}
        stateBusy={transitionMut.isPending}
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
              {tTransitions('cancel')}
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
                onPick={() => editable && setOpenPicker('org')}
                inlineFetcher={orgFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        organizationId: item.id,
                        organizationLabel: String(item.primary),
                      },
                  )
                }
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
                onPick={() => editable && setOpenPicker('store')}
                inlineFetcher={storeFetcher}
                onInlineSelect={(item) =>
                  setForm((s) => s && { ...s, storeId: item.id, storeLabel: String(item.primary) })
                }
                onClear={() =>
                  editable && setForm((s) => s && { ...s, storeId: '', storeLabel: '' })
                }
                disabled={!editable}
                testId="field-store"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tDetailForm('external_code')}>
              <Input
                value={form.externalCode}
                onChange={(e) => setForm((s) => s && { ...s, externalCode: e.target.value })}
                disabled={!editable}
                maxLength={255}
                placeholder="—"
                data-test-id="field-external-code"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('project')}>
              <CatalogPickerField
                value={form.projectId ? { id: form.projectId, label: form.projectLabel } : null}
                onPick={() => editable && setOpenPicker('project')}
                inlineFetcher={projectFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) => s && { ...s, projectId: item.id, projectLabel: String(item.primary) },
                  )
                }
                onClear={() =>
                  editable && setForm((s) => s && { ...s, projectId: null, projectLabel: '' })
                }
                disabled={!editable}
                testId="field-project"
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

        {/* Moved-progress summary row — informational, not editable */}
        {data.applicable && (
          <div className="mt-2 flex items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 py-2 text-sm">
            <Icons.check className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" />
            <span className="text-[var(--ms-text-muted)]">
              {t('moved_progress', {
                moved: formatMoney(data.movedSumMinor, data.currency, { displayAs: 'none' }),
                total: formatMoney(data.sumMinor, data.currency),
              })}
            </span>
          </div>
        )}

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="InternalOrder"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tDetailTabs('positions')}
            filesSlot={<AttachmentsSection entity="InternalOrder" entityId={data.id} />}
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                {/* PositionEditor with extra moved-quantity column overlay */}
                <PositionEditor<ProductItem>
                  labels={positionLabels}
                  hideTotals
                  positions={form.positions}
                  onChange={(next) => setForm((s) => s && { ...s, positions: next })}
                  vatEnabled={form.vatEnabled}
                  vatIncluded={form.vatIncluded}
                  productFetcher={productFetcher}
                  onPickProduct={(raw) => ({
                    priceMinor: '0',
                    vat: raw?.vat != null ? String(raw.vat) : '0',
                    productUom: raw?.uom ?? null,
                  })}
                  readOnly={!editable}
                />

                {/* Moved-quantity progress — read-only, server-derived from linked Move docs */}
                {form.positions.length > 0 && (
                  <div
                    className="mt-2 overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                    data-test-id="moved-progress-table"
                  >
                    <div className="grid grid-cols-[1fr_100px_100px] gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-3 py-1.5 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                      <div>{tFields('product')}</div>
                      <div className="text-right">{t('moved_col_ordered')}</div>
                      <div className="text-right">{t('moved_col_fulfilled')}</div>
                    </div>
                    {form.positions.map((pos) => {
                      const detail = data.positions.find((p) => p.id === pos._uid);
                      return (
                        <div
                          key={pos._uid}
                          className="grid grid-cols-[1fr_100px_100px] gap-2 border-[var(--ms-border-default)] border-b px-3 py-1.5 text-sm last:border-b-0"
                        >
                          <div className="truncate">{pos.productLabel}</div>
                          <div className="text-right text-[var(--ms-text-muted)] tabular-nums">
                            {pos.quantity}
                            {pos.productUom ? ` ${pos.productUom}` : ''}
                          </div>
                          <div className="text-right">
                            <MovedProgressCell
                              movedQuantity={detail?.movedQuantity ?? '0'}
                              quantity={pos.quantity}
                              uom={pos.productUom ?? null}
                              title={`${t('moved_progress', {
                                moved: Number(detail?.movedQuantity ?? '0'),
                                total: Number(pos.quantity || '0'),
                              })}${pos.productUom ? ` ${pos.productUom}` : ''}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => setOpenCatalogPicker(true)}
                    disabled={!editable}
                    data-test-id="position-add-from-catalog"
                  >
                    <Icons.create className="h-4 w-4" />
                    {tDetailForm('add_from_catalog')}
                  </Button>
                </div>
              </div>

              <DetailTotalsSidebar
                subtotalMinor={subtotal.toString()}
                currency={data.currency}
                vatMinor={data.vatSumMinor}
                vatEnabled={form.vatEnabled}
                vatIncluded={form.vatIncluded}
                totalMinor={total.toString()}
                totalQty={totalQty}
                readOnly={!editable}
                onToggleVatEnabled={(v) => setForm((s) => s && { ...s, vatEnabled: v })}
                onToggleVatIncluded={(v) => setForm((s) => s && { ...s, vatIncluded: v })}
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
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={t('destination_store')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, storeId: item.id, storeLabel: String(item.primary) })
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
        open={openCatalogPicker}
        onClose={() => setOpenCatalogPicker(false)}
        title={tDetailForm('add_from_catalog')}
        fetcher={productFetcher}
        onSelect={(item) => {
          const raw = (item as { raw?: ProductItem }).raw;
          const newPos: PositionRow = {
            _uid: `new-${Date.now()}`,
            assortmentId: item.id,
            productLabel: String(item.primary),
            productUom: raw?.uom ?? null,
            quantity: '1',
            priceMinor: '0',
            discount: '0',
            vat: raw?.vat != null ? String(raw.vat) : '0',
            vatEnabled: form.vatEnabled,
          };
          setForm((s) => s && { ...s, positions: [...s.positions, newPos] });
        }}
      />
    </div>
  );
}
