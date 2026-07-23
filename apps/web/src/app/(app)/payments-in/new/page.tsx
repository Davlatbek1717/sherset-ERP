'use client';

/**
 * /payments-in/new — moysklad-parity «Входящий платёж» editor («+ Приход»).
 *
 * Rebuilt 2026-06-26 onto the invoices-in/new shell so the create form is pixel-1:1
 * with live moysklad (ground: docs/audits/payments-in-new-2026-06-26/moysklad —
 * 11-editor-meta.png). 2-column meta, ROW-PAIRED (b-operation-form-top):
 *   Организация* (+ Счёт организации subRow) | Контрагент* (+ Баланс)
 *   Договор                                  | Сумма*
 *   Проект                                   | Включая НДС
 *   Канал продаж                             | Входящий номер [от дата]
 *   Назначение платежа (textarea)            |
 *   Валюта документа* ✎  (left-only, full inline rate)
 * INLINE type-to-search ref fields (NOT modals); metaPanel ABOVE the tabs; owner
 * popover top-right; «Баланс» under Контрагент; tabs = «Оплаченные документы»
 * (allocation grid) | «Связанные документы». No «Счёт контрагента» / «Внешний
 * код» / «Входящая дата»-row / «Комментарий» — absent in moysklad's payment editor.
 */

import { CounterpartyBalanceInline } from '@/components/counterparty-balance-inline';
import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaRow,
  DocumentTabs,
  Icons,
  Input,
  MoneyInput,
  NativeSelect,
  type PickerItem,
  StickyHScroll,
  Textarea,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
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

// Account currency (Настройки → Валюты) — mirror enters: isoCode/default/rate.
interface CurrencyItem {
  id: string;
  isoCode: string;
  name: string;
  default: boolean;
  rateValue: string;
  rate: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function NewPaymentInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // «Создать → Входящий платёж» off a customer order pre-fills this receipt
  // from the order. `fromOrder` may be a CSV (multi-select) — a payment is one
  // document, so use the FIRST id (the raw CSV would 404 the GET). The order's
  // values win over the user-defaults auto-fill below.
  const fromOrderId = searchParams.get('fromOrder')?.split(',')[0] ?? null;
  const { user } = useAuth();
  const t = useTranslations('pages.payments_in');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.payment_in');
  const docEditorLabels = useDocumentEditorLabels();

  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  // «Валюта документа» options — the account's REAL currencies (Настройки → Валюты).
  const { data: currenciesData } = useQuery<{ items: CurrencyItem[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
  });
  const currencies = currenciesData?.items ?? [];

  // Source customer order — fetched only when ?fromOrder is present.
  const { data: fromOrder } = useQuery<{
    name: string;
    agent: { id: string; name: string };
    organization: { id: string; name: string };
    sumMinor: string;
    payedSumMinor: string;
  }>({
    queryKey: ['customer-order', fromOrderId],
    queryFn: () => api.get(`/customer-orders/${fromOrderId}`),
    enabled: !!fromOrderId,
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

  // «Владелец» (owner/access) — defaults to the current user; department + «Общий
  // доступ» editable via the header popover. Sent on create (BE tenant-validates).
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>(() => ({
    ownerId: null,
    ownerLabel: '',
    groupId: null,
    groupLabel: '',
    shared: false,
  }));

  // Meta state
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [organizationAccountId, setOrganizationAccountId] = useState<string | null>(null);
  const [organizationAccountLabel, setOrganizationAccountLabel] = useState('');
  const [salesChannelId, setSalesChannelId] = useState<string | null>(null);
  const [salesChannelLabel, setSalesChannelLabel] = useState('');
  const [sumMinor, setSumMinor] = useState('0');
  const [vatSumMinor, setVatSumMinor] = useState('0');
  const [currency, setCurrency] = useState('UZS');
  const [rate, setRate] = useState('1');
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [incomingNumber, setIncomingNumber] = useState('');
  const [incomingDate, setIncomingDate] = useState('');
  const [paymentPurpose, setPaymentPurpose] = useState('');
  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | 'organizationAccount'
    | 'linkDoc'
  >(null);

  const selectedCurrency = currencies.find((c) => c.isoCode === currency);
  const isBaseCurrency = selectedCurrency?.default ?? currency === 'UZS';
  const baseCode = currencies.find((c) => c.default)?.isoCode ?? 'UZS';
  const docGlobalRate = selectedCurrency?.rate ?? '1';

  // Owner display defaults to the current user (moysklad shows «<name> / Основной»);
  // ownerId stays null so the BE stamps the creator unless the popover overrides it.
  useEffect(() => {
    if (user) {
      setOwnerAccess((v) => (v.ownerLabel || v.ownerId ? v : { ...v, ownerLabel: user.name }));
    }
  }, [user]);

  // Pre-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to EVERY new document). Money doc — Организация=defaultCompany
  // (first-item fallback) + Контрагент=defaultCustomer (incoming money).
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    // When pre-filling from a source order, let the order win — skip the
    // user-defaults auto-fill entirely.
    if (defaultsAppliedRef.current || fromOrderId) return;
    if (!orgsData) return;
    if (userDefaults.isLoading) return;
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
    if (!agentId && us?.defaultCustomer) {
      setAgentId(us.defaultCustomer.id);
      setAgentLabel(us.defaultCustomer.name);
    }
  }, [orgsData, userDefaults.data, userDefaults.isLoading, organizationId, agentId, fromOrderId]);

