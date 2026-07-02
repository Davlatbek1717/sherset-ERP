'use client';

/**
 * /prepayment-returns/[id] — detail/edit view for a PrepaymentReturn document.
 *
 * Mirrors /prepayments/[id], but:
 *   - prepaymentId is required and fixed once the draft exists (read-only).
 *   - Agent + org are read-only — locked to the source prepayment's values.
 *   - No customerOrderId field.
 *   - No clone button (onClone omitted).
 *   - Source prepayment sub-card in the summary area.
 *   - Sum column uses «+» with warning color (INCREASE to customer balance).
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

interface PrepaymentReturnDetail {
  id: string;
  name: string;
  state: string;
  version: number;
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
  prepayment: { id: string; name: string; sumMinor: string; state: string } | null;
  /** Source advance still refundable (source.sumMinor − other applicable returns). */
  prepaymentRemainingMinor: string | null;
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  organizationAccount: { id: string; name: string; accountNumber: string | null } | null;
  agentAccount: { id: string; accountNumber: string } | null;
  owner: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  sumMinor: string;
  cashSumMinor: string;
  noCashSumMinor: string;
  qrSumMinor: string;
  currency: string;
  description: string;
  externalCode: string;
  organizationAccountId: string | null;
  organizationAccountLabel: string;
  agentAccountId: string | null;
  agentAccountLabel: string;
}

