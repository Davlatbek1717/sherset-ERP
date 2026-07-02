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
import { DOC_STATE_VERB, buildDocStateMenu } from '@/lib/doc-state-dropdown';
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
  NativeSelect,
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
  quantity: string;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface MoveDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
  overheadSumMinor: string;
  overheadDistribution: string;
  organization: { id: string; name: string };
  sourceStore: { id: string; name: string };
  destinationStore: { id: string; name: string };
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
  sourceStoreId: string;
  sourceStoreLabel: string;
  destinationStoreId: string;
  destinationStoreLabel: string;
  projectId: string | null;
  projectLabel: string;
  externalCode: string;
  description: string;
  overheadMajor: string;
  overheadDistribution: 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY';
  positions: PositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: MoveDetail): FormState {
  return {
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    sourceStoreId: d.sourceStore.id,
    sourceStoreLabel: d.sourceStore.name,
    destinationStoreId: d.destinationStore.id,
    destinationStoreLabel: d.destinationStore.name,
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    overheadMajor:
      d.overheadSumMinor && d.overheadSumMinor !== '0'
        ? (Number(d.overheadSumMinor) / 100).toString()
        : '',
    overheadDistribution: (['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY'] as const).includes(
      d.overheadDistribution as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY',
    )
      ? (d.overheadDistribution as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY')
      : 'WEIGHT',
    positions: d.positions.map((p) => ({
      _uid: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productUom: p.product?.uom ?? null,
      quantity: p.quantity,
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
    sourceStoreId: s.sourceStoreId,
    destinationStoreId: s.destinationStoreId,
    projectId: s.projectId,
    externalCode: s.externalCode,
    description: s.description,
    overheadMajor: s.overheadMajor,
    overheadDistribution: s.overheadDistribution,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      quantity: p.quantity,
    })),
    attributes: s.attributes,
  });
}

export default function MoveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('moves', id);
  const positionLabels = usePositionEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tStates = useTranslations('states.move');

  const { data, isLoading } = useQuery<MoveDetail>({
    queryKey: ['move', id],
    queryFn: () => api.get(`/moves/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    null | 'org' | 'sourceStore' | 'destStore' | 'project'
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['move', id], () => setForm(null));

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
    mutationFn: (target: string) => api.post(`/moves/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['move', id] });
      qc.invalidateQueries({ queryKey: ['moves'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/moves/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['moves'] });
      router.push('/moves');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/moves/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['moves'] });
      router.push(`/moves/${clone.id}`);
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
        // «Накладные расходы» — tiyin; '' → 0 (no-op at post).
        overheadSumMinor:
          Number(form.overheadMajor) > 0
            ? String(BigInt(Math.round(Number(form.overheadMajor) * 100)))
            : '0',
        overheadDistribution: form.overheadDistribution,
      };
      if (data && !data.applicable) {
        payload.organizationId = form.organizationId;
        payload.sourceStoreId = form.sourceStoreId;
        payload.destinationStoreId = form.destinationStoreId;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: PositionEditor guarantees assortmentId is set before save
          assortmentId: p.assortmentId!,
          quantity: Number(p.quantity),
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/moves/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['move', id] });
      qc.invalidateQueries({ queryKey: ['moves'] });
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
  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="move-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/moves')}
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
        printEntity="move"
      />
      <DetailHeader
        titlePrefix={tDetailTitles('move')}
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
            <DocumentMetaField label={tFields('posted_at')}>
              <Input
                value={data.postedAt ? formatDate(data.postedAt) : ''}
                disabled
                placeholder="—"
                data-test-id="field-posted-at"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('store_from')} required>
              <CatalogPickerField
                value={
                  form.sourceStoreId
                    ? { id: form.sourceStoreId, label: form.sourceStoreLabel }
                    : null
                }
                onPick={() => editable && setOpenPicker('sourceStore')}
                inlineFetcher={storeFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && { ...s, sourceStoreId: item.id, sourceStoreLabel: String(item.primary) },
                  )
                }
                onClear={() =>
                  editable && setForm((s) => s && { ...s, sourceStoreId: '', sourceStoreLabel: '' })
                }
                disabled={!editable}
                testId="field-source-store"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('store_to')} required>
              <CatalogPickerField
                value={
                  form.destinationStoreId
                    ? { id: form.destinationStoreId, label: form.destinationStoreLabel }
                    : null
                }
                onPick={() => editable && setOpenPicker('destStore')}
                inlineFetcher={storeFetcher}
                onInlineSelect={(item) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        destinationStoreId: item.id,
                        destinationStoreLabel: String(item.primary),
                      },
                  )
                }
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, destinationStoreId: '', destinationStoreLabel: '' })
                }
                disabled={!editable}
                testId="field-destination-store"
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
            <DocumentMetaField label={tDetailForm('external_code')}>
              <Input
                value={form.externalCode}
                onChange={(e) => setForm((s) => s && { ...s, externalCode: e.target.value })}
                disabled={!editable}
                data-test-id="field-external-code"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tDetailForm('overhead_sum')}>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.overheadMajor}
                placeholder="0"
                onChange={(e) => setForm((s) => s && { ...s, overheadMajor: e.target.value })}
                disabled={!editable}
                data-test-id="field-overhead-sum"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tDetailForm('overhead_distribution')}>
              <NativeSelect
                value={form.overheadDistribution}
                onChange={(e) =>
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        overheadDistribution: e.target.value as
                          | 'WEIGHT'
                          | 'PRICE'
                          | 'VOLUME'
                          | 'QUANTITY',
                      },
                  )
                }
                data-test-id="field-overhead-distribution"
                disabled={!editable || !(Number(form.overheadMajor) > 0)}
              >
                <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
              </NativeSelect>
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="Move"
            entityId={data.id}
            positionsLabel={tDetailTabs('main')}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="Move" entityId={data.id} />}
          >
            <PositionEditor<ProductItem>
              labels={positionLabels}
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
            />
          </DetailContentTabs>
        </div>

        {/* Inline Задачи collapsible — moysklad parity (bottom of the
            document body, outside the tab strip), mirroring demands/supplies. */}
        <div className="mt-6 flex flex-col gap-3">
          <DocumentTasksSection entity="Move" entityId={data.id} />
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="Move"
            values={form.attributes}
            onChange={(next) => setForm({ ...form, attributes: next })}
            disabled={!editable}
            testIdPrefix="move"
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
        open={openPicker === 'sourceStore'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store_from')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, sourceStoreId: item.id, sourceStoreLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'destStore'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store_to')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && {
                ...s,
                destinationStoreId: item.id,
                destinationStoreLabel: String(item.primary),
              },
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
    </div>
  );
}
