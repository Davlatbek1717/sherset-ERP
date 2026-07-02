'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import { DetailContentTabs, DetailHeader, DetailToolbar } from '@/components/document-detail';
import { DocumentTasksSection } from '@/components/document-tasks-section';
import { PriceRateDialog } from '@/components/products/price-rate-dialog';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
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
  MoneyInput,
  NativeSelect,
  type PickerItem,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

// A linked target document (InvoiceOut or CustomerOrder) — the rich grid needs
// each one's №/Статус/Дата/Организация/Контрагент/К оплате(sum)/Не оплачено.
interface LinkedDoc {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  payedSumMinor: string;
  moment: string;
  organization: { name: string } | null;
  agent: { name: string } | null;
}

interface OperationDetail {
  id: string;
  targetKind: string;
  invoiceOutId: string | null;
  customerOrderId: string | null;
  amountMinor: string;
  invoiceOut: LinkedDoc | null;
  customerOrder: LinkedDoc | null;
}

interface PaymentDetail {
  id: string;
  version: number;
  name: string;
  state: string;
  applicable: boolean;
  moment: string;
  incomingDate: string | null;
  incomingNumber: string | null;
  postedAt: string | null;
  description: string | null;
  paymentPurpose: string | null;
  sumMinor: string;
  currency: string;
  rateValue: string;
  agent: { id: string; name: string; legalTitle: string | null; companyType: string };
  organization: { id: string; name: string; legalTitle: string | null };
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  salesChannel: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  agentAccount: { id: string; accountNumber: string } | null;
  externalCode: string | null;
  vatSumMinor: string;
  owner: { id: string; name: string } | null;
  operations: OperationDetail[];
  createdAt: string;
  updatedAt: string;
}

// List-endpoint shape for the «Привязать платеж» picker (order OR invoice).
interface LinkRef {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  payedSumMinor: string;
  moment?: string;
  organization?: { name: string } | null;
  agent?: { name: string } | null;
}

// Account currency (Настройки → Валюты) — mirror enters/[id]: `isoCode`=UZS/USD,
// `default`=base, `rateValue` (×1e8) / `rate` = value vs the base currency.
interface CurrencyItem {
  id: string;
  isoCode: string;
  name: string;
  default: boolean;
  rateValue: string;
  rate: string;
}

interface OperationRow {
  _uid: string;
  targetKind: 'invoiceout' | 'customerorder';
  targetId: string | null;
  number: string; // №
  posted: boolean; // Пров.
  date: string; // Дата (ISO)
  orgName: string; // Организация
  agentName: string; // Контрагент
  state: string; // Статус (raw FSM)
  toPayMinor: string; // К оплате (target sum)
  notPaidMinor: string; // Не оплачено (sum − payed, before this payment)
  amountMinor: string; // Оплачено из этого платежа
}

