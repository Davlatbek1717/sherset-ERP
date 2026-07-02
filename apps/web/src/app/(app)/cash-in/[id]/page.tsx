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
  invoiceOutId: string | null;
  amountMinor: string;
  invoiceOut: {
    id: string;
    name: string;
    state: string;
    sumMinor: string;
    payedSumMinor: string;
  } | null;
}

interface CashInDetail {
  id: string;
  version: number;
  name: string;
  externalCode: string | null;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  description: string | null;
  paymentPurpose: string | null;
  sumMinor: string;
  currency: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string; legalTitle: string | null };
  cashDesk: { id: string; name: string; currency: string; balanceMinor: string };
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  operations: OperationDetail[];
  createdAt: string;
  updatedAt: string;
}

interface InvoiceOutRef {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  payedSumMinor: string;
}

interface OperationRow {
  _uid: string;
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
  cashDeskId: string;
  cashDeskLabel: string;
  contractId: string | null;
  contractLabel: string;
  projectId: string | null;
  projectLabel: string;
  paymentPurpose: string;
  externalCode: string;
  description: string;
  sumMinor: string;
  operations: OperationRow[];
  attributes: Record<string, unknown>;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function formFromData(d: CashInDetail): FormState {
  return {
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    cashDeskId: d.cashDesk.id,
    cashDeskLabel: d.cashDesk.name,
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    paymentPurpose: d.paymentPurpose ?? '',
    externalCode: d.externalCode ?? '',
    description: d.description ?? '',
    sumMinor: d.sumMinor,
    operations: d.operations.map((op) => ({
      _uid: op.id,
      targetId: op.invoiceOutId,
      targetLabel: op.invoiceOut?.name ?? '—',
      targetHint: op.invoiceOut ? `${op.invoiceOut.state}` : '',
      amountMinor: op.amountMinor,
    })),
    attributes: (d as { attributes?: Record<string, unknown> }).attributes ?? {},
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify({
    agentId: s.agentId,
    organizationId: s.organizationId,
    cashDeskId: s.cashDeskId,
    contractId: s.contractId,
    projectId: s.projectId,
    paymentPurpose: s.paymentPurpose,
    externalCode: s.externalCode,
    description: s.description,
    sumMinor: s.sumMinor,
    operations: s.operations.map((op) => ({
      targetId: op.targetId,
      amountMinor: op.amountMinor,
    })),
    attributes: s.attributes,
  });
}

export default function CashInDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('cash-in', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.cash_in');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailHeader = useTranslations('detail_header');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailForm = useTranslations('detail_form');
  const tStates = useTranslations('states.cash_in');

  const { data, isLoading } = useQuery<CashInDetail>({
    queryKey: ['cash-in', id],
    queryFn: () => api.get(`/cash-in/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'cashdesk'
    | 'contract'
    | 'project'
    | { kind: 'invoice'; rowUid: string }
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

  const onConflict = useConflictReload(['cash-in', id], () => setForm(null));

  const transitionMut = useApiMutation({
    mutationFn: (target: string) => api.post(`/cash-in/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-in', id] });
      qc.invalidateQueries({ queryKey: ['cash-in'] });
      for (const op of data?.operations ?? []) {
        if (op.invoiceOutId) qc.invalidateQueries({ queryKey: ['invoice-out', op.invoiceOutId] });
      }
      qc.invalidateQueries({ queryKey: ['invoices-out'] });
      qc.invalidateQueries({ queryKey: ['cash-desks'] });
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
      const payload = {
        version: data.version,
        agentId: form.agentId,
        organizationId: form.organizationId,
        cashDeskId: form.cashDeskId,
        contractId: form.contractId,
        projectId: form.projectId,
        // Send null (not undefined) so emptying a field persists the clear —
        // update() skips undefined keys but writes null. Mirrors externalCode.
        paymentPurpose: form.paymentPurpose || null,
        description: form.description || null,
        externalCode: form.externalCode || null,
        sumMinor: form.sumMinor,
        operations: form.operations.map((op) => ({
          targetKind: 'invoiceout',
          invoiceOutId: op.targetId,
          amountMinor: op.amountMinor,
        })),
        attributes: form.attributes,
      };
      return api.patch(`/cash-in/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-in', id] });
      qc.invalidateQueries({ queryKey: ['cash-in'] });
      setForm(null);
    },
    onError: (err: Error) => {
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/cash-in/${id}/clone`, {}),
    onSuccess: (cloned) => router.push(`/cash-in/${cloned.id}`),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/cash-in/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-in'] });
      router.push('/cash-in');
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

  const cashDeskFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: { id: string; name: string; currency: string }[] }>(
      `/cash-desks?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.currency }));
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

  const invoiceOutFetcher = async (s: string): Promise<PickerItem[]> => {
    const qs = new URLSearchParams({ limit: '50' });
    if (s) qs.set('search', s);
    if (form?.agentId) qs.set('agentId', form.agentId);
    const d = await api.get<{ items: InvoiceOutRef[] }>(`/invoices-out?${qs.toString()}`);
    return d.items
      .filter((inv) => inv.state === 'posted' || inv.state === 'partially_paid')
      .map((inv) => {
        const remaining = BigInt(inv.sumMinor) - BigInt(inv.payedSumMinor);
        return {
          id: inv.id,
          primary: inv.name,
          secondary: t('invoice_remaining', { state: inv.state, amount: formatMoney(remaining) }),
          raw: { ...inv, remaining: remaining.toString() },
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
  const addOp = () => {
    setForm((f) =>
      f
        ? {
            ...f,
            operations: [
              ...f.operations,
              { _uid: uid(), targetId: null, targetLabel: '', targetHint: '', amountMinor: '0' },
            ],
          }
        : f,
    );
  };
  const removeOp = (rowUid: string) => {
    setForm((f) => (f ? { ...f, operations: f.operations.filter((o) => o._uid !== rowUid) } : f));
  };

  const remaining = BigInt(form.sumMinor || '0') - totalAllocated;

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="cash-in-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => {
          setSaveError(null);
          saveMut.mutate();
        }}
        onClose={() => router.push('/cash-in')}
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
        printEntity="cashin"
      />
      <DetailHeader
        titlePrefix={tDetailTitles('cash_in')}
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
                  !locked && setForm({ ...form, organizationId: '', organizationLabel: '' })
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
            <DocumentMetaField label={t('cash_desk')} required>
              <CatalogPickerField
                value={form.cashDeskId ? { id: form.cashDeskId, label: form.cashDeskLabel } : null}
                placeholder={t('cash_desk')}
                onPick={() => !locked && setOpenPicker('cashdesk')}
                onClear={() => !locked && setForm({ ...form, cashDeskId: '', cashDeskLabel: '' })}
                disabled={locked}
                testId="field-cashdesk"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('sum')} required>
              <MoneyInput
                valueMinor={form.sumMinor}
                onChangeMinor={(v) => setForm({ ...form, sumMinor: v })}
                className="text-right tabular-nums"
                disabled={locked}
                data-test-id="field-sum-minor"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={tFields('basis')}>
              <Input
                value={form.paymentPurpose}
                onChange={(e) => setForm({ ...form, paymentPurpose: e.target.value })}
                disabled={locked}
                data-test-id="field-payment-purpose"
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
            <DocumentMetaField label={tFields('description')}>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={locked}
                data-test-id="field-description"
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
          <div className="mt-1 flex justify-between border-[var(--ms-border-default)] border-t pt-1">
            <span className="text-[var(--ms-text-muted)]">{t('cash_desk_balance')}:</span>
            <span className="font-medium tabular-nums">
              {data.cashDesk.balanceMinor ? formatMoney(data.cashDesk.balanceMinor) : '—'}
            </span>
          </div>
        </div>

        <div className="mt-6">
          <DetailContentTabs
            auditEntity="CashIn"
            entityId={data.id}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="CashIn" entityId={data.id} />}
            positionsLabel={tDetailTabs('paid_documents')}
          >
            <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
              <div className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-3 py-2">
                <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                  {t('allocation_title', { count: form.operations.length })}
                </span>
              </div>
              <div className="p-3">
                {form.operations.length === 0 ? (
                  <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm">
                    {t('allocation_empty')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr,160px,40px] gap-2 px-2 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                      <div>{t('alloc_col_invoice')}</div>
                      <div className="text-right">{t('alloc_col_amount')}</div>
                      <div />
                    </div>
                    {form.operations.map((op) => (
                      <div
                        key={op._uid}
                        className="grid grid-cols-[1fr,160px,40px] items-center gap-2"
                        data-test-id={`operation-row-${op._uid}`}
                      >
                        <CatalogPickerField
                          value={op.targetId ? { id: op.targetId, label: op.targetLabel } : null}
                          placeholder={
                            !form.agentId ? t('select_payer_first') : t('select_invoice')
                          }
                          onPick={() => {
                            if (locked) return;
                            if (!form.agentId) {
                              setSaveError(t('select_payer_first'));
                              return;
                            }
                            setOpenPicker({ kind: 'invoice', rowUid: op._uid });
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
                          <div className="col-span-3 text-[var(--ms-text-muted)] text-xs">
                            {op.targetHint}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!locked && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={addOp}
                    className="mt-2"
                    data-test-id="add-operation"
                  >
                    <Icons.create className="h-4 w-4" />
                    {t('add_invoice')}
                  </Button>
                )}
              </div>
            </div>
          </DetailContentTabs>
        </div>

        {/* Inline Задачи collapsible — moysklad parity (bottom of the document
            body, outside the tab strip), mirroring the other detail pages. */}
        <div className="mt-6 flex flex-col gap-3">
          <DocumentTasksSection entity="CashIn" entityId={data.id} />
        </div>

        <div className="mt-4">
          <AttributesEditor
            entity="CashIn"
            values={form.attributes}
            onChange={(next) => setForm({ ...form, attributes: next })}
            disabled={locked}
            testIdPrefix="cash-in"
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
          setForm({ ...form, organizationId: item.id, organizationLabel: String(item.primary) });
          setOpenPicker(null);
        }}
      />
      <CatalogPicker
        open={openPicker === 'cashdesk'}
        onClose={() => setOpenPicker(null)}
        title={t('cash_desk')}
        fetcher={cashDeskFetcher}
        onSelect={(item) => {
          setForm({ ...form, cashDeskId: item.id, cashDeskLabel: String(item.primary) });
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
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'invoice'
        }
        onClose={() => setOpenPicker(null)}
        title={t('invoice_picker_title')}
        fetcher={invoiceOutFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          const raw = (item as PickerItem & { raw?: InvoiceOutRef & { remaining: string } }).raw;
          updateOp(openPicker.rowUid, {
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