  // Apply the source customer order once loaded — set Контрагент / Организация
  // and the amount to the order's OUTSTANDING balance (sum − paid), defaulting
  // to the full sum. «Назначение платежа» references the order by its own number.
  const fromOrderAppliedRef = useRef(false);
  useEffect(() => {
    if (fromOrderAppliedRef.current || !fromOrder) return;
    fromOrderAppliedRef.current = true;
    setAgentId(fromOrder.agent.id);
    setAgentLabel(fromOrder.agent.name);
    setOrganizationId(fromOrder.organization.id);
    setOrganizationLabel(fromOrder.organization.name);
    const outstanding = BigInt(fromOrder.sumMinor) - BigInt(fromOrder.payedSumMinor ?? '0');
    setSumMinor((outstanding > 0n ? outstanding : BigInt(fromOrder.sumMinor)).toString());
    setPaymentPurpose(fromOrder.name);
  }, [fromOrder]);

  // «Привязать платеж» — add a row from a picked order/invoice. Default amount =
  // its remaining, capped at the payment's still-unallocated remainder.
  const addLinkedDoc = (
    raw: LinkRef & { kind: 'customerorder' | 'invoiceout'; remaining: string },
  ) => {
    setOperations((ops) => {
      if (ops.some((o) => o.targetId === raw.id)) return ops; // already linked
      const allocated = ops.reduce((a, o) => a + BigInt(o.amountMinor || '0'), 0n);
      const payRemainder = BigInt(sumMinor || '0') - allocated;
      const docRemaining = BigInt(raw.remaining || '0');
      const amount = payRemainder > 0n && payRemainder < docRemaining ? payRemainder : docRemaining;
      return [
        ...ops,
        {
          _uid: uid(),
          targetKind: raw.kind,
          targetId: raw.id,
          number: raw.name,
          posted: raw.state !== 'draft',
          date: raw.moment ?? '',
          orgName: raw.organization?.name ?? organizationLabel,
          agentName: raw.agent?.name ?? agentLabel,
          state: raw.state,
          toPayMinor: raw.sumMinor ?? '0',
          notPaidMinor: (BigInt(raw.sumMinor || '0') - BigInt(raw.payedSumMinor || '0')).toString(),
          amountMinor: (amount > 0n ? amount : 0n).toString(),
        },
      ];
    });
  };
  // «Перераспределить сумму платежа» — spread the payment sum across the linked
  // docs in order, each filled up to its «Не оплачено», until the sum runs out.
  const redistribute = () => {
    setOperations((ops) => {
      let left = BigInt(sumMinor || '0');
      return ops.map((o) => {
        const cap = BigInt(o.notPaidMinor || '0');
        const give = left > cap ? cap : left > 0n ? left : 0n;
        left -= give;
        return { ...o, amountMinor: give.toString() };
      });
    });
  };
  const updateOperation = (u: string, patch: Partial<OperationRow>) => {
    setOperations((ops) => ops.map((o) => (o._uid === u ? { ...o, ...patch } : o)));
  };
  const removeOperation = (u: string) => {
    setOperations((ops) => ops.filter((o) => o._uid !== u));
  };

