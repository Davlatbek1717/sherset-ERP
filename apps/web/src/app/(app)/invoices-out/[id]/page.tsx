'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import {
  type CreateMenuItem,
  DetailContentTabs,
  DetailHeader,
  DetailToolbar,
  DetailTotalsSidebar,
} from '@/components/document-detail';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { SendEmailDialog } from '@/components/send-email-dialog';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { usePositionEditorLabels } from '@/hooks/use-position-editor-labels';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { docTotals } from '@/lib/doc-totals';
import { INVOICE_STATE_TONE, documentStateTone } from '@/lib/document-state-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { resolveDefaultSalePriceOrZero } from '@/lib/sale-price';
import {
  Alert,
  Avatar,
  Badge,
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
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface InvoiceDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  paymentPlannedMoment: string | null;
  postedAt: string | null;
  description: string | null;
  sumMinor: string;
  /** ISO currency of the document (e.g. USD), for money formatting. */
  currency: string;
  vatSumMinor: string;
  payedSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  agent: { id: string; name: string; legalTitle: string | null; companyType: string };
  organization: { id: string; name: string; legalTitle: string | null };
  owner: { id: string; name: string } | null;
  customerOrder: { id: string; name: string; state: string } | null;
  salesChannel: { id: string; name: string } | null;
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  store: { id: string; name: string } | null;
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

// moysklad parity: inline state dropdown — only the 2 unambiguous
// manually settable states (draft↔posted). sent/partially_paid/paid/
// overdue/cancelled are derived from payments or the «Отправлено» flag.
const IO_STATE_COLOR: Record<string, string> = {
  draft: '#9ca3af',
  posted: '#2563eb',
};
const IO_STATE_VERB: Record<string, string> = {
  draft: 'unpost',
  posted: 'post',
};

interface FormState {
  agentId: string;
  agentLabel: string;
  organizationId: string;
  organizationLabel: string;
  salesChannelId: string | null;
  salesChannelLabel: string;
  contractId: string | null;
  contractLabel: string;
  projectId: string | null;
  projectLabel: string;
  storeId: string | null;
  storeLabel: string;
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  agentAccountId: string | null;
  agentAccountLabel: string;
  externalCode: string;
  paymentPlannedMoment: string;
  description: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  positions: PositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: InvoiceDetail): FormState {
  return {
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    salesChannelId: d.salesChannel?.id ?? null,
    salesChannelLabel: d.salesChannel?.name ?? '',
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    storeId: d.store?.id ?? null,
    storeLabel: d.store?.name ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.accountNumber || d.organizationAccount?.name || '',
    agentAccountId: d.agentAccount?.id ?? null,
    agentAccountLabel: d.agentAccount?.accountNumber ?? '',
    externalCode: d.externalCode ?? '',
    paymentPlannedMoment: d.paymentPlannedMoment ? d.paymentPlannedMoment.slice(0, 10) : '',
    description: d.description ?? '',
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
    })),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    agentId: s.agentId,
    organizationId: s.organizationId,
    salesChannelId: s.salesChannelId,
    contractId: s.contractId,
    projectId: s.projectId,
    storeId: s.storeId,
    organizationAccountId: s.organizationAccountId,
    agentAccountId: s.agentAccountId,
    externalCode: s.externalCode,
    paymentPlannedMoment: s.paymentPlannedMoment,
    description: s.description,
    vatEnabled: s.vatEnabled,
    vatIncluded: s.vatIncluded,
    positions: s.positions.map((p) => ({
      assortmentId: p.assortmentId,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      discount: p.discount,
      vat: p.vat,
      vatEnabled: p.vatEnabled,
    })),
    attributes: s.attributes,
  });
}

