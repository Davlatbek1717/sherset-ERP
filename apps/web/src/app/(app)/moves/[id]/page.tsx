'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import { DetailContentTabs, DetailHeader, DetailToolbar } from '@/components/document-detail';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { DOC_STATE_VERB, buildDocStateMenu } from '@/lib/doc-state-dropdown';
import { documentStateTone } from '@/lib/document-state-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { scaleMinorByQty } from '@moysklad/money';
import {
  Alert,
  Avatar,
  CatalogPicker,
  CatalogPickerField,
  type DocPositionRow,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  Input,
  NativeSelect,
  type PickerItem,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  formatDate,
  formatMoney,
  useConfirm,
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
  /** Per-unit cost snapshot written at post time (null on drafts). */
  costMinor: string | null;
  product: {
    id: string;
    name: string;
    code: string | null;
    uom: string | null;
    buyPrice: string | null;
  } | null;
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
  // Buy price in minor units — /products returns `buyPrice` (NOT buyPriceMinor);
  // it seeds the line's «Цена» so Сумма/Итого have a real cost basis.
  buyPrice?: string | null;
  // Live stock cluster — feeds the rich search dropdown's «Доступно» badge.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
}

interface DetailPositionRow extends DocPositionRow {
  assortmentId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
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
  positions: DetailPositionRow[];
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
      // PositionTable keys on `id` (DocPositionRow.id) — use the persisted
      // position id so React keys stay stable across saves.
      id: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productCode: p.product?.code ?? undefined,
      productUom: p.product?.uom ?? null,
      quantity: p.quantity,
      // «Цена» = the post-time cost snapshot when posted; on drafts fall back
      // to the product's buy price (the same seed /new uses).
      priceMinor: p.costMinor ?? p.product?.buyPrice ?? '0',
      discount: '0',
      vat: '0',
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
  const router = useRouter();
  const qc = useQueryClient();
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tStates = useTranslations('states.move');
  const tPos = useTranslations('position_editor');
  const tUnsaved = useTranslations('unsaved_dialog');
  const tTotals = useTranslations('list_totals');
  const { confirm } = useConfirm();

