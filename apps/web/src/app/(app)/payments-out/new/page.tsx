'use client';

/**
 * /payments-out/new — moysklad-parity «Исходящий платёж» editor.
 *
 * Money doc: no PositionTable, no waiting checkbox.
 * Single sumMinor field + optional allocations table (invoicein | purchaseorder).
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
  DocumentTabs,
  Icons,
  Input,
  MoneyInput,
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

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function NewPaymentOutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.payments_out');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
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

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(false);

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
  const [agentAccountId, setAgentAccountId] = useState<string | null>(null);
  const [agentAccountLabel, setAgentAccountLabel] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [sumMinor, setSumMinor] = useState('0');
  const [paymentPurpose, setPaymentPurpose] = useState('');
  // «Статья расходов» — the expense item name (free-form string matching the
  // ExpenseItem master list). Picked from /expense-items; persists to the
  // PaymentOut.expenseItem column so the list filter is no longer dead.
  const [expenseItem, setExpenseItem] = useState('');
  const [description, setDescription] = useState('');
  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'contract'
    | 'project'
    | 'organizationAccount'
    | 'agentAccount'
    | 'expenseItem'
    | { kind: 'target'; rowUid: string; targetKind: OperationKind }
  >(null);

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
        ...(organizationAccountId ? { organizationAccountId } : {}),
        ...(agentAccountId ? { agentAccountId } : {}),
        ...(externalCode ? { externalCode } : {}),
        ...(expenseItem ? { expenseItem } : {}),
        sumMinor,
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
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
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
  const expenseItemFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/expense-items?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  // moysklad parity — counterparty bank accounts have no flat list endpoint;
  // the only route is the nested /counterparties/:id/bank-accounts (same as
  // the contract picker is gated on the chosen agent). Client-filter by
  // search since the nested endpoint takes no search param.
  const agentAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!agentId) return [];
    const d = await api.get<Array<{ id: string; accountNumber: string; bankName: string | null }>>(
      `/counterparties/${agentId}/bank-accounts`,
    );
    const q = s.trim().toLowerCase();
    return d
      .filter(
        (a) =>
          !q ||
          a.accountNumber.toLowerCase().includes(q) ||
          (a.bankName ?? '').toLowerCase().includes(q),
      )
      .map((a) => ({ id: a.id, primary: a.accountNumber, secondary: a.bankName ?? undefined }));
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

  const allocationSection = (
    <div className="space-y-3">
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
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('agent')} required>
                <CatalogPickerField
                  value={agentId ? { id: agentId, label: agentLabel } : null}
                  placeholder={tFields('agent')}
                  onPick={() => setOpenPicker('agent')}
                  onClear={() => {
                    setAgentId(null);
                    setAgentLabel('');
                    setOperations((ops) =>
                      ops.map((o) => ({ ...o, targetId: null, targetLabel: '', targetHint: '' })),
                    );
                  }}
                  onCreate={() => router.push('/counterparties/new')}
                  createLabel={tForm('create_new_counterparty')}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('organization')} required>
                <CatalogPickerField
                  value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                  placeholder={tFields('organization')}
                  onPick={() => setOpenPicker('org')}
                  onClear={() => {
                    setOrganizationId(null);
                    setOrganizationLabel('');
                    setOrganizationAccountId(null);
                    setOrganizationAccountLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('sum')} required>
                <MoneyInput
                  valueMinor={sumMinor}
                  onChangeMinor={(v) => setSumMinor(v)}
                  className="text-right"
                  data-test-id="field-sum-minor"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('payment_purpose')}>
                <Input
                  value={paymentPurpose}
                  onChange={(e) => setPaymentPurpose(e.target.value)}
                  placeholder={t('payment_purpose_hint')}
                  data-test-id="field-payment-purpose"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('contract')}>
                <CatalogPickerField
                  value={contractId ? { id: contractId, label: contractLabel } : null}
                  placeholder={tFields('contract')}
                  onPick={() => setOpenPicker('contract')}
                  onClear={() => {
                    setContractId(null);
                    setContractLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('project')}>
                <CatalogPickerField
                  value={projectId ? { id: projectId, label: projectLabel } : null}
                  placeholder={tFields('project')}
                  onPick={() => setOpenPicker('project')}
                  onClear={() => {
                    setProjectId(null);
                    setProjectLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('organization_account')}>
                <CatalogPickerField
                  value={
                    organizationAccountId
                      ? { id: organizationAccountId, label: organizationAccountLabel }
                      : null
                  }
                  placeholder={tFields('organization_account')}
                  onPick={() => setOpenPicker('organizationAccount')}
                  onClear={() => {
                    setOrganizationAccountId(null);
                    setOrganizationAccountLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('agent_account')}>
                <CatalogPickerField
                  value={agentAccountId ? { id: agentAccountId, label: agentAccountLabel } : null}
                  placeholder={agentId ? tFields('agent_account') : t('select_payer_first')}
                  onPick={() => agentId && setOpenPicker('agentAccount')}
                  onClear={() => {
                    setAgentAccountId(null);
                    setAgentAccountLabel('');
                  }}
                  disabled={!agentId}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              {/* «Статья расходов» — expense item (moysklad parity). Picked from
                 the ExpenseItem master list; stored as the name string. */}
              <DocumentMetaField label={tFields('expense_item')}>
                <CatalogPickerField
                  value={expenseItem ? { id: expenseItem, label: expenseItem } : null}
                  placeholder={tFields('expense_item')}
                  onPick={() => setOpenPicker('expenseItem')}
                  onClear={() => setExpenseItem('')}
                  testId="field-expense-item"
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
          </DocumentMetaPanel>

          {allocationSection}

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tFields('description')}
            rows={3}
            data-test-id="field-description"
          />

          <DocumentDisclosurePanel
            title={tForm('tasks_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_task')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('tasks_after_save_hint')}</p>
          </DocumentDisclosurePanel>

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
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          setAgentId(item.id);
          setAgentLabel(String(item.primary));
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
        }}
      />
      <CatalogPicker
        open={openPicker === 'agentAccount'}
        onClose={() => setOpenPicker(null)}
        title={tFields('agent_account')}
        fetcher={agentAccountFetcher}
        onSelect={(item) => {
          setAgentAccountId(item.id);
          setAgentAccountLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'expenseItem'}
        onClose={() => setOpenPicker(null)}
        title={tFields('expense_item')}
        fetcher={expenseItemFetcher}
        onSelect={(item) => setExpenseItem(String(item.primary))}
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
        }}
      />
    </>
  );
}
