'use client';

/**
 * /prepayments/[id] — detail/edit view for a prepayment document.
 *
 * Mirrors counterparty-adjustments/[id] minus direction: prepayment
 * always reduces customer balance on post. Extra fields:
 *   - customerOrderId (optional picker)
 *   - retail split: cashSumMinor / noCashSumMinor / qrSumMinor
 *
 * Locking: when `applicable=true`, all fields become read-only.
 * Toggle Provedeno off (POST /transitions/unpost) to re-enable editing.
 */

import { AttachmentsSection } from '@/components/attachments-section';
import { DetailContentTabs, DetailHeader, DetailToolbar } from '@/components/document-detail';
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
  CatalogPicker,
  CatalogPickerField,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  Input,
  MoneyInput,
  type PickerItem,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface PrepaymentDetail {
  id: string;
  version: number;
  name: string;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  sumMinor: string;
  cashSumMinor: string;
  noCashSumMinor: string;
  qrSumMinor: string;
  currency: string;
  description: string | null;
  externalCode: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string; legalTitle: string | null };
  customerOrder: { id: string; name: string } | null;
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  agentAccount: { id: string; accountNumber: string } | null;
  owner: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
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
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  agentAccountId: string | null;
  agentAccountLabel: string;
  customerOrderId: string;
  customerOrderLabel: string;
  sumMinor: string;
  cashSumMinor: string;
  noCashSumMinor: string;
  qrSumMinor: string;
  currency: string;
  description: string;
  externalCode: string;
}

interface CustomerOrderItem {
  id: string;
  name: string;
  agent: { id: string; name: string } | null;
}