  const { data, isLoading } = useQuery<MoveDetail>({
    queryKey: ['move', id],
    queryFn: () => api.get(`/moves/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'org'
    | 'sourceStore'
    | 'destStore'
    | 'project'
    // «Добавить из справочника» — the catalog modal in APPEND mode (each pick
    // lands as a new position row; mirrors /new).
    | 'catalogAdd'
    | { kind: 'product'; rowUid: string }
  >(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
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

  // Live stock legs for the two grid columns — «Остаток (со склада)» (source,
  // feeds the oversell guard's `available`) and «Остаток (на склад)» (dest).
  // Mirrors /new (owner screenshots 2026-07-14, #move/edit).
  const assortmentIds = useMemo(
    () => (form?.positions ?? []).map((p) => p.assortmentId).filter((x): x is string => !!x),
    [form?.positions],
  );
  const { data: stockData } = useQuery<{ items: Array<{ assortmentId: string; qty: string }> }>({
    queryKey: ['stocks', form?.sourceStoreId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${form?.sourceStoreId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!form?.sourceStoreId && assortmentIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of stockData?.items ?? []) m.set(r.assortmentId, r.qty);
    return m;
  }, [stockData]);
  const { data: destStockData } = useQuery<{
    items: Array<{ assortmentId: string; qty: string }>;
  }>({
    queryKey: ['stocks', form?.destinationStoreId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${form?.destinationStoreId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!form?.destinationStoreId && assortmentIds.length > 0,
  });
  const destStockMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of destStockData?.items ?? []) m.set(r.assortmentId, r.qty);
    return m;
  }, [destStockData]);

  // Grid rows with both stock legs resolved (available = source, stock = dest).
  const tableRows = useMemo(
    () =>
      (form?.positions ?? []).map((p) => ({
        ...p,
        available: p.assortmentId && form?.sourceStoreId ? stockMap.get(p.assortmentId) : undefined,
        stock:
          p.assortmentId && form?.destinationStoreId ? destStockMap.get(p.assortmentId) : undefined,
      })),
    [form?.positions, stockMap, destStockMap, form?.sourceStoreId, form?.destinationStoreId],
  );

  // «Итого» — Σ Цена × Кол-во (cost snapshot when posted, buy-price seed on
  // drafts; the BE re-snapshots the real per-unit cost when the move posts).
  const totalMinor = useMemo(
    () =>
      (form?.positions ?? []).reduce(
        (acc, p) => acc + scaleMinorByQty(BigInt(p.priceMinor || '0'), p.quantity || '0'),
        0n,
      ),
    [form?.positions],
  );

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

  // Append a picked product as a fresh position row — shared by the inline
  // typeahead («Добавить позицию») and the catalog modal («Добавить из
  // справочника»). Seeds Цена from the product's buy price (mirrors /new).
  // `entry` (qty/price from the pick modal, owner 2026-07-18) overrides the
  // defaults; only the inline typeahead passes it — the catalog modal doesn't.
  const appendProduct = (
    item: { id: string; primary: unknown; raw?: unknown },
    entry?: { quantity: string; priceMinor: string },
  ) => {
    const raw = item.raw as ProductItem | undefined;
    const newId = uid();
    setForm(
      (s) =>
        s && {
          ...s,
          positions: [
            ...s.positions,
            {
              id: newId,
              assortmentId: item.id,
              productLabel: String(item.primary),
              productCode: raw?.code ?? undefined,
              productUom: raw?.uom ?? null,
              quantity: entry?.quantity ?? '1',
              priceMinor: entry?.priceMinor ?? raw?.buyPrice ?? '0',
              discount: '0',
              vat: '0',
              vatEnabled: false,
            },
          ],
        },
    );
    // owner 2026-07-18: returning the id hands focus to the new
    // row's «Кол-во» (modal → table entry chain).
    return newId;
  };
  const updatePosition = (rowId: string, patch: Partial<DetailPositionRow>) => {
    setForm(
      (s) =>
        s && { ...s, positions: s.positions.map((p) => (p.id === rowId ? { ...p, ...patch } : p)) },
    );
  };
  const removePosition = (rowId: string) => {
    setForm((s) => s && { ...s, positions: s.positions.filter((p) => p.id !== rowId) });
  };
  // «Kelishuv» — spread the negotiated delta across the lines (no VAT on moves).
  const applyAgreement = (deltaMinor: bigint) => {
    setForm((s) => {
      if (!s) return s;
      const patch = distributeAgreementDelta(s.positions, deltaMinor, false);
      if (patch.size === 0) return s;
      return {
        ...s,
        positions: s.positions.map((p) => {
          const next = patch.get(p.id);
          return next != null ? { ...p, priceMinor: next } : p;
        }),
      };
    });
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
  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  // moysklad move position grid (owner screenshots 2026-07-14, #move/edit):
  // Наименование · Кол-во · Остаток (со склада) · Остаток (на склад) · Цена ·
  // Сумма — no «Уп.», no VAT/discount (internal transfer). Mirrors /new.
  const positionColumns: PositionTableColumnConfig[] = [
    { key: 'dragarea' },
    { key: 'select' },
    { key: 'index' },
    { key: 'image' },
    { key: 'name' },
    { key: 'quantity', label: tPos('quantity') },
    { key: 'available', label: tPos('stock_from') },
    { key: 'stock', label: tPos('stock_to') },
    { key: 'price' },
    { key: 'amount' },
    { key: 'menu' },
  ];

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as DetailPositionRow;
    // moysklad parity: the product name LINKS to its card; swapping the line's
    // product moves to the row ⋮ «Заменить» (onReplace below) — mirrors /new.
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <PositionNameCell
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => editable && setOpenPicker({ kind: 'product', rowUid: p.id })}
        productHref={href}
        onNavigate={href ? () => router.push(href) : undefined}
        testId={`pos-${p.id}-name`}
      />
    );
  };

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
            auditEntity="Move"
            entityId={data.id}
            positionsLabel={tDetailTabs('positions')}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="Move" entityId={data.id} />}
          >
            {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
                top-right corner (same spot in every section). */}
            {editable && (
              <div className="-mb-2.5 flex justify-end">
                <PositionAgreementButton
                  totalMinor={totalMinor}
                  currency="UZS"
                  labels={{
                    button: tPos('agreement_button'),
                    total: tPos('agreement_total'),
                    amount: tPos('agreement_amount'),
                    add: tPos('agreement_add'),
                    subtract: tPos('agreement_subtract'),
                    save: tPos('pick_modal_save'),
                    cancel: tPos('pick_modal_cancel'),
                  }}
                  onApply={applyAgreement}
                />
              </div>
            )}
            <PositionTable
              columns={positionColumns}
              rows={tableRows}
              emptyText={tPos('empty')}
              onUpdate={(rowId, patch) =>
                updatePosition(rowId, patch as Partial<DetailPositionRow>)
              }
              onRemove={removePosition}
              onDuplicate={(rowId) => {
                const source = form.positions.find((p) => p.id === rowId);
                if (!source) return;
                setForm(
                  (s) => s && { ...s, positions: [...s.positions, { ...source, id: uid() }] },
                );
              }}
              onReorder={(from, to) => {
                setForm((s) => {
                  if (!s) return s;
                  const next = s.positions.slice();
                  const [moved] = next.splice(from, 1);
                  if (moved) next.splice(to, 0, moved);
                  return { ...s, positions: next };
                });
              }}
              // «Наименование ▾» sort menu (по наименованию / по коду) — the
              // PositionTable built-in, same as PO/[id] and the inventories panel.
              onSortPositions={
                editable
                  ? (by) =>
                      setForm((s) =>
                        s
                          ? {
                              ...s,
                              positions: [...s.positions].sort((a, b) =>
                                (by === 'name'
                                  ? (a.productLabel ?? '')
                                  : (a.productCode ?? '')
                                ).localeCompare(
                                  by === 'name' ? (b.productLabel ?? '') : (b.productCode ?? ''),
                                  'ru',
                                ),
                              ),
                            }
                          : s,
                      )
                  : undefined
              }
              sortByNameLabel={tPos('sort_by_name')}
              sortByCodeLabel={tPos('sort_by_code')}
              renderNameCell={renderPositionNameCell}
              onReplace={(rowId) => editable && setOpenPicker({ kind: 'product', rowUid: rowId })}
              selectedIds={selectedRowIds}
              onSelectionChange={setSelectedRowIds}
              readOnly={!editable}
              // moysklad-parity add-position bar (mirrors /new, band 3): inline
              // typeahead + «Добавить из справочника» + «Проверить комплектацию».
              // Hidden entirely on a posted (locked) move — PO/[id] pattern.
              footerToolbar={
                editable ? (
                  <PositionInlineAdd
                    placeholder={tPos('addPositionPlaceholder')}
                    addFromCatalogLabel={tPos('addFromCatalog')}
                    checkCompletenessLabel={tPos('checkCompleteness')}
                    onSearch={async (q) => {
                      const r = await api.get<{ items: ProductItem[]; total: number }>(
                        `/products?search=${encodeURIComponent(q)}&limit=20`,
                      );
                      return {
                        items: r.items.map((p) => ({
                          id: p.id,
                          primary: p.name,
                          code: p.code ?? undefined,
                          available: p.stock?.available != null ? Number(p.stock.available) : 0,
                          // Pick modal (owner 2026-07-18): reference «Цена» = the same
                          // default the row would get (buy price — mirrors appendProduct).
                          priceMinor: p.buyPrice ?? '0',
                          uomLabel: p.uom ?? undefined,
                          raw: p,
                        })),
                        total: r.total ?? r.items.length,
                      };
                    }}
                    sortAvailableLabel={tPos('sortByAvailable')}
                    moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                    createProductLabel={(qq) => tPos('createProductNamed', { query: qq })}
                    onCreateProduct={() => router.push('/products/new')}
                    // owner 2026-07-18: qty/price modal on EVERY product-add search
                    // (was sales-only). No price-scope checkboxes here — writing a
                    // permanent SALE price from a buy price would be wrong.
                    pickModal={{
                      currency: 'UZS',
                      permanentPriceOption: false,
                      labels: {
                        stock: tPos('pick_modal_stock'),
                        price: tPos('pick_modal_price'),
                        quantity: tPos('pick_modal_quantity'),
                        salePrice: tPos('pick_modal_sale_price'),
                        priceThisSale: tPos('pick_modal_price_this_sale'),
                        pricePermanent: tPos('pick_modal_price_permanent'),
                        save: tPos('pick_modal_save'),
                        cancel: tPos('pick_modal_cancel'),
                      },
                    }}
                    onPick={appendProduct}
                    onAddFromCatalog={() => setOpenPicker('catalogAdd')}
                    // «Проверить комплектацию» with unsaved edits — moysklad first
                    // asks «Сохранение изменений … Сохранить изменения?»; OK saves
                    // (stays on the detail page). On a clean doc it is a no-op for
                    // now (the completeness modal itself is a separate debt).
                    onCheckCompleteness={async () => {
                      if (!isDirty) return;
                      const ok = await confirm({
                        title: tUnsaved('title'),
                        description: `${tUnsaved('changed')} ${tUnsaved('question')}`,
                        confirmLabel: tUnsaved('ok'),
                        cancelLabel: tUnsaved('cancel'),
                        tone: 'warning',
                      });
                      if (ok === true) saveMut.mutate();
                    }}
                    testId="move-position-add"
                  />
                ) : undefined
              }
            />

            {/* moysklad move editor bottom row (mirrors /new): «Комментарий»
                textarea on the left; bold «Итого» with the «Накладные расходы»
                input + distribution select on the right. */}
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((s) => s && { ...s, description: e.target.value })}
                  placeholder={tFields('description')}
                  rows={3}
                  disabled={!editable}
                  data-test-id="field-description"
                />
              </div>
              <div className="flex min-w-[300px] flex-col gap-2 py-1">
                <div className="flex items-baseline justify-between gap-8 font-semibold text-base">
                  <span>{tTotals('total')}:</span>
                  <span className="text-xl tabular-nums" data-test-id="move-total">
                    {formatMoney(totalMinor, 'UZS', { displayAs: 'none' })}
                  </span>
                </div>
                <hr className="border-[var(--ms-border-default)]" />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--ms-text-primary)]">
                    {tDetailForm('overhead_sum')}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.overheadMajor}
                    placeholder="0"
                    onChange={(e) => setForm((s) => s && { ...s, overheadMajor: e.target.value })}
                    className="w-24"
                    disabled={!editable}
                    data-test-id="field-overhead-sum"
                  />
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
                    className="w-auto"
                  >
                    <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                    <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                    <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                    <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
                  </NativeSelect>
                </div>
              </div>
            </div>
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
      {/* Per-row «Заменить» — swap the line's product (name cell links to the
          card, so swapping lives on the row ⋮ menu; mirrors /new). */}
      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'product'
        }
        onClose={() => setOpenPicker(null)}
        title={tForm('product_picker_title')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          const raw = (item as PickerItem & { raw?: ProductItem }).raw;
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productCode: raw?.code ?? undefined,
            productUom: raw?.uom ?? null,
            priceMinor: raw?.buyPrice ?? '0',
          });
        }}
      />
      {/* «Добавить из справочника» — the same product catalog modal in APPEND
          mode: each pick lands as a new position row (moysklad «Выбор товара»). */}
      <CatalogPicker
        open={openPicker === 'catalogAdd'}
        onClose={() => setOpenPicker(null)}
        title={tForm('product_picker_title')}
        fetcher={productFetcher}
        onSelect={appendProduct}
      />
    </div>
  );
}
