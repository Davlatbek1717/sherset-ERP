'use client';

/**
 * /processings/new — Yangi texoperatsiya editor.
 *
 * Vs. ProcessingOrder /new:
 *  - TWO stores: materialsStoreId (kirim) + productsStoreId (chiqim)
 *  - BOM is REQUIRED (server rejects without processingPlanId)
 *  - Optional link to a parent ProcessingOrder for fulfilment tracking
 *  - Posting (applicable=true) actually MOVES stock — show a clear hint
 *
 * Quantity: user types whole units; stored ×1000 microqty on server.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { defaultDocStore, useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  DocumentTotalsPanel,
  Icons,
  Input,
  type PickerItem,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
interface RefItem {
  id: string;
  name: string;
  code?: string | null;
}

interface BomItem {
  id: string;
  name: string;
  standardCostMinor: string;
  outputQty: string;
  product: { id: string; name: string; uom: string | null } | null;
  components: BomComponent[];
}

interface BomComponent {
  id: string;
  productId: string;
  qty: string;
  position: number;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface ProcessingOrderRef {
  id: string;
  name: string;
  processingPlan: { id: string; name: string } | null;
  store: { id: string; name: string } | null;
}

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

/** §117 — so'm string → integer-tiyin string (money discipline). */
function somToTiyin(som: string): string {
  const n = Number(som);
  if (!Number.isFinite(n) || n < 0) return '0';
  return String(Math.round(n * 100));
}

