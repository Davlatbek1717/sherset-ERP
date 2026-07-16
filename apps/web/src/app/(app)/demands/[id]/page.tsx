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
import { documentStateTone } from '@/lib/document-state-tone';
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
  priceMinor: string;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
  costMinor: string | null;
  customerOrderPositionId: string | null;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface DemandDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  overheadSumMinor: string;
  overheadDistribution: string;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
  sumMinor: string;
  /** ISO currency of the document (e.g. USD), for money formatting. */
  currency: string;
  // «Оплата» — populated by the PaymentIn cascade; drives the «Не оплачено» chip.
  payedSumMinor: string;
  vatSumMinor: string;
  costSumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  agent: { id: string; name: string; legalTitle: string | null; companyType: string };
  organization: { id: string; name: string; legalTitle: string | null };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  customerOrder: { id: string; name: string; state: string } | null;
  salesChannel: { id: string; name: string } | null;
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  deliveryPlannedMoment: string | null;
  paymentPlannedMoment: string | null;
  shipmentAddress: string | null;
  consignor: { id: string; name: string } | null;
  consignee: { id: string; name: string } | null;
  carrier: { id: string; name: string } | null;
  cargoName: string | null;
  shipperInstructions: string | null;
  transportFacility: string | null;
  carNumber: string | null;
  placesCount: number | null;
  shippingDocNo: string | null;
  shippingDocDate: string | null;
  stateContractId: string | null;
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

// moysklad parity: inline state-change dropdown («Новый ▾») in the
// detail title. Demand FSM transitions are verb-based (post/unpost/
// cancel), so each target state maps to its transition verb.
const DEMAND_STATE_COLOR: Record<string, string> = {
  draft: '#9ca3af',
  posted: '#16a34a',
  cancelled: '#e92919',
};
const DEMAND_STATE_VERB: Record<string, string> = {
  draft: 'unpost',
  posted: 'post',
  cancelled: 'cancel',
};

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
  deliveryPlannedMoment: string;
  paymentPlannedMoment: string;
  shipmentAddress: string;
  consignorId: string | null;
  consignorLabel: string;
  consigneeId: string | null;
  consigneeLabel: string;
  carrierId: string | null;
  carrierLabel: string;
  cargoName: string;
  shipperInstructions: string;
  transportFacility: string;
  carNumber: string;
  placesCount: string;
  shippingDocNo: string;
  shippingDocDate: string;
  stateContractId: string;
  externalCode: string;
  overheadMajor: string;
  overheadDistribution: 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY';
  description: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  positions: PositionRow[];
  attributes: Record<string, unknown>;
}