interface FormState {
  agentId: string;
  agentLabel: string;
  organizationId: string;
  organizationLabel: string;
  contractId: string | null;
  contractLabel: string;
  projectId: string | null;
  projectLabel: string;
  salesChannelId: string | null;
  salesChannelLabel: string;
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  agentAccountId: string | null;
  agentAccountLabel: string;
  externalCode: string;
  incomingNumber: string;
  incomingDate: string;
  paymentPurpose: string;
  description: string;
  sumMinor: string;
  vatSumMinor: string;
  // «Валюта документа» + per-document rate (major units vs base).
  currency: string;
  rate: string;
  operations: OperationRow[];
  attributes: Record<string, unknown>;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function formFromData(d: PaymentDetail): FormState {
  return {
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    salesChannelId: d.salesChannel?.id ?? null,
    salesChannelLabel: d.salesChannel?.name ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.accountNumber || d.organizationAccount?.name || '',
    agentAccountId: d.agentAccount?.id ?? null,
    agentAccountLabel: d.agentAccount?.accountNumber ?? '',
    externalCode: d.externalCode ?? '',
    incomingNumber: d.incomingNumber ?? '',
    // date input wants YYYY-MM-DD; the API returns an ISO timestamp.
    incomingDate: d.incomingDate ? d.incomingDate.slice(0, 10) : '',
    paymentPurpose: d.paymentPurpose ?? '',
    description: d.description ?? '',
    sumMinor: d.sumMinor,
    vatSumMinor: d.vatSumMinor ?? '0',
    currency: d.currency ?? 'UZS',
    // doc's stored rate → major units (rateValue / 1e8). UZS ⇒ «1».
    rate: d.rateValue ? String(Number(d.rateValue) / 1e8) : '1',
    operations: d.operations.map((op) => {
      const isOrder = op.targetKind === 'customerorder';
      const tgt = isOrder ? op.customerOrder : op.invoiceOut;
      return {
        _uid: op.id,
        targetKind: (isOrder ? 'customerorder' : 'invoiceout') as 'invoiceout' | 'customerorder',
        targetId: isOrder ? op.customerOrderId : op.invoiceOutId,
        number: tgt?.name ?? '—',
        posted: tgt ? tgt.state !== 'draft' : false,
        date: tgt?.moment ?? '',
        orgName: tgt?.organization?.name ?? '',
        agentName: tgt?.agent?.name ?? '',
        state: tgt?.state ?? '',
        toPayMinor: tgt?.sumMinor ?? '0',
        notPaidMinor: tgt ? (BigInt(tgt.sumMinor) - BigInt(tgt.payedSumMinor)).toString() : '0',
        amountMinor: op.amountMinor,
      };
    }),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    agentId: s.agentId,
    organizationId: s.organizationId,
    contractId: s.contractId,
    projectId: s.projectId,
    salesChannelId: s.salesChannelId,
    organizationAccountId: s.organizationAccountId,
    agentAccountId: s.agentAccountId,
    externalCode: s.externalCode,
    incomingNumber: s.incomingNumber,
    incomingDate: s.incomingDate,
    paymentPurpose: s.paymentPurpose,
    description: s.description,
    sumMinor: s.sumMinor,
    vatSumMinor: s.vatSumMinor,
    currency: s.currency,
    rate: s.rate,
    operations: s.operations.map((op) => ({
      targetKind: op.targetKind,
      targetId: op.targetId,
      amountMinor: op.amountMinor,
    })),
    attributes: s.attributes,
  });
}

