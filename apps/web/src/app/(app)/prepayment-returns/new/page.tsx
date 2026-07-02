'use client';

/**
 * /prepayment-returns/new — moysklad-parity «Возврат предоплаты» editor.
 *
 * Key differences vs. /prepayments/new:
 *   - prepaymentId is REQUIRED — picker fetches only state=posted prepayments.
 *   - Selecting a source prepayment auto-fills agentId + organizationId (read-only).
 *   - No customerOrderId picker.
 *   - No clone option.
 *   - Retail-split row preserved: cashSumMinor / noCashSumMinor / qrSumMinor.
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
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
}

/** Shape returned by the picker when a prepayment is selected. */
interface PrepaymentRef {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  currency: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
}

/** Returns true when at least one retail split field is non-zero. */
function hasSplit(cash: string, noCash: string, qr: string): boolean {
  return BigInt(cash || '0') > 0n || BigInt(noCash || '0') > 0n || BigInt(qr || '0') > 0n;
}

export default function NewPrepaymentReturnPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.prepayment_return');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.prepayment_return');
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

  // Header
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(false);

  // Source prepayment (required)
  const [prepaymentId, setPrepaymentId] = useState<string | null>(null);
  const [prepaymentLabel, setPrepaymentLabel] = useState('');
  const [prepaymentSumMinor, setPrepaymentSumMinor] = useState<string>('0');

  // Agent + org auto-filled from selected prepayment — not editable separately.
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');

  // Bank accounts (moysklad parity — independent of the source prepayment)
  const [organizationAccountId, setOrganizationAccountId] = useState<string | null>(null);
  const [organizationAccountLabel, setOrganizationAccountLabel] = useState('');
  const [agentAccountId, setAgentAccountId] = useState<string | null>(null);
  const [agentAccountLabel, setAgentAccountLabel] = useState('');

  // Money fields
  const [currency, setCurrency] = useState('UZS');
  const [sumMinor, setSumMinor] = useState('0');
  const [cashSumMinor, setCashSumMinor] = useState('0');
  const [noCashSumMinor, setNoCashSumMinor] = useState('0');
  const [qrSumMinor, setQrSumMinor] = useState('0');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [openPicker, setOpenPicker] = useState<
    null | 'prepayment' | 'organizationAccount' | 'agentAccount'
  >(null);

  // Auto-fill Организация from the user's «Значения по умолчанию» (first-item
  // fallback). Контрагент is intentionally NOT seeded from a user default here —
  // this doc is derived from a chosen prepayment, whose counterparty/org win once
  // the prepayment is picked; the default just pre-seeds the org for the empty form.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || userDefaults.isLoading) return;
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
  }, [orgsData, userDefaults.data, userDefaults.isLoading, organizationId]);

  // Retail split validation
  const splitActive = hasSplit(cashSumMinor, noCashSumMinor, qrSumMinor);
  const splitTotal =
    BigInt(cashSumMinor || '0') + BigInt(noCashSumMinor || '0') + BigInt(qrSumMinor || '0');
  const splitMismatch = splitActive && splitTotal !== BigInt(sumMinor || '0');

  const createMut = useMutation({
    mutationFn: async () => {
      if (!prepaymentId) throw new Error(t('err_source_required'));
      if (!agentId) throw new Error(t('err_agent_required'));
      if (!organizationId) throw new Error(t('err_org_required'));
      const sum = BigInt(sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      if (splitMismatch) throw new Error(t('retail_split_hint'));
      const sourceSumBig = BigInt(prepaymentSumMinor || '0');
      if (sum > sourceSumBig) throw new Error(t('cap_exceeded'));
      return api.post<{ id: string }>('/prepayment-returns', {
        prepaymentId,
        agentId,
        organizationId,
        ...(organizationAccountId ? { organizationAccountId } : {}),
        ...(agentAccountId ? { agentAccountId } : {}),
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
    onSuccess: (created) => router.push(`/prepayment-returns/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  /** Fetches only posted prepayments so they have balance to refund. */
  const prepaymentFetcher = async (s: string): Promise<PickerItem[]> => {
    const agentParam = agentId ? `&agentId=${agentId}` : '';
    const d = await api.get<{ items: PrepaymentRef[] }>(
      `/prepayments?search=${encodeURIComponent(s)}&state=posted&limit=50${agentParam}`,
    );
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: `${p.agent.name} — ${p.sumMinor}`,
      // Store full metadata so auto-fill works in onSelect.
      raw: p,
    }));
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

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel>
            {/* Row 1: Source prepayment picker (required) */}
            <DocumentMetaRow>
              <DocumentMetaField label={t('source_prepayment')} required>
                <CatalogPickerField
                  value={prepaymentId ? { id: prepaymentId, label: prepaymentLabel } : null}
                  placeholder={t('source_prepayment')}
                  onPick={() => setOpenPicker('prepayment')}
                  onClear={() => {
                    // Clearing source prepayment also clears agent + org.
                    setPrepaymentId(null);
                    setPrepaymentLabel('');
                    setPrepaymentSumMinor('0');
                    setAgentId(null);
                    setAgentLabel('');
                    setOrganizationId(null);
                    setOrganizationLabel('');
                    // Org changed → drop the org-scoped bank account.
                    setOrganizationAccountId(null);
                    setOrganizationAccountLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* Row 2: Agent + Org — auto-filled from prepayment, read-only */}
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('agent')} required>
                <CatalogPickerField
                  value={agentId ? { id: agentId, label: agentLabel } : null}
                  placeholder={t('autofill_from_source')}
                  onPick={() => undefined}
                  onClear={() => undefined}
                  disabled
                  testId="field-agent"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('organization')} required>
                <CatalogPickerField
                  value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                  placeholder={t('autofill_from_source')}
                  onPick={() => undefined}
                  onClear={() => undefined}
                  disabled
                  testId="field-organization"
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* Row 2b: Bank accounts (moysklad parity) */}
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
                  placeholder={agentId ? tFields('agent_account') : t('select_source_first')}
                  onPick={() => agentId && setOpenPicker('agentAccount')}
                  onClear={() => {
                    setAgentAccountId(null);
                    setAgentAccountLabel('');
                  }}
                  disabled={!agentId}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* Row 3: Currency + Sum */}
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('sum')} required>
                <MoneyInput
                  valueMinor={sumMinor}
                  onChangeMinor={(v) => setSumMinor(v)}
                  className="text-right"
                  data-test-id="field-sum"
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('currency')}>
                {/* Inherited from the selected source prepayment, not editable —
                    a refund is booked in the advance's currency (the backend
                    forces source currency on create). (2026-06-03g) */}
                <Input value={currency} disabled data-test-id="field-currency" />
              </DocumentMetaField>
            </DocumentMetaRow>

            {/* Row 4: Retail split — cash / no-cash / qr */}
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

            {/* Row 5: External code */}
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('external_code')}>
                <Input
                  value={externalCode}
                  onChange={(e) => setExternalCode(e.target.value)}
                  data-test-id="field-external-code"
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
        testId="prepayment-return-new-page"
        documentTypeLabel={tDetailTitles('prepayment_return')}
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
        onClose={() => router.push('/prepayment-returns')}
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

      {/* Source prepayment picker — only posted prepayments */}
      <CatalogPicker
        open={openPicker === 'prepayment'}
        onClose={() => setOpenPicker(null)}
        title={t('source_prepayment')}
        fetcher={prepaymentFetcher}
        onSelect={(item) => {
          const raw = item.raw as PrepaymentRef | undefined;
          setPrepaymentId(item.id);
          setPrepaymentLabel(String(item.primary));
          if (raw) {
            setPrepaymentSumMinor(raw.sumMinor);
            // A refund is booked in the source advance's currency — inherit it
            // (read-only, like agent/org); the backend forces it too. (2026-06-03g)
            setCurrency(raw.currency);
            setAgentId(raw.agent.id);
            setAgentLabel(raw.agent.name);
            setOrganizationId(raw.organization.id);
            setOrganizationLabel(raw.organization.name);
            // Org changed → drop any stale org-scoped bank account.
            setOrganizationAccountId(null);
            setOrganizationAccountLabel('');
          }
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
    </>
  );
}
