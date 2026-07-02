'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import { DetailContentTabs, DetailHeader, DetailToolbar } from '@/components/document-detail';
import { DocumentTasksSection } from '@/components/document-tasks-section';
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
  type PickerItem,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface OperationDetail {
  id: string;
  targetKind: string;
  invoiceInId: string | null;
  purchaseOrderId: string | null;
  amountMinor: string;
  invoiceIn: {
    id: string;
    name: string;
    state: string;
    sumMinor: string;
    payedSumMinor: string;
  } | null;
  purchaseOrder: {
    id: string;
    name: string;
    state: string;
    sumMinor: string;
    payedSumMinor: string;
  } | null;
}

interface PaymentDetail {
  id: string;
  version: number;
  name: string;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
  paymentPurpose: string | null;
  expenseItem: string | null;
  sumMinor: string;
  agent: { id: string; name: string; legalTitle: string | null; companyType: string };
  organization: { id: string; name: string; legalTitle: string | null };
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  agentAccount: { id: string; accountNumber: string } | null;
  externalCode: string | null;
  owner: { id: string; name: string } | null;
  operations: OperationDetail[];
  createdAt: string;
  updatedAt: string;
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
  externalCode: string;
  paymentPurpose: string;
  expenseItem: string;
  description: string;
  sumMinor: string;
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
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.accountNumber || d.organizationAccount?.name || '',
    agentAccountId: d.agentAccount?.id ?? null,
    agentAccountLabel: d.agentAccount?.accountNumber ?? '',
    externalCode: d.externalCode ?? '',
    paymentPurpose: d.paymentPurpose ?? '',
    expenseItem: d.expenseItem ?? '',
    description: d.description ?? '',
    sumMinor: d.sumMinor,
    operations: d.operations.map((op) => {
      const target = op.invoiceIn ?? op.purchaseOrder;
      return {
        _uid: op.id,
        targetKind: op.targetKind as OperationKind,
        targetId: op.invoiceInId ?? op.purchaseOrderId,
        targetLabel: target?.name ?? '—',
        targetHint: target ? `${target.state} · ${formatMoney(target.sumMinor)}` : '',
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
    organizationAccountId: s.organizationAccountId,
    agentAccountId: s.agentAccountId,
    externalCode: s.externalCode,
    paymentPurpose: s.paymentPurpose,
    expenseItem: s.expenseItem,
    description: s.description,
    sumMinor: s.sumMinor,
    operations: s.operations.map((op) => ({
      targetKind: op.targetKind,
      targetId: op.targetId,
      amountMinor: op.amountMinor,
    })),
    attributes: s.attributes,
  });
}

export default function PaymentOutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('payments-out', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.payments_out');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.payment_out');