  const totalAllocated = operations.reduce((acc, o) => acc + BigInt(o.amountMinor || '0'), 0n);
  const remaining = BigInt(sumMinor || '0') - totalAllocated;

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(t('err_agent_required'));
      if (!organizationId) throw new Error(t('err_org_required'));
      const sum = BigInt(sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      for (const [i, op] of operations.entries()) {
        if (!op.targetId) throw new Error(t('err_op_invoice', { n: i + 1 }));
        if (BigInt(op.amountMinor || '0') <= 0n) throw new Error(t('err_op_sum', { n: i + 1 }));
      }
      if (totalAllocated > sum) {
        throw new Error(t('err_alloc_over'));
      }
      const payload = {
        agentId,
        organizationId,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(salesChannelId ? { salesChannelId } : {}),
        ...(organizationAccountId ? { organizationAccountId } : {}),
        ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
        ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
        ...(ownerAccess.shared ? { shared: true } : {}),
        sumMinor,
        vatSumMinor,
        currency,
        rateValue: isBaseCurrency
          ? '100000000'
          : Number(rate) > 0
            ? String(BigInt(Math.round(Number(rate) * 1e8)))
            : (selectedCurrency?.rateValue ?? '100000000'),
        incomingNumber: incomingNumber || undefined,
        incomingDate: incomingDate || undefined,
        paymentPurpose: paymentPurpose || undefined,
        operations: operations.map((op) => ({
          targetKind: op.targetKind,
          invoiceOutId: op.targetKind === 'invoiceout' ? op.targetId : null,
          customerOrderId: op.targetKind === 'customerorder' ? op.targetId : null,
          amountMinor: op.amountMinor,
        })),
      };
      return api.post<{ id: string }>('/payments-in', payload);
    },
    onSuccess: (created) => router.push(`/payments-in/${created.id}`),
    onError: (err: Error) => setError(err.message),
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
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
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
    if (organizationId) params.set('organizationId', organizationId);
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

