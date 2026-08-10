'use client';

/**
 * /productions/[id] — «Заказ на производство» (Production) detail/edit.
 *
 * §96 (Chat-1 round-3). GENUINE GAP closure: /productions/page.tsx
 * (list) and /productions/new (§93) both existed and were git-tracked,
 * but every row-click and the create-success redirect did
 * `router.push('/productions/:id')` → 404 (this page was absent). The
 * «Производство» FSM document was create-then-dead-end.
 *
 * Production is a header-only document (no positions/BOM — the actual
 * shop-floor work lives on child ProcessingOrders linked via
 * productionId). Structure mirrors the proven, gated processings/[id]
 * (§92) detail chrome; FSM is identical (post/unpost via the Provedeno
 * toggle + cancel pill — production.service targets: post|unpost|
 * cancel). The whole header locks when applicable=true (the API
 * rejects any PATCH on a posted Production).
 *
 * Field labels match /productions/new (§93) so the create↔detail pair
 * is internally consistent for this entity; state labels use the same
 * pages.productions namespace as the list page.
 */

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
  Checkbox,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
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

interface ProcessingOrderRef {
  id: string;
  name: string;
  state: string;
  quantity: string;
  moment: string;
}

interface ProductionDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  deliveryPlannedMoment: string | null;
  productionStart: string | null;
  productionEnd: string | null;
  reserve: boolean;
  awaiting: boolean;
  description: string | null;
  sumMinor: string;
  currency: string;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  materialsStore: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  customerOrder: { id: string; name: string; state: string } | null;
  owner: { id: string; name: string; email: string } | null;
  processingOrders: ProcessingOrderRef[];
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  materialsStoreId: string | null;
  materialsStoreLabel: string;
  projectId: string | null;
  projectLabel: string;
  customerOrderId: string | null;
  customerOrderLabel: string;
  externalCode: string;
  /** datetime-local strings (YYYY-MM-DDTHH:mm); '' ⇒ unset. */
  moment: string;
  deliveryPlannedMoment: string;
  productionStart: string;
  productionEnd: string;
  reserve: boolean;
  awaiting: boolean;
  description: string;
}

// =========================================================================
// Helpers
// =========================================================================

