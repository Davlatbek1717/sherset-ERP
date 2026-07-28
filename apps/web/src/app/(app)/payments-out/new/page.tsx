'use client';

/**
 * /payments-out/new — moysklad-parity «Исходящий платёж» editor («+ Расход» 1st form).
 *
 * Rebuilt 2026-06-26 onto the payments-in/new + cash-in/new shell so the create
 * form is pixel-1:1 with live moysklad (ground:
 * docs/audits/cash-money-forms-2026-06-26/moysklad — 22-paymentout-editor-meta.png).
 * ROW-PAIRED 2-col meta (DocumentMetaRow fixedWidth):
 *   Организация* (+ «Счёт организации» labelless subRow)  | Контрагент* (+ Баланс)
 *   Договор                                               | Сумма*
 *   Проект                                                | Включая НДС
 *   Канал продаж                                          | Статья расходов (reference picker)
 *   Назначение платежа (textarea)                         | —
 *   Валюта документа* ✎  (left-only, inline rate)
 *   «Комментарий» (bottom textarea)
 * Bank money-OUT: no «Касса», no «Входящий номер», no «Внешний код». Header adds
 * «Без закрывающих документов» (waiting checkbox). INLINE type-to-search ref
 * fields; owner popover top-right; tabs = «Оплаченные документы» (allocation grid,
 * invoice-in/purchase-order advance — PRESERVED verbatim) | «Связанные документы».
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
import { useEffect, useRef, useState } from 'react';

interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
}
interface InvoiceInRef {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  payedSumMinor: string;
}
interface PurchaseOrderRef {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  payedSumMinor: string;
}

type OperationKind = 'invoicein' | 'purchaseorder';

interface OperationRow {
  _uid: string;
  targetKind: OperationKind;
  targetId: string | null;
  targetLabel: string;
  targetHint: string;
  amountMinor: string;
}

// Account currency (Настройки → Валюты) — mirror payments-in: isoCode/default/rate.
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

export default function NewPaymentOutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.payments_out');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.payment_out');
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

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(true);
  const [noClosingDocs, setNoClosingDocs] = useState(false);

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
  const [paymentPurpose, setPaymentPurpose] = useState('');
  // «Статья расходов» — the NAME picked from the /expense-items reference.
  // (MASTER-TODO #8: the old comment claimed «no master dictionary» — there IS
  // one, `settings/expense-items`, and the edit form already picked from it.)
  // Persists to PaymentOut.expenseItem so the list filter is honest.
  const [expenseItem, setExpenseItem] = useState('');
  const [description, setDescription] = useState(''); // «Комментарий»
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
    | 'expenseItem'
    | { kind: 'target'; rowUid: string; targetKind: OperationKind }
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
  // (first-item fallback) + Контрагент=defaultSupplier (outgoing money).
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

  // === Allocation (PRESERVED verbatim — invoice-in / purchase-order advance) ===
  const addOperation = (targetKind: OperationKind) => {
    setOperations((ops) => [
      ...ops,
      {
        _uid: uid(),
        targetKind,
        targetId: null,
        targetLabel: '',
        targetHint: '',
        amountMinor: '0',
      },
    ]);
  };
  const updateOperation = (rowUid: string, patch: Partial<OperationRow>) => {
    setOperations((ops) => ops.map((o) => (o._uid === rowUid ? { ...o, ...patch } : o)));
  };
  const removeOperation = (rowUid: string) => {
    setOperations((ops) => ops.filter((o) => o._uid !== rowUid));
  };

  const totalAllocated = operations.reduce((acc, o) => acc + BigInt(o.amountMinor || '0'), 0n);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(t('err_agent_required'));
      if (!organizationId) throw new Error(t('err_org_required'));
      const sum = BigInt(sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      for (const [i, op] of operations.entries()) {
        if (!op.targetId) throw new Error(t('err_op_doc', { n: i + 1 }));
        if (BigInt(op.amountMinor || '0') <= 0n) {
          throw new Error(t('err_op_sum', { n: i + 1 }));
        }
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
        operations: operations.map((op) => ({
          targetKind: op.targetKind,
          invoiceInId: op.targetKind === 'invoicein' ? op.targetId : undefined,
          purchaseOrderId: op.targetKind === 'purchaseorder' ? op.targetId : undefined,
          amountMinor: op.amountMinor,
        })),
      };
      return api.post<{ id: string }>('/payments-out', payload);
    },
    onSuccess: (created) => router.push(`/payments-out/${created.id}`),
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
  // MASTER-TODO #8: «Статья расходов» IS a master dictionary here
  // (`settings/expense-items` + GET /expense-items) — the old comment on this
  // field claiming otherwise was wrong. The edit form (payments-out/[id])
  // already picked from it; this form let the user type anything, so the
  // list's «Статья расходов» filter could not match what create wrote.
  const expenseItemFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/expense-items?search=${encodeURIComponent(s)}&limit=50`,
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

  const invoiceInFetcher = async (s: string): Promise<PickerItem[]> => {
    const qs = new URLSearchParams({ limit: '50' });
    if (s) qs.set('search', s);
    if (agentId) qs.set('agentId', agentId);
    const d = await api.get<{ items: InvoiceInRef[] }>(`/invoices-in?${qs.toString()}`);
    return d.items
      .filter((inv) => inv.state === 'posted' || inv.state === 'partially_paid')
      .map((inv) => {
        const remaining = BigInt(inv.sumMinor) - BigInt(inv.payedSumMinor);
        return {
          id: inv.id,
          primary: inv.name,
          secondary: tForm('supplier_label_qoldiq', {
            state: inv.state,
            amount: formatMoney(remaining),
          }),
          raw: { ...inv, remaining: remaining.toString() },
        };
      });
  };

  const purchaseOrderFetcher = async (s: string): Promise<PickerItem[]> => {
    const qs = new URLSearchParams({ limit: '50' });
    if (s) qs.set('search', s);
    if (agentId) qs.set('agentId', agentId);
    const d = await api.get<{ items: PurchaseOrderRef[] }>(`/purchase-orders?${qs.toString()}`);
    return d.items
      .filter(
        (po) =>
          po.state === 'confirmed' ||
          po.state === 'partially_received' ||
          po.state === 'fully_received',
      )
      .map((po) => {
        const remaining = BigInt(po.sumMinor) - BigInt(po.payedSumMinor);
        return {
          id: po.id,
          primary: po.name,
          secondary: tForm('supplier_label_qoldiq', {
            state: po.state,
            amount: formatMoney(remaining),
          }),
          raw: { ...po, remaining: remaining.toString() },
        };
      });
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
              // Linked docs belong to the chosen payee — drop them all.
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
        {/* «Статья расходов» — picker over the /expense-items reference
            (mirrors payments-out/[id]); a catalog value is what keeps the
            list filter live. */}
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

  // «Оплаченные документы» — allocation (PRESERVED verbatim): a PaymentOut pays
  // the supplier's Счета поставщиков (invoice-in) AND direct PO advances.
  const allocationSection = (
    <div className="space-y-3 bg-[var(--ms-bg-surface)] px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          {tForm('section_allocation')} — {operations.length} · {formatMoney(totalAllocated)} /{' '}
          {formatMoney(sumMinor || '0')}
        </span>
      </div>
      {operations.length === 0 ? (
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
          {t('allocation_empty')}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[140px,1fr,160px,40px] gap-2 px-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            <div>{t('allocation_kind')}</div>
            <div>{t('allocation_doc')}</div>
            <div className="text-right">{t('alloc_col_amount')}</div>
            <div />
          </div>
          {operations.map((op) => (
            <div
              key={op._uid}
              className="grid grid-cols-[140px,1fr,160px,40px] items-center gap-2"
              data-test-id={`operation-row-${op._uid}`}
            >
              <div className="text-[var(--ms-text-muted)] text-sm">
                {op.targetKind === 'invoicein' ? t('kind_invoicein') : t('kind_purchaseorder')}
              </div>
              <CatalogPickerField
                value={op.targetId ? { id: op.targetId, label: op.targetLabel } : null}
                placeholder={
                  !agentId
                    ? t('select_payer_first')
                    : op.targetKind === 'invoicein'
                      ? tForm('select_invoice')
                      : tForm('select_advance_po')
                }
                onPick={() => {
                  if (!agentId) {
                    setError(t('select_payer_first'));
                    return;
                  }
                  setOpenPicker({ kind: 'target', rowUid: op._uid, targetKind: op.targetKind });
                }}
                onClear={() =>
                  updateOperation(op._uid, { targetId: null, targetLabel: '', targetHint: '' })
                }
              />
              <MoneyInput
                valueMinor={op.amountMinor}
                onChangeMinor={(v) => updateOperation(op._uid, { amountMinor: v })}
                className="text-right"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => removeOperation(op._uid)}
                aria-label={t('remove_row')}
              >
                <Icons.close className="h-4 w-4" />
              </Button>
              {op.targetHint && (
                <div className="col-span-4 pl-[148px] text-[var(--ms-text-muted)] text-xs">
                  {op.targetHint}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => addOperation('invoicein')}
          data-test-id="add-operation-invoicein"
        >
          <Icons.create className="h-4 w-4" />
          {t('add_invoicein')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => addOperation('purchaseorder')}
          data-test-id="add-operation-po"
        >
          <Icons.create className="h-4 w-4" />
          {t('add_advance')}
        </Button>
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
              kind: 'payment-out',
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
        testId="payment-out-new-page"
        documentTypeLabel={tDetailTitles('payment_out')}
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
        onClose={() => router.push('/payments-out')}
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
        open={openPicker === 'expenseItem'}
        onClose={() => setOpenPicker(null)}
        title={tFields('expense_item')}
        fetcher={expenseItemFetcher}
        onSelect={(item) => {
          // Store the NAME — PaymentOut.expenseItem is a string column and the
          // list filter matches on it; same contract as the edit form.
          setExpenseItem(String(item.primary));
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
        open={
          typeof openPicker === 'object' &&
          openPicker !== null &&
          openPicker.kind === 'target' &&
          openPicker.targetKind === 'invoicein'
        }
        onClose={() => setOpenPicker(null)}
        title={tForm('invoice_picker_title')}
        fetcher={invoiceInFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null || openPicker.kind !== 'target')
            return;
          const raw = (item as PickerItem & { raw?: InvoiceInRef & { remaining: string } }).raw;
          updateOperation(openPicker.rowUid, {
            targetId: item.id,
            targetLabel: String(item.primary),
            targetHint: item.secondary as string,
            amountMinor: raw?.remaining ?? '0',
          });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={
          typeof openPicker === 'object' &&
          openPicker !== null &&
          openPicker.kind === 'target' &&
          openPicker.targetKind === 'purchaseorder'
        }
        onClose={() => setOpenPicker(null)}
        title={tForm('advance_po_picker_title')}
        fetcher={purchaseOrderFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null || openPicker.kind !== 'target')
            return;
          const raw = (item as PickerItem & { raw?: PurchaseOrderRef & { remaining: string } }).raw;
          updateOperation(openPicker.rowUid, {
            targetId: item.id,
            targetLabel: String(item.primary),
            targetHint: item.secondary as string,
            amountMinor: raw?.remaining ?? '0',
          });
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
