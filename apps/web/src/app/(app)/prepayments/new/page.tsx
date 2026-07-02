'use client';

/**
 * /prepayments/new — moysklad-parity «Предоплата» editor.
 *
 * Mirrors counterparty-adjustments/new, but:
 *   - No «direction» field — prepayment always reduces customer balance.
 *   - customerOrderId optional picker linked to /customer-orders.
 *   - Retail-split row: cashSumMinor / noCashSumMinor / qrSumMinor.
 *     When any of the three is non-zero, their sum must equal sumMinor
 *     (inline error if not). Otherwise all three stay at 0.
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

interface CustomerOrderItem {
  id: string;
  name: string;
  agent: { id: string; name: string } | null;
}

/** Narrowed GET /customer-orders/:id shape consumed by the ?fromOrder pre-fill. */
interface CustomerOrderDetail {
  id: string;
  name: string;
  currency: string;
  sumMinor: string;
  organization: { id: string; name: string };
  agent: { id: string; name: string };
}

/** Returns true when at least one retail split field is non-zero. */
function hasSplit(cash: string, noCash: string, qr: string): boolean {
  return BigInt(cash || '0') > 0n || BigInt(noCash || '0') > 0n || BigInt(qr || '0') > 0n;
}

export default function NewPrepaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const t = useTranslations('pages.prepayment');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.prepayment');
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

  // Optional pre-fill from a customer order (?fromOrder=<id>) — moysklad's
  // «Создать → Предоплата» from an order. Mirrors sales-returns ?fromDemand.
  const fromOrderId = searchParams.get('fromOrder');
  const { data: fromOrder } = useQuery<CustomerOrderDetail>({
    queryKey: ['customer-order', fromOrderId],
    queryFn: () => api.get(`/customer-orders/${fromOrderId}`),
    enabled: !!fromOrderId,
  });

  // Header
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(false);

  // Meta
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
  const [customerOrderId, setCustomerOrderId] = useState<string | null>(null);
  const [customerOrderLabel, setCustomerOrderLabel] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [sumMinor, setSumMinor] = useState('0');
  const [cashSumMinor, setCashSumMinor] = useState('0');
  const [noCashSumMinor, setNoCashSumMinor] = useState('0');
  const [qrSumMinor, setQrSumMinor] = useState('0');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'customerOrder'
    | 'contract'
    | 'project'
    | 'organizationAccount'
    | 'agentAccount'
  >(null);

  // Pre-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to EVERY new document). Money doc — Организация=defaultCompany
  // (first-item fallback) + Контрагент=defaultCustomer (customer prepayment).
  // Skipped when pre-filling from a customer order — the order's values win.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
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

  // Pre-fill from the source customer order (?fromOrder) once it has loaded.
  // Applied once via a ref guard. Sets org/agent + the prepayment amount
  // (order total, minor units) + currency, and back-links the order itself.
  const fromOrderAppliedRef = useRef(false);
  useEffect(() => {
    if (fromOrderAppliedRef.current || !fromOrder) return;
    fromOrderAppliedRef.current = true;
    setOrganizationId(fromOrder.organization.id);
    setOrganizationLabel(fromOrder.organization.name);
    setAgentId(fromOrder.agent.id);
    setAgentLabel(fromOrder.agent.name);
    setCustomerOrderId(fromOrder.id);
    setCustomerOrderLabel(fromOrder.name);
    setCurrency(fromOrder.currency);
    setSumMinor(fromOrder.sumMinor);
  }, [fromOrder]);

  // Retail split validation: if any split field non-zero, they must sum to sumMinor.
  const splitActive = hasSplit(cashSumMinor, noCashSumMinor, qrSumMinor);
  const splitTotal =
    BigInt(cashSumMinor || '0') + BigInt(noCashSumMinor || '0') + BigInt(qrSumMinor || '0');
  const splitMismatch = splitActive && splitTotal !== BigInt(sumMinor || '0');

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(t('err_agent_required'));
      if (!organizationId) throw new Error(t('err_org_required'));
      const sum = BigInt(sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      if (splitMismatch) throw new Error(t('retail_split_hint'));
      return api.post<{ id: string }>('/prepayments', {
        agentId,
        organizationId,
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(organizationAccountId ? { organizationAccountId } : {}),
        ...(agentAccountId ? { agentAccountId } : {}),
        customerOrderId: customerOrderId ?? undefined,
        currency,
        sumMinor,
        cashSumMinor: cashSumMinor !== '0' ? cashSumMinor : undefined,
        noCashSumMinor: noCashSumMinor !== '0' ? noCashSumMinor : undefined,
        qrSumMinor: qrSumMinor !== '0' ? qrSumMinor : undefined,
        description: description || undefined,
        externalCode: externalCode || undefined,
        moment: docDate,
        applicable,
      });
    },
    onSuccess: (created) => router.push(`/prepayments/${created.id}`),
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

  const customerOrderFetcher = async (s: string): Promise<PickerItem[]> => {
    const agentParam = agentId ? `&agentId=${agentId}` : '';
    const d = await api.get<{ items: CustomerOrderItem[] }>(
      `/customer-orders?search=${encodeURIComponent(s)}&limit=50${agentParam}`,
    );
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.agent?.name,
    }));
  };

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
                    // also clear order if agent changes
                    setCustomerOrderId(null);
                    setCustomerOrderLabel('');
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
                    // changing org wipes any previously-selected org account
                    setOrganizationAccountId(null);
                    setOrganizationAccountLabel('');
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
              <DocumentMetaField label={tFields('currency')}>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                  data-test-id="field-currency"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('sum')} required>
                <MoneyInput
                  valueMinor={sumMinor}
                  onChangeMinor={(v) => setSumMinor(v)}
                  className="text-right"
                  data-test-id="field-sum"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('external_code')}>
                <Input
                  value={externalCode}
                  onChange={(e) => setExternalCode(e.target.value)}
                  data-test-id="field-external-code"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* Retail split row — cash / no-cash / qr */}
            <DocumentMetaRow>
              <DocumentMetaField
                label={t('cash_sum')}
                helper={splitMismatch ? t('retail_split_hint') : undefined}
              >
                <MoneyInput
                  valueMinor={cashSumMinor}
                  onChangeMinor={(v) => setCashSumMinor(v)}
                  className="text-right"
                  data-test-id="field-cash-sum"
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('no_cash_sum')}>
                <MoneyInput
                  valueMinor={noCashSumMinor}
                  onChangeMinor={(v) => setNoCashSumMinor(v)}
                  className="text-right"
                  data-test-id="field-no-cash-sum"
                />
              </DocumentMetaField>
              <DocumentMetaField label={t('qr_sum')}>
                <MoneyInput
                  valueMinor={qrSumMinor}
                  onChangeMinor={(v) => setQrSumMinor(v)}
                  className="text-right"
                  data-test-id="field-qr-sum"
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
                  placeholder={agentId ? tFields('agent_account') : t('select_agent_first')}
                  onPick={() => agentId && setOpenPicker('agentAccount')}
                  onClear={() => {
                    setAgentAccountId(null);
                    setAgentAccountLabel('');
                  }}
                  disabled={!agentId}
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

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
        testId="prepayment-new-page"
        documentTypeLabel={tDetailTitles('prepayment')}
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
        onClose={() => router.push('/prepayments')}
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
          // Reset customer order if agent changes
          setCustomerOrderId(null);
          setCustomerOrderLabel('');
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
          // changing org wipes any previously-selected org account
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
          setOpenPicker(null);
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
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'customerOrder'}
        onClose={() => setOpenPicker(null)}
        title={t('customer_order')}
        fetcher={customerOrderFetcher}
        onSelect={(item) => {
          setCustomerOrderId(item.id);
          setCustomerOrderLabel(String(item.primary));
        }}
      />
    </>
  );
}
