'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import {
  DetailContentTabs,
  DetailHeader,
  DetailToolbar,
  DetailTotalsSidebar,
} from '@/components/document-detail';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { usePositionEditorLabels } from '@/hooks/use-position-editor-labels';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { DOC_STATE_VERB, buildDocStateMenu } from '@/lib/doc-state-dropdown';
import { docTotals } from '@/lib/doc-totals';
import { documentStateTone } from '@/lib/document-state-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
import { resolveDefaultSalePriceOrZero } from '@/lib/sale-price';
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
  Modal,
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
  demandPositionId: string | null;
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
  gtdNumber: string | null;
  gtdSumMinor: string | null;
  countryId: string | null;
  country: { id: string; name: string; code: string | null } | null;
}

interface SalesReturnDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  reason: string | null;
  description: string | null;
  sumMinor: string;
  /** ISO currency of the document (e.g. USD), for money formatting. */
  currency: string;
  vatSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string; legalTitle: string | null };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  demand: { id: string; name: string; state: string } | null;
  customerOrder: { id: string; name: string; state: string } | null;
  salesChannel: { id: string; name: string } | null;
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  agentAccount: { id: string; accountNumber: string } | null;
  positions: PositionDetail[];
  createdAt: string;
  updatedAt: string;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
}

interface FormState {
  agentId: string;
  agentLabel: string;
  organizationId: string;
  organizationLabel: string;
  storeId: string;
  storeLabel: string;
  salesChannelId: string | null;
  salesChannelLabel: string;
  contractId: string | null;
  contractLabel: string;
  projectId: string | null;
  projectLabel: string;
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  agentAccountId: string | null;
  agentAccountLabel: string;
  externalCode: string;
  description: string;
  reason: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  positions: PositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: SalesReturnDetail): FormState {
  return {
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    storeId: d.store.id,
    storeLabel: d.store.name,
    salesChannelId: d.salesChannel?.id ?? null,
    salesChannelLabel: d.salesChannel?.name ?? '',
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.accountNumber || d.organizationAccount?.name || '',
    agentAccountId: d.agentAccount?.id ?? null,
    agentAccountLabel: d.agentAccount?.accountNumber ?? '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    reason: d.reason ?? '',
    vatEnabled: d.vatEnabled,
    vatIncluded: d.vatIncluded,
    positions: d.positions.map((p) => ({
      _uid: p.id,
      assortmentId: p.assortmentId,
      productLabel: p.product?.name ?? '—',
      productUom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      discount: p.discount,
      vat: p.vat != null ? String(p.vat) : '',
      vatEnabled: p.vatEnabled,
      gtdNumber: p.gtdNumber ?? '',
      gtdSumMinor: p.gtdSumMinor ?? '',
      countryId: p.countryId ?? null,
      countryLabel: p.country?.name ?? '',
    })),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    agentId: s.agentId,
    organizationId: s.organizationId,
    storeId: s.storeId,
    salesChannelId: s.salesChannelId,
    contractId: s.contractId,
    projectId: s.projectId,
    organizationAccountId: s.organizationAccountId,
    agentAccountId: s.agentAccountId,
    externalCode: s.externalCode,
    description: s.description,
    reason: s.reason,
    vatEnabled: s.vatEnabled,
    vatIncluded: s.vatIncluded,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      discount: p.discount,
      vat: p.vat,
      vatEnabled: p.vatEnabled,
      gtdNumber: p.gtdNumber ?? '',
      gtdSumMinor: p.gtdSumMinor ?? '',
      countryId: p.countryId ?? null,
    })),
    attributes: s.attributes,
  });
}

