'use client';

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
import {
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  type PickerItem,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface CounterpartyRef {
  id: string;
  name: string;
  legalTitle: string | null;
}
interface ContactPersonRef {
  id: string;
  name: string;
}
interface StageRef {
  id: string;
  name: string;
  type: 'open' | 'won' | 'lost';
  position: number;
  color: string | null;
}
interface PipelineRef {
  id: string;
  name: string;
  isDefault: boolean;
  stages: StageRef[];
}

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const TEXTAREA_CLASS =
  'w-full min-h-[96px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)]';

export default function NewOpportunityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('pages.opportunities');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const userDefaults = useUserDefaults();

  const fromCounterpartyId = searchParams.get('counterpartyId');

  const [name, setName] = useState('');
  const [pipelineId, setPipelineId] = useState<string>('');
  const [stageId, setStageId] = useState<string>('');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(fromCounterpartyId);
  const [counterpartyLabel, setCounterpartyLabel] = useState('');
  const [contactPersonId, setContactPersonId] = useState<string | null>(null);
  const [contactPersonLabel, setContactPersonLabel] = useState('');
  const [amountSom, setAmountSom] = useState('0');
  const [currency, setCurrency] = useState('UZS');
  const [probability, setProbability] = useState<string>('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [source, setSource] = useState('');
  const [description, setDescription] = useState('');
  const [pickerCp, setPickerCp] = useState(false);
  const [pickerPerson, setPickerPerson] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: pipelines } = useQuery<{ items: PipelineRef[] }>({
    queryKey: ['pipelines-active'],
    queryFn: () => api.get<{ items: PipelineRef[] }>('/pipelines?archived=false&limit=50'),
  });

  // Pick default pipeline + first open stage on first load
  useEffect(() => {
    if (pipelineId || !pipelines?.items?.length) return;
    const def = pipelines.items.find((p) => p.isDefault) ?? pipelines.items[0];
    if (!def) return;
    setPipelineId(def.id);
    const firstOpen = def.stages.find((s) => s.type === 'open') ?? def.stages[0];
    if (firstOpen) setStageId(firstOpen.id);
  }, [pipelines, pipelineId]);

  // When pipeline changes, re-pick its first open stage
  useEffect(() => {
    if (!pipelineId || !pipelines?.items) return;
    const pipe = pipelines.items.find((p) => p.id === pipelineId);
    if (!pipe) return;
    const stillValid = pipe.stages.some((s) => s.id === stageId);
    if (stillValid) return;
    const firstOpen = pipe.stages.find((s) => s.type === 'open') ?? pipe.stages[0];
    if (firstOpen) setStageId(firstOpen.id);
  }, [pipelineId, pipelines, stageId]);

  useEffect(() => {
    if (!fromCounterpartyId || counterpartyLabel) return;
    api
      .get<CounterpartyRef>(`/counterparties/${fromCounterpartyId}`)
      .then((cp) => {
        setCounterpartyLabel(cp.name);
      })
      .catch(() => {});
  }, [fromCounterpartyId, counterpartyLabel]);

  useEffect(() => {
    setContactPersonId(null);
    setContactPersonLabel('');
  }, [counterpartyId]);

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

  const currentPipeline = pipelines?.items?.find((p) => p.id === pipelineId);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(tCommon('field_required', { field: t('name') }));
      if (!stageId) throw new Error(t('select_stage'));

      const amountTiyin = BigInt(Math.round(Number.parseFloat(amountSom || '0') * 100));
      const body: Record<string, unknown> = {
        name,
        pipelineId,
        stageId,
        amount: amountTiyin.toString(),
        currency,
        ...(counterpartyId ? { counterpartyId } : {}),
        ...(contactPersonId ? { contactPersonId } : {}),
        ...(probability ? { probability: Number(probability) } : {}),
        ...(expectedCloseDate
          ? { expectedCloseDate: new Date(expectedCloseDate).toISOString() }
          : {}),
        ...(source ? { source } : {}),
        ...(description ? { description } : {}),
      };
      return api.post<{ id: string }>('/opportunities', body);
    },
    onSuccess: (created) =>
      router.push(
        fromCounterpartyId
          ? `/counterparties/${fromCounterpartyId}`
          : `/opportunities/${created.id}`,
      ),
    onError: (e: Error) => setError(e.message),
  });

  const handleSave = () => {
    setError(null);
    createMut.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="opportunity-new-page"
    >
      <DetailToolbar
        isDirty={!!(name || stageId)}
        isSaving={createMut.isPending}
        onSave={handleSave}
        onClose={() =>
          router.push(
            fromCounterpartyId ? `/counterparties/${fromCounterpartyId}` : '/opportunities',
          )
        }
        createMenuItems={[]}
      />
      <DetailHeader
        titlePrefix=""
        name=""
        moment={new Date().toISOString()}
        stateLabel={tCommon('new_state')}
        stateTone="neutral"
        stateSlug="new"
        applicable={false}
        customTitle={t('new_title')}
      />
      {error && (
        <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
          {error}
        </div>
      )}
      <main className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <FormSection title={tForm('section_main')}>
            <FormField id="name" label={t('name')} required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="Q3 enterprise contract"
                data-test-id="field-name"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="pipeline" label={t('pipeline')} required>
                <NativeSelect
                  id="pipeline"
                  value={pipelineId}
                  onChange={(e) => setPipelineId(e.target.value)}
                  className={SELECT_CLASS}
                  data-test-id="field-pipeline"
                >
                  {pipelines?.items?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isDefault ? ` (${tCommon('default')})` : ''}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="stage" label={t('stage')} required>
                <NativeSelect
                  id="stage"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className={SELECT_CLASS}
                  data-test-id="field-stage"
                  disabled={!currentPipeline}
                >
                  {currentPipeline?.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
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
                  onChange={(e) => setAmountSom(e.target.value)}
                  data-test-id="field-amount"
                />
              </FormField>
              <FormField id="currency" label={t('currency')}>
                <NativeSelect
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
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
                  onChange={(e) => setProbability(e.target.value)}
                  placeholder="50"
                  data-test-id="field-probability"
                />
              </FormField>
            </div>
            <FormField id="expectedCloseDate" label={t('expected_close_date')}>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
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
                }}
                disabled={!!fromCounterpartyId}
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
                  onChange={(e) => setSource(e.target.value)}
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
                onChange={(e) => setDescription(e.target.value)}
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
            }}
          />
        </div>
      </main>
    </form>
  );
}
