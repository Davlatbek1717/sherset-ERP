'use client';

/**
 * /productions/new — moysklad-parity «Заказ на производство» editor.
 *
 * Header-only document (Production is the high-level make-to-order
 * order; ProcessingOrders/Processing ops materialise from it — no
 * inline line editor here, mirrors the API CreateProductionSchema).
 * §93 — the create-form was genuinely absent (§85 flagged it); the
 * API (schema + CRUD + transitions) was already complete.
 *
 * Scaffolding cloned from the §65-verified /moves/new page (proven,
 * gated) with the positions editor stripped.
 */

import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  DocumentTabs,
  Input,
  type PickerItem,
  Textarea,
} from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
  code?: string | null;
}

type PickerKey = null | 'org' | 'store' | 'matStore' | 'project' | 'customerOrder';

export default function NewProductionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.productions');
  const tErrors = useTranslations('errors');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.production');
  const docEditorLabels = useDocumentEditorLabels();

  // FSM mirrors productions/[id]; status is decorative on /new (the API creates a draft).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

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
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [materialsStoreId, setMaterialsStoreId] = useState<string | null>(null);
  const [materialsStoreLabel, setMaterialsStoreLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [customerOrderId, setCustomerOrderId] = useState<string | null>(null);
  const [customerOrderLabel, setCustomerOrderLabel] = useState('');

  const [deliveryPlanned, setDeliveryPlanned] = useState('');
  const [productionStart, setProductionStart] = useState('');
  const [productionEnd, setProductionEnd] = useState('');
  const [reserve, setReserve] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');

  const [openPicker, setOpenPicker] = useState<PickerKey>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). This doc uses inline-fetch pickers (no
  // preloaded list), so the defaults apply directly — Организация=defaultCompany,
  // Склад/Склад материалов=defaultStore, Проект=defaultProject.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current || userDefaults.isLoading) return;
    defaultsAppliedRef.current = true;
    const us = userDefaults.data;
    if (!organizationId && us?.defaultCompany) {
      setOrganizationId(us.defaultCompany.id);
      setOrganizationLabel(us.defaultCompany.name);
    }
    if (us?.defaultStore) {
      if (!storeId) {
        setStoreId(us.defaultStore.id);
        setStoreLabel(us.defaultStore.name);
      }
      if (!materialsStoreId) {
        setMaterialsStoreId(us.defaultStore.id);
        setMaterialsStoreLabel(us.defaultStore.name);
      }
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    storeId,
    materialsStoreId,
    projectId,
  ]);

  const toIso = (local: string): string | undefined =>
    local ? new Date(local).toISOString() : undefined;

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!storeId) throw new Error(t('select_product_store'));
      const payload = {
        organizationId,
        storeId,
        ...(materialsStoreId ? { materialsStoreId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(customerOrderId ? { customerOrderId } : {}),
        ...(externalCode ? { externalCode } : {}),
        ...(docNumber ? { name: docNumber } : {}),
        moment: toIso(docDate),
        ...(deliveryPlanned ? { deliveryPlannedMoment: toIso(deliveryPlanned) } : {}),
        ...(productionStart ? { productionStart: toIso(productionStart) } : {}),
        ...(productionEnd ? { productionEnd: toIso(productionEnd) } : {}),
        reserve,
        awaiting,
        description: description || undefined,
      };
      return api.post<{ id: string }>('/productions', payload);
    },
    onSuccess: (created) => router.push(`/productions/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
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
  const customerOrderFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/customer-orders?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  const dtField = (label: string, value: string, set: (v: string) => void, testId: string) => (
    <DocumentMetaField label={label}>
      <Input
        type="datetime-local"
        value={value}
        onChange={(e) => set(e.target.value)}
        data-test-id={testId}
      />
    </DocumentMetaField>
  );

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
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
              <DocumentMetaField label={t('product_store')} required>
                <CatalogPickerField
                  value={storeId ? { id: storeId, label: storeLabel } : null}
                  placeholder={tForm('select_store')}
                  onPick={() => setOpenPicker('store')}
                  onClear={() => {
                    setStoreId(null);
                    setStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>
            <DocumentMetaRow>
              <DocumentMetaField label={t('material_store')}>
                <CatalogPickerField
                  value={
                    materialsStoreId ? { id: materialsStoreId, label: materialsStoreLabel } : null
                  }
                  placeholder={tForm('select_store')}
                  onPick={() => setOpenPicker('matStore')}
                  onClear={() => {
                    setMaterialsStoreId(null);
                    setMaterialsStoreLabel('');
                  }}
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
            <DocumentMetaRow>
              <DocumentMetaField label={t('customer_order')}>
                <CatalogPickerField
                  value={
                    customerOrderId ? { id: customerOrderId, label: customerOrderLabel } : null
                  }
                  placeholder={t('customer_order')}
                  onPick={() => setOpenPicker('customerOrder')}
                  onClear={() => {
                    setCustomerOrderId(null);
                    setCustomerOrderLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tDetailForm('external_code')}>
                <Input
                  value={externalCode}
                  onChange={(e) => setExternalCode(e.target.value)}
                  data-test-id="field-external-code"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
            <DocumentMetaRow>
              {dtField(
                t('ship_date_planned'),
                deliveryPlanned,
                setDeliveryPlanned,
                'field-delivery',
              )}
              {dtField(t('date_start'), productionStart, setProductionStart, 'field-prod-start')}
            </DocumentMetaRow>
            <DocumentMetaRow>
              {dtField(t('date_end'), productionEnd, setProductionEnd, 'field-prod-end')}
              <DocumentMetaField label={t('reserve_materials')}>
                <label className="flex h-8 items-center gap-2 text-sm">
                  <Checkbox
                    checked={reserve}
                    onCheckedChange={(v) => setReserve(v === true)}
                    data-test-id="field-reserve"
                  />
                  <span className="text-[var(--ms-text-muted)]">{t('reserve_materials')}</span>
                </label>
              </DocumentMetaField>
            </DocumentMetaRow>
            <DocumentMetaRow>
              <DocumentMetaField label={t('awaiting_product')}>
                <label className="flex h-8 items-center gap-2 text-sm">
                  <Checkbox
                    checked={awaiting}
                    onCheckedChange={(v) => setAwaiting(v === true)}
                    data-test-id="field-awaiting"
                  />
                  <span className="text-[var(--ms-text-muted)]">{t('awaiting_product')}</span>
                </label>
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          <div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tFields('description')}
              rows={3}
              data-test-id="field-description"
            />
          </div>
        </div>
      ),
    },
    {
      key: 'related',
      label: tDetailTabs('related'),
      content: (
        <p className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-6 text-center text-[var(--ms-text-muted)] text-sm">
          {t('related_empty')}
        </p>
      ),
    },
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="production-new-page"
        documentTypeLabel={tDetailTitles('production')}
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
        onClose={() => router.push('/productions')}
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
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
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
        title={t('product_store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'matStore'}
        onClose={() => setOpenPicker(null)}
        title={t('material_store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setMaterialsStoreId(item.id);
          setMaterialsStoreLabel(String(item.primary));
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
        open={openPicker === 'customerOrder'}
        onClose={() => setOpenPicker(null)}
        title={t('customer_order_picker_title')}
        fetcher={customerOrderFetcher}
        onSelect={(item) => {
          setCustomerOrderId(item.id);
          setCustomerOrderLabel(String(item.primary));
        }}
      />
    </>
  );
}
