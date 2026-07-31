'use client';

/**
 * /cash-out/new — moysklad-parity «Расходный ордер» editor («+ Расход» 2nd form).
 *
 * Rebuilt 2026-06-26 onto the cash-in/new shell so the create form is pixel-1:1
 * with live moysklad (ground: docs/audits/cash-money-forms-2026-06-26/moysklad —
 * 32-cashout-editor-meta.png). This is the OUT twin of cash-in/new. ROW-PAIRED
 * 2-col meta:
 *   Организация* (+ Касса sub-select when >1) | Контрагент* (+ Баланс)
 *   Договор                                   | Сумма*
 *   Проект                                    | Включая НДС
 *   Канал продаж                              | Статья расходов (reference picker)
 *   Основание (textarea)                      |
 *   Валюта документа* ✎  (left-only, inline rate) · Комментарий (bottom textarea)
 * Header carries the extra «Без закрывающих документов» checkbox (РКО paid in
 * advance). Cash doc: «Касса» (cashDeskId) replaces the bank account;
 * «Основание»=paymentPurpose; «Комментарий»=description. No «Счёт организации» /
 * «Входящий номер» / «Внешний код». INLINE type-to-search ref fields; owner
 * popover; tabs = «Оплаченные документы» (allocation grid, invoices-IN only) |
 * «Связанные документы». The allocation + operations payload are kept verbatim
 * from the prior cash-out/new (targetKind 'invoicein').
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
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaRow,
  DocumentTabs,
  Icons,
  MoneyInput,
  NativeSelect,
  type PickerItem,
  Textarea,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
}
interface CashDeskRef {
  id: string;
  name: string;
  currency: string;
  balanceMinor: string;
}
interface InvoiceInRef {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  payedSumMinor: string;
}
interface AllocationRow {
  _uid: string;
  invoiceInId: string | null;
  invoiceLabel: string;
  invoiceHint: string;
  amountMinor: string;
}
// Account currency (Настройки → Валюты) — isoCode/default/rate like cash-in.
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

export default function NewCashOutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.cash_out');
  const tPay = useTranslations('pages.payments_in'); // shared allocation-grid labels
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.cash_out');
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
  const { data: cashDesksData } = useQuery<{ items: CashDeskRef[] }>({
    queryKey: ['cash-desks'],
    queryFn: () => api.get('/cash-desks'),
  });
  const cashDesks = cashDesksData?.items ?? [];
  const { data: currenciesData } = useQuery<{ items: CurrencyItem[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
  });
  const currencies = currenciesData?.items ?? [];

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(true);
  // «Без закрывающих документов» — РКО-only header flag (cash-out twin extra).
  const [noClosingDocs, setNoClosingDocs] = useState(false);

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
  const [cashDeskId, setCashDeskId] = useState<string | null>(null);
  const [cashDeskLabel, setCashDeskLabel] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [salesChannelId, setSalesChannelId] = useState<string | null>(null);
  const [salesChannelLabel, setSalesChannelLabel] = useState('');
  const [sumMinor, setSumMinor] = useState('0');
  const [vatSumMinor, setVatSumMinor] = useState('0');
  const [currency, setCurrency] = useState('UZS');
  const [rate, setRate] = useState('1');
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [paymentPurpose, setPaymentPurpose] = useState(''); // «Основание»
  // «Статья расходов» — the NAME picked from the /expense-items reference
  // (MASTER-TODO #8; was free text, which the list filter could not match).
  // Persists to the CashOut.expenseItem string column so the list filter lives.
  const [expenseItem, setExpenseItem] = useState('');
  const [description, setDescription] = useState(''); // «Комментарий»
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'cashDesk'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | 'expenseItem'
    | { kind: 'invoicein'; rowUid: string }
  >(null);

  const selectedCurrency = currencies.find((c) => c.isoCode === currency);
  const isBaseCurrency = selectedCurrency?.default ?? currency === 'UZS';
  const baseCode = currencies.find((c) => c.default)?.isoCode ?? 'UZS';
  const docGlobalRate = selectedCurrency?.rate ?? '1';

  useEffect(() => {
    if (user) {
      setOwnerAccess((v) => (v.ownerLabel || v.ownerId ? v : { ...v, ownerLabel: user.name }));
    }
  }, [user]);

  // Pre-fill org / agent from the user defaults (money-OUT → defaultSupplier).
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
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
    if (!agentId && us?.defaultSupplier) {
      setAgentId(us.defaultSupplier.id);
      setAgentLabel(us.defaultSupplier.name);
    }
  }, [orgsData, userDefaults.data, userDefaults.isLoading, organizationId, agentId]);

  // Auto-select the first cash desk (moysklad: a cash order always has a касса;
  // the selector only surfaces when the account has more than one).
  useEffect(() => {
    if (cashDesks[0] && !cashDeskId) {
      setCashDeskId(cashDesks[0].id);
      setCashDeskLabel(cashDesks[0].name);
      setCurrency(cashDesks[0].currency);
    }
  }, [cashDesks, cashDeskId]);

  const totalAllocated = useMemo(
    () => allocations.reduce((s, a) => s + BigInt(a.amountMinor || '0'), 0n),
    [allocations],
  );
  const remaining = BigInt(sumMinor || '0') - totalAllocated;

  const addAllocation = () => {
    if (!agentId) {
      setError(t('select_payer_first'));
      return;
    }
    setAllocations((xs) => [
      ...xs,
      {
        _uid: uid(),
        invoiceInId: null,
        invoiceLabel: '',
        invoiceHint: '',
        amountMinor: '0',
      },
    ]);
  };
  const updateAllocation = (rowUid: string, patch: Partial<AllocationRow>) => {
    setAllocations((xs) => xs.map((a) => (a._uid === rowUid ? { ...a, ...patch } : a)));
  };
  const removeAllocation = (rowUid: string) => {
    setAllocations((xs) => xs.filter((a) => a._uid !== rowUid));
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(t('err_agent_required'));
      if (!organizationId) throw new Error(t('err_org_required'));
      if (!cashDeskId) throw new Error(t('err_cashdesk_required'));
      const sum = BigInt(sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      if (totalAllocated > sum) throw new Error(t('err_alloc_over'));
      allocations.forEach((a, i) => {
        if (!a.invoiceInId) throw new Error(t('err_op_invoice', { n: i + 1 }));
      });
      return api.post<{ id: string }>('/cash-out', {
        agentId,
        organizationId,
        cashDeskId,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(salesChannelId ? { salesChannelId } : {}),
        ...(expenseItem ? { expenseItem } : {}),
        ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
        ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
        ...(ownerAccess.shared ? { shared: true } : {}),
        ...(noClosingDocs ? { noClosingDocs: true } : {}),
        sumMinor,
        vatSumMinor,
        currency,
        rateValue: isBaseCurrency
          ? '100000000'
          : Number(rate) > 0
            ? String(BigInt(Math.round(Number(rate) * 1e8)))
            : (selectedCurrency?.rateValue ?? '100000000'),
        paymentPurpose: paymentPurpose || undefined,
        description: description || undefined,
        operations: allocations.map((a) => ({
          targetKind: 'invoicein',
          invoiceInId: a.invoiceInId,
          amountMinor: a.amountMinor,
        })),
      });
    },
    onSuccess: (created) => router.push(`/cash-out/${created.id}`),
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
  // MASTER-TODO #8: «Статья расходов» is a REFERENCE in moysklad (and here —
  // `settings/expense-items` + the /expense-items endpoint). This form used a
  // free-text Input while the EDIT form (cash-out/[id]) already used a picker,
  // so a document created here could carry any string the user typed and the
  // list's «Статья расходов» filter — which matches catalog values — would
  // never find it. Mirrors the edit form exactly.
  const expenseItemFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/expense-items?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const cashDeskFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: CashDeskRef[] }>(
      `/cash-desks?${s ? `search=${encodeURIComponent(s)}` : ''}`,
    );
    return d.items.map((cd) => ({ id: cd.id, primary: cd.name, secondary: cd.currency }));
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

  // «Привязать платеж» — outgoing cash attaches to the supplier's unpaid Счета
  // поставщика (cash-out BE links invoices-in only).
  const invoiceFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: InvoiceInRef[] }>(
      `/invoices-in?${agentId ? `agentId=${agentId}&` : ''}${s ? `search=${encodeURIComponent(s)}` : ''}`,
    );
    return d.items.map((r) => {
      const rem = BigInt(r.sumMinor) - BigInt(r.payedSumMinor);
      return {
        id: r.id,
        primary: r.name,
        secondary: r.state,
        meta: `${formatMoney(rem)} / ${formatMoney(r.sumMinor)}`,
        raw: r,
      };
    });
  };

  const showCashDeskSub = !!organizationId && cashDesks.length > 1;

  const metaPanel = (
    <div className="max-w-[860px] space-y-2 bg-[var(--ms-bg-surface)] px-4 py-3">
      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tFields('organization')}
          required
          subRow={
            showCashDeskSub ? (
              <CatalogPickerField
                value={cashDeskId ? { id: cashDeskId, label: cashDeskLabel } : null}
                placeholder=""
                testId="field-cash-desk"
                onPick={() => setOpenPicker('cashDesk')}
                inlineFetcher={cashDeskFetcher}
                onInlineSelect={(item) => {
                  setCashDeskId(item.id);
                  setCashDeskLabel(String(item.primary));
                  if (item.secondary) setCurrency(String(item.secondary));
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
              setAllocations([]);
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
            onCreate={() => router.push('/ecommerce/channels/new')}
            createLabel={tForm('create_new')}
          />
        </DocumentMetaField>
        {/* «Статья расходов» — cash-OUT distinguishing field. Picker over the
            /expense-items reference (mirrors cash-out/[id]); persisting a
            catalog value is what keeps the list filter live. */}
        <DocumentMetaField label={tFields('expense_item')}>
          <CatalogPickerField
            value={expenseItem ? { id: expenseItem, label: expenseItem } : null}
            placeholder={tFields('expense_item')}
            onPick={() => setOpenPicker('expenseItem')}
            onClear={() => setExpenseItem('')}
            testId="field-expense-item"
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      {/* «Основание» — multi-line textarea (LEFT-only row, mirrors moysklad). */}
      <DocumentMetaRow>
        <DocumentMetaField label={tFields('basis')}>
          <Textarea
            value={paymentPurpose}
            onChange={(e) => setPaymentPurpose(e.target.value)}
            rows={2}
            data-test-id="field-purpose"
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

      {/* «Комментарий» — bottom textarea (moysklad). */}
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={tFields('comment')}
        rows={3}
        className="max-w-[420px]"
        data-test-id="field-description"
      />
    </div>
  );

  // «Оплаченные документы» — allocation to the supplier's Счета поставщика
  // (invoices-IN). Section + operations payload kept verbatim from the prior
  // cash-out/new (targetKind 'invoicein').
  const allocationSection = (
    <div className="bg-[var(--ms-bg-surface)] px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium text-sm">
          {tForm('section_allocation')} — {allocations.length} · {formatMoney(totalAllocated)} /{' '}
          {formatMoney(sumMinor || '0')}
        </span>
      </div>
      {allocations.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr,180px,40px] gap-2 px-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            <div>{t('alloc_col_invoice')}</div>
            <div className="text-right">{t('alloc_col_amount')}</div>
            <div />
          </div>
          {allocations.map((a) => (
            <div
              key={a._uid}
              className="grid grid-cols-[1fr,180px,40px] items-start gap-2"
              data-test-id={`allocation-row-${a._uid}`}
            >
              <CatalogPickerField
                value={a.invoiceInId ? { id: a.invoiceInId, label: a.invoiceLabel } : null}
                placeholder={t('select_invoice')}
                onPick={() => setOpenPicker({ kind: 'invoicein', rowUid: a._uid })}
                onClear={() =>
                  updateAllocation(a._uid, {
                    invoiceInId: null,
                    invoiceLabel: '',
                    invoiceHint: '',
                  })
                }
              />
              <MoneyInput
                valueMinor={a.amountMinor}
                onChangeMinor={(v) => updateAllocation(a._uid, { amountMinor: v })}
                className="text-right"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => removeAllocation(a._uid)}
                aria-label={t('remove_row')}
              >
                <Icons.close className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          onClick={addAllocation}
          data-test-id="add-allocation"
        >
          <Icons.create className="h-4 w-4" />
          {t('add_invoice')}
        </Button>
      </div>
      {/* «Привязано» / «Не привязано» totals (moysklad, right-aligned) */}
      <div className="mt-3 flex flex-col items-end gap-1 text-sm">
        <div className="flex w-[280px] justify-between">
          <span className="text-[var(--ms-text-muted)]">{tPay('linked_total')}</span>
          <span className="font-medium tabular-nums">{formatMoney(totalAllocated)}</span>
        </div>
        <div className="flex w-[280px] justify-between">
          <span className="text-[var(--ms-text-muted)]">{tPay('not_linked')}</span>
          <span className="font-medium tabular-nums">{formatMoney(remaining)}</span>
        </div>
      </div>
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
              kind: 'cash-out',
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
        testId="cash-out-new-page"
        documentTypeLabel={tDetailTitles('cash_out')}
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
        waiting={noClosingDocs}
        onWaitingChange={setNoClosingDocs}
        waitingLabel={tFields('no_closing_docs')}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/cash-out')}
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
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'cashDesk'}
        onClose={() => setOpenPicker(null)}
        title={t('cash_desk')}
        fetcher={cashDeskFetcher}
        onSelect={(item) => {
          setCashDeskId(item.id);
          setCashDeskLabel(String(item.primary));
          if (item.secondary) setCurrency(String(item.secondary));
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
        open={openPicker === 'expenseItem'}
        onClose={() => setOpenPicker(null)}
        title={tFields('expense_item')}
        fetcher={expenseItemFetcher}
        onSelect={(item) => {
          // Store the NAME (not the id) — CashOut.expenseItem is a string
          // column and the list filter matches on it; same as the edit form.
          setExpenseItem(String(item.primary));
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
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'invoicein'
        }
        onClose={() => setOpenPicker(null)}
        title={t('invoice_picker_title')}
        fetcher={invoiceFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          const raw = (item as PickerItem & { raw?: InvoiceInRef }).raw;
          const rem = raw ? (BigInt(raw.sumMinor) - BigInt(raw.payedSumMinor)).toString() : '0';
          updateAllocation(openPicker.rowUid, {
            invoiceInId: item.id,
            invoiceLabel: String(item.primary),
            invoiceHint: String(item.secondary ?? ''),
            amountMinor: rem,
          });
          setOpenPicker(null);
        }}
      />
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