  const { data, isLoading } = useQuery<PaymentDetail>({
    queryKey: ['payment-out', id],
    queryFn: () => api.get(`/payments-out/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
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

  const totalAllocated = useMemo(
    () => form?.operations.reduce((acc, o) => acc + BigInt(o.amountMinor || '0'), 0n) ?? 0n,
    [form],
  );

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/payments-out/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-out', id] });
      qc.invalidateQueries({ queryKey: ['payments-out'] });
      for (const op of data?.operations ?? []) {
        if (op.invoiceInId) qc.invalidateQueries({ queryKey: ['invoice-in', op.invoiceInId] });
        if (op.purchaseOrderId)
          qc.invalidateQueries({ queryKey: ['purchase-order', op.purchaseOrderId] });
      }
      qc.invalidateQueries({ queryKey: ['invoices-in'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const onConflict = useConflictReload(['payment-out', id], () => setForm(null));

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error(t('err_form_not_loaded'));
      const sum = BigInt(form.sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      for (const [i, op] of form.operations.entries()) {
        if (!op.targetId) throw new Error(t('err_op_doc', { n: i + 1 }));
        if (BigInt(op.amountMinor || '0') <= 0n) throw new Error(t('err_op_sum', { n: i + 1 }));
      }
      if (totalAllocated > sum) {
        throw new Error(t('err_alloc_over'));
      }
      const payload = {
        version: data.version,
        agentId: form.agentId,
        organizationId: form.organizationId,
        contractId: form.contractId,
        projectId: form.projectId,
        organizationAccountId: form.organizationAccountId,
        agentAccountId: form.agentAccountId,
        // Send null (not undefined) so emptying a field persists the clear —
        // update() skips undefined keys but writes null. Mirrors externalCode.
        externalCode: form.externalCode || null,
        paymentPurpose: form.paymentPurpose || null,
        expenseItem: form.expenseItem || null,
        description: form.description || null,
        sumMinor: form.sumMinor,
        operations: form.operations.map((op) => ({
          targetKind: op.targetKind,
          invoiceInId: op.targetKind === 'invoicein' ? op.targetId : undefined,
          purchaseOrderId: op.targetKind === 'purchaseorder' ? op.targetId : undefined,
          amountMinor: op.amountMinor,
        })),
        attributes: form.attributes,
      };
      return api.patch(`/payments-out/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-out', id] });
      qc.invalidateQueries({ queryKey: ['payments-out'] });
      setForm(null);
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/payments-out/${id}/clone`, {}),
    onSuccess: (cloned) => router.push(`/payments-out/${cloned.id}`),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/payments-out/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments-out'] });
      router.push('/payments-out');
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
  const expenseItemFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/expense-items?search=${encodeURIComponent(s)}&limit=50`,
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

  const invoiceInFetcher = async (s: string): Promise<PickerItem[]> => {
    const qs = new URLSearchParams({ limit: '50' });
    if (s) qs.set('search', s);
    if (form?.agentId) qs.set('agentId', form.agentId);
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
    if (form?.agentId) qs.set('agentId', form.agentId);
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
  const addOp = (kind: OperationKind) => {
    setForm((f) =>
      f
        ? {
            ...f,
            operations: [
              ...f.operations,
              {
                _uid: uid(),
                targetKind: kind,
                targetId: null,
                targetLabel: '',
                targetHint: '',
                amountMinor: '0',
              },
            ],
          }
        : f,
    );
  };
  const removeOp = (rowUid: string) => {
    setForm((f) => (f ? { ...f, operations: f.operations.filter((o) => o._uid !== rowUid) } : f));
  };

  const remaining = BigInt(form.sumMinor || '0') - totalAllocated;
  const targetPicker =
    typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'target'
      ? openPicker
      : null;

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="payment-out-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => {
          setSaveError(null);
          saveMut.mutate();
        }}
        onClose={() => router.push('/payments-out')}
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
        printEntity="paymentout"
      />
      <DetailHeader
        titlePrefix={tDetailTitles('payment_out')}
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
            <DocumentMetaField label={tFields('payment_purpose')}>
              <Input
                value={form.paymentPurpose}
                onChange={(e) => setForm({ ...form, paymentPurpose: e.target.value })}
                disabled={locked}
                data-test-id="field-payment-purpose"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('posted_at')}>
              <Input
                value={data.postedAt ? formatDate(data.postedAt) : ''}
                disabled
                placeholder="—"
                data-test-id="field-posted-at"
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

          <DocumentMetaRow>
            {/* «Статья расходов» — expense item (moysklad parity). Now editable
               on a draft; persisting it is what makes the list filter live. */}
            <DocumentMetaField label={tFields('expense_item')}>
              <CatalogPickerField
                value={form.expenseItem ? { id: form.expenseItem, label: form.expenseItem } : null}
                placeholder={tFields('expense_item')}
                onPick={() => !locked && setOpenPicker('expenseItem')}
                onClear={() => !locked && setForm({ ...form, expenseItem: '' })}
                disabled={locked}
                testId="field-expense-item"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tDetailForm('external_code')}>
              <Input
                value={form.externalCode}
                onChange={(e) => setForm({ ...form, externalCode: e.target.value })}
                disabled={locked}
                data-test-id="field-external-code"
              />
            </DocumentMetaField>
          </DocumentMetaRow>
        </DocumentMetaPanel>