function formFromData(d: PrepaymentReturnDetail): FormState {
  return {
    sumMinor: d.sumMinor,
    cashSumMinor: d.cashSumMinor,
    noCashSumMinor: d.noCashSumMinor,
    qrSumMinor: d.qrSumMinor,
    currency: d.currency,
    description: d.description ?? '',
    externalCode: d.externalCode ?? '',
    organizationAccountId: d.organizationAccount?.id ?? null,
    organizationAccountLabel:
      d.organizationAccount?.accountNumber || d.organizationAccount?.name || '',
    agentAccountId: d.agentAccount?.id ?? null,
    agentAccountLabel: d.agentAccount?.accountNumber ?? '',
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify(s);
}

/** Returns true when at least one retail split field is non-zero. */
function hasSplit(cash: string, noCash: string, qr: string): boolean {
  return BigInt(cash || '0') > 0n || BigInt(noCash || '0') > 0n || BigInt(qr || '0') > 0n;
}

export default function PrepaymentReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('prepayment-returns', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.prepayment_return');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.prepayment_return');

  const { data, isLoading } = useQuery<PrepaymentReturnDetail>({
    queryKey: ['prepayment-returns', id],
    queryFn: () => api.get(`/prepayment-returns/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<null | 'organizationAccount' | 'agentAccount'>(null);
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
    mutationFn: (target: string) => api.post(`/prepayment-returns/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prepayment-returns', id] });
      qc.invalidateQueries({ queryKey: ['prepayment-returns'] });
      qc.invalidateQueries({ queryKey: ['counterparty-balance'] });
    },
  });

  const onConflict = useConflictReload(['prepayment-returns', id], () => setForm(null));

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form) throw new Error(t('err_form_not_loaded'));
      if (!data) throw new Error(t('err_form_not_loaded'));
      const sum = BigInt(form.sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      if (splitMismatch) throw new Error(t('retail_split_hint'));
      return api.patch(`/prepayment-returns/${id}`, {
        // Optimistic-lock token — sourced from the LOADED query data (not the
        // editable form state) so a stale copy is rejected with 409. (lock cohort)
        version: data.version,
        sumMinor: form.sumMinor,
        // Retail split fields are non-nullable BigInt @default(0) columns and
        // UpdatePrepaymentReturnSchema is `.strict()` with `bigintMinor.optional()`
        // (string|undefined — `null` is REJECTED). Send '0', never null, so a
        // non-retail save isn't rejected with a 400. (audit 2026-06-03g)
        cashSumMinor: form.cashSumMinor || '0',
        noCashSumMinor: form.noCashSumMinor || '0',
        qrSumMinor: form.qrSumMinor || '0',
        // currency intentionally NOT sent — a refund is locked to the source
        // advance's currency; the backend rejects currency on update. (2026-06-03g)
        description: form.description || null,
        externalCode: form.externalCode || null,
        organizationAccountId: form.organizationAccountId,
        agentAccountId: form.agentAccountId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prepayment-returns', id] });
      qc.invalidateQueries({ queryKey: ['prepayment-returns'] });
      setForm(null);
    },
    onError: (err: Error) => {
      // The reload dialog (onConflict) owns optimistic-lock 409s — keep the raw
      // message out of the inline banner so saveError stays null for conflicts.
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/prepayment-returns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prepayment-returns'] });
      router.push('/prepayment-returns');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const organizationAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    const params = new URLSearchParams({ search: s, limit: '50' });
    if (data?.organization?.id) params.set('organizationId', data.organization.id);
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
    if (!data?.agent?.id) return [];
    const d = await api.get<Array<{ id: string; accountNumber: string; bankName: string | null }>>(
      `/counterparties/${data.agent.id}/bank-accounts`,
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

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data || !form) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const locked = data.applicable;
  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  const sourceSumBig = BigInt(data.prepayment?.sumMinor ?? '0');

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="prepayment-return-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => {
          setSaveError(null);
          saveMut.mutate();
        }}
        onClose={() => router.push('/prepayment-returns')}
        position={detailNav.position}
        onPrev={detailNav.onPrev}
        onNext={detailNav.onNext}
        apiData={data}
        // No clone — each refund is one-off (onClone omitted intentionally).
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
        titlePrefix={tDetailTitles('prepayment_return')}
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
          {/* Source prepayment — read-only, always shown */}
          <DocumentMetaRow>
            <DocumentMetaField label={t('source_prepayment')} required>
              {data.prepayment ? (
                <a
                  href={`/prepayments/${data.prepayment.id}`}
                  className="block rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
                  data-test-id="field-source-prepayment"
                >
                  {data.prepayment.name} — {formatMoney(data.prepayment.sumMinor, data.currency)}
                </a>
              ) : (
                <span className="text-[var(--ms-text-muted)] text-sm">—</span>
              )}
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

          {/* Agent + Org — inherited from source prepayment, read-only */}
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('organization')} required>
              <Input value={data.organization.name} disabled data-test-id="field-organization" />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('agent')} required>
              <Input value={data.agent.name} disabled data-test-id="field-agent" />
            </DocumentMetaField>
          </DocumentMetaRow>

          {/* Contract + Project — inherited from source prepayment, read-only */}
          <DocumentMetaRow>
            <DocumentMetaField label={tFields('contract')}>
              <Input value={data.contract?.name ?? '—'} disabled data-test-id="field-contract" />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('project')}>
              <Input value={data.project?.name ?? '—'} disabled data-test-id="field-project" />
            </DocumentMetaField>
          </DocumentMetaRow>

          {/* Bank accounts — editable on the refund itself (moysklad parity) */}
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

          {/* Sum + currency */}
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
            <DocumentMetaField label={tFields('currency')}>
              {/* Currency is inherited from the source prepayment and is NOT
                  editable on the return (like agent/org above) — a refund is
                  always booked in the advance's currency. (2026-06-03g) */}
              <Input value={data.currency} disabled data-test-id="field-currency" />
            </DocumentMetaField>
          </DocumentMetaRow>

          {/* Retail split */}
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

          {/* External code + description */}
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
        </DocumentMetaPanel>

        {/* Summary card — PrepaymentReturn is always an INCREASE to customer balance */}
        <div className="mt-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-muted)]">{tFields('sum')}:</span>
            <span className="font-medium text-[var(--ms-text-warning)] tabular-nums">
              {'+'}
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

          {/* Source prepayment sub-card */}
          {data.prepayment && (
            <div className="mt-2 border-[var(--ms-border-default)] border-t pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ms-text-muted)]">{t('source_prepayment')}:</span>
                <a
                  href={`/prepayments/${data.prepayment.id}`}
                  className="text-[var(--ms-text-brand)] text-xs underline-offset-2 hover:underline"
                  data-test-id="summary-source-prepayment-link"
                >
                  {data.prepayment.name} — {formatMoney(data.prepayment.sumMinor, data.currency)}
                </a>
              </div>
              <div className="mt-0.5 text-right text-[var(--ms-text-muted)] text-xs">
                {/* Net of prior applicable returns (backend prepaymentRemainingMinor),
                    so it matches the post-time over-return cap. (2026-06-03g) */}
                {t('remaining_refundable')}:{' '}
                {formatMoney(data.prepaymentRemainingMinor ?? String(sourceSumBig), data.currency)}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          <DetailContentTabs
            auditEntity="PrepaymentReturn"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={tFields('sum')}
            filesSlot={<AttachmentsSection entity="PrepaymentReturn" entityId={data.id} />}
          >
            {/* No position table — PrepaymentReturn is a single-sum money doc. */}
            <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ms-text-muted)]">{tFields('sum')}</span>
                <span className="font-medium text-[var(--ms-text-warning)] tabular-nums">
                  {'+'}
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
              {data.prepayment && (
                <div className="mt-2 flex items-center justify-between border-[var(--ms-border-default)] border-t pt-2">
                  <span className="text-[var(--ms-text-muted)]">{t('source_prepayment')}</span>
                  <a
                    href={`/prepayments/${data.prepayment.id}`}
                    className="text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
                  >
                    {data.prepayment.name}
                  </a>
                </div>
              )}
            </div>
          </DetailContentTabs>
        </div>
      </main>

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
    </div>
  );
}
