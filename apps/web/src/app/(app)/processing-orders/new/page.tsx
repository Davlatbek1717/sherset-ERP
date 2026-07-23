'use client';

/**
 * /processing-orders/new — Yangi qayta ishlash buyurtmasi editor.
 *
 * Key points:
 *  - No positions table — the output product + recipe come from the BOM (processingPlan).
 *  - quantity: user types whole units; stored ×1000 microqty on server.
 *  - Materials table: read-only, derived live from the selected BOM's components.
 *    Shows (component product, qty per unit × order quantity = total needed).
 *  - sumMinor: computed server-side from BOM.standardCostMinor × quantity (informational).
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
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
import { useRouter } from 'next/navigation';
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

export default function NewProcessingOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.processing_order');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tStates = useTranslations('states.processing_order');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const docEditorLabels = useDocumentEditorLabels();

  // FSM mirrors processing-orders/[id]; status is decorative on /new (API creates a draft).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(true);

  // Meta state
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [externalCodeVisible, setExternalCodeVisible] = useState(false);

  // BOM (processingPlan) state
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [processingPlanLabel, setProcessingPlanLabel] = useState('');
  const [bomDetail, setBomDetail] = useState<BomItem | null>(null);

  // Quantity (whole units, user-facing)
  const [quantity, setQuantity] = useState('1');

  // Picker state
  const [openPicker, setOpenPicker] = useState<null | 'org' | 'store' | 'bom' | 'project'>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). Организация/Склад=default with a first-item
  // fallback, Проект=defaultProject (no counterparty on this doc).
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
    if (!storeId) {
      if (us?.defaultStore) {
        setStoreId(us.defaultStore.id);
        setStoreLabel(us.defaultStore.name);
      } else if (storesData.items[0]) {
        setStoreId(storesData.items[0].id);
        setStoreLabel(storesData.items[0].name);
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
    storeId,
    projectId,
  ]);

  // Fetch BOM detail when BOM changes (for materials table)
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

  // Compute total cost estimate: standardCostMinor × quantity
  const totalCostMinor =
    bomDetail && quantity
      ? (BigInt(bomDetail.standardCostMinor || '0') * BigInt(Math.round(Number(quantity || '0')))) /
        1n
      : 0n;

  // Fetchers
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
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

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!storeId) throw new Error(t('err_store'));
      if (!quantity || Number(quantity) <= 0) throw new Error(t('err_quantity'));
      const payload = {
        organizationId,
        storeId,
        ...(projectId ? { projectId } : {}),
        ...(processingPlanId ? { processingPlanId } : {}),
        quantity,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        ...(deliveryDate ? { deliveryPlannedMoment: deliveryDate } : {}),
        applicable,
        description: description || undefined,
        externalCode: externalCode || undefined,
      };
      return api.post<{ id: string }>('/processing-orders', payload);
    },
    onSuccess: (created) => router.push(`/processing-orders/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  // Compute total materials needed for the materials table
  const materialsRows =
    bomDetail?.components.map((c) => ({
      ...c,
      totalQty: (Number(c.qty) * Number(quantity || '0')).toFixed(3).replace(/\.?0+$/, ''),
    })) ?? [];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="processing-order-new-page"
        documentTypeLabel={tDetailTitles('processing_order')}
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
        onClose={() => router.push('/processing-orders')}
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
              <DocumentMetaField label={t('destination_store')} required>
                <CatalogPickerField
                  value={storeId ? { id: storeId, label: storeLabel } : null}
                  placeholder={t('destination_store')}
                  onPick={() => setOpenPicker('store')}
                  onClear={() => {
                    setStoreId(null);
                    setStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('processing_plan')}>
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
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('delivery_planned')}>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  data-test-id="field-delivery-date"
                />
              </DocumentMetaField>
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
          </DocumentMetaPanel>

          {/* Materials from BOM — read-only, live-computed */}
          {bomDetail ? (
            <div
              className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
              data-test-id="bom-materials-table"
            >
              <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {t('materials_from_bom')} — {bomDetail.name}
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
              {/* Estimated total cost */}
              <div className="flex items-center justify-between border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-4 py-2 text-sm">
                <span className="text-[var(--ms-text-muted)]">{t('total_materials_cost')}</span>
                <span className="font-medium tabular-nums">
                  {(Number(totalCostMinor) / 100).toFixed(2)} UZS
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
              subtotalMinor={totalCostMinor}
              vatMinor={0n}
              totalMinor={totalCostMinor}
              currency="UZS"
              vatEnabled={false}
              onVatEnabledChange={() => {
                // VAT not applicable to processing orders
              }}
              vatIncluded={false}
              onVatIncludedChange={() => {
                // VAT not applicable to processing orders
              }}
              quantity={Number(quantity || '0')}
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
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tForm('store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
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
    </>
  );
}