        <div className="mt-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-muted)]">{t('allocated')}:</span>
            <span className="font-medium tabular-nums">{formatMoney(totalAllocated)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-muted)]">{t('remainder')}:</span>
            <span className="font-medium tabular-nums">{formatMoney(remaining)}</span>
          </div>
        </div>

        <div className="mt-6">
          <DetailContentTabs
            auditEntity="PaymentOut"
            entityId={data.id}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="PaymentOut" entityId={data.id} />}
            positionsLabel={tDetailTabs('paid_documents')}
          >
            <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
              <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-3 py-2">
                <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                  {tForm('section_allocation')} — {form.operations.length} (
                  {formatMoney(totalAllocated)} / {formatMoney(form.sumMinor || '0')})
                </span>
              </div>
              <div className="p-3">
                {form.operations.length === 0 ? (
                  <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
                    {t('allocation_empty')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[120px,1fr,160px,40px] gap-2 px-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                      <div>{t('allocation_kind')}</div>
                      <div>{t('allocation_doc')}</div>
                      <div className="text-right">{t('alloc_col_amount')}</div>
                      <div />
                    </div>
                    {form.operations.map((op) => (
                      <div
                        key={op._uid}
                        className="grid grid-cols-[120px,1fr,160px,40px] items-center gap-2"
                        data-test-id={`operation-row-${op._uid}`}
                      >
                        <div className="text-sm">
                          {op.targetKind === 'invoicein'
                            ? t('kind_invoicein')
                            : t('kind_purchaseorder')}
                        </div>
                        <CatalogPickerField
                          value={op.targetId ? { id: op.targetId, label: op.targetLabel } : null}
                          placeholder={
                            !form.agentId
                              ? t('select_payer_first')
                              : op.targetKind === 'invoicein'
                                ? tForm('select_invoice')
                                : tForm('select_advance_po')
                          }
                          onPick={() => {
                            if (locked) return;
                            if (!form.agentId) {
                              setSaveError(t('select_payer_first'));
                              return;
                            }
                            setOpenPicker({
                              kind: 'target',
                              rowUid: op._uid,
                              targetKind: op.targetKind,
                            });
                          }}
                          onClear={() =>
                            !locked &&
                            updateOp(op._uid, { targetId: null, targetLabel: '', targetHint: '' })
                          }
                          disabled={locked}
                        />
                        <MoneyInput
                          valueMinor={op.amountMinor}
                          onChangeMinor={(v) => updateOp(op._uid, { amountMinor: v })}
                          className="text-right tabular-nums"
                          disabled={locked}
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => removeOp(op._uid)}
                          disabled={locked}
                          aria-label={t('remove_row')}
                        >
                          <Icons.close className="h-4 w-4" />
                        </Button>
                        {op.targetHint && (
                          <div className="col-span-4 text-[var(--ms-text-muted)] text-xs">
                            {op.targetHint}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!locked && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => addOp('invoicein')}
                      data-test-id="add-operation-invoicein"
                    >
                      <Icons.create className="h-4 w-4" />
                      {t('add_invoicein')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => addOp('purchaseorder')}
                      data-test-id="add-operation-purchaseorder"
                    >
                      <Icons.create className="h-4 w-4" />
                      {t('add_advance')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </DetailContentTabs>
        </div>

        {/* Inline Задачи collapsible — moysklad parity (bottom of the document
            body, outside the tab strip), mirroring the other detail pages. */}
        <div className="mt-6 flex flex-col gap-3">
          <DocumentTasksSection entity="PaymentOut" entityId={data.id} />
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="PaymentOut"
            values={form.attributes}
            onChange={(next) => setForm({ ...form, attributes: next })}
            disabled={locked}
            testIdPrefix="payment-out"
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
        open={openPicker === 'expenseItem'}
        onClose={() => setOpenPicker(null)}
        title={tFields('expense_item')}
        fetcher={expenseItemFetcher}
        onSelect={(item) => {
          setForm({ ...form, expenseItem: String(item.primary) });
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
        open={!!targetPicker && targetPicker.targetKind === 'invoicein'}
        onClose={() => setOpenPicker(null)}
        title={tForm('invoice_picker_title')}
        fetcher={invoiceInFetcher}
        onSelect={(item) => {
          if (!targetPicker) return;
          const raw = (item as PickerItem & { raw?: InvoiceInRef & { remaining: string } }).raw;
          updateOp(targetPicker.rowUid, {
            targetId: item.id,
            targetLabel: String(item.primary),
            targetHint: item.secondary as string,
            amountMinor: raw?.remaining ?? '0',
          });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={!!targetPicker && targetPicker.targetKind === 'purchaseorder'}
        onClose={() => setOpenPicker(null)}
        title={tForm('advance_po_picker_title')}
        fetcher={purchaseOrderFetcher}
        onSelect={(item) => {
          if (!targetPicker) return;
          const raw = (item as PickerItem & { raw?: PurchaseOrderRef & { remaining: string } }).raw;
          updateOp(targetPicker.rowUid, {
            targetId: item.id,
            targetLabel: String(item.primary),
            targetHint: item.secondary as string,
            amountMinor: raw?.remaining ?? '0',
          });
          setOpenPicker(null);
        }}
      />
    </div>
  );
}
