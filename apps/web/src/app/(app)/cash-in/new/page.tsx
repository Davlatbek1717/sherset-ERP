'use client';

/**
 * /cash-in/new — moysklad-parity «Приходный ордер» editor.
 *
 * Money doc: no PositionTable, no waiting checkbox.
 * Контрагент + Организация | Касса + Назначение платежа | Сумма.
 * Optional allocations to invoices-out.
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
import { useRouter, useSearchParams } from 'next/navigation';
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
interface InvoiceOutRef {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  payedSumMinor: string;
}

interface AllocationRow {
  _uid: string;
  invoiceOutId: string | null;
  invoiceLabel: string;
  invoiceHint: string;
  amountMinor: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function NewCashInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const t = useTranslations('pages.cash_in');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.cash_in');
  const docEditorLabels = useDocumentEditorLabels();

  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  // Optional «Приходный ордер» pre-fill from a customer order (moysklad's
  // «Создать → Приходный ордер» off a customer order). Mirrors the sibling
  // fromDemand flow in sales-returns/new — the order's values win over the
  // user-defaults auto-fill below.
  // `fromOrder` may carry a CSV of ids when several rows were selected on the
  // list. A receipt is one document, so pre-fill from the FIRST order — passing
  // the raw CSV as a single id would 404 the GET and silently blank the form.
  const fromOrderId = searchParams.get('fromOrder')?.split(',')[0] ?? null;

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: cashDesksData } = useQuery<{ items: CashDeskRef[] }>({
    queryKey: ['cash-desks'],
    queryFn: () => api.get('/cash-desks'),
  });

  // Source customer order — fetched only when ?fromOrder is present. The
  // receipt is FOR this order: Контрагент=order.agent, Организация=order
  // .organization, Сумма=order.sumMinor (the order total). No positions —
  // a cash receipt has none. «Основание» references the order number.
  const { data: fromOrder } = useQuery<{
    id: string;
    name: string;
    currency: string;
    sumMinor: string;
    organization: { id: string; name: string };
    agent: { id: string; name: string };
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
  const [applicable, setApplicable] = useState(false);

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
  const [currency, setCurrency] = useState('UZS');
  const [sumMinor, setSumMinor] = useState('0');
  const [paymentPurpose, setPaymentPurpose] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'cashDesk'
    | 'contract'
    | 'project'
    | { kind: 'invoiceout'; rowUid: string }
  >(null);

  // Pre-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to EVERY new document). Money doc — Организация=defaultCompany
  // (first-item fallback) + Контрагент=defaultCustomer (incoming money). Skipped
  // when pre-filling from a customer order — the order's own values win (mirrors
  // sales-returns/new skipping auto-fill when fromDemand is set).
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

  // Apply the source customer order once it has loaded — set the receipt meta
  // (Контрагент / Организация / Сумма / «Основание») from the order. Guarded by
  // a ref so re-renders don't clobber edits the user makes afterwards.
  const fromOrderAppliedRef = useRef(false);
  useEffect(() => {
    if (fromOrderAppliedRef.current || !fromOrder) return;
    fromOrderAppliedRef.current = true;
    setAgentId(fromOrder.agent.id);
    setAgentLabel(fromOrder.agent.name);
    setOrganizationId(fromOrder.organization.id);
    setOrganizationLabel(fromOrder.organization.name);
    setSumMinor(fromOrder.sumMinor);
    // «Основание» references the source order. No i18n template key exists for a
    // composed phrase, so use the order's own number (e.g. «ЗП-2026-00074») —
    // the order's data, not a hardcoded string, and it references the order.
    setPaymentPurpose(fromOrder.name);
  }, [fromOrder]);

  useEffect(() => {
    if (cashDesksData?.items[0] && !cashDeskId) {
      const d = cashDesksData.items[0];
      setCashDeskId(d.id);
      setCashDeskLabel(d.name);
      setCurrency(d.currency);
    }
  }, [cashDesksData, cashDeskId]);

  const totalAllocated = useMemo(
    () => allocations.reduce((s, a) => s + BigInt(a.amountMinor || '0'), 0n),
    [allocations],
  );

  const addAllocation = () => {
    if (!agentId) {
      setError(t('select_payer_first'));
      return;
    }
    setAllocations((xs) => [
      ...xs,
      {
        _uid: uid(),
        invoiceOutId: null,
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
        if (!a.invoiceOutId) throw new Error(t('err_op_invoice', { n: i + 1 }));
      });
      return api.post<{ id: string }>('/cash-in', {
        agentId,
        organizationId,
        cashDeskId,
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(externalCode ? { externalCode } : {}),
        sumMinor,
        currency,
        paymentPurpose: paymentPurpose || undefined,
        description: description || undefined,
        operations: allocations.map((a) => ({
          targetKind: 'invoiceout',
          invoiceOutId: a.invoiceOutId,
          amountMinor: a.amountMinor,
        })),
      });
    },
    onSuccess: (created) => router.push(`/cash-in/${created.id}`),
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
  const cashDeskFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: CashDeskRef[] }>(
      `/cash-desks?${s ? `search=${encodeURIComponent(s)}` : ''}`,
    );
    return d.items.map((cd) => ({
      id: cd.id,
      primary: cd.name,
      secondary: cd.currency,
      meta: formatMoney(cd.balanceMinor),
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
  const invoiceFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: InvoiceOutRef[] }>(
      `/invoices-out?${agentId ? `agentId=${agentId}&` : ''}${s ? `search=${encodeURIComponent(s)}` : ''}`,
    );
    return d.items.map((r) => {
      const remaining = BigInt(r.sumMinor) - BigInt(r.payedSumMinor);
      return {
        id: r.id,
        primary: r.name,
        secondary: r.state,
        meta: `${formatMoney(remaining)} / ${formatMoney(r.sumMinor)}`,
        raw: r,
      };
    });
  };

  const allocationSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
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
                value={a.invoiceOutId ? { id: a.invoiceOutId, label: a.invoiceLabel } : null}
                placeholder={t('select_invoice')}
                onPick={() => setOpenPicker({ kind: 'invoiceout', rowUid: a._uid })}
                onClear={() =>
                  updateAllocation(a._uid, {
                    invoiceOutId: null,
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
                    setAllocations([]);
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
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('cash_desk')} required>
                <CatalogPickerField
                  value={cashDeskId ? { id: cashDeskId, label: cashDeskLabel } : null}
                  placeholder={t('cash_desk')}
                  onPick={() => setOpenPicker('cashDesk')}
                  onClear={() => {
                    setCashDeskId(null);
                    setCashDeskLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('basis')}>
                <Input
                  value={paymentPurpose}
                  onChange={(e) => setPaymentPurpose(e.target.value)}
                  data-test-id="field-purpose"
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
        testId="cash-in-new-page"
        documentTypeLabel={tDetailTitles('cash_in')}
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
        onClose={() => router.push('/cash-in')}
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
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'invoiceout'
        }
        onClose={() => setOpenPicker(null)}
        title={t('invoice_picker_title')}
        fetcher={invoiceFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          const raw = (item as PickerItem & { raw?: InvoiceOutRef }).raw;
          const remaining = raw
            ? (BigInt(raw.sumMinor) - BigInt(raw.payedSumMinor)).toString()
            : '0';
          updateAllocation(openPicker.rowUid, {
            invoiceOutId: item.id,
            invoiceLabel: String(item.primary),
            invoiceHint: String(item.secondary ?? ''),
            amountMinor: remaining,
          });
        }}
      />
    </>
  );
}