export default function InvoiceOutDetailPage() {
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.invoice_out');
  const tEmail = useTranslations('email_template');
  const tDetailTabs = useTranslations('detail_tabs');
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('invoices-out', id);
  const positionLabels = usePositionEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-out', id],
    queryFn: () => api.get(`/invoices-out/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | 'store'
    | 'organizationAccount'
    | 'agentAccount'
  >(null);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['invoice-out', id], () => setForm(null));

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
    mutationFn: (target: string) => api.post(`/invoices-out/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-out', id] });
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      if (data?.customerOrder) {
        qc.invalidateQueries({ queryKey: ['customer-order', data.customerOrder.id] });
        qc.invalidateQueries({ queryKey: ['customer-orders'] });
      }
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/invoices-out/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      router.push('/invoices-out');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const createPaymentMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/payments-in/from-invoice-out/${id}`, {}),
    onSuccess: (payment) => {
      qc.invalidateQueries({ queryKey: ['invoice-out', id] });
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      router.push(`/payments-in/${payment.id}`);
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/invoices-out/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      router.push(`/invoices-out/${clone.id}`);
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        // moysklad parity — header refs (Канал продаж / Договор / Проект)
        // are document metadata, editable any time.
        salesChannelId: form.salesChannelId,
        contractId: form.contractId,
        projectId: form.projectId,
        storeId: form.storeId,
        organizationAccountId: form.organizationAccountId,
        agentAccountId: form.agentAccountId,
        externalCode: form.externalCode || null,
        // moysklad parity — «План. дата оплаты» is editable any time (overdue
        // is derived from it). Mirrors invoices-in; backend persists it.
        paymentPlannedMoment: form.paymentPlannedMoment || null,
      };
      if (!data.applicable) {
        payload.agentId = form.agentId;
        payload.organizationId = form.organizationId;
        payload.positions = form.positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: PositionEditor guarantees assortmentId is set before save
          assortmentId: p.assortmentId!,
          quantity: Number(p.quantity),
          priceMinor: p.priceMinor,
          discount: Number(p.discount || '0'),
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/invoices-out/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['invoice-out', id] });
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      if (form) setOriginal(snapshot(form));
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
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
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
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
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; code: string | null }>;
    }>(`/stores?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((x) => ({ id: x.id, primary: x.name, secondary: x.code ?? undefined }));
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

  if (isLoading || !form) {
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const editable = !data.applicable;
  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const paidBig = BigInt(data.payedSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);
  const isPaid = sumBig > 0n && paidBig >= sumBig;
  const remainingMinor = (sumBig - paidBig).toString();

  const canCreatePayment =
    (['posted', 'sent', 'partially_paid', 'overdue'] as const).includes(data.state as never) &&
    !isPaid;

  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'payment-in',
      // moysklad parity: «Создать» menu uses the singular detail_titles name
      // («Входящий платёж»), not the plural create_related list-title.
      label: tDetailTitles('payment_in'),
      onSelect: canCreatePayment ? () => createPaymentMut.mutate() : undefined,
      disabled: !canCreatePayment,
    },
  ];

  const onToggleApplicable = (['cancelled'] as const).includes(data.state as never)
    ? undefined
    : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  const pillsSlot = (
    <>
      {!isPaid && (
        <Badge tone="warning" data-test-id="detail-header-unpaid">
          {tDetailHeader('not_paid')}
        </Badge>
      )}
      {!isPaid && canCreatePayment && (
        <button
          type="button"
          onClick={() => createPaymentMut.mutate()}
          className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
          disabled={createPaymentMut.isPending}
          data-test-id="detail-header-request-payment"
        >
          {tDetailHeader('request_payment')}
        </button>
      )}
    </>
  );

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="invoice-out-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/invoices-out')}
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
        onPrintList={() =>
          window.open(`/print/invoice-out/${data.id}?auto=1`, '_blank', 'width=820,height=1100')
        }
        printEntity="invoiceout"
        onSendEmail={() => setEmailOpen(true)}
      />
      <DetailHeader
        titlePrefix={tDetailTitles('invoice_out')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(
          data.state as
            | 'draft'
            | 'posted'
            | 'sent'
            | 'partially_paid'
            | 'paid'
            | 'overdue'
            | 'cancelled',
        )}
        stateTone={documentStateTone(data.state, INVOICE_STATE_TONE)}
        stateSlug={data.state}
        stateMenuItems={(['draft', 'posted'] as const).map((s) => ({
          slug: s,
          label: tStates(s),
          color: IO_STATE_COLOR[s],
        }))}
        onStateChange={(slug) => transitionMut.mutate(IO_STATE_VERB[slug] ?? slug)}
        stateBusy={transitionMut.isPending}
        applicable={data.applicable}
        onToggleApplicable={onToggleApplicable}
        applicableBusy={transitionMut.isPending}
        pillsSlot={pillsSlot}
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
        {createPaymentMut.error && (
          <Alert tone="destructive" className="mb-3">
            {(createPaymentMut.error as Error).message}
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
            <DocumentMetaField label={tFields('payment_planned')}>
              <Input
                type="date"
                value={form.paymentPlannedMoment}
                onChange={(e) =>
                  setForm((s) => s && { ...s, paymentPlannedMoment: e.target.value })
                }
                disabled={!editable}
                data-test-id="field-payment-planned"
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
            <DocumentMetaField label={tCommon('paid')}>
              <Input
                value={formatMoney(paidBig)}
                disabled
                placeholder="—"
                data-test-id="field-payed-sum"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('customer_order')}>
              <div className="flex h-9 items-center px-2 text-sm">
                {data.customerOrder ? (
                  <a
                    href={`/customer-orders/${data.customerOrder.id}`}
                    className="text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
                    data-test-id="field-customer-order"
                  >
                    {data.customerOrder.name}
                  </a>
                ) : (
                  <span className="text-[var(--ms-text-muted)]">{tCommon('none')}</span>
                )}
              </div>
            </DocumentMetaField>
            <DocumentMetaField label={tCommon('balance')}>
              <Input
                value={formatMoney(remainingMinor)}
                disabled
                placeholder="—"
                data-test-id="field-remaining"
              />
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
            <DocumentMetaField label={tFields('store')}>
              <CatalogPickerField
                value={form.storeId ? { id: form.storeId, label: form.storeLabel } : null}
                placeholder={tFields('store')}
                onPick={() => editable && setOpenPicker('store')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, storeId: null, storeLabel: '' })
                }
                disabled={!editable}
                testId="field-store"
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
            auditEntity="InvoiceOut"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tDetailTabs('main')}
            filesSlot={<AttachmentsSection entity="InvoiceOut" entityId={data.id} />}
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
          <DocumentTasksSection entity="InvoiceOut" entityId={data.id} />
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="InvoiceOut"
            values={form.attributes}
            onChange={(next) => setForm({ ...form, attributes: next })}
            disabled={!editable}
            testIdPrefix="invoice-out"
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
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, storeId: item.id, storeLabel: String(item.primary) })
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
      <SendEmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        entity="InvoiceOut"
        entityId={data.id}
        defaultSubject={tEmail('subject_invoice', { name: data.name })}
        defaultBodyHtml={tEmail.raw('body_invoice')}
      />
    </div>
  );
}