export default function PaymentInDetailPage() {
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.payment_in');
  const t = useTranslations('pages.payments_in');
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('payments-in', id, { server: true });
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<PaymentDetail>({
    queryKey: ['payment-in', id],
    queryFn: () => api.get(`/payments-in/${id}`),
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
    | 'organizationAccount'
    | 'agentAccount'
    | 'linkDoc'
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onConflict = useConflictReload(['payment-in', id], () => setForm(null));

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  // «Баланс» — the payer's per-currency balance ledger (moysklad shows it under
  // Контрагент). Read-only; refetches when the payer changes.
  const { data: balanceData } = useQuery<{
    items: Array<{ currency: string; balanceMinor: string }>;
  }>({
    queryKey: ['counterparty-balance', form?.agentId],
    queryFn: () => api.get(`/counterparty-balances/${form?.agentId}`),
    enabled: !!form?.agentId,
  });

  // «Валюта документа» options — the account's REAL currencies (Настройки → Валюты),
  // never a hardcoded list. The ✎ opens «Курс валюты документа» (rate override).
  const { data: currenciesData } = useQuery<{ items: CurrencyItem[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
  });
  const currencies = useMemo(() => currenciesData?.items ?? [], [currenciesData]);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);

  const totalAllocated = useMemo(
    () => form?.operations.reduce((acc, o) => acc + BigInt(o.amountMinor || '0'), 0n) ?? 0n,
    [form],
  );

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/payments-in/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-in', id] });
      qc.invalidateQueries({ queryKey: ['payments-in'] });
      for (const op of data?.operations ?? []) {
        if (op.invoiceOutId) {
          qc.invalidateQueries({ queryKey: ['invoice-out', op.invoiceOutId] });
        }
      }
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      qc.invalidateQueries({ queryKey: ['customer-orders'] });
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error(t('err_form_not_loaded'));
      const sum = BigInt(form.sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      for (const [i, op] of form.operations.entries()) {
        if (!op.targetId) throw new Error(t('err_op_invoice', { n: i + 1 }));
        if (BigInt(op.amountMinor || '0') <= 0n) throw new Error(t('err_op_sum', { n: i + 1 }));
      }
      if (totalAllocated > sum) {
        throw new Error(t('err_alloc_over'));
      }
      // «Валюта документа» + per-document rate → rateValue ×1e8 (mirror enters).
      const selectedCur = currencies.find((c) => c.isoCode === form.currency);
      const isBaseCur = selectedCur?.default ?? form.currency === 'UZS';
      const rateValue = isBaseCur
        ? '100000000'
        : Number(form.rate) > 0
          ? String(BigInt(Math.round(Number(form.rate) * 1e8)))
          : (selectedCur?.rateValue ?? '100000000');
      const payload = {
        version: data.version,
        currency: form.currency,
        rateValue,
        agentId: form.agentId,
        organizationId: form.organizationId,
        contractId: form.contractId,
        projectId: form.projectId,
        salesChannelId: form.salesChannelId,
        organizationAccountId: form.organizationAccountId,
        agentAccountId: form.agentAccountId,
        // Send null (not undefined) so emptying a field persists the clear —
        // update() skips undefined keys but writes null. Mirrors externalCode.
        externalCode: form.externalCode || null,
        incomingNumber: form.incomingNumber || null,
        incomingDate: form.incomingDate || null,
        paymentPurpose: form.paymentPurpose || null,
        description: form.description || null,
        sumMinor: form.sumMinor,
        vatSumMinor: form.vatSumMinor,
        operations: form.operations.map((op) => ({
          targetKind: op.targetKind,
          invoiceOutId: op.targetKind === 'invoiceout' ? op.targetId : null,
          customerOrderId: op.targetKind === 'customerorder' ? op.targetId : null,
          amountMinor: op.amountMinor,
        })),
        attributes: form.attributes,
      };
      return api.patch(`/payments-in/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-in', id] });
      qc.invalidateQueries({ queryKey: ['payments-in'] });
      setForm(null);
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/payments-in/${id}/clone`, {}),
    onSuccess: (cloned) => router.push(`/payments-in/${cloned.id}`),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/payments-in/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments-in'] });
      router.push('/payments-in');
    },
  });

  const { runDestructive } = useDestructiveMutation();

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
    const d = await api.get<{ items: { id: string; name: string }[] }>(
      `/organizations?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
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
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/sales-channels?search=${encodeURIComponent(s)}&limit=50`,
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

  // «Привязать платеж» — moysklad lets a payment attach to the agent's unpaid
  // Заказы покупателя AND Счета покупателя. Combined picker over both endpoints;
  // each item's `raw.kind` decides the operation's targetKind on select.
  const linkDocFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!form?.agentId) return [];
    const mkQs = () => {
      const q = new URLSearchParams({ limit: '30', agentId: form.agentId });
      if (s) q.set('search', s);
      return q.toString();
    };
    const [ordersRes, invoicesRes] = await Promise.all([
      api
        .get<{ items: LinkRef[] }>(`/customer-orders?${mkQs()}`)
        .catch(() => ({ items: [] as LinkRef[] })),
      api
        .get<{ items: LinkRef[] }>(`/invoices-out?${mkQs()}`)
        .catch(() => ({ items: [] as LinkRef[] })),
    ]);
    const hasRemaining = (d: LinkRef) => BigInt(d.sumMinor || '0') > BigInt(d.payedSumMinor || '0');
    const toItem = (kind: 'customerorder' | 'invoiceout', d: LinkRef) => {
      const remaining = BigInt(d.sumMinor || '0') - BigInt(d.payedSumMinor || '0');
      return {
        id: d.id,
        primary: `${kind === 'customerorder' ? t('doc_customer_order') : t('doc_invoice_out')} ${d.name}`,
        secondary: t('invoice_remaining', { state: d.state, amount: formatMoney(remaining) }),
        raw: { ...d, kind, remaining: remaining.toString() },
      };
    };
    const orders = ordersRes.items
      .filter((o) => hasRemaining(o) && o.state !== 'cancelled')
      .map((o) => toItem('customerorder', o));
    const invoices = invoicesRes.items
      .filter(
        (inv) => (inv.state === 'posted' || inv.state === 'partially_paid') && hasRemaining(inv),
      )
      .map((inv) => toItem('invoiceout', inv));
    return [...orders, ...invoices];
  };

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data || !form) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const locked = data.applicable;
  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  const updateOp = (rowUid: string, patch: Partial<OperationRow>) => {
    setForm((f) =>
      f
        ? {
            ...f,
            operations: f.operations.map((o) => (o._uid === rowUid ? { ...o, ...patch } : o)),
          }
        : f,
    );
  };
  // «Привязать платеж» — add a row from a picked order/invoice. Default amount =
  // its remaining, capped at the payment's still-unallocated remainder.
  const addLinkedDoc = (
    raw: LinkRef & { kind: 'customerorder' | 'invoiceout'; remaining: string },
  ) => {
    setForm((f) => {
      if (!f) return f;
      if (f.operations.some((o) => o.targetId === raw.id)) return f; // already linked
      const allocated = f.operations.reduce((a, o) => a + BigInt(o.amountMinor || '0'), 0n);
      const payRemainder = BigInt(f.sumMinor || '0') - allocated;
      const docRemaining = BigInt(raw.remaining || '0');
      const amount = payRemainder > 0n && payRemainder < docRemaining ? payRemainder : docRemaining;
      return {
        ...f,
        operations: [
          ...f.operations,
          {
            _uid: uid(),
            targetKind: raw.kind,
            targetId: raw.id,
            number: raw.name,
            posted: raw.state !== 'draft',
            date: raw.moment ?? '',
            orgName: raw.organization?.name ?? f.organizationLabel,
            agentName: raw.agent?.name ?? f.agentLabel,
            state: raw.state,
            toPayMinor: raw.sumMinor ?? '0',
            notPaidMinor: (
              BigInt(raw.sumMinor || '0') - BigInt(raw.payedSumMinor || '0')
            ).toString(),
            amountMinor: (amount > 0n ? amount : 0n).toString(),
          },
        ],
      };
    });
  };
  // «Перераспределить сумму платежа» — spread the payment sum across the linked
  // docs in order, each filled up to its «Не оплачено», until the sum runs out.
  const redistribute = () => {
    setForm((f) => {
      if (!f) return f;
      let left = BigInt(f.sumMinor || '0');
      return {
        ...f,
        operations: f.operations.map((o) => {
          const cap = BigInt(o.notPaidMinor || '0');
          const give = left > cap ? cap : left > 0n ? left : 0n;
          left -= give;
          return { ...o, amountMinor: give.toString() };
        }),
      };
    });
  };
  const removeOp = (rowUid: string) => {
    setForm((f) => (f ? { ...f, operations: f.operations.filter((o) => o._uid !== rowUid) } : f));
  };

  const remaining = BigInt(form.sumMinor || '0') - totalAllocated;
  const balanceMinor =
    balanceData?.items.find((bi) => bi.currency === data.currency)?.balanceMinor ?? '0';
  const selectedCurrency = currencies.find((c) => c.isoCode === form.currency);
  const isBaseCurrency = selectedCurrency?.default ?? form.currency === 'UZS';
  const baseCode = currencies.find((c) => c.default)?.isoCode ?? 'UZS';
  const docGlobalRate = selectedCurrency?.rate ?? '1';
  const effectiveRate = form.rate;

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="payment-in-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => {
          setSaveError(null);
          saveMut.mutate();
        }}
        onClose={() => router.push('/payments-in')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        onClone={() => cloneMut.mutate()}
        onDelete={
          !locked
            ? () =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                  successMessage: tCommon('saved'),
                })
            : undefined
        }
        onPrintList={() =>
          window.open(`/print/payment-in/${data.id}?auto=1`, '_blank', 'width=820,height=1100')
        }
        printEntity="paymentin"
      />
      <DetailHeader
        titlePrefix={tDetailTitles('payment_in')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(data.state as 'draft' | 'posted' | 'cancelled')}
        stateTone={documentStateTone(data.state)}
        stateSlug={data.state}
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
        {locked && (
          <Alert tone="info" className="mb-3">
            {tCommon('locked_when_posted')}
          </Alert>
        )}
        {saveError && (
          <Alert tone="destructive" className="mb-3">
            {saveError}
          </Alert>
        )}
        {transitionMut.error && (
          <Alert tone="destructive" className="mb-3">
            {(transitionMut.error as Error).message}
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
                onPick={() => !locked && setOpenPicker('org')}
                onClear={() =>
                  !locked &&
                  setForm({
                    ...form,
                    organizationId: '',
                    organizationLabel: '',
                    organizationAccountId: null,
                    organizationAccountLabel: '',
                  })
                }
                disabled={locked}
                testId="field-organization"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('agent')} required>
              <CatalogPickerField
                value={form.agentId ? { id: form.agentId, label: form.agentLabel } : null}
                placeholder={tFields('agent')}
                onPick={() => !locked && setOpenPicker('agent')}
                onClear={() =>
                  !locked &&
                  setForm({
                    ...form,
                    agentId: '',
                    agentLabel: '',
                    operations: form.operations.map((o) => ({
                      ...o,
                      targetId: null,
                      targetLabel: '',
                      targetHint: '',
                    })),
                  })
                }
                disabled={locked}
                testId="field-agent"
              />
              {form.agentId && (
                <div
                  className="mt-1 text-[var(--ms-text-muted)] text-xs tabular-nums"
                  data-test-id="agent-balance"
                >
                  {tFields('counterparty_balance')} : {formatMoney(balanceMinor)}
                </div>
              )}
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('sum')} required>
              <MoneyInput
                valueMinor={form.sumMinor}
                onChangeMinor={(v) => setForm({ ...form, sumMinor: v })}
                className="text-right tabular-nums"
                disabled={locked}
                data-test-id="field-sum-minor"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('including_vat')}>
              <MoneyInput
                valueMinor={form.vatSumMinor}
                onChangeMinor={(v) => setForm({ ...form, vatSumMinor: v })}
                className="text-right tabular-nums"
                disabled={locked}
                data-test-id="field-vat-sum-minor"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          {/* Входящий номер + Входящая дата — moysklad shows the incoming date
             right after the incoming number (incomingDate col exists, no migration). */}
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('incoming_number')}>
              <Input
                value={form.incomingNumber}
                onChange={(e) => setForm({ ...form, incomingNumber: e.target.value })}
                disabled={locked}
                data-test-id="field-incoming-number"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('incoming_date')}>
              <Input
                type="date"
                value={form.incomingDate}
                onChange={(e) => setForm({ ...form, incomingDate: e.target.value })}
                disabled={locked}
                data-test-id="field-incoming-date"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('payment_purpose')}>
              <Input
                value={form.paymentPurpose}
                onChange={(e) => setForm({ ...form, paymentPurpose: e.target.value })}
                disabled={locked}
                data-test-id="field-payment-purpose"
              />
            </DocumentMetaField>
            {/* «Канал продаж» — salesChannelId col exists (no migration). */}
            <DocumentMetaField label={tFields('sales_channel')}>
              <CatalogPickerField
                value={
                  form.salesChannelId
                    ? { id: form.salesChannelId, label: form.salesChannelLabel }
                    : null
                }
                placeholder={tFields('sales_channel')}
                onPick={() => !locked && setOpenPicker('salesChannel')}
                onClear={() =>
                  !locked && setForm({ ...form, salesChannelId: null, salesChannelLabel: '' })
                }
                disabled={locked}
                testId="field-sales-channel"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('contract')}>
              <CatalogPickerField
                value={form.contractId ? { id: form.contractId, label: form.contractLabel } : null}
                placeholder={tFields('contract')}
                onPick={() => !locked && setOpenPicker('contract')}
                onClear={() => !locked && setForm({ ...form, contractId: null, contractLabel: '' })}
                disabled={locked}
                testId="field-contract"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('project')}>
              <CatalogPickerField
                value={form.projectId ? { id: form.projectId, label: form.projectLabel } : null}
                placeholder={tFields('project')}
                onPick={() => !locked && setOpenPicker('project')}
                onClear={() => !locked && setForm({ ...form, projectId: null, projectLabel: '' })}
                disabled={locked}
                testId="field-project"
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
                onPick={() => !locked && setOpenPicker('organizationAccount')}
                onClear={() =>
                  !locked &&
                  setForm({ ...form, organizationAccountId: null, organizationAccountLabel: '' })
                }
                disabled={locked}
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
                onPick={() => !locked && setOpenPicker('agentAccount')}
                onClear={() =>
                  !locked && setForm({ ...form, agentAccountId: null, agentAccountLabel: '' })
                }
                disabled={locked}
                testId="field-agent-account"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tDetailForm('external_code')}>
              <Input
                value={form.externalCode}
                onChange={(e) => setForm({ ...form, externalCode: e.target.value })}
                disabled={locked}
                data-test-id="field-external-code"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('description')}>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={locked}
                data-test-id="field-description"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          {/* «Валюта документа» — COMPACT select + INLINE «1 X = N base ✎» (the ✎
             opens «Курс валюты документа» to override the per-document rate). */}
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('currency_document')} required fullWidth>
              <div className="flex items-center gap-2">
                <div className="w-[180px] shrink-0">
                  <NativeSelect
                    value={form.currency}
                    onChange={(e) => {
                      const next = e.target.value;
                      const gc = currencies.find((c) => c.isoCode === next);
                      setForm({ ...form, currency: next, rate: gc?.rate ?? '1' });
                      setRateDialogOpen(false);
                    }}
                    disabled={locked}
                    data-test-id="field-currency"
                  >
                    {currencies.length === 0 && (
                      <option value={form.currency}>{form.currency}</option>
                    )}
                    {currencies.map((c) => (
                      <option key={c.id} value={c.isoCode}>
                        {c.name} ({c.isoCode})
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {!isBaseCurrency && selectedCurrency && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--ms-text-muted)] text-xs tabular-nums">
                    1 {form.currency} = {Number(effectiveRate).toLocaleString('ru-RU')} {baseCode}
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => setRateDialogOpen(true)}
                        className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                        aria-label={tCommon('edit')}
                        data-test-id="currency-rate-edit"
                      >
                        ✎
                      </button>
                    )}
                  </span>
                )}
              </div>
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-6">
          <DetailContentTabs
            auditEntity="PaymentIn"
            entityId={data.id}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="PaymentIn" entityId={data.id} />}
            positionsLabel={tDetailTabs('paid_documents')}
          >
            <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
              {/* «Привязать платеж» + «Перераспределить сумму платежа» (moysklad) */}
              {!locked && (
                <div className="flex items-center gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-3 py-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (!form.agentId) {
                        setSaveError(t('select_payer_first'));
                        return;
                      }
                      setOpenPicker('linkDoc');
                    }}
                    data-test-id="link-payment"
                  >
                    {t('link_payment')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={redistribute}
                    disabled={form.operations.length === 0}
                    data-test-id="redistribute"
                  >
                    {t('redistribute')}
                  </Button>
                </div>
              )}
              <div className="overflow-x-auto p-3">
                {form.operations.length === 0 ? (
                  <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
                    {t('allocation_empty')}
                  </div>
                ) : (
                  <table className="w-full text-sm" data-test-id="paid-documents-grid">
                    <thead>
                      <tr className="border-[var(--ms-border-default)] border-b text-left text-[var(--ms-text-muted)] text-xs">
                        <th className="px-2 py-1 font-medium">{t('col_type')}</th>
                        <th className="px-2 py-1 font-medium">{t('col_number')}</th>
                        <th className="px-2 py-1 text-center font-medium">{t('col_posted')}</th>
                        <th className="px-2 py-1 font-medium">{t('col_date')}</th>
                        <th className="px-2 py-1 font-medium">{t('col_org')}</th>
                        <th className="px-2 py-1 font-medium">{t('col_agent')}</th>
                        <th className="px-2 py-1 font-medium">{t('col_status')}</th>
                        <th className="px-2 py-1 text-right font-medium">{t('col_to_pay')}</th>
                        <th className="px-2 py-1 text-right font-medium">{t('col_not_paid')}</th>
                        <th className="px-2 py-1 text-right font-medium">{t('col_paid_from')}</th>
                        <th className="px-2 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.operations.map((op) => (
                        <tr
                          key={op._uid}
                          className="border-[var(--ms-border-default)] border-b last:border-0"
                          data-test-id={`operation-row-${op._uid}`}
                        >
                          <td className="px-2 py-1 whitespace-nowrap">
                            {op.targetKind === 'customerorder'
                              ? t('doc_customer_order')
                              : t('doc_invoice_out')}
                          </td>
                          <td className="px-2 py-1 font-medium text-[var(--ms-text-brand)]">
                            {op.number}
                          </td>
                          <td className="px-2 py-1 text-center text-[#3aa757]">
                            {op.posted ? '✓' : ''}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap text-[var(--ms-text-muted)]">
                            {op.date ? formatDate(op.date) : ''}
                          </td>
                          <td className="px-2 py-1">{op.orgName}</td>
                          <td className="px-2 py-1">{op.agentName}</td>
                          <td className="px-2 py-1 text-[var(--ms-text-muted)]">{op.state}</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {formatMoney(op.toPayMinor)}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {formatMoney(op.notPaidMinor)}
                          </td>
                          <td className="px-2 py-1 text-right">
                            <MoneyInput
                              valueMinor={op.amountMinor}
                              onChangeMinor={(v) => updateOp(op._uid, { amountMinor: v })}
                              className="w-[140px] text-right tabular-nums"
                              disabled={locked}
                            />
                          </td>
                          <td className="px-2 py-1 text-right">
                            {!locked && (
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => removeOp(op._uid)}
                                aria-label={t('remove_row')}
                              >
                                <Icons.close className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {/* «Привязано» / «Не привязано» totals (moysklad, right-aligned) */}
                <div className="mt-3 flex flex-col items-end gap-1 text-sm">
                  <div className="flex w-[280px] justify-between">
                    <span className="text-[var(--ms-text-muted)]">{t('linked_total')}</span>
                    <span className="font-medium tabular-nums">{formatMoney(totalAllocated)}</span>
                  </div>
                  <div className="flex w-[280px] justify-between">
                    <span className="text-[var(--ms-text-muted)]">{t('not_linked')}</span>
                    <span className="font-medium tabular-nums">{formatMoney(remaining)}</span>
                  </div>
                </div>
              </div>
            </div>
          </DetailContentTabs>
        </div>

        {/* Inline Задачи collapsible — moysklad parity (bottom of the document
            body, outside the tab strip), mirroring the other detail pages. */}
        <div className="mt-6 flex flex-col gap-3">
          <DocumentTasksSection entity="PaymentIn" entityId={data.id} />
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="PaymentIn"
            values={form.attributes}
            onChange={(next) => setForm({ ...form, attributes: next })}
            disabled={locked}
            testIdPrefix="payment-in"
          />
        </div>
      </main>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          setForm({
            ...form,
            agentId: item.id,
            agentLabel: String(item.primary),
            operations: form.operations.map((o) => ({
              ...o,
              targetId: null,
              targetLabel: '',
              targetHint: '',
            })),
          });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setForm({
            ...form,
            organizationId: item.id,
            organizationLabel: String(item.primary),
            organizationAccountId: null,
            organizationAccountLabel: '',
          });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tFields('contract')}
        fetcher={contractFetcher}
        onSelect={(item) => {
          setForm({ ...form, contractId: item.id, contractLabel: String(item.primary) });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tFields('project')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setForm({ ...form, projectId: item.id, projectLabel: String(item.primary) });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tFields('sales_channel')}
        fetcher={salesChannelFetcher}
        onSelect={(item) => {
          setForm({ ...form, salesChannelId: item.id, salesChannelLabel: String(item.primary) });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'organizationAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization_account')}
        fetcher={organizationAccountFetcher}
        onSelect={(item) => {
          setForm({
            ...form,
            organizationAccountId: item.id,
            organizationAccountLabel: String(item.primary),
          });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'agentAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent_account')}
        fetcher={agentAccountFetcher}
        onSelect={(item) => {
          setForm({
            ...form,
            agentAccountId: item.id,
            agentAccountLabel: String(item.primary),
          });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'linkDoc'}
        onClose={() => setOpenPicker(null)}
        title={t('link_payment')}
        fetcher={linkDocFetcher}
        onSelect={(item) => {
          const raw = (
            item as PickerItem & {
              raw?: LinkRef & { kind: 'customerorder' | 'invoiceout'; remaining: string };
            }
          ).raw;
          if (raw) addLinkedDoc(raw);
          setOpenPicker(null);
        }}
      />
      {/* «Курс валюты документа» — moysklad rate-override modal (the currency ✎). */}
      <PriceRateDialog
        open={rateDialogOpen}
        onClose={() => setRateDialogOpen(false)}
        currencyCode={form.currency}
        baseCode={baseCode}
        referenceRate={docGlobalRate}
        customRate={form.rate === docGlobalRate ? null : form.rate}
        onApply={(r) => setForm({ ...form, rate: r ?? docGlobalRate })}
      />
    </div>
  );
}