function formFromData(d: PrepaymentDetail): FormState {
  return {
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.accountNumber || d.organizationAccount?.name || '',
    agentAccountId: d.agentAccount?.id ?? null,
    agentAccountLabel: d.agentAccount?.accountNumber ?? '',
    customerOrderId: d.customerOrder?.id ?? '',
    customerOrderLabel: d.customerOrder?.name ?? '',
    sumMinor: d.sumMinor,
    cashSumMinor: d.cashSumMinor,
    noCashSumMinor: d.noCashSumMinor,
    qrSumMinor: d.qrSumMinor,
    currency: d.currency,
    description: d.description ?? '',
    externalCode: d.externalCode ?? '',
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify(s);
}

/** Returns true when at least one retail split field is non-zero. */
function hasSplit(cash: string, noCash: string, qr: string): boolean {
  return BigInt(cash || '0') > 0n || BigInt(noCash || '0') > 0n || BigInt(qr || '0') > 0n;
}

export default function PrepaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('prepayments', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.prepayment');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.prepayment');

  const { data, isLoading } = useQuery<PrepaymentDetail>({
    queryKey: ['prepayments', id],
    queryFn: () => api.get(`/prepayments/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
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
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !form) {
      const initial = formFromData(data);
      setForm(initial);
      setOriginal(snapshot(initial));
    }
  }, [data, form]);

  const isDirty = useMemo(() => (form ? snapshot(form) !== original : false), [form, original]);
  useUnsavedGuard(isDirty);

  // Retail split validation
  const splitActive = form
    ? hasSplit(form.cashSumMinor, form.noCashSumMinor, form.qrSumMinor)
    : false;
  const splitTotal = form
    ? BigInt(form.cashSumMinor || '0') +
      BigInt(form.noCashSumMinor || '0') +
      BigInt(form.qrSumMinor || '0')
    : 0n;
  const splitMismatch = form ? splitActive && splitTotal !== BigInt(form.sumMinor || '0') : false;

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/prepayments/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prepayments', id] });
      qc.invalidateQueries({ queryKey: ['prepayments'] });
      qc.invalidateQueries({ queryKey: ['counterparty-balance'] });
    },
  });

  const onConflict = useConflictReload(['prepayments', id], () => setForm(null));

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form) throw new Error(t('err_form_not_loaded'));
      if (!data) throw new Error(t('err_form_not_loaded'));
      const sum = BigInt(form.sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      if (splitMismatch) throw new Error(t('retail_split_hint'));
      return api.patch(`/prepayments/${id}`, {
        // Optimistic-lock token — sourced from the LOADED query data, NOT the
        // editable form state, so it reflects the version the form opened with.
        version: data.version,
        agentId: form.agentId,
        organizationId: form.organizationId,
        contractId: form.contractId,
        projectId: form.projectId,
        organizationAccountId: form.organizationAccountId,
        agentAccountId: form.agentAccountId,
        customerOrderId: form.customerOrderId || null,
        sumMinor: form.sumMinor,
        // Retail split fields are non-nullable BigInt @default(0) columns and
        // the UpdatePrepaymentSchema is `.strict()` with `bigintMinor.optional()`
        // (string|undefined — `null` is REJECTED). Send '0', never null, so a
        // wholesale (no-split) save isn't rejected with a 400. (audit 2026-06-03g)
        cashSumMinor: form.cashSumMinor || '0',
        noCashSumMinor: form.noCashSumMinor || '0',
        qrSumMinor: form.qrSumMinor || '0',
        currency: form.currency,
        description: form.description || null,
        externalCode: form.externalCode || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prepayments', id] });
      qc.invalidateQueries({ queryKey: ['prepayments'] });
      setForm(null);
    },
    onError: (err: Error) => {
      // An optimistic-lock 409 is owned by the conflict dialog (onConflict) —
      // don't surface it as a raw inline banner. Local saveError stays empty.
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/prepayments/${id}/clone`, {}),
    onSuccess: (cloned) => router.push(`/prepayments/${cloned.id}`),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/prepayments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prepayments'] });
      router.push('/prepayments');
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

  const customerOrderFetcher = async (s: string): Promise<PickerItem[]> => {
    const agentParam = form?.agentId ? `&agentId=${form.agentId}` : '';
    const d = await api.get<{ items: CustomerOrderItem[] }>(
      `/customer-orders?search=${encodeURIComponent(s)}&limit=50${agentParam}`,
    );
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.agent?.name,
    }));
  };

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data || !form) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const locked = data.applicable;
  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="prepayment-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => {
          setSaveError(null);
          saveMut.mutate();
        }}
        onClose={() => router.push('/prepayments')}
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
      />
      <DetailHeader
        titlePrefix={tDetailTitles('prepayment')}
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
                    customerOrderId: '',
                    customerOrderLabel: '',
                  })
                }
                disabled={locked}
                testId="field-agent"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('customer_order')}>
              <CatalogPickerField
                value={
                  form.customerOrderId
                    ? { id: form.customerOrderId, label: form.customerOrderLabel }
                    : null
                }
                placeholder="—"
                onPick={() => !locked && setOpenPicker('customerOrder')}
                onClear={() =>
                  !locked && setForm({ ...form, customerOrderId: '', customerOrderLabel: '' })
                }
                disabled={locked}
                testId="field-customer-order"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('currency')}>
              <Input
                value={form.currency}
                onChange={(e) =>
                  setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })
                }
                disabled={locked}
                data-test-id="field-currency"
              />
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
            <DocumentMetaField label={tFields('posted_at')}>
              <Input
                value={data.postedAt ? formatDate(data.postedAt) : ''}
                disabled
                placeholder="—"
                data-test-id="field-posted-at"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          {/* Retail split row */}
          <DocumentMetaRow>
            <DocumentMetaField
              label={t('cash_sum')}
              helper={splitMismatch ? t('retail_split_hint') : undefined}
            >
              <MoneyInput
                valueMinor={form.cashSumMinor}
                onChangeMinor={(v) => setForm({ ...form, cashSumMinor: v })}
                className="text-right tabular-nums"
                disabled={locked}
                data-test-id="field-cash-sum"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('no_cash_sum')}>
              <MoneyInput
                valueMinor={form.noCashSumMinor}
                onChangeMinor={(v) => setForm({ ...form, noCashSumMinor: v })}
                className="text-right tabular-nums"
                disabled={locked}
                data-test-id="field-no-cash-sum"
              />
            </DocumentMetaField>
            <DocumentMetaField label={t('qr_sum')}>
              <MoneyInput
                valueMinor={form.qrSumMinor}
                onChangeMinor={(v) => setForm({ ...form, qrSumMinor: v })}
                className="text-right tabular-nums"
                disabled={locked}
                data-test-id="field-qr-sum"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('external_code')}>
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
        </DocumentMetaPanel>

        {/* Summary card — prepayment always a DECREASE */}
        <div className="mt-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-muted)]">{tFields('sum')}:</span>
            <span className="font-medium text-[var(--ms-text-brand)] tabular-nums">
              {'−'}
              {formatMoney(form.sumMinor || '0')}
            </span>
          </div>
          {splitActive && (
            <div className="mt-1 grid grid-cols-3 gap-2 border-[var(--ms-border-default)] border-t pt-1 text-[var(--ms-text-muted)] text-xs">
              <span>
                {t('cash_sum')}: {formatMoney(form.cashSumMinor || '0')}
              </span>
              <span>
                {t('no_cash_sum')}: {formatMoney(form.noCashSumMinor || '0')}
              </span>
              <span>
                {t('qr_sum')}: {formatMoney(form.qrSumMinor || '0')}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6">
          <DetailContentTabs
            auditEntity="Prepayment"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tFields('sum')}
            filesSlot={<AttachmentsSection entity="Prepayment" entityId={data.id} />}
          >
            {/* No position table — prepayment is a single-sum money doc. */}
            <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ms-text-muted)]">{tFields('sum')}</span>
                <span className="font-medium text-[var(--ms-text-brand)] tabular-nums">
                  {'−'}
                  {formatMoney(data.sumMinor, data.currency)}
                </span>
              </div>
              {(BigInt(data.cashSumMinor || '0') > 0n ||
                BigInt(data.noCashSumMinor || '0') > 0n ||
                BigInt(data.qrSumMinor || '0') > 0n) && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-[var(--ms-border-default)] border-t pt-3 text-xs">
                  <div>
                    <div className="text-[var(--ms-text-muted)]">{t('cash_sum')}</div>
                    <div className="font-medium tabular-nums">
                      {formatMoney(data.cashSumMinor, data.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--ms-text-muted)]">{t('no_cash_sum')}</div>
                    <div className="font-medium tabular-nums">
                      {formatMoney(data.noCashSumMinor, data.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--ms-text-muted)]">{t('qr_sum')}</div>
                    <div className="font-medium tabular-nums">
                      {formatMoney(data.qrSumMinor, data.currency)}
                    </div>
                  </div>
                </div>
              )}
              {data.customerOrder && (
                <div className="mt-2 flex items-center justify-between border-[var(--ms-border-default)] border-t pt-2">
                  <span className="text-[var(--ms-text-muted)]">{t('customer_order')}</span>
                  <a
                    href={`/customer-orders/${data.customerOrder.id}`}
                    className="text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
                  >
                    {data.customerOrder.name}
                  </a>
                </div>
              )}
            </div>
          </DetailContentTabs>
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
            customerOrderId: '',
            customerOrderLabel: '',
          });
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
          setForm({
            ...form,
            organizationId: item.id,
            organizationLabel: String(item.primary),
            organizationAccountId: null,
            organizationAccountLabel: '',
          });
        }}
      />
      <CatalogPicker
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tFields('contract')}
        fetcher={contractFetcher}
        onSelect={(item) => {
          setForm({ ...form, contractId: item.id, contractLabel: String(item.primary) });
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tFields('project')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setForm({ ...form, projectId: item.id, projectLabel: String(item.primary) });
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
        }}
      />
      <CatalogPicker
        open={openPicker === 'customerOrder'}
        onClose={() => setOpenPicker(null)}
        title={t('customer_order')}
        fetcher={customerOrderFetcher}
        onSelect={(item) => {
          setForm({
            ...form,
            customerOrderId: item.id,
            customerOrderLabel: String(item.primary),
          });
        }}
      />
    </div>
  );
}