function formFromData(d: DemandDetail): FormState {
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
    deliveryPlannedMoment: d.deliveryPlannedMoment ? d.deliveryPlannedMoment.slice(0, 10) : '',
    paymentPlannedMoment: d.paymentPlannedMoment ? d.paymentPlannedMoment.slice(0, 10) : '',
    shipmentAddress: d.shipmentAddress ?? '',
    consignorId: d.consignor?.id ?? null,
    consignorLabel: d.consignor?.name ?? '',
    consigneeId: d.consignee?.id ?? null,
    consigneeLabel: d.consignee?.name ?? '',
    carrierId: d.carrier?.id ?? null,
    carrierLabel: d.carrier?.name ?? '',
    cargoName: d.cargoName ?? '',
    shipperInstructions: d.shipperInstructions ?? '',
    transportFacility: d.transportFacility ?? '',
    carNumber: d.carNumber ?? '',
    placesCount: d.placesCount != null ? String(d.placesCount) : '',
    shippingDocNo: d.shippingDocNo ?? '',
    shippingDocDate: d.shippingDocDate ? d.shippingDocDate.slice(0, 10) : '',
    stateContractId: d.stateContractId ?? '',
    externalCode: d.externalCode ?? '',
    overheadMajor:
      d.overheadSumMinor && d.overheadSumMinor !== '0'
        ? (Number(d.overheadSumMinor) / 100).toString()
        : '',
    overheadDistribution: (['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY'] as const).includes(
      d.overheadDistribution as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY',
    )
      ? (d.overheadDistribution as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY')
      : 'PRICE',
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
    storeId: s.storeId,
    salesChannelId: s.salesChannelId,
    contractId: s.contractId,
    projectId: s.projectId,
    organizationAccountId: s.organizationAccountId,
    deliveryPlannedMoment: s.deliveryPlannedMoment,
    paymentPlannedMoment: s.paymentPlannedMoment,
    shipmentAddress: s.shipmentAddress,
    consignorId: s.consignorId,
    consigneeId: s.consigneeId,
    carrierId: s.carrierId,
    cargoName: s.cargoName,
    shipperInstructions: s.shipperInstructions,
    transportFacility: s.transportFacility,
    carNumber: s.carNumber,
    placesCount: s.placesCount,
    shippingDocNo: s.shippingDocNo,
    shippingDocDate: s.shippingDocDate,
    stateContractId: s.stateContractId,
    externalCode: s.externalCode,
    overheadMajor: s.overheadMajor,
    overheadDistribution: s.overheadDistribution,
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

export default function DemandDetailPage() {
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.demand');
  const tCreate = useTranslations('create_related');
  const tDemands = useTranslations('pages.demands');
  const tDetailTabs = useTranslations('detail_tabs');
  const tEmail = useTranslations('email_template');
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('demands', id);
  const positionLabels = usePositionEditorLabels();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<DemandDetail>({
    queryKey: ['demand', id],
    queryFn: () => api.get(`/demands/${id}`),
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
    | 'consignor'
    | 'consignee'
    | 'carrier'
  >(null);
  const [openCatalogPicker, setOpenCatalogPicker] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['demand', id], () => setForm(null));

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
    mutationFn: (target: string) => api.post(`/demands/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demand', id] });
      qc.invalidateQueries({ queryKey: ['demands'] });
      if (data?.customerOrder) {
        qc.invalidateQueries({ queryKey: ['customer-order', data.customerOrder.id] });
        qc.invalidateQueries({ queryKey: ['customer-orders'] });
      }
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/demands/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demands'] });
      router.push('/demands');
    },
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/demands/${id}/clone`, {}),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: ['demands'] });
      router.push(`/demands/${clone.id}`);
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error('Form not ready');
      const payload: Record<string, unknown> = {
        version: data.version,
        description: form.description || null,
        vatEnabled: form.vatEnabled,
        vatIncluded: form.vatIncluded,
        // moysklad parity — header refs (Канал продаж / Договор / Проект)
        // and Адрес доставки are document metadata, editable any time.
        salesChannelId: form.salesChannelId,
        contractId: form.contractId,
        projectId: form.projectId,
        organizationAccountId: form.organizationAccountId,
        deliveryPlannedMoment: form.deliveryPlannedMoment || null,
        paymentPlannedMoment: form.paymentPlannedMoment || null,
        shipmentAddress: form.shipmentAddress || null,
        consignorId: form.consignorId,
        consigneeId: form.consigneeId,
        carrierId: form.carrierId,
        cargoName: form.cargoName || null,
        shipperInstructions: form.shipperInstructions || null,
        transportFacility: form.transportFacility || null,
        carNumber: form.carNumber || null,
        placesCount: form.placesCount ? Number(form.placesCount) : null,
        shippingDocNo: form.shippingDocNo || null,
        shippingDocDate: form.shippingDocDate || null,
        stateContractId: form.stateContractId || null,
        externalCode: form.externalCode || null,
        // «Накладные расходы» — '' → 0 (no-op at post). Distribution
        // only meaningful when a positive overhead is set.
        overheadSumMinor:
          Number(form.overheadMajor) > 0
            ? String(BigInt(Math.round(Number(form.overheadMajor) * 100)))
            : '0',
        overheadDistribution: form.overheadDistribution,
      };
      if (!data.applicable) {
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
        }));
      }
      payload.attributes = form.attributes;
      return api.patch(`/demands/${id}`, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ['demand', id] });
      qc.invalidateQueries({ queryKey: ['demands'] });
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
  const consignorFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };
  const consigneeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };
  const carrierFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
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
  const canCreateReturn = data.state === 'posted';

  // Totals — same structure as customer-orders.
  const sumBig = BigInt(data.sumMinor || '0');
  const vatBig = BigInt(data.vatSumMinor || '0');
  const { subtotal, total } = docTotals(sumBig, vatBig);
  const totalQty = form.positions.reduce((acc, p) => acc + Number(p.quantity || 0), 0);

  // «Прибыль» — gross profit = sale total − COGS (costSumMinor, set at post via
  // FIFO). Surfaced only once cost is known (posted); a draft's costSumMinor=0
  // keeps it hidden rather than showing full revenue as profit (1:1 plan §1.5).
  const costSumBig = BigInt(data.costSumMinor || '0');
  const profitMinor = costSumBig > 0n ? (sumBig - costSumBig).toString() : undefined;

  // «Не оплачено» payment chip — demand payment progress (payedSumMinor is
  // populated by the PaymentIn cascade). moysklad also shows «Запросить оплату»,
  // but the from-demand create-payment is a disabled placeholder here, so only
  // the status badge is surfaced (1:1 plan §2.3, mirrors invoices-out).
  const paidBig = BigInt(data.payedSumMinor || '0');
  const isPaid = sumBig > 0n && paidBig >= sumBig;
  const pillsSlot = !isPaid ? (
    <Badge tone="warning" data-test-id="detail-header-unpaid">
      {tDetailHeader('not_paid')}
    </Badge>
  ) : null;

  // moysklad «Создать документ» for a demand lists 6 downstream docs in this
  // order (live capture demands/detail/edit-dropdown-sozdat). Only «Возврат
  // покупателя» is wired (its from-demand backend exists); the other five are
  // label-parity placeholders rendered disabled until their from-demand
  // endpoints land — same convention as the assortment «Копировать» /
  // currencies mass-edit placeholders.
  const createMenuItems: CreateMenuItem[] = [
    { id: 'move', label: tDetailTitles('move'), disabled: true },
    { id: 'invoice-out', label: tDetailTitles('invoice_out'), disabled: true },
    { id: 'facture-out', label: tCreate('facture_out'), disabled: true },
    { id: 'payment-in', label: tDetailTitles('payment_in'), disabled: true },
    { id: 'cash-in', label: tDetailTitles('cash_in'), disabled: true },
    {
      id: 'sales-return',
      label: tCreate('sales_return'),
      onSelect: canCreateReturn
        ? () => router.push(`/sales-returns/new?fromDemand=${data.id}`)
        : undefined,
      disabled: !canCreateReturn,
    },
  ];

  // Map the Provedeno checkbox to the FSM. Demand transitions are
  // "post" / "unpost" (verb-style). Cancelled is terminal so the
  // checkbox is rendered disabled by the parent (no callback).
  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="demand-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/demands')}
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
          window.open(`/print/demand/${data.id}?auto=1`, '_blank', 'width=820,height=1100')
        }
        printEntity="demand"
        onSendEmail={() => setEmailOpen(true)}
      />
      <DetailHeader
        titlePrefix={tDetailTitles('demand')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(data.state as 'draft' | 'posted' | 'cancelled')}
        stateTone={documentStateTone(data.state)}
        stateSlug={data.state}
        stateMenuItems={(['draft', 'posted', 'cancelled'] as const).map((s) => ({
          slug: s,
          label: tStates(s),
          color: DEMAND_STATE_COLOR[s],
        }))}
        onStateChange={(slug) => transitionMut.mutate(DEMAND_STATE_VERB[slug] ?? slug)}
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
            {(() => {
              const err = transitionMut.error as Error & {
                data?: {
                  details?: {
                    shortages?: Array<{
                      assortmentId: string;
                      requested: string;
                      available: string;
                      shortage: string;
                    }>;
                  };
                };
              };
              const shortages = err.data?.details?.shortages;
              if (shortages && shortages.length > 0) {
                return (
                  <div>
                    <div className="mb-1 font-medium">{tDemands('stock_shortage_title')}</div>
                    <ul className="ml-5 list-disc text-sm">
                      {shortages.map((s) => (
                        <li key={s.assortmentId}>
                          {tDemands('stock_shortage_line', {
                            requested: s.requested,
                            available: s.available,
                            shortage: s.shortage,
                          })}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return err.message;
            })()}
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
                  setForm((s) => s && { ...s, organizationId: '', organizationLabel: '' })
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
            <DocumentMetaField label={tDetailTitles('customer_order')} fullWidth>
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
            <DocumentMetaField label={tFields('delivery_address')}>
              <Input
                value={form.shipmentAddress}
                onChange={(e) => setForm((s) => s && { ...s, shipmentAddress: e.target.value })}
                disabled={!editable}
                data-test-id="field-shipment-address"
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
            <DocumentMetaField label={tDemands('delivery_date')}>
              <Input
                type="date"
                value={form.deliveryPlannedMoment}
                onChange={(e) =>
                  setForm((s) => s && { ...s, deliveryPlannedMoment: e.target.value })
                }
                disabled={!editable}
                data-test-id="field-delivery-planned"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
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
                placeholder="—"
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
                        overheadDistribution: e.target.value as FormState['overheadDistribution'],
                      },
                  )
                }
                data-test-id="field-overhead-distribution"
                disabled={!editable || !(Number(form.overheadMajor) > 0)}
              >
                <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
              </NativeSelect>
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('consignor')}>
              <CatalogPickerField
                value={
                  form.consignorId ? { id: form.consignorId, label: form.consignorLabel } : null
                }
                placeholder={tFields('consignor')}
                onPick={() => editable && setOpenPicker('consignor')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, consignorId: null, consignorLabel: '' })
                }
                disabled={!editable}
                testId="field-consignor"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('consignee')}>
              <CatalogPickerField
                value={
                  form.consigneeId ? { id: form.consigneeId, label: form.consigneeLabel } : null
                }
                placeholder={tFields('consignee')}
                onPick={() => editable && setOpenPicker('consignee')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, consigneeId: null, consigneeLabel: '' })
                }
                disabled={!editable}
                testId="field-consignee"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('carrier')}>
              <CatalogPickerField
                value={form.carrierId ? { id: form.carrierId, label: form.carrierLabel } : null}
                placeholder={tFields('carrier')}
                onPick={() => editable && setOpenPicker('carrier')}
                onClear={() =>
                  editable && setForm((s) => s && { ...s, carrierId: null, carrierLabel: '' })
                }
                disabled={!editable}
                testId="field-carrier"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('cargo_name')}>
              <Input
                value={form.cargoName}
                onChange={(e) => setForm((s) => s && { ...s, cargoName: e.target.value })}
                disabled={!editable}
                data-test-id="field-cargo-name"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('transport_facility')}>
              <Input
                value={form.transportFacility}
                onChange={(e) => setForm((s) => s && { ...s, transportFacility: e.target.value })}
                disabled={!editable}
                data-test-id="field-transport-facility"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('car_number')}>
              <Input
                value={form.carNumber}
                onChange={(e) => setForm((s) => s && { ...s, carNumber: e.target.value })}
                disabled={!editable}
                data-test-id="field-car-number"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('places_count')}>
              <Input
                type="number"
                min="0"
                value={form.placesCount}
                onChange={(e) => setForm((s) => s && { ...s, placesCount: e.target.value })}
                disabled={!editable}
                data-test-id="field-places-count"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('shipping_doc_no')}>
              <Input
                value={form.shippingDocNo}
                onChange={(e) => setForm((s) => s && { ...s, shippingDocNo: e.target.value })}
                disabled={!editable}
                data-test-id="field-shipping-doc-no"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('shipping_doc_date')}>
              <Input
                type="date"
                value={form.shippingDocDate}
                onChange={(e) => setForm((s) => s && { ...s, shippingDocDate: e.target.value })}
                disabled={!editable}
                data-test-id="field-shipping-doc-date"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('state_contract_id')}>
              <Input
                value={form.stateContractId}
                onChange={(e) => setForm((s) => s && { ...s, stateContractId: e.target.value })}
                disabled={!editable}
                data-test-id="field-state-contract-id"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('shipper_instructions')} fullWidth>
              <Input
                value={form.shipperInstructions}
                onChange={(e) => setForm((s) => s && { ...s, shipperInstructions: e.target.value })}
                disabled={!editable}
                data-test-id="field-shipper-instructions"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        {/* Tab strip + content swap (Pozitsiyalar / Bog'liq / Fayllar / Tarix). */}
        <div className="mt-4">
          <DetailContentTabs
            auditEntity="Demand"
            entityId={data.id}
            positionsLabel={tDetailTabs('main')}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="Demand" entityId={data.id} />}
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
                profitMinor={profitMinor}
                onToggleVatEnabled={(v) => setForm((s) => s && { ...s, vatEnabled: v })}
                onToggleVatIncluded={(v) => setForm((s) => s && { ...s, vatIncluded: v })}
              />
            </div>
          </DetailContentTabs>
        </div>

        {/* Inline Задачи collapsible — moysklad parity (bottom of the
            document body, outside the tab strip), mirroring customer-orders. */}
        <div className="mt-6 flex flex-col gap-3">
          <DocumentTasksSection entity="Demand" entityId={data.id} />
        </div>

        {/* Custom attributes — moysklad keeps these inline below the
            position area, outside the tabbed surface. */}
        <div className="mt-4">
          <AttributesEditor
            entity="Demand"
            values={form.attributes}
            onChange={(next) => setForm({ ...form, attributes: next })}
            disabled={!editable}
            testIdPrefix="demand"
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
        open={openPicker === 'consignor'}
        onClose={() => setOpenPicker(null)}
        title={tFields('consignor')}
        fetcher={consignorFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, consignorId: item.id, consignorLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'consignee'}
        onClose={() => setOpenPicker(null)}
        title={tFields('consignee')}
        fetcher={consigneeFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, consigneeId: item.id, consigneeLabel: String(item.primary) })
        }
      />
      <CatalogPicker
        open={openPicker === 'carrier'}
        onClose={() => setOpenPicker(null)}
        title={tFields('carrier')}
        fetcher={carrierFetcher}
        onSelect={(item) =>
          setForm((s) => s && { ...s, carrierId: item.id, carrierLabel: String(item.primary) })
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
        entity="Demand"
        entityId={data.id}
        defaultSubject={tEmail('subject_shipment', { name: data.name })}
        defaultBodyHtml={tEmail.raw('body_shipment')}
      />
    </div>
  );
}