export default function SalesReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('sales-returns', id);
  const positionLabels = usePositionEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tStates = useTranslations('states.sales_return');
  const tRestock = useTranslations('restock');
  const tForm = useTranslations('form');
  const userDefaults = useUserDefaults();

  const { data, isLoading } = useQuery<SalesReturnDetail>({
    queryKey: ['sales-return', id],
    queryFn: () => api.get(`/sales-returns/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | 'organizationAccount'
    | 'agentAccount'
  >(null);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // «Omborchiga yubordim» — send returned goods to a warehouse-keeper to restock.
  const [sendOpen, setSendOpen] = useState(false);
  const [omborchiId, setOmborchiId] = useState<string | null>(null);
  const [omborchiLabel, setOmborchiLabel] = useState('');
  const [omborchiPickerOpen, setOmborchiPickerOpen] = useState(false);
  const [restockNote, setRestockNote] = useState('');
  const onConflict = useConflictReload(['sales-return', id], () => setForm(null));

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
    mutationFn: (target: string) => api.post(`/sales-returns/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-return', id] });
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      if (data?.demand) qc.invalidateQueries({ queryKey: ['demand', data.demand.id] });
      if (data?.customerOrder)
        qc.invalidateQueries({ queryKey: ['customer-order', data.customerOrder.id] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/sales-returns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      router.push('/sales-returns');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/sales-returns/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      router.push(`/sales-returns/${clone.id}`);
    },
  });

  // Send returned goods to the warehouse-keeper (omborchi) → creates a restock
  // task (with each product's bin location) + notifies them.
  const sendToWarehouseMut = useApiMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/restock-tasks/from-sales-return', {
        salesReturnId: id,
        assigneeId: omborchiId,
        note: restockNote.trim() || undefined,
      }),
    successMessage: tRestock('sent_success'),
    onSuccess: (task) => {
      setSendOpen(false);
      setOmborchiId(null);
      setOmborchiLabel('');
      setRestockNote('');
      router.push(`/restock-tasks/${task.id}`);
    },
  });

  const omborchiFetcher = async (search: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; email?: string | null }> }>(
      `/employees?search=${encodeURIComponent(search)}&limit=20`,
    );
    return d.items.map((e) => ({ id: e.id, primary: e.name, secondary: e.email ?? undefined }));
  };

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        // Optimistic-lock: send the version we LOADED (from the query `data`,
        // not local form state) so a concurrent edit is detected → 409.
        version: data.version,
        description: form.description || null,
        reason: form.reason || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        // moysklad parity — header refs (Канал продаж / Договор / Проект)
        // are document metadata, editable any time.
        salesChannelId: form.salesChannelId,
        contractId: form.contractId,
        projectId: form.projectId,
        organizationAccountId: form.organizationAccountId,
        agentAccountId: form.agentAccountId,
        externalCode: form.externalCode || null,
      };
      if (data && !data.applicable) {
        payload.agentId = form.agentId;
        payload.organizationId = form.organizationId;
        payload.storeId = form.storeId;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: PositionEditor guarantees assortmentId is set before save
          assortmentId: p.assortmentId!,
          quantity: Number(p.quantity),
          priceMinor: p.priceMinor,
          discount: Number(p.discount || '0'),
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          gtdNumber: p.gtdNumber || undefined,
          gtdSumMinor: p.gtdSumMinor || undefined,
          countryId: p.countryId || undefined,
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/sales-returns/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['sales-return', id] });
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      if (form) setOriginal(snapshot(form));
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const { runDestructive } = useDestructiveMutation();

  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    const items = d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
    return pinDefaultCustomer(
      items,
      userDefaults.data?.defaultCustomer,
      s,
      tForm('pinned_default'),
    );
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
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const countryFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code: string | null }> }>(
      `/countries?search=${encodeURIComponent(s)}&limit=100`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/contracts?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const organizationAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    const params = new URLSearchParams({ search: s, limit: '50' });
    if (form?.organizationId) params.set('organizationId', form.organizationId);
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        accountNumber: string | null;
        bankName: string | null;
      }>;
    }>(`/organization-accounts?${params.toString()}`);
    return d.items.map((x) => ({
      id: x.id,
      primary: x.accountNumber || x.name,
      secondary: x.bankName ?? undefined,
    }));
  };
  // moysklad parity — counterparty bank accounts have no flat list endpoint;
  // the only route is the nested /counterparties/:id/bank-accounts (same as
  // the contract picker is gated on the chosen agent). Client-filter by
  // search since the nested endpoint takes no search param.
  const agentAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!form?.agentId) return [];
    const d = await api.get<Array<{ id: string; accountNumber: string; bankName: string | null }>>(
      `/counterparties/${form.agentId}/bank-accounts`,
    );
    const q = s.trim().toLowerCase();
    return d
      .filter(
        (x) =>
          !q ||
          x.accountNumber.toLowerCase().includes(q) ||
          (x.bankName ?? '').toLowerCase().includes(q),
      )
      .map((x) => ({ id: x.id, primary: x.accountNumber, secondary: x.bankName ?? undefined }));
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
  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);

  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="sales-return-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/sales-returns')}
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
        onPrintList={() =>
          window.open(`/print/sales-return/${data.id}?auto=1`, '_blank', 'width=820,height=1100')
        }
        printEntity="salesreturn"
        rightSlot={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSendOpen(true)}
            data-test-id="send-to-warehouse"
          >
            {tRestock('send_button')}
          </Button>
        }
      />
      <DetailHeader
        titlePrefix={tDetailTitles('sales_return')}
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
                placeholder={tFields('organization')}
                onPick={() => editable && setOpenPicker('org')}
                onClear={() =>
                  editable &&
                  setForm(
                    (s) =>
                      s && {
                        ...s,
                        organizationId: '',
                        organizationLabel: '',
                        organizationAccountId: null,
                        organizationAccountLabel: '',
                      },
                  )
                }
                disabled={!editable}
                testId="field-organization"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('store')} required>
              <CatalogPickerField
                value={form.storeId ? { id: form.storeId, label: form.storeLabel } : null}
                placeholder={tFields('store')}
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
            <DocumentMetaField label={tFields('agent')} required>
              <CatalogPickerField
                value={form.agentId ? { id: form.agentId, label: form.agentLabel } : null}
                placeholder={tFields('agent')}
                onPick={() => editable && setOpenPicker('agent')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, agentId: '', agentLabel: '' })
                }
                disabled={!editable}
                testId="field-agent"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('reason')}>
              <Input
                value={form.reason}
                onChange={(e) => setForm((s) => s && { ...s, reason: e.target.value })}
                disabled={!editable}
                data-test-id="field-reason"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('linked_demand')}>
              <div className="flex h-9 items-center px-2 text-sm">
                {data.demand ? (
                  <a
                    href={`/demands/${data.demand.id}`}
                    className="text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
                    data-test-id="field-linked-demand"
                  >
                    {data.demand.name}
                  </a>
                ) : (
                  <span className="text-[var(--ms-text-muted)]">{tCommon('none')}</span>
                )}
              </div>
            </DocumentMetaField>
            <DocumentMetaField label={tFields('linked_order')}>
              <div className="flex h-9 items-center px-2 text-sm">
                {data.customerOrder ? (
                  <a
                    href={`/customer-orders/${data.customerOrder.id}`}
                    className="text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
                    data-test-id="field-linked-order"
                  >
                    {data.customerOrder.name}
                  </a>
                ) : (
                  <span className="text-[var(--ms-text-muted)]">{tCommon('none')}</span>
                )}
              </div>
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('sales_channel')}>
              <CatalogPickerField
                value={
                  form.salesChannelId
                    ? { id: form.salesChannelId, label: form.salesChannelLabel }
                    : null
                }
                placeholder={tFields('sales_channel')}
                onPick={() => editable && setOpenPicker('salesChannel')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, salesChannelId: null, salesChannelLabel: '' })
                }
                disabled={!editable}
                testId="field-sales-channel"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('contract')}>
              <CatalogPickerField
                value={form.contractId ? { id: form.contractId, label: form.contractLabel } : null}
                placeholder={tFields('contract')}
                onPick={() => editable && setOpenPicker('contract')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, contractId: null, contractLabel: '' })
                }
                disabled={!editable}
                testId="field-contract"
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
            <DocumentMetaField label={tFields('organization_account')}>
              <CatalogPickerField
                value={
                  form.organizationAccountId
                    ? { id: form.organizationAccountId, label: form.organizationAccountLabel }
                    : null
                }
                placeholder={tFields('organization_account')}
                onPick={() => editable && setOpenPicker('organizationAccount')}
                onClear={() =>
                  editable &&
                  setForm(
                    (s) => s && { ...s, organizationAccountId: null, organizationAccountLabel: '' },
                  )
                }
                disabled={!editable}
                testId="field-organization-account"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('agent_account')}>
              <CatalogPickerField
                value={
                  form.agentAccountId
                    ? { id: form.agentAccountId, label: form.agentAccountLabel }
                    : null
                }
                placeholder={tFields('agent_account')}
                onPick={() => editable && setOpenPicker('agentAccount')}
                onClear={() =>
                  editable &&
                  setForm((s) => s && { ...s, agentAccountId: null, agentAccountLabel: '' })
                }
                disabled={!editable}
                testId="field-agent-account"
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
            <DocumentMetaField label={tFields('posted_at')}>
              <Input
                value={data.postedAt ? formatDate(data.postedAt) : ''}
                disabled
                placeholder="—"
                data-test-id="field-posted-at"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-4">
          <DetailContentTabs
            auditEntity="SalesReturn"
            entityId={data.id}
            positionsLabel={tDetailTabs('main')}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="SalesReturn" entityId={data.id} />}
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                <PositionEditor<ProductItem>
                  labels={positionLabels}
                  hideTotals
                  positions={form.positions}
                  onChange={(next) => setForm((s) => s && { ...s, positions: next })}
                  vatEnabled={form.vatEnabled}
                  vatIncluded={form.vatIncluded}
                  productFetcher={productFetcher}
                  onPickProduct={(raw) => ({
                    priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices),
                    vat: raw?.vat != null ? String(raw.vat) : '0',
                    productUom: raw?.uom ?? null,
                  })}
                  customs={{
                    gtdSum: true,
                    gtdSumLabel: tFields('gtd_cost'),
                    country: true,
                    countryFetcher,
                  }}
                  readOnly={!editable}
                />
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

        {/* Inline Задачи collapsible — moysklad parity (bottom of the document
            body, outside the tab strip), mirroring the other detail pages. */}
        <div className="mt-6 flex flex-col gap-3">
          <DocumentTasksSection entity="SalesReturn" entityId={data.id} />
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="SalesReturn"
            values={form.attributes}
            onChange={(next) => setForm({ ...form, attributes: next })}
            disabled={!editable}
            testIdPrefix="sales-return"
          />
        </div>
      </main>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, agentId: item.id, agentLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && {
                ...s,
                organizationId: item.id,
                organizationLabel: String(item.primary),
                organizationAccountId: null,
                organizationAccountLabel: '',
              },
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
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tFields('sales_channel')}
        fetcher={salesChannelFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, salesChannelId: item.id, salesChannelLabel: String(item.primary) },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tFields('contract')}
        fetcher={contractFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, contractId: item.id, contractLabel: String(item.primary) })
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
        open={openPicker === 'organizationAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization_account')}
        fetcher={organizationAccountFetcher}
        onSelect={(item) =>
          setForm(
            (s) =>
              s && {
                ...s,
                organizationAccountId: item.id,
                organizationAccountLabel: String(item.primary),
              },
          )
        }
      />
      <CatalogPicker
        open={openPicker === 'agentAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent_account')}
        fetcher={agentAccountFetcher}
        onSelect={(item) =>
          setForm(
            (s) => s && { ...s, agentAccountId: item.id, agentAccountLabel: String(item.primary) },
          )
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
            priceMinor: resolveDefaultSalePriceOrZero(raw?.salePrices),
            discount: '0',
            vat: raw?.vat != null ? String(raw.vat) : '0',
            vatEnabled: form.vatEnabled,
          };
          setForm((s) => s && { ...s, positions: [...s.positions, newPos] });
        }}
      />

      {/* «Omborchiga yubordim» — pick the warehouse-keeper + optional note, then
          create a restock task (with each product's bin location) + notify them. */}
      <Modal
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={tRestock('modal_title')}
        widthClass="w-[440px]"
        testId="send-warehouse-modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSendOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => sendToWarehouseMut.mutate(undefined)}
              loading={sendToWarehouseMut.isPending}
              disabled={!omborchiId}
              data-test-id="send-to-warehouse-submit"
            >
              {tRestock('send')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[var(--ms-text-secondary)] text-sm">
              {tRestock('omborchi_label')}
            </div>
            <CatalogPickerField
              value={omborchiId ? { id: omborchiId, label: omborchiLabel } : null}
              placeholder={tRestock('omborchi_placeholder')}
              onPick={() => setOmborchiPickerOpen(true)}
              onClear={() => {
                setOmborchiId(null);
                setOmborchiLabel('');
              }}
              testId="omborchi-field"
            />
          </div>
          <div>
            <div className="mb-1 text-[var(--ms-text-secondary)] text-sm">
              {tRestock('note_label')}
            </div>
            <Input
              value={restockNote}
              onChange={(e) => setRestockNote(e.target.value)}
              data-test-id="restock-note"
            />
          </div>
        </div>
      </Modal>
      <CatalogPicker
        open={omborchiPickerOpen}
        onClose={() => setOmborchiPickerOpen(false)}
        title={tRestock('omborchi_label')}
        fetcher={omborchiFetcher}
        onSelect={(item) => {
          setOmborchiId(item.id);
          setOmborchiLabel(String(item.primary));
        }}
      />
    </div>
  );
}