/** ISO datetime → `YYYY-MM-DDTHH:mm` for <input type="datetime-local">. */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` local → ISO; '' ⇒ undefined (omit from payload). */
function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function formFromData(d: ProductionDetail): FormState {
  return {
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    materialsStoreId: d.materialsStore?.id ?? null,
    materialsStoreLabel: d.materialsStore?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    customerOrderId: d.customerOrder?.id ?? null,
    customerOrderLabel: d.customerOrder?.name ?? '',
    externalCode: d.externalCode ?? '',
    moment: isoToLocal(d.moment),
    deliveryPlannedMoment: isoToLocal(d.deliveryPlannedMoment),
    productionStart: isoToLocal(d.productionStart),
    productionEnd: isoToLocal(d.productionEnd),
    reserve: d.reserve,
    awaiting: d.awaiting,
    description: d.description ?? '',
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify(s);
}

// =========================================================================
// Component
// =========================================================================

type PickerKey = null | 'org' | 'store' | 'matStore' | 'project' | 'customerOrder';

export default function ProductionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('productions', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.productions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tErrors = useTranslations('errors');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.processing_order');

  const { data, isLoading } = useQuery<ProductionDetail>({
    queryKey: ['production', id],
    queryFn: () => api.get(`/productions/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<PickerKey>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['production', id], () => setForm(null));

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
    mutationFn: (target: string) => api.post(`/productions/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production', id] });
      qc.invalidateQueries({ queryKey: ['productions'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/productions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productions'] });
      router.push('/productions');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/productions/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['productions'] });
      router.push(`/productions/${clone.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      if (!form.organizationId) throw new Error(tErrors('select_organization'));
      if (!form.storeId) throw new Error(t('select_product_store'));
      const payload: Record<string, unknown> = {
        // Optimistic-lock token — the version this form loaded (from the
        // server query `data`, NOT `form`, which has no version field).
        version: data.version,
        organizationId: form.organizationId,
        storeId: form.storeId,
        materialsStoreId: form.materialsStoreId,
        projectId: form.projectId,
        customerOrderId: form.customerOrderId,
        externalCode: form.externalCode || null,
        reserve: form.reserve,
        awaiting: form.awaiting,
        description: form.description || null,
      };
      const moment = localToIso(form.moment);
      if (moment) payload.moment = moment;
      payload.deliveryPlannedMoment = localToIso(form.deliveryPlannedMoment) ?? null;
      payload.productionStart = localToIso(form.productionStart) ?? null;
      payload.productionEnd = localToIso(form.productionEnd) ?? null;
      return api.patch(`/productions/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['production', id] });
      qc.invalidateQueries({ queryKey: ['productions'] });
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
  const customerOrderFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/customer-orders?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
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

  const stateLabel =
    data.state === 'draft'
      ? t('state_draft')
      : data.state === 'posted'
        ? t('state_posted')
        : t('state_cancelled');

  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => (s ? { ...s, [key]: value } : s));

  const dtField = (
    label: string,
    key: 'moment' | 'deliveryPlannedMoment' | 'productionStart' | 'productionEnd',
    testId: string,
  ) => (
    <DocumentMetaField label={label}>
      <Input
        type="datetime-local"
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
        disabled={!editable}
        data-test-id={testId}
      />
    </DocumentMetaField>
  );

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="production-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/productions')}
        onClone={() => cloneMut.mutate()}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
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
        printEntity="production"
      />

      <DetailHeader
        titlePrefix={tDetailTitles('production')}
        name={data.name}
        moment={data.moment}
        stateLabel={stateLabel}
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
                placeholder={tForm('select_organization')}
                onPick={() => editable && setOpenPicker('org')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, organizationId: '', organizationLabel: '' })
                }
                disabled={!editable}
                testId="field-organization"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('product_store')} required>
              <CatalogPickerField
                value={form.storeId ? { id: form.storeId, label: form.storeLabel } : null}
                placeholder={tForm('select_store')}
                onPick={() => editable && setOpenPicker('store')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, storeId: '', storeLabel: '' })
                }
                disabled={!editable}
                testId="field-store"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('material_store')}>
              <CatalogPickerField
                value={
                  form.materialsStoreId
                    ? { id: form.materialsStoreId, label: form.materialsStoreLabel }
                    : null
                }
                placeholder={tForm('select_store')}
                onPick={() => editable && setOpenPicker('matStore')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, materialsStoreId: null, materialsStoreLabel: '' })
                }
                disabled={!editable}
                testId="field-materials-store"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('project')}>
              <CatalogPickerField
                value={form.projectId ? { id: form.projectId, label: form.projectLabel } : null}
                placeholder={tForm('select_project')}
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
            <DocumentMetaField label={t('customer_order')}>
              <CatalogPickerField
                value={
                  form.customerOrderId
                    ? { id: form.customerOrderId, label: form.customerOrderLabel }
                    : null
                }
                placeholder={t('customer_order')}
                onPick={() => editable && setOpenPicker('customerOrder')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, customerOrderId: null, customerOrderLabel: '' })
                }
                disabled={!editable}
                testId="field-customer-order"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tDetailForm('external_code')}>
              <Input
                value={form.externalCode}
                onChange={(e) => setField('externalCode', e.target.value)}
                disabled={!editable}
                data-test-id="field-external-code"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            {dtField(t('doc_date'), 'moment', 'field-moment')}
            {dtField(t('ship_date_planned'), 'deliveryPlannedMoment', 'field-delivery')}
          </DocumentMetaRow>

          <DocumentMetaRow>
            {dtField(t('date_start'), 'productionStart', 'field-prod-start')}
            {dtField(t('date_end'), 'productionEnd', 'field-prod-end')}
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('reserve_materials')}>
              <label className="flex h-8 items-center gap-2 text-sm">
                <Checkbox
                  checked={form.reserve}
                  onCheckedChange={(v) => setField('reserve', v === true)}
                  disabled={!editable}
                  data-test-id="field-reserve"
                />
                <span className="text-[var(--ms-text-muted)]">{t('reserve_materials')}</span>
              </label>
            </DocumentMetaField>
            <DocumentMetaField label={t('awaiting_product')}>
              <label className="flex h-8 items-center gap-2 text-sm">
                <Checkbox
                  checked={form.awaiting}
                  onCheckedChange={(v) => setField('awaiting', v === true)}
                  disabled={!editable}
                  data-test-id="field-awaiting"
                />
                <span className="text-[var(--ms-text-muted)]">{t('awaiting_product')}</span>
              </label>
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('description')}>
              <Input
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                disabled={!editable}
                data-test-id="field-description"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-4">
          <DetailContentTabs auditEntity="Production" entityId={data.id} relatedGroups={[]}>
            <div className="space-y-4">
              <div
                className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                data-test-id="processing-orders-card"
              >
                <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('col_orders')}
                </div>
                {data.processingOrders.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[var(--ms-text-muted)] text-sm">
                    {tCommon('no_records')}
                  </div>
                ) : (
                  <table className="w-full text-sm" data-test-id="processing-orders-table">
                    <thead>
                      <tr className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)]">
                        <th className="px-4 py-1.5 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                          {tFields('number')}
                        </th>
                        <th className="px-4 py-1.5 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                          {tFields('state')}
                        </th>
                        <th className="px-4 py-1.5 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                          {tFields('quantity')}
                        </th>
                        <th className="px-4 py-1.5 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                          {tFields('moment')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.processingOrders.map((po) => (
                        <tr
                          key={po.id}
                          className="border-[var(--ms-border-default)] border-b last:border-b-0 hover:bg-[var(--ms-bg-hover)]"
                        >
                          <td className="px-4 py-2">
                            <a
                              href={`/processing-orders/${po.id}`}
                              className="font-medium text-[var(--ms-text-brand)] hover:underline"
                            >
                              {po.name}
                            </a>
                          </td>
                          <td className="px-4 py-2">
                            <span className="text-xs" data-state-tone={documentStateTone(po.state)}>
                              {tStates(po.state as 'draft' | 'posted' | 'cancelled')}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {(Number(po.quantity) / 1_000).toString()}
                          </td>
                          <td className="px-4 py-2 text-right text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                            {formatDate(po.moment)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {data.applicable && data.postedAt && (
                <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-sm">
                  <div className="text-[var(--ms-text-muted)]">
                    {t('state_posted')}: {formatDate(data.postedAt)}
                  </div>
                </div>
              )}
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
        title={t('product_store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, storeId: item.id, storeLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'matStore'}
        onClose={() => setOpenPicker(null)}
        title={t('material_store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && { ...s, materialsStoreId: item.id, materialsStoreLabel: String(item.primary) },
          )
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
        open={openPicker === 'customerOrder'}
        onClose={() => setOpenPicker(null)}
        title={t('customer_order_picker_title')}
        fetcher={customerOrderFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && { ...s, customerOrderId: item.id, customerOrderLabel: String(item.primary) },
          )
        }
      />
    </div>
  );
}
