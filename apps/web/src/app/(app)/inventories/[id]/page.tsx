'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import { DetailContentTabs, DetailHeader, DetailToolbar } from '@/components/document-detail';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import {
  type InventoryPanelRow,
  InventoryPositionsPanel,
} from '@/components/inventories/inventory-positions-panel';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
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
  costMinor: string | null;
  cellId: string | null;
  cell: string | null;
  /** K5 — sanalgan bo'lak tarkibi («250x3+BLK-000041:200»). */
  pieceEntry: string | null;
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

interface FormState {
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  projectId: string | null;
  projectLabel: string;
  externalCode: string;
  description: string;
  positions: InventoryPanelRow[];
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
      id: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productCode: p.product?.code ?? undefined,
      productUom: p.product?.uom ?? null,
      actualQty: String(Number(p.actualQty)),
      postedExpectedQty: p.expectedQty,
      postedVarianceQty: p.varianceQty,
      postedCostMinor: p.costMinor,
      cellId: p.cellId,
      cell: p.cell,
      pieceEntry: p.pieceEntry,
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
      actualQty: p.actualQty,
      cellId: p.cellId ?? null,
      pieceEntry: p.pieceEntry ?? null,
    })),
    attributes: s.attributes,
  });
}

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('inventories', id);
  const router = useRouter();
  const qc = useQueryClient();
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
        // 2026-08-23 (egasi, 00112 hodisasi): hujjatga FAQAT yacheykali qatorlar
        // yoziladi. Ombor-darajali qatorlar endi faqat mijoz tomonidagi «tovar
        // ro'yxati» — ular saqlansa va post qilinsa, actual=0 qatori butun ombor
        // qoldig'ini 0 ga tekislab yuborardi (sanalmagan tovar = yo'qolgan emas!).
        payload.positions = form.positions
          .filter((p) => p.cellId)
          .map((p) => ({
            assortmentKind: 'product',
            assortmentId: p.assortmentId,
            // Trailing '.' can survive mid-typing in the cell grid — normalize.
            actualQty: (p.actualQty || '0').replace(/\.$/, ''),
            cellId: p.cellId,
            cell: p.cell ?? null,
            // K5 — bo'lak tarkibi (bo'linmaydigan tovarda `null`).
            pieceEntry: p.pieceEntry || null,
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

  // «Создать документ» → Списание (недостача) / Оприходование (излишек) —
  // moysklad builds the downstream doc from the inventory's variance lines.
  // Draft: variance = actual − live store balance (position-meta); posted:
  // the persisted varianceQty/costMinor snapshots. Dirty grid saves first.
  const [createDocBusy, setCreateDocBusy] = useState(false);
  const createDownstream = async (kind: 'loss' | 'enter') => {
    if (!form || !data || createDocBusy) return;
    setCreateDocBusy(true);
    try {
      if (isDirty) await saveMut.mutateAsync();
      const metaRes = await api.post<{
        items: Array<{
          assortmentId: string;
          stockQty: string;
          unitCostMinor: string | null;
          cells?: Array<{ cellId: string; qty: string }>;
        }>;
      }>('/inventories/position-meta', {
        storeId: form.storeId,
        assortmentIds: Array.from(new Set(form.positions.map((p) => p.assortmentId))),
      });
      const metaMap = new Map(metaRes.items.map((m) => [m.assortmentId, m]));
      const fmt = (n: number) => String(Number(n.toFixed(6)));
      const lines = form.positions
        .map((p) => {
          const m = metaMap.get(p.assortmentId);
          // Cell row's draft «расчетный» is that CELL's balance, not the store's.
          const liveExpected = p.cellId
            ? Number(m?.cells?.find((c) => c.cellId === p.cellId)?.qty ?? '0')
            : Number(m?.stockQty ?? '0');
          const variance = data.applicable
            ? Number(p.postedVarianceQty ?? '0')
            : Number(p.actualQty || '0') - liveExpected;
          const cost = (data.applicable ? p.postedCostMinor : null) ?? m?.unitCostMinor ?? '0';
          return { p, variance, cost };
        })
        .filter((x) => (kind === 'loss' ? x.variance < 0 : x.variance > 0));
      const created = await api.post<{ id: string }>(kind === 'loss' ? '/losses' : '/enters', {
        organizationId: form.organizationId,
        storeId: form.storeId,
        positions: lines.map((x) =>
          kind === 'loss'
            ? {
                assortmentId: x.p.assortmentId,
                quantity: fmt(Math.abs(x.variance)),
                costMinor: x.cost,
                // Loss/Enter carry the cell too — the downstream doc adjusts the
                // same StockByCell row the recount was made against.
                cellId: x.p.cellId ?? null,
                cell: x.p.cell ?? null,
              }
            : {
                assortmentId: x.p.assortmentId,
                quantity: fmt(x.variance),
                costMinor: x.cost,
                cellId: x.p.cellId ?? null,
                cell: x.p.cell ?? null,
              },
        ),
      });
      router.push(kind === 'loss' ? `/losses/${created.id}` : `/enters/${created.id}`);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setCreateDocBusy(false);
    }
  };

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
        // «Создать документ» = Списание · Оприходование (moysklad builds them
        // from the inventory's shortage/surplus lines — user screenshots 2026-07-14).
        createMenuItems={[
          {
            id: 'loss',
            label: tDetailTitles('loss'),
            onSelect: () => void createDownstream('loss'),
            disabled: createDocBusy,
          },
          {
            id: 'enter',
            label: tDetailTitles('enter'),
            onSelect: () => void createDownstream('enter'),
            disabled: createDocBusy,
          },
        ]}
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
            positionsLabel={tDetailTabs('positions')}
            filesSlot={<AttachmentsSection entity="Inventory" entityId={data.id} />}
          >
            {/* Band 3 — the moysklad positions block: [Остатки по складу |
                Остатки по ячейке] toggle · Фильтр · search · grid with the
                Расчетный/Фактический/Разница/Цена/Избыток-недостача columns ·
                add bar (draft) with «Добавить из справочника» / «Дополнить из
                остатков» / «Дополнить из номенклатуры» · Комментарий · Итого. */}
            <InventoryPositionsPanel
              mode="detail"
              storeId={form.storeId}
              rows={form.positions}
              onRowsChange={
                editable ? (next) => setForm((s) => s && { ...s, positions: next }) : undefined
              }
              readOnly={!editable}
              description={form.description}
              onDescriptionChange={
                editable ? (v) => setForm((s) => s && { ...s, description: v }) : undefined
              }
              descriptionDisabled={!editable}
              testId="inventory-detail-positions"
            />
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
