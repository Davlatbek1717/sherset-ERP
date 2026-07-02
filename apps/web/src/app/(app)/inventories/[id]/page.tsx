'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import { DetailContentTabs, DetailHeader, DetailToolbar } from '@/components/document-detail';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { usePositionEditorLabels } from '@/hooks/use-position-editor-labels';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { DOC_STATE_COLOR, buildDocStateMenu } from '@/lib/doc-state-dropdown';
import { documentStateTone } from '@/lib/document-state-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Alert,
  Avatar,
  CatalogPicker,
  CatalogPickerField,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
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

interface PositionDetail {
  id: string;
  position: number;
  assortmentKind: string;
  assortmentId: string;
  expectedQty: string;
  actualQty: string;
  varianceQty: string;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface InventoryDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
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
}

interface FormState {
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  projectId: string | null;
  projectLabel: string;
  externalCode: string;
  description: string;
  /** Each row's `quantity` field carries the counter's actualQty. */
  positions: PositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: InventoryDetail): FormState {
  return {
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    positions: d.positions.map((p) => ({
      _uid: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productUom: p.product?.uom ?? null,
      quantity: p.actualQty,
      priceMinor: '0',
      discount: '0',
      vat: '',
      vatEnabled: false,
    })),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    organizationId: s.organizationId,
    storeId: s.storeId,
    projectId: s.projectId,
    externalCode: s.externalCode,
    description: s.description,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      actualQty: p.quantity,
    })),
    attributes: s.attributes,
  });
}

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const positionLabels = usePositionEditorLabels();
  const detailNav = useDetailNavigation('inventories', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.inventories');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.inventory');
  const tDetailTabs = useTranslations('detail_tabs');

  const { data, isLoading } = useQuery<InventoryDetail>({
    queryKey: ['inventory', id],
    queryFn: () => api.get(`/inventories/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<null | 'org' | 'store' | 'project'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['inventory', id], () => setForm(null));

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
    mutationFn: (target: string) => api.post(`/inventories/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', id] });
      qc.invalidateQueries({ queryKey: ['inventories'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/inventories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventories'] });
      router.push('/inventories');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/inventories/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['inventories'] });
      router.push(`/inventories/${clone.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        projectId: form.projectId,
        externalCode: form.externalCode || null,
      };
      if (!data.applicable) {
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: PositionEditor guarantees assortmentId is set before save
          assortmentId: p.assortmentId!,
          actualQty: p.quantity,
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/inventories/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['inventory', id] });
      qc.invalidateQueries({ queryKey: ['inventories'] });
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
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/stores?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((st) => ({ id: st.id, primary: st.name, secondary: st.code ?? undefined }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const productFetcher = async (s: string) => {
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

  if (isLoading || !form)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const editable = !data.applicable;
  const surplusCount = data.positions.filter((p) => Number(p.varianceQty) > 0).length;
  const shortageCount = data.positions.filter((p) => Number(p.varianceQty) < 0).length;
  // Inventory only has one terminal post (no unpost back to draft).
  const onToggleApplicable =
    data.state === 'draft' ? (_next: boolean) => transitionMut.mutate('post') : undefined;

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="inventory-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/inventories')}
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
        printEntity="inventory"
      />
      <DetailHeader
        titlePrefix={tDetailTitles('inventory')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(data.state as 'draft' | 'posted' | 'cancelled')}
        stateTone={documentStateTone(data.state)}
        stateSlug={data.state}
        // Inventory FSM has no «unpost» — once posted it can only be
        // cancelled. Dropdown offers posted (post) + cancelled (cancel);
        // draft is the implicit starting state.
        stateMenuItems={buildDocStateMenu(
          ['posted', 'cancelled'],
          (slug) => tStates(slug as 'draft' | 'posted' | 'cancelled'),
          DOC_STATE_COLOR,
        )}
        onStateChange={(slug) => transitionMut.mutate(slug === 'posted' ? 'post' : 'cancel')}
        stateBusy={transitionMut.isPending}
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
            <DocumentMetaField label={tFields('store')} required>
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
            <DocumentMetaField label={tFields('posted_at')}>
              <Input
                value={data.postedAt ? formatDate(data.postedAt) : ''}
                disabled
                placeholder="—"
                data-test-id="field-posted-at"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('surplus_count')}>
              <Input
                value={String(surplusCount)}
                disabled
                placeholder="—"
                data-test-id="field-surplus"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('shortage_count')}>
              <Input
                value={String(shortageCount)}
                disabled
                placeholder="—"
                data-test-id="field-shortage"
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

          <DocumentMetaRow>
            <DocumentMetaField label={tDetailForm('external_code')}>
              <Input
                value={form.externalCode}
                onChange={(e) => setForm((s) => s && { ...s, externalCode: e.target.value })}
                disabled={!editable}
                data-test-id="field-external-code"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="Inventory"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tDetailTabs('main')}
            filesSlot={<AttachmentsSection entity="Inventory" entityId={data.id} />}
          >
            {data.state === 'draft' ? (
              <PositionEditor<ProductItem>
                positions={form.positions}
                onChange={(next) => setForm((s) => s && { ...s, positions: next })}
                vatEnabled={false}
                vatIncluded={false}
                productFetcher={productFetcher}
                onPickProduct={(raw) => ({
                  productUom: raw?.uom ?? null,
                })}
                readOnly={!editable}
                mode="qty-only"
                labels={{ ...positionLabels, quantity: t('actual_qty') }}
              />
            ) : (
              <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--ms-bg-muted)]">
                    <tr>
                      <th className="h-8 w-12 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                        {tFields('position')}
                      </th>
                      <th className="h-8 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                        {tFields('product')}
                      </th>
                      <th className="h-8 w-32 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                        {t('expected_qty')}
                      </th>
                      <th className="h-8 w-32 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                        {t('actual_qty')}
                      </th>
                      <th className="h-8 w-32 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                        {t('variance_qty')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((p) => {
                      const variance = Number(p.varianceQty);
                      const varianceColor =
                        variance > 0
                          ? 'text-[var(--ms-text-brand)]'
                          : variance < 0
                            ? 'text-[var(--ms-text-destructive)]'
                            : 'text-[var(--ms-text-muted)]';
                      const varianceSign = variance > 0 ? '+' : '';
                      return (
                        <tr key={p.id} className="border-[var(--ms-border-default)] border-t">
                          <td className="px-3 py-2 text-[var(--ms-text-muted)] text-sm">
                            {p.position}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{p.product?.name ?? '—'}</div>
                            {p.product?.code && (
                              <div className="text-[var(--ms-text-muted)] text-xs">
                                {p.product.code}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                            {Number(p.expectedQty)} {p.product?.uom ?? ''}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {Number(p.actualQty)} {p.product?.uom ?? ''}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-medium tabular-nums ${varianceColor}`}
                          >
                            {varianceSign}
                            {variance} {p.product?.uom ?? ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DetailContentTabs>
        </div>

        {/* Inline Задачи collapsible — moysklad parity (bottom of the document
            body, outside the tab strip), mirroring the other detail pages. */}
        <div className="mt-6 flex flex-col gap-3">
          <DocumentTasksSection entity="Inventory" entityId={data.id} />
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="Inventory"
            values={form.attributes}
            onChange={(next) => setForm({ ...form, attributes: next })}
            disabled={!editable}
            testIdPrefix="inventory"
          />
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
        title={tFields('store')}
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
    </div>
  );
}
