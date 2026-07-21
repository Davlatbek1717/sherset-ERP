'use client';

/**
 * /counterparty-adjustments/[id] — detail/edit view for a manual balance
 * adjustment. Mirrors cash-in/[id] minus operations: nothing to split,
 * just one delta against one counterparty.
 *
 * Locking: when `applicable=true`, the editor is read-only. The user must
 * toggle Provedeno off (which triggers POST /transitions/unpost on the
 * backend) before changing direction/sum/agent — otherwise the balance
 * touch would silently drift from the document.
 */

import { AttachmentsSection } from '@/components/attachments-section';
import { DetailContentTabs, DetailHeader, DetailToolbar } from '@/components/document-detail';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDetailNavigation } from '@/hooks/use-detail-navigation';
import { useSaveMutation } from '@/hooks/use-save-mutation';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
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
  SegmentedControl,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Direction = 'INCREASE' | 'DECREASE';

interface AdjustmentDetail {
  id: string;
  version: number;
  name: string;
  state: string;
  applicable: boolean;
  moment: string;
  postedAt: string | null;
  direction: Direction;
  sumMinor: string;
  currency: string;
  description: string | null;
  externalCode: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string; legalTitle: string | null };
  contract: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
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
  direction: Direction;
  sumMinor: string;
  currency: string;
  description: string;
  externalCode: string;
}

function formFromData(d: AdjustmentDetail): FormState {
  return {
    agentId: d.agent.id,
    agentLabel: d.agent.name,
    organizationId: d.organization.id,
    organizationLabel: d.organization.name,
    contractId: d.contract?.id ?? null,
    contractLabel: d.contract?.name ?? '',
    projectId: d.project?.id ?? null,
    projectLabel: d.project?.name ?? '',
    direction: d.direction,
    sumMinor: d.sumMinor,
    currency: d.currency,
    description: d.description ?? '',
    externalCode: d.externalCode ?? '',
  };
}

function snapshot(s: FormState): string {
  return JSON.stringify(s);
}

export default function CounterpartyAdjustmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detailNav = useDetailNavigation('counterparty-adjustments', id);
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.counterparty_adjustment');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const userDefaults = useUserDefaults();
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.counterparty_adjustment');

  const { data, isLoading } = useQuery<AdjustmentDetail>({
    queryKey: ['counterparty-adjustments', id],
    queryFn: () => api.get(`/counterparty-adjustments/${id}`),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [openPicker, setOpenPicker] = useState<null | 'agent' | 'org' | 'contract' | 'project'>(
    null,
  );
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

  const onConflict = useConflictReload(['counterparty-adjustments', id], () => setForm(null));

  const transitionMut = useApiMutation({
    mutationFn: (target: string) =>
      api.post(`/counterparty-adjustments/${id}/transitions/${target}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['counterparty-adjustments', id] });
      qc.invalidateQueries({ queryKey: ['counterparty-adjustments'] });
      qc.invalidateQueries({ queryKey: ['counterparty-balance'] });
    },
  });

  const saveMut = useSaveMutation({
    mutationFn: async () => {
      if (!form || !data) throw new Error(t('err_form_not_loaded'));
      const sum = BigInt(form.sumMinor || '0');
      if (sum <= 0n) throw new Error(t('err_sum_positive'));
      return api.patch(`/counterparty-adjustments/${id}`, {
        // Optimistic-lock token — sourced from the LOADED query data (not the
        // editable form state) so it reflects the version the user opened.
        version: data.version,
        agentId: form.agentId,
        organizationId: form.organizationId,
        contractId: form.contractId,
        projectId: form.projectId,
        direction: form.direction,
        sumMinor: form.sumMinor,
        currency: form.currency,
        description: form.description || null,
        externalCode: form.externalCode || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['counterparty-adjustments', id] });
      qc.invalidateQueries({ queryKey: ['counterparty-adjustments'] });
      setForm(null);
    },
    onError: (err: Error) => {
      // The conflict dialog (via onConflict) owns the optimistic-lock 409 —
      // don't ALSO render it as a raw inline banner.
      if (isOptimisticConflict(err)) return;
      setSaveError(err.message);
    },
    onConflict,
  });

  const cloneMut = useApiMutation({
    mutationFn: () => api.post<{ id: string }>(`/counterparty-adjustments/${id}/clone`, {}),
    onSuccess: (cloned) => router.push(`/counterparty-adjustments/${cloned.id}`),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete(`/counterparty-adjustments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['counterparty-adjustments'] });
      router.push('/counterparty-adjustments');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    const items = d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
    return pinDefaultCustomer(
      items,
      userDefaults.data?.defaultCustomer,
      s,
      tForm('pinned_default'),
    );
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
      data-test-id="counterparty-adjustment-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => {
          setSaveError(null);
          saveMut.mutate();
        }}
        onClose={() => router.push('/counterparty-adjustments')}
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
        titlePrefix={tDetailTitles('counterparty_adjustment')}
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
                onClear={() => !locked && setForm({ ...form, agentId: '', agentLabel: '' })}
                disabled={locked}
                testId="field-agent"
              />
            </DocumentMetaField>
          </DocumentMetaRow>

          <DocumentMetaRow>
            <DocumentMetaField label={t('direction')} required>
              <SegmentedControl<Direction>
                value={form.direction}
                onChange={(v) => setForm({ ...form, direction: v })}
                disabled={locked}
                ariaLabel={t('direction')}
                options={[
                  {
                    value: 'INCREASE',
                    label: t('direction_increase'),
                    'data-test-id': 'direction-increase',
                  },
                  {
                    value: 'DECREASE',
                    label: t('direction_decrease'),
                    'data-test-id': 'direction-decrease',
                  },
                ]}
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
        </DocumentMetaPanel>

        <div className="mt-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--ms-text-muted)]">{t('direction')}:</span>
            <span className="font-medium tabular-nums">
              {form.direction === 'INCREASE' ? '+' : '−'}
              {formatMoney(form.sumMinor || '0')}
            </span>
          </div>
          <div className="mt-1 flex justify-between border-[var(--ms-border-default)] border-t pt-1 text-[var(--ms-text-muted)] text-xs">
            <span>
              {form.direction === 'INCREASE'
                ? t('direction_increase_hint')
                : t('direction_decrease_hint')}
            </span>
          </div>
        </div>

        <div className="mt-6">
          <DetailContentTabs
            auditEntity="CounterpartyAdjustment"
            entityId={data.id}
            relatedGroups={[]}
            positionsLabel={t('direction')}
            filesSlot={<AttachmentsSection entity="CounterpartyAdjustment" entityId={data.id} />}
          >
            {/* No position table: the adjustment is a single delta. The
                "positions" tab acts as a summary card so the tab strip
                stays consistent with other money docs. */}
            <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ms-text-muted)]">{t('direction')}</span>
                <span className="font-medium">
                  {data.direction === 'INCREASE'
                    ? t('direction_increase')
                    : t('direction_decrease')}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[var(--ms-text-muted)]">{tFields('sum')}</span>
                <span className="font-medium tabular-nums">
                  {data.direction === 'INCREASE' ? '+' : '−'}
                  {formatMoney(data.sumMinor, data.currency)}
                </span>
              </div>
              <p className="mt-3 text-[var(--ms-text-muted)] text-xs">
                {data.direction === 'INCREASE'
                  ? t('direction_increase_hint')
                  : t('direction_decrease_hint')}
              </p>
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
          setForm({ ...form, agentId: item.id, agentLabel: String(item.primary) });
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
          setForm({ ...form, organizationId: item.id, organizationLabel: String(item.primary) });
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
    </div>
  );
}
