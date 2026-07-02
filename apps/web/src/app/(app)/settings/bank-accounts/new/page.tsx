'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import {
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  type PickerItem,
} from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
type Currency = (typeof CURRENCIES)[number];

interface OrgRef {
  id: string;
  name: string;
  legalTitle: string | null;
}

export default function NewBankAccountPage() {
  const router = useRouter();
  const t = useTranslations('pages.bank_accounts');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bic, setBic] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      if (!organizationId)
        throw new Error(tCommon('field_required', { field: tFields('organization') }));
      return api.post<{ id: string }>('/admin/organization-accounts', {
        name,
        organizationId,
        isDefault,
        currency,
        bankName: bankName || undefined,
        accountNumber: accountNumber || undefined,
        bic: bic || undefined,
      });
    },
    onSuccess: (created) => router.push(`/settings/bank-accounts/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: OrgRef[] }>(
      `/admin/organizations?${s ? `search=${encodeURIComponent(s)}` : ''}&limit=50`,
    );
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };

  return (
    <EditForm
      {...editFormLabels}
      testId="bank-accounts-new-page"
      title={t('new_title')}
      breadcrumbs={[
        { label: t('title'), href: '/settings/bank-accounts' },
        { label: t('new_title') },
      ]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/bank-accounts"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={tForm('section_main')}>
        <FormField id="name" label={t('name')} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder={t('name_placeholder')}
            data-test-id="field-name"
          />
        </FormField>
        <FormField id="organization" label={t('organization')} required>
          <CatalogPickerField
            value={organizationId ? { id: organizationId, label: organizationLabel } : null}
            placeholder={t('select_organization')}
            onPick={() => setPickerOpen(true)}
            onClear={() => {
              setOrganizationId(null);
              setOrganizationLabel('');
            }}
            testId="field-organization"
          />
        </FormField>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="currency" label={t('currency')}>
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
          <FormField id="isDefault" label="">
            <label
              htmlFor="isDefault"
              className="mt-7 inline-flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id="isDefault"
                checked={isDefault}
                onCheckedChange={(v) => setIsDefault(!!v)}
                data-test-id="field-is-default"
              />
              <span>{t('is_default')}</span>
            </label>
          </FormField>
        </div>
      </FormSection>

      <FormSection title={t('bank_name')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="bankName" label={t('bank_name')}>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              data-test-id="field-bank-name"
            />
          </FormField>
          <FormField id="bic" label={t('bic')}>
            <Input value={bic} onChange={(e) => setBic(e.target.value)} data-test-id="field-bic" />
          </FormField>
        </div>
        <FormField id="accountNumber" label={t('account_number')}>
          <Input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            data-test-id="field-account-number"
          />
        </FormField>
      </FormSection>

      <CatalogPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
    </EditForm>
  );
}