export default function NewProcessingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const t = useTranslations('pages.processing');
  const totalsLabels = useTotalsLabels();
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tStates = useTranslations('states.processing');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const docEditorLabels = useDocumentEditorLabels();

  // FSM mirrors processings/[id]; status is decorative on /new (API creates a draft).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  // If the user landed here from "Yaratish → Qayta ishlash operatsiyasi" on a
  // ProcessingOrder detail page, prefill the source-order link + copy over its
  // BOM so they don't have to re-pick it.
  const preselectedOrderId = searchParams?.get('processingOrderId') ?? null;

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });

  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(true);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [materialsStoreId, setMaterialsStoreId] = useState<string | null>(null);
  const [materialsStoreLabel, setMaterialsStoreLabel] = useState('');
  const [productsStoreId, setProductsStoreId] = useState<string | null>(null);
  const [productsStoreLabel, setProductsStoreLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [processingPlanLabel, setProcessingPlanLabel] = useState('');
  const [bomDetail, setBomDetail] = useState<BomItem | null>(null);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [processingOrderLabel, setProcessingOrderLabel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [externalCodeVisible, setExternalCodeVisible] = useState(false);

  // §126/round-6c — moysklad «Выполнение этапа производства» create-form
  // parity: stage picked directly from the standalone Этап catalog +
  // performer link + labour-accounting.
  const [processingStageId, setProcessingStageId] = useState<string | null>(null);
  const [processingStageLabel, setProcessingStageLabel] = useState('');
  const [performerId, setPerformerId] = useState<string | null>(null);
  const [performerLabel, setPerformerLabel] = useState('');
  const [defect, setDefect] = useState(false);
  const [enableHourAccounting, setEnableHourAccounting] = useState(false);
  const [labourUnitCost, setLabourUnitCost] = useState('0');
  const [standardHourCost, setStandardHourCost] = useState('0');
  const [standardHourUnit, setStandardHourUnit] = useState('0');

  const [openPicker, setOpenPicker] = useState<PickerKey>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). Организация=default with a first-item
  // fallback; Склад материалов/продукции both seed from defaultStore (first-item
  // fallback, clerk usually edits one); Проект=defaultProject.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || !storesData || userDefaults.isLoading) return;
    defaultsAppliedRef.current = true;
    const us = userDefaults.data;
    if (!organizationId) {
      if (us?.defaultCompany) {
        setOrganizationId(us.defaultCompany.id);
        setOrganizationLabel(us.defaultCompany.name);
      } else if (orgsData.items[0]) {
        setOrganizationId(orgsData.items[0].id);
        setOrganizationLabel(orgsData.items[0].name);
      }
    }
    const store = defaultDocStore(us, storesData.items) ?? null;
    if (store) {
      if (!materialsStoreId) {
        setMaterialsStoreId(store.id);
        setMaterialsStoreLabel(store.name);
      }
      if (!productsStoreId) {
        setProductsStoreId(store.id);
        setProductsStoreLabel(store.name);
      }
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    orgsData,
    storesData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    materialsStoreId,
    productsStoreId,
    projectId,
  ]);

  // Fetch BOM detail when BOM changes
  useEffect(() => {
    if (!processingPlanId) {
      setBomDetail(null);
      return;
    }
    api
      .get<BomItem>(`/boms/${processingPlanId}`)
      .then(setBomDetail)
      .catch(() => setBomDetail(null));
  }, [processingPlanId]);

  // Estimated cost: standardCostMinor × (quantity / outputQty)
  const qtyNum = Number(quantity || '0');
  const outputQtyNum = bomDetail ? Number(bomDetail.outputQty || '1') : 1;
  const recipeRuns = bomDetail && outputQtyNum > 0 ? qtyNum / outputQtyNum : 0;
  const totalCostMinor = bomDetail
    ? BigInt(Math.round(Number(bomDetail.standardCostMinor || '0') * recipeRuns))
    : 0n;

  // Materials needed = component.qty × recipeRuns
  const materialsRows =
    bomDetail?.components.map((c) => {
      const total = Number(c.qty) * recipeRuns;
      return {
        ...c,
        totalQty: total.toFixed(3).replace(/\.?0+$/, ''),
      };
    }) ?? [];

  // Fetchers
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
  };
  // §126/round-6c — flat standalone Этап + Исполнитель pickers.
  const stageFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/processing-stages?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({ id: p.id, primary: p.name, secondary: p.code ?? undefined }));
  };
  const performerFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/employees?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((e) => ({ id: e.id, primary: e.name }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/stores?search=${encodeURIComponent(s)}`);
    return d.items.map((st) => ({ id: st.id, primary: st.name, secondary: st.code ?? undefined }));
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
    // Filter to posted / draft orders only (cancelled ones shouldn't accept new Processing)
    const d = await api.get<{ items: ProcessingOrderRef[] }>(
      `/processing-orders?search=${encodeURIComponent(s)}&limit=50&state=posted`,
    );
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.processingPlan?.name ?? undefined,
      meta: o.store?.name ?? undefined,
    }));
  };

  /**
   * After picking an order, re-fetch its detail to discover its BOM and copy
   * it onto this Processing if the user hasn't picked a BOM yet. We use a
   * separate fetch (not item.raw) because PickerItem doesn't carry raw data.
   */
  const onOrderPicked = async (orderId: string, orderLabel: string) => {
    setProcessingOrderId(orderId);
    setProcessingOrderLabel(orderLabel);
    if (!processingPlanId) {
      try {
        const order = await api.get<ProcessingOrderRef>(`/processing-orders/${orderId}`);
        if (order.processingPlan) {
          setProcessingPlanId(order.processingPlan.id);
          setProcessingPlanLabel(order.processingPlan.name);
        }
      } catch {
        // Order lookup failed (rare race). User can pick the BOM manually.
      }
    }
  };

  // Honor ?processingOrderId=... query param — auto-link to the order and copy
  // its BOM. Runs once on mount via `mounted` guard so subsequent re-renders
  // don't keep overwriting user edits.
  const [mountedOrderLoaded, setMountedOrderLoaded] = useState(false);
  useEffect(() => {
    if (mountedOrderLoaded || !preselectedOrderId) return;
    setMountedOrderLoaded(true);
    api
      .get<ProcessingOrderRef>(`/processing-orders/${preselectedOrderId}`)
      .then((order) => {
        setProcessingOrderId(order.id);
        setProcessingOrderLabel(order.name);
        if (order.processingPlan && !processingPlanId) {
          setProcessingPlanId(order.processingPlan.id);
          setProcessingPlanLabel(order.processingPlan.name);
        }
      })
      .catch(() => {
        // Stale URL or order soft-deleted — silently ignore, user can pick manually.
      });
  }, [preselectedOrderId, processingPlanId, mountedOrderLoaded]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!materialsStoreId) throw new Error(t('err_materials_store'));
      if (!productsStoreId) throw new Error(t('err_products_store'));
      if (!processingPlanId) throw new Error(t('err_bom_required'));
      if (!quantity || Number(quantity) <= 0) {
        throw new Error(t('err_quantity'));
      }
      const payload = {
        organizationId,
        materialsStoreId,
        productsStoreId,
        ...(projectId ? { projectId } : {}),
        processingPlanId,
        ...(processingOrderId ? { processingOrderId } : {}),
        quantity,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        description: description || undefined,
        externalCode: externalCode || undefined,
        // §118-full / §117 — stage-completion create-form fields.
        ...(processingStageId ? { processingStageId } : {}),
        ...(performerId ? { performerId } : {}),
        defect,
        enableHourAccounting,
        labourUnitCostMinor: somToTiyin(labourUnitCost),
        standardHourCostMinor: somToTiyin(standardHourCost),
        standardHourUnit: standardHourUnit || '0',
      };
      return api.post<{ id: string }>('/processings', payload);
    },
    onSuccess: (created) => router.push(`/processings/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="processing-new-page"
        documentTypeLabel={tDetailTitles('processing')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={status}
        statusOptions={STATUS_OPTIONS}
        onStatusChange={setStatus}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/processings')}
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
        <div className="space-y-4">
          <DocumentMetaPanel compact>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('organization')} required>
                <CatalogPickerField
                  value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                  placeholder={tForm('select_organization')}
                  onPick={() => setOpenPicker('org')}
                  onClear={() => {
                    setOrganizationId(null);
                    setOrganizationLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('processing_plan')} required>
                <CatalogPickerField
                  value={
                    processingPlanId ? { id: processingPlanId, label: processingPlanLabel } : null
                  }
                  placeholder={t('select_processing_plan')}
                  onPick={() => setOpenPicker('bom')}
                  onClear={() => {
                    setProcessingPlanId(null);
                    setProcessingPlanLabel('');
                    setBomDetail(null);
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('materials_store')} required>
                <CatalogPickerField
                  value={
                    materialsStoreId ? { id: materialsStoreId, label: materialsStoreLabel } : null
                  }
                  placeholder={t('materials_store')}
                  onPick={() => setOpenPicker('matStore')}
                  onClear={() => {
                    setMaterialsStoreId(null);
                    setMaterialsStoreLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('products_store')} required>
                <CatalogPickerField
                  value={
                    productsStoreId ? { id: productsStoreId, label: productsStoreLabel } : null
                  }
                  placeholder={t('products_store')}
                  onPick={() => setOpenPicker('prodStore')}
                  onClear={() => {
                    setProductsStoreId(null);
                    setProductsStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('output_quantity')} required>
                <Input
                  type="number"
                  min="0.001"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  data-test-id="field-quantity"
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('source_processing_order')}>
                <CatalogPickerField
                  value={
                    processingOrderId
                      ? { id: processingOrderId, label: processingOrderLabel }
                      : null
                  }
                  placeholder={t('select_processing_order')}
                  onPick={() => setOpenPicker('order')}
                  onClear={() => {
                    setProcessingOrderId(null);
                    setProcessingOrderLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('project')}>
                <CatalogPickerField
                  value={projectId ? { id: projectId, label: projectLabel } : null}
                  placeholder={tForm('select_project')}
                  onPick={() => setOpenPicker('project')}
                  onClear={() => {
                    setProjectId(null);
                    setProjectLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* §126/round-6c — stage picked directly from the
                standalone Этап catalog (/processing-stages flat
                endpoint; §118 2-level limitation removed). */}
            <DocumentMetaRow>
              <DocumentMetaField label={t('production_stage')}>
                <CatalogPickerField
                  value={
                    processingStageId
                      ? { id: processingStageId, label: processingStageLabel }
                      : null
                  }
                  placeholder={t('select_processing_stage')}
                  onPick={() => setOpenPicker('stage')}
                  onClear={() => {
                    setProcessingStageId(null);
                    setProcessingStageLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('performer')}>
                <CatalogPickerField
                  value={performerId ? { id: performerId, label: performerLabel } : null}
                  placeholder={tForm('select_employee')}
                  onPick={() => setOpenPicker('performer')}
                  onClear={() => {
                    setPerformerId(null);
                    setPerformerLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('defect_hour_accounting')}>
                <div className="flex h-9 items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={defect}
                      onCheckedChange={(v) => setDefect(v === true)}
                      data-test-id="field-defect"
                    />
                    <span className="text-[var(--ms-text-muted)]">{t('defect')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={enableHourAccounting}
                      onCheckedChange={(v) => setEnableHourAccounting(v === true)}
                      data-test-id="field-hour-accounting"
                    />
                    <span className="text-[var(--ms-text-muted)]">{t('normo_hour')}</span>
                  </label>
                </div>
              </DocumentMetaField>
            </DocumentMetaRow>
            <DocumentMetaRow>
              <DocumentMetaField label={t('labour_cost_per_unit')}>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={labourUnitCost}
                  onChange={(e) => setLabourUnitCost(e.target.value)}
                  disabled={enableHourAccounting}
                  className="text-right"
                  data-test-id="field-labour-unit-cost"
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('normo_hours_per_unit')}>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={standardHourUnit}
                  onChange={(e) => setStandardHourUnit(e.target.value)}
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
                  value={standardHourCost}
                  onChange={(e) => setStandardHourCost(e.target.value)}
                  className="text-right"
                  data-test-id="field-standard-hour-cost"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          {/* Materials from BOM */}
          {bomDetail ? (
            <div
              className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
              data-test-id="bom-materials-table"
            >
              <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {t('materials_to_consume')} — {bomDetail.name}
                {bomDetail.product ? ` → ${bomDetail.product.name}` : ''}
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
                      <div className="truncate font-medium">{c.product?.name ?? c.productId}</div>
                      <div className="text-right text-[var(--ms-text-muted)] tabular-nums">
                        {c.qty}
                      </div>
                      <div className="text-right tabular-nums">{c.totalQty}</div>
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
                  {(Number(totalCostMinor) / 100).toFixed(2)} UZS
                </span>
              </div>
            </div>
          ) : (
            <div
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed px-4 py-6 text-center text-[var(--ms-text-muted)] text-sm"
              data-test-id="bom-required-empty"
            >
              {t('bom_required_empty')}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tFields('description')}
                rows={3}
                data-test-id="field-description"
              />
              {externalCodeVisible ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="external-code" className="text-[var(--ms-text-muted)] text-sm">
                    {tFields('external_code')}:
                  </label>
                  <Input
                    id="external-code"
                    type="text"
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                    className="flex-1"
                    data-test-id="field-external-code"
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setExternalCodeVisible(true)}
                  className="h-auto px-0 font-normal text-xs"
                  data-test-id="show-external-code"
                >
                  {tFields('external_code')}
                </Button>
              )}
            </div>
            <DocumentTotalsPanel
              labels={totalsLabels}
              subtotalMinor={totalCostMinor}
              vatMinor={0n}
              totalMinor={totalCostMinor}
              currency="UZS"
              vatEnabled={false}
              onVatEnabledChange={() => {
                /* no VAT for Processing */
              }}
              vatIncluded={false}
              onVatIncludedChange={() => {
                /* no VAT for Processing */
              }}
              quantity={qtyNum}
            />
          </div>

          <DocumentDisclosurePanel
            title={tForm('files_section')}
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
      </DocumentEditor>

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
      <CatalogPicker
        open={openPicker === 'matStore'}
        onClose={() => setOpenPicker(null)}
        title={tForm('store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setMaterialsStoreId(item.id);
          setMaterialsStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'prodStore'}
        onClose={() => setOpenPicker(null)}
        title={tForm('store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setProductsStoreId(item.id);
          setProductsStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tForm('project_picker_title')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setProjectId(item.id);
          setProjectLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'bom'}
        onClose={() => setOpenPicker(null)}
        title={t('processing_plan_picker')}
        fetcher={bomFetcher}
        onSelect={(item) => {
          setProcessingPlanId(item.id);
          setProcessingPlanLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'order'}
        onClose={() => setOpenPicker(null)}
        title={t('processing_order_picker')}
        fetcher={orderFetcher}
        onSelect={(item) => {
          void onOrderPicked(item.id, String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'stage'}
        onClose={() => setOpenPicker(null)}
        title={t('production_stage')}
        fetcher={stageFetcher}
        onSelect={(item) => {
          setProcessingStageId(item.id);
          setProcessingStageLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'performer'}
        onClose={() => setOpenPicker(null)}
        title={tFields('performer')}
        fetcher={performerFetcher}
        onSelect={(item) => {
          setPerformerId(item.id);
          setPerformerLabel(String(item.primary));
        }}
      />
    </>
  );
}
