'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import {
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  EditForm,
  FormField,
  FormSection,
  Input,
  MoneyInput,
  NativeSelect,
  type PickerItem,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
type Currency = (typeof CURRENCIES)[number];

const CONTRACT_TYPES = ['Sales', 'Commission'] as const;
type ContractType = (typeof CONTRACT_TYPES)[number];

interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function NewContractPage() {
  const router = useRouter();
  const t = useTranslations('pages.contracts');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [moment, setMoment] = useState<string | null>(todayIso());
  const [contractType, setContractType] = useState<ContractType>('Sales');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [sumMinor, setSumMinor] = useState('0');
  const [rewardPercent, setRewardPercent] = useState('');
  const [description, setDescription] = useState('');

  const [ownAgentId, setOwnAgentId] = useState<string | null>(null);
  const [ownAgentLabel, setOwnAgentLabel] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');

  const [openPicker, setOpenPicker] = useState<null | 'org' | 'agent'>(null);
  const [error, setError] = useState<string | null>(null);

  // Default the organisation to the first one (mirrors money-doc forms).
  useEffect(() => {
    if (orgsData?.items[0] && !ownAgentId) {
      setOwnAgentId(orgsData.items[0].id);
      setOwnAgentLabel(orgsData.items[0].name);
    }
  }, [orgsData, ownAgentId]);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('err_name_required'));
      if (!ownAgentId) throw new Error(t('err_org_required'));
      if (!agentId) throw new Error(t('err_agent_required'));
      return api.post<{ id: string }>('/contracts', {
        name,
        code: code || undefined,
        contractType,
        ownAgentId,
        agentId,
        currency,
        sumMinor,
        moment: moment ? new Date(moment).toISOString() : undefined,
        rewardPercent:
          contractType === 'Commission' && rewardPercent !== '' ? Number(rewardPercent) : undefined,
        description: description || undefined,
      });
    },
    onSuccess: (created) => router.push(`/contracts/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/counterparties?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };

  return (
    <>
      <EditForm
        {...editFormLabels}
        testId="contracts-new-page"
        title={t('new_title')}
        breadcrumbs={[{ label: t('title'), href: '/contracts' }, { label: t('new_title') }]}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          createMut.mutate();
        }}
        cancelHref="/contracts"
        saving={createMut.isPending}
        error={error}
      >
        <FormSection title={tForm('section_main')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField id="name" label={t('field_name')} required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder={t('name_placeholder')}
                data-test-id="field-name"
              />
            </FormField>
            <FormField id="moment" label={t('field_moment')}>
              <DatePicker value={moment} onChange={setMoment} testId="field-moment" />
            </FormField>
            <FormField id="ownAgent" label={tFields('organization')} required>
              <CatalogPickerField
                value={ownAgentId ? { id: ownAgentId, label: ownAgentLabel } : null}
                placeholder={tFields('organization')}
                onPick={() => setOpenPicker('org')}
                onClear={() => {
                  setOwnAgentId(null);
                  setOwnAgentLabel('');
                }}
                testId="field-own-agent"
              />
            </FormField>
            <FormField id="contractType" label={t('field_contract_type')} required>
              <NativeSelect
                id="contractType"
                value={contractType}
                onChange={(e) => setContractType(e.target.value as ContractType)}
                className={SELECT_CLASS}
                data-test-id="field-contract-type"
              >
                {CONTRACT_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {t(`contract_type_${ct === 'Sales' ? 'sales' : 'commission'}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="currency" label={t('field_currency')} required>
              <NativeSelect
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className={SELECT_CLASS}
                data-test-id="field-currency"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="code" label={t('field_code')}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                data-test-id="field-code"
              />
            </FormField>
            <FormField id="sumMinor" label={t('field_sum')}>
              <MoneyInput
                valueMinor={sumMinor}
                onChangeMinor={(v) => setSumMinor(v)}
                className="text-right"
                data-test-id="field-sum-minor"
              />
            </FormField>
            <FormField id="agent" label={tFields('agent')} required>
              <CatalogPickerField
                value={agentId ? { id: agentId, label: agentLabel } : null}
                placeholder={tFields('agent')}
                onPick={() => setOpenPicker('agent')}
                onClear={() => {
                  setAgentId(null);
                  setAgentLabel('');
                }}
                onCreate={() => router.push('/counterparties/new')}
                createLabel={tForm('create_new_counterparty')}
                testId="field-agent"
              />
            </FormField>
            {contractType === 'Commission' && (
              <FormField id="rewardPercent" label={t('field_reward_percent')}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={rewardPercent}
                  onChange={(e) => setRewardPercent(e.target.value)}
                  data-test-id="field-reward-percent"
                />
              </FormField>
            )}
          </div>
          <FormField id="description" label={tFields('description')}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-test-id="field-description"
            />
          </FormField>
        </FormSection>
      </EditForm>

      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOwnAgentId(item.id);
          setOwnAgentLabel(String(item.primary));
        }}
      />
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
    </>
  );
}
