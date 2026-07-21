'use client';

import { useAuditLabels } from '@/hooks/use-audit-labels';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useDocumentHistory } from '@/hooks/use-document-history';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
import {
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  EditForm,
  FormField,
  FormSection,
  HistoryTimeline,
  Input,
  MoneyInput,
  NativeSelect,
  type PickerItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
type Currency = (typeof CURRENCIES)[number];

const CONTRACT_TYPES = ['Sales', 'Commission'] as const;
type ContractType = (typeof CONTRACT_TYPES)[number];

interface ContractDetail {
  id: string;
  name: string;
  code: string | null;
  contractType: string;
  ownAgentId: string;
  agentId: string;
  currency: string;
  rateValue: string;
  sumMinor: string;
  rewardPercent: number | null;
  rewardType: string | null;
  moment: string;
  description: string | null;
  archived: boolean;
  agent: { id: string; name: string } | null;
  ownAgent: { id: string; name: string } | null;
}

function isoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

export default function EditContractPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.contracts');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const userDefaults = useUserDefaults();
  const tFields = useTranslations('fields');
  const tAudit = useTranslations('audit');
  const editFormLabels = useEditFormLabels();
  const { runDestructive } = useDestructiveMutation();
  const { translateAction, translateField, translateValue } = useAuditLabels('Contract');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [moment, setMoment] = useState<string | null>(null);
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

  const { data, isLoading } = useQuery<ContractDetail>({
    queryKey: ['contract', id],
    queryFn: () => api.get<ContractDetail>(`/contracts/${id}`),
    enabled: !!id,
  });

  const historyQuery = useDocumentHistory('Contract', id);
  const historyEntries = historyQuery.data?.items ?? [];

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCode(data.code ?? '');
    setMoment(isoDate(data.moment));
    setContractType((data.contractType as ContractType) ?? 'Sales');
    setCurrency((data.currency as Currency) ?? 'UZS');
    setSumMinor(data.sumMinor ?? '0');
    setRewardPercent(data.rewardPercent != null ? String(data.rewardPercent) : '');
    setDescription(data.description ?? '');
    setOwnAgentId(data.ownAgentId);
    setOwnAgentLabel(data.ownAgent?.name ?? '');
    setAgentId(data.agentId);
    setAgentLabel(data.agent?.name ?? '');
  }, [data]);

  const updateMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('err_name_required'));
      if (!ownAgentId) throw new Error(t('err_org_required'));
      if (!agentId) throw new Error(t('err_agent_required'));
      return api.patch<ContractDetail>(`/contracts/${id}`, {
        name,
        // null (not undefined) so emptying a field persists the clear.
        code: code || null,
        contractType,
        ownAgentId,
        agentId,
        currency,
        sumMinor,
        moment: moment ? new Date(moment).toISOString() : undefined,
        rewardPercent:
          contractType === 'Commission' && rewardPercent !== '' ? Number(rewardPercent) : null,
        description: description || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract', id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<ContractDetail>(`/contracts/${id}/archive`, {}),
    onSuccess: () => router.push('/contracts'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post<ContractDetail>(`/contracts/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/contracts/${id}`),
    onSuccess: () => router.push('/contracts'),
    onError: (e: Error) => setError(e.message),
  });

  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle?: string | null }>;
    }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle?: string | null }>;
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

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  const mainForm = (
    <FormSection title={tForm('section_main')}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="name" label={t('field_name')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} data-test-id="field-name" />
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
            <option value="Sales">{t('contract_type_sales')}</option>
            <option value="Commission">{t('contract_type_commission')}</option>
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
          <Input value={code} onChange={(e) => setCode(e.target.value)} data-test-id="field-code" />
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
  );

  return (
    <>
      <EditForm
        {...editFormLabels}
        testId="contracts-edit-page"
        title={t('edit_title')}
        breadcrumbs={[{ label: t('title'), href: '/contracts' }, { label: data.name }]}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          updateMut.mutate();
        }}
        cancelHref="/contracts"
        saving={updateMut.isPending}
        error={error}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={archivedTone(data.archived)}>
            {data.archived ? tCommon('archived') : tCommon('active')}
          </Badge>
          <div className="flex items-center gap-2">
            {data.archived ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => restoreMut.mutate()}
                loading={restoreMut.isPending}
              >
                {tCommon('restore')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="tertiary"
                onClick={() => archiveMut.mutate()}
                loading={archiveMut.isPending}
              >
                {tCommon('archive')}
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                runDestructive({
                  title: tCommon('delete_confirm', { name: data.name }),
                  run: () => deleteMut.mutateAsync(),
                })
              }
              loading={deleteMut.isPending}
            >
              {tCommon('delete')}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="main" className="w-full" data-test-id="contract-tabs">
          <TabsList>
            <TabsTrigger value="main" data-test-id="tab-main">
              {t('tab_main')}
            </TabsTrigger>
            <TabsTrigger value="history" data-test-id="tab-history">
              {t('tab_changes')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="main">{mainForm}</TabsContent>

          <TabsContent value="history">
            {historyQuery.isLoading ? (
              <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
            ) : (
              <HistoryTimeline
                entries={historyEntries}
                emptyLabel={tAudit('history_empty')}
                translateAction={translateAction}
                translateField={translateField}
                translateValue={translateValue}
              />
            )}
          </TabsContent>
        </Tabs>
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