  // «Привязать платеж» — moysklad lets a payment attach to the agent's unpaid
  // Заказы покупателя AND Счета покупателя. Combined picker over both endpoints;
  // each item's `raw.kind` decides the operation's targetKind on select.
  const linkDocFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!agentId) return [];
    const mkQs = () => {
      const q = new URLSearchParams({ limit: '30', agentId });
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

  // moysklad b-operation-form-top — a ROW-PAIRED table: each row aligns the LEFT
  // field with its RIGHT counterpart. The org's account is a subRow UNDER
  // Организация; «Баланс» sits under Контрагент. Назначение / Валюта are LEFT-only.
  const metaPanel = (
    <div className="max-w-[860px] space-y-2 bg-[var(--ms-bg-surface)] px-4 py-3">
      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tFields('organization')}
          required
          subRow={
            organizationId ? (
              <CatalogPickerField
                value={
                  organizationAccountId
                    ? { id: organizationAccountId, label: organizationAccountLabel }
                    : null
                }
                placeholder=""
                testId="field-organization-account"
                onPick={() => setOpenPicker('organizationAccount')}
                inlineFetcher={organizationAccountFetcher}
                onInlineSelect={(item) => {
                  setOrganizationAccountId(item.id);
                  setOrganizationAccountLabel(String(item.primary));
                }}
                onClear={() => {
                  setOrganizationAccountId(null);
                  setOrganizationAccountLabel('');
                }}
              />
            ) : undefined
          }
        >
          <CatalogPickerField
            value={organizationId ? { id: organizationId, label: organizationLabel } : null}
            placeholder=""
            testId="field-organization"
            onPick={() => setOpenPicker('org')}
            inlineFetcher={orgFetcher}
            onInlineSelect={(item) => {
              setOrganizationId(item.id);
              setOrganizationLabel(String(item.primary));
              setOrganizationAccountId(null);
              setOrganizationAccountLabel('');
            }}
            onEdit={
              organizationId
                ? () => window.open(`/organizations/${organizationId}`, '_blank', 'noopener')
                : undefined
            }
            editLabel={tCommon('edit')}
            onClear={() => {
              setOrganizationId(null);
              setOrganizationLabel('');
              setOrganizationAccountId(null);
              setOrganizationAccountLabel('');
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('agent')} required>
          <CatalogPickerField
            value={agentId ? { id: agentId, label: agentLabel } : null}
            placeholder=""
            testId="field-agent"
            onPick={() => setOpenPicker('agent')}
            inlineFetcher={agentFetcher}
            onInlineSelect={(item) => {
              setAgentId(item.id);
              setAgentLabel(String(item.primary));
            }}
            onEdit={
              agentId
                ? () => window.open(`/counterparties/${agentId}`, '_blank', 'noopener')
                : undefined
            }
            editLabel={tCommon('edit')}
            onClear={() => {
              setAgentId(null);
              setAgentLabel('');
              setContractId(null);
              setContractLabel('');
              // Linked docs belong to the chosen payer — drop them all.
              setOperations([]);
            }}
            onCreate={() => router.push('/counterparties/new')}
            createLabel={tForm('create_new_counterparty')}
          />
          <CounterpartyBalanceInline counterpartyId={agentId} />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('contract')}>
          <CatalogPickerField
            value={contractId ? { id: contractId, label: contractLabel } : null}
            placeholder=""
            testId="field-contract"
            onPick={() => agentId && setOpenPicker('contract')}
            inlineFetcher={contractFetcher}
            onInlineSelect={(item) => {
              setContractId(item.id);
              setContractLabel(String(item.primary));
            }}
            disabled={!agentId}
            disabledHint={t('select_payer_first')}
            onClear={() => {
              setContractId(null);
              setContractLabel('');
            }}
            onCreate={() => router.push('/contracts/new')}
            createLabel={tForm('create_new_contract')}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('sum')} required>
          <MoneyInput
            valueMinor={sumMinor}
            onChangeMinor={(v) => setSumMinor(v)}
            className="text-right"
            data-test-id="field-sum-minor"
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('project')}>
          <CatalogPickerField
            value={projectId ? { id: projectId, label: projectLabel } : null}
            placeholder=""
            testId="field-project"
            onPick={() => setOpenPicker('project')}
            inlineFetcher={projectFetcher}
            onInlineSelect={(item) => {
              setProjectId(item.id);
              setProjectLabel(String(item.primary));
            }}
            onClear={() => {
              setProjectId(null);
              setProjectLabel('');
            }}
            onCreate={() => router.push('/settings/projects/new')}
            createLabel={tForm('create_new_project')}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('including_vat')}>
          <MoneyInput
            valueMinor={vatSumMinor}
            onChangeMinor={(v) => setVatSumMinor(v)}
            className="text-right"
            data-test-id="field-vat-sum-minor"
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('sales_channel')}>
          <CatalogPickerField
            value={salesChannelId ? { id: salesChannelId, label: salesChannelLabel } : null}
            placeholder=""
            testId="field-sales-channel"
            onPick={() => setOpenPicker('salesChannel')}
            inlineFetcher={salesChannelFetcher}
            onInlineSelect={(item) => {
              setSalesChannelId(item.id);
              setSalesChannelLabel(String(item.primary));
            }}
            onClear={() => {
              setSalesChannelId(null);
              setSalesChannelLabel('');
            }}
            onCreate={() => router.push('/sales-channels/new')}
            createLabel={tForm('create_new')}
          />
        </DocumentMetaField>
        {/* «Входящий номер» [____] «от» [📅____] — combined like moysklad. */}
        <DocumentMetaField label={t('incoming_number_label')}>
          <div className="flex items-center gap-2">
            <Input
              value={incomingNumber}
              onChange={(e) => setIncomingNumber(e.target.value)}
              className="w-32"
              data-test-id="field-incoming-number"
            />
            <span className="text-[var(--ms-text-muted)] text-xs">{tDetailHeader('from')}</span>
            <DatePicker
              value={incomingDate || null}
              onChange={(d) => setIncomingDate(d ?? '')}
              locale="ru-RU"
              testId="field-incoming-date"
            />
          </div>
        </DocumentMetaField>
      </DocumentMetaRow>

      {/* «Назначение платежа» — multi-line textarea (LEFT-only row). */}
      <DocumentMetaRow>
        <DocumentMetaField label={tFields('payment_purpose')}>
          <Textarea
            value={paymentPurpose}
            onChange={(e) => setPaymentPurpose(e.target.value)}
            placeholder={t('payment_purpose_hint')}
            rows={3}
            className="max-w-[420px]"
            data-test-id="field-payment-purpose"
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      {/* «Валюта документа» — select + inline «1 X = N base ✎» rate override. */}
      <DocumentMetaRow>
        <DocumentMetaField label={tFields('currency_document')} required>
          <div className="flex items-center gap-2">
            <div className="w-[180px] shrink-0">
              <NativeSelect
                value={currency}
                onChange={(e) => {
                  const next = e.target.value;
                  const gc = currencies.find((c) => c.isoCode === next);
                  setCurrency(next);
                  setRate(gc?.rate ?? '1');
                  setRateDialogOpen(false);
                }}
                data-test-id="field-currency"
              >
                {currencies.length === 0 && <option value={currency}>{currency}</option>}
                {currencies.map((c) => (
                  <option key={c.id} value={c.isoCode}>
                    {c.name} ({c.isoCode})
                  </option>
                ))}
              </NativeSelect>
            </div>
            {!isBaseCurrency && selectedCurrency && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                1 {currency} = {Number(rate).toLocaleString('ru-RU')} {baseCode}
                <button
                  type="button"
                  onClick={() => setRateDialogOpen(true)}
                  className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                  aria-label={tCommon('edit')}
                  data-test-id="currency-rate-edit"
                >
                  ✎
                </button>
              </span>
            )}
          </div>
        </DocumentMetaField>
      </DocumentMetaRow>
    </div>
  );

  // «Оплаченные документы» — rich allocation grid (moysklad). A payment can pay the
  // agent's Заказы покупателя AND Счета покупателя; «Привязать платеж» opens the
  // combined picker, «Перераспределить» spreads the sum across them.
  const allocationSection = (
    <div className="bg-[var(--ms-bg-surface)] px-4 py-3">
      {/* «Привязать платеж» + «Перераспределить сумму платежа» (moysklad) */}
      <div className="mb-3 flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!agentId) {
              setError(t('select_payer_first'));
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
          disabled={operations.length === 0}
          data-test-id="redistribute"
        >
          {t('redistribute')}
        </Button>
      </div>
      <StickyHScroll>
        {operations.length === 0 ? (
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
              {operations.map((op) => (
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
                  <td className="px-2 py-1 font-medium text-[var(--ms-text-brand)]">{op.number}</td>
                  <td className="px-2 py-1 text-center text-[#3aa757]">{op.posted ? '✓' : ''}</td>
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
                      onChangeMinor={(v) => updateOperation(op._uid, { amountMinor: v })}
                      className="w-[140px] text-right tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeOperation(op._uid)}
                      aria-label={t('remove_row')}
                    >
                      <Icons.close className="h-4 w-4" />
                    </Button>
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
      </StickyHScroll>
    </div>
  );

  const tabs = [
    {
      key: 'main',
      label: t('tab_paid_documents'),
      content: allocationSection,
    },
    {
      key: 'related',
      label: tDetailTabs('related'),
      content: (
        <div className="bg-[var(--ms-bg-surface)] px-4 py-3">
          <RelatedDocsTab
            current={{
              id: 'new',
              name: docNumber,
              moment: docDate ? new Date(docDate).toISOString() : new Date().toISOString(),
              sumMinor: sumMinor || '0',
              kind: 'payment-in',
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="payment-in-new-page"
        documentTypeLabel={tDetailTitles('payment_in')}
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
        onClose={() => router.push('/payments-in')}
        modifyMenu={[]}
        createDocMenu={[]}
        printMenu={[]}
        sendMenu={[]}
        rightSlot={<OwnerAccessPopover value={ownerAccess} onChange={setOwnerAccess} />}
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        {metaPanel}
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          setAgentId(item.id);
          setAgentLabel(String(item.primary));
          setOpenPicker(null);
        }}
        createLabel={tForm('create_new_counterparty')}
        onCreate={() => router.push('/counterparties/new')}
      />
      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
          setOrganizationAccountId(null);
          setOrganizationAccountLabel('');
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tFields('contract')}
        fetcher={contractFetcher}
        onSelect={(item) => {
          setContractId(item.id);
          setContractLabel(String(item.primary));
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tFields('project')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setProjectId(item.id);
          setProjectLabel(String(item.primary));
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tFields('sales_channel')}
        fetcher={salesChannelFetcher}
        onSelect={(item) => {
          setSalesChannelId(item.id);
          setSalesChannelLabel(String(item.primary));
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'organizationAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization_account')}
        fetcher={organizationAccountFetcher}
        onSelect={(item) => {
          setOrganizationAccountId(item.id);
          setOrganizationAccountLabel(String(item.primary));
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
      {/* «Курс валюты документа» — rate-override modal (the currency ✎). */}
      <CurrencyRateModal
        open={rateDialogOpen}
        onOpenChange={setRateDialogOpen}
        currency={currency}
        referenceRate={docGlobalRate}
        currentOverride={rate === docGlobalRate ? null : rate}
        onApply={(r) => setRate(r ?? docGlobalRate)}
      />
    </>
  );
}
