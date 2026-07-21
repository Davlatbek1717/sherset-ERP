'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { DocumentTabs } from '@/components/document-tabs';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { opportunityStatusTone } from '@/lib/domain-status-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
import {
  Alert,
  Avatar,
  Button,
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  type PickerItem,
  Textarea,
  formatDate,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type StageType = 'open' | 'won' | 'lost';
type StatusValue = StageType;

interface OpportunityDetail {
  id: string;
  version: number;
  number: string;
  name: string;
  amount: string;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  closedAt: string | null;
  source: string | null;
  description: string | null;
  lostReason: string | null;
  status: StatusValue;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  stage: {
    id: string;
    name: string;
    type: StageType;
    color: string | null;
    probability: number;
  };
  pipeline: {
    id: string;
    name: string;
    stages: Array<{
      id: string;
      name: string;
      type: StageType;
      color: string | null;
      position: number;
    }>;
  };
  counterparty: { id: string; name: string; legalTitle: string | null; companyType: string } | null;
  contactPerson: {
    id: string;
    name: string;
    position: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  owner: { id: string; name: string; email: string } | null;
}

interface CounterpartyRef {
  id: string;
  name: string;
  legalTitle: string | null;
}
interface ContactPersonRef {
  id: string;
  name: string;
}
const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const TEXTAREA_CLASS =
  'w-full min-h-[96px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)]';

function amountSomFromTiyin(tiyin: string): string {
  const n = Number(BigInt(tiyin));
  return (n / 100).toFixed(2).replace(/\.?0+$/, '');
}

export default function OpportunityDetailPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.opportunities');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const userDefaults = useUserDefaults();
  const tDetailHeader = useTranslations('detail_header');

  // ── FSM transition state ─────────────────────────────────────────────────
  const [lostReasonInput, setLostReasonInput] = useState('');
  const [showLostInput, setShowLostInput] = useState(false);

  // ── Inline-edit field state ──────────────────────────────────────────────
  const [name, setName] = useState('');
  const [amountSom, setAmountSom] = useState('0');
  const [currency, setCurrency] = useState('UZS');
  const [probability, setProbability] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [source, setSource] = useState('');
  const [description, setDescription] = useState('');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [counterpartyLabel, setCounterpartyLabel] = useState('');
  const [contactPersonId, setContactPersonId] = useState<string | null>(null);
  const [contactPersonLabel, setContactPersonLabel] = useState('');
  const [pickerCp, setPickerCp] = useState(false);
  const [pickerPerson, setPickerPerson] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<OpportunityDetail>({
    queryKey: ['opportunity', id],
    queryFn: () => api.get<OpportunityDetail>(`/opportunities/${id}`),
    enabled: !!id,
  });

  // Hydrate form from server data; mark as pristine after load.
  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setAmountSom(amountSomFromTiyin(data.amount));
    setCurrency(data.currency);
    setProbability(data.probability != null ? String(data.probability) : '');
    setExpectedCloseDate(
      data.expectedCloseDate ? new Date(data.expectedCloseDate).toISOString().slice(0, 10) : '',
    );
    setSource(data.source ?? '');
    setDescription(data.description ?? '');
    setCounterpartyId(data.counterparty?.id ?? null);
    setCounterpartyLabel(data.counterparty?.legalTitle ?? data.counterparty?.name ?? '');
    setContactPersonId(data.contactPerson?.id ?? null);
    setContactPersonLabel(data.contactPerson?.name ?? '');
    setIsDirty(false);
  }, [data]);

  // Helper to mark dirty on any field change
  const mark =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setIsDirty(true);
    };

  const onConflict = useConflictReload(['opportunity', id]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const transitionMut = useApiMutation({
    mutationFn: ({ stageId, lostReason }: { stageId: string; lostReason?: string }) =>
      api.post<OpportunityDetail>(`/opportunities/${id}/transition`, {
        stageId,
        ...(lostReason ? { lostReason } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunity', id] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['opportunity-board'] });
      setShowLostInput(false);
      setLostReasonInput('');
    },
  });

  const updateMut = useApiMutation({
    mutationFn: async () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(tCommon('field_required', { field: t('name') }));
      const amountTiyin = BigInt(Math.round(Number.parseFloat(amountSom || '0') * 100));
      const body: Record<string, unknown> = {
        version: data.version,
        name,
        amount: amountTiyin.toString(),
        currency,
        ...(counterpartyId ? { counterpartyId } : { counterpartyId: null }),
        ...(contactPersonId ? { contactPersonId } : { contactPersonId: null }),
        ...(probability ? { probability: Number(probability) } : { probability: null }),
        ...(expectedCloseDate
          ? { expectedCloseDate: new Date(expectedCloseDate).toISOString() }
          : { expectedCloseDate: null }),
        source: source || null,
        description: description || null,
      };
      return api.patch<OpportunityDetail>(`/opportunities/${id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunity', id] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['opportunity-board'] });
      setIsDirty(false);
      setError(null);
    },
    onError: (e: unknown) => {
      if (isOptimisticConflict(e)) return;
      setError(e instanceof Error ? e.message : String(e));
    },
    onConflict,
  });

  const archiveMut = useApiMutation({
    mutationFn: (archive: boolean) =>
      api.post<unknown>(`/opportunities/${id}/${archive ? 'archive' : 'restore'}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunity', id] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete<unknown>(`/opportunities/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['opportunity-board'] });
      router.push('/opportunities');
    },
  });

  const { runDestructive } = useDestructiveMutation();

  // ── Pickers ──────────────────────────────────────────────────────────────
  const counterpartyFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: CounterpartyRef[] }>(
      `/counterparties?search=${encodeURIComponent(s)}&limit=50`,
    );
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

  const contactPersonFetcher = useMemo(
    () =>
      async (s: string): Promise<PickerItem[]> => {
        if (!counterpartyId) return [];
        const d = await api.get<{ items: ContactPersonRef[] }>(
          `/contact-persons?counterpartyId=${counterpartyId}&search=${encodeURIComponent(s)}&limit=50`,
        );
        return d.items.map((p) => ({ id: p.id, primary: p.name }));
      },
    [counterpartyId],
  );

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  // Sort stages by position; identify next/prev for quick transition
  const stages = [...data.pipeline.stages].sort((a, b) => a.position - b.position);
  const currentIdx = stages.findIndex((s) => s.id === data.stage.id);
  const nextStage =
    currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;
  const prevStage = currentIdx > 0 ? stages[currentIdx - 1] : null;
  const wonStage = stages.find((s) => s.type === 'won');
  const lostStage = stages.find((s) => s.type === 'lost');

  const handleSave = () => {
    setError(null);
    updateMut.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="opportunity-detail-page"
    >
      <DetailToolbar
        isDirty={isDirty}
        isSaving={updateMut.isPending}
        onSave={handleSave}
        onClose={() => router.push('/opportunities')}
        apiData={data}
        onDelete={
          !data.archived
            ? () =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.number }),
                  run: () => deleteMut.mutateAsync(),
                  successMessage: tCommon('saved'),
                })
            : undefined
        }
        createMenuItems={[]}
      />

      <DetailHeader
        titlePrefix=""
        name={data.number}
        moment={data.createdAt}
        stateLabel={data.archived ? tCommon('archived') : t(`statuses.${data.status}`)}
        stateTone={data.archived ? 'neutral' : opportunityStatusTone(data.status)}
        stateSlug={data.archived ? 'archived' : data.status}
        applicable={false}
        hideApplicable
        customTitle={
          <span data-test-id="detail-header-title-text">
            {data.number} — {data.name}
          </span>
        }
        pillsSlot={
          <>
            {data.status === 'open' && !data.archived && (
              <>
                {prevStage && (
                  <button
                    type="button"
                    onClick={() => transitionMut.mutate({ stageId: prevStage.id })}
                    disabled={transitionMut.isPending}
                    className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
                    data-test-id="action-prev-stage"
                  >
                    ← {prevStage.name}
                  </button>
                )}
                {nextStage && (
                  <button
                    type="button"
                    onClick={() => transitionMut.mutate({ stageId: nextStage.id })}
                    disabled={transitionMut.isPending}
                    className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-brand,#2563eb)] bg-[var(--ms-bg-brand,#2563eb)] px-2 py-0.5 text-white text-xs hover:opacity-90 disabled:opacity-50"
                    data-test-id="action-next-stage"
                  >
                    {nextStage.name} →
                  </button>
                )}
                {wonStage && data.stage.id !== wonStage.id && (
                  <button
                    type="button"
                    onClick={() => transitionMut.mutate({ stageId: wonStage.id })}
                    disabled={transitionMut.isPending}
                    className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
                    data-test-id="action-won"
                  >
                    {t('actions.won')}
                  </button>
                )}
                {lostStage && data.stage.id !== lostStage.id && (
                  <button
                    type="button"
                    onClick={() => setShowLostInput(true)}
                    disabled={transitionMut.isPending}
                    className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-muted)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
                    data-test-id="action-lost"
                  >
                    {t('actions.lost')}
                  </button>
                )}
              </>
            )}
            {data.archived && (
              <button
                type="button"
                onClick={() => archiveMut.mutate(false)}
                disabled={archiveMut.isPending}
                className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
                data-test-id="detail-header-restore"
              >
                {tCommon('restore')}
              </button>
            )}
            {!data.archived && (
              <button
                type="button"
                onClick={() => archiveMut.mutate(true)}
                disabled={archiveMut.isPending}
                className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-[var(--ms-text-primary)] text-xs hover:bg-[var(--ms-bg-muted)] disabled:opacity-50"
                data-test-id="detail-header-archive"
              >
                {tCommon('archive')}
              </button>
            )}
          </>
        }
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
        {error && !isOptimisticConflict(updateMut.error) && (
          <Alert tone="destructive" className="mb-3">
            {error}
          </Alert>
        )}

        {showLostInput && lostStage && (
          <div className="mb-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-destructive,#fecaca)] bg-[var(--ms-bg-destructive-soft,#fef2f2)] p-3">
            <label htmlFor="lost-reason-input" className="mb-2 block font-medium text-sm">
              {t('lost_reason')}
            </label>
            <div className="flex gap-2">
              <Input
                id="lost-reason-input"
                type="text"
                value={lostReasonInput}
                onChange={(e) => setLostReasonInput(e.target.value)}
                placeholder="..."
                className="flex-1"
                data-test-id="lost-reason-input"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() =>
                  transitionMut.mutate({ stageId: lostStage.id, lostReason: lostReasonInput })
                }
                disabled={transitionMut.isPending}
                data-test-id="lost-confirm"
              >
                {t('actions.lost')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowLostInput(false)}
              >
                {tCommon('cancel')}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <FormSection title={tForm('section_main')}>
            <FormField id="name" label={t('name')} required>
              <Input
                value={name}
                onChange={(e) => mark(setName)(e.target.value)}
                placeholder="Q3 enterprise contract"
                data-test-id="field-name"
              />
            </FormField>

            {/* Stage info — read-only display; transitions happen via pills above */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="pipeline" label={t('pipeline')}>
                <Input
                  value={data.pipeline.name}
                  readOnly
                  className="cursor-default bg-[var(--ms-bg-muted)]"
                  data-test-id="field-pipeline"
                />
              </FormField>
              <FormField id="stage" label={t('stage')}>
                <div className="flex h-9 items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3">
                  {data.stage.color && (
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: data.stage.color }}
                    />
                  )}
                  <span
                    className="text-sm"
                    style={{ color: data.stage.color ?? 'var(--ms-text-primary)' }}
                    data-test-id="field-stage"
                  >
                    {data.stage.name}
                  </span>
                </div>
              </FormField>
            </div>
          </FormSection>

          <FormSection title={t('amount')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField id="amount" label={t('amount')}>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={amountSom}
                  onChange={(e) => mark(setAmountSom)(e.target.value)}
                  data-test-id="field-amount"
                />
              </FormField>
              <FormField id="currency" label={t('currency')}>
                <NativeSelect
                  id="currency"
                  value={currency}
                  onChange={(e) => mark(setCurrency)(e.target.value)}
                  className={SELECT_CLASS}
                  data-test-id="field-currency"
                >
                  <option value="UZS">UZS</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="RUB">RUB</option>
                </NativeSelect>
              </FormField>
              <FormField id="probability" label={t('probability')}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={probability}
                  onChange={(e) => mark(setProbability)(e.target.value)}
                  placeholder="50"
                  data-test-id="field-probability"
                />
              </FormField>
            </div>
            <FormField id="expectedCloseDate" label={t('expected_close_date')}>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => mark(setExpectedCloseDate)(e.target.value)}
                data-test-id="field-expected-close"
              />
            </FormField>
          </FormSection>

          <FormSection title={tForm('section_party') ?? t('counterparty')}>
            <FormField id="counterparty" label={t('counterparty')}>
              <CatalogPickerField
                value={counterpartyId ? { id: counterpartyId, label: counterpartyLabel } : null}
                placeholder={t('select_counterparty')}
                onPick={() => setPickerCp(true)}
                onClear={() => {
                  setCounterpartyId(null);
                  setCounterpartyLabel('');
                  // Clear the dependent contact person on a USER change only
                  // (not on hydration — that wiped the loaded value before).
                  setContactPersonId(null);
                  setContactPersonLabel('');
                  setIsDirty(true);
                }}
                testId="field-counterparty"
              />
            </FormField>

            <FormField id="contactPerson" label={t('contact_person')}>
              <CatalogPickerField
                value={contactPersonId ? { id: contactPersonId, label: contactPersonLabel } : null}
                placeholder={t('select_contact_person')}
                onPick={() => counterpartyId && setPickerPerson(true)}
                onClear={() => {
                  setContactPersonId(null);
                  setContactPersonLabel('');
                  setIsDirty(true);
                }}
                disabled={!counterpartyId}
                testId="field-contact-person"
              />
            </FormField>
          </FormSection>

          <FormSection title={tCommon('description')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="source" label={t('source')}>
                <Input
                  value={source}
                  onChange={(e) => mark(setSource)(e.target.value)}
                  placeholder="website / cold / referral"
                  data-test-id="field-source"
                />
              </FormField>
            </div>
            <FormField id="description" label={tCommon('description')}>
              <Textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => mark(setDescription)(e.target.value)}
                placeholder={tCommon('description')}
                className={TEXTAREA_CLASS}
                data-test-id="field-description"
              />
            </FormField>
          </FormSection>

          <CatalogPicker
            open={pickerCp}
            onClose={() => setPickerCp(false)}
            title={tForm('counterparty_picker_title')}
            fetcher={counterpartyFetcher}
            onSelect={(item) => {
              setCounterpartyId(item.id);
              setCounterpartyLabel(String(item.primary));
              // Changing the counterparty invalidates the chosen contact person.
              setContactPersonId(null);
              setContactPersonLabel('');
              setIsDirty(true);
            }}
          />
          <CatalogPicker
            open={pickerPerson}
            onClose={() => setPickerPerson(false)}
            title={t('select_contact_person')}
            fetcher={contactPersonFetcher}
            onSelect={(item) => {
              setContactPersonId(item.id);
              setContactPersonLabel(String(item.primary));
              setIsDirty(true);
            }}
          />

          <AttachmentsSection entity="Opportunity" entityId={data.id} />

          {/* Backend opportunity.service writes auditLog entity:'Opportunity' (PascalCase);
              the lowercase "opportunity" slug matched nothing → History tab was empty. */}
          <DocumentTabs auditEntity="Opportunity" entityId={data.id} relatedGroups={[]} />
        </div>
      </main>
    </form>
  );
}
