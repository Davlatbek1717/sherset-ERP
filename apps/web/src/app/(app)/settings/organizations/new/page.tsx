'use client';

import {
  type OrgAccountCard,
  OrganizationAccountsEditor,
} from '@/components/organization-accounts-editor';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import {
  Checkbox,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  Textarea,
} from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const TEXTAREA_CLASS =
  'w-full min-h-[80px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)]';

type CompanyType = 'legalUZ' | 'entrepreneurUZ' | 'individualUZ';

export default function NewOrganizationPage() {
  const router = useRouter();
  const t = useTranslations('pages.organizations');
  const _tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [legalTitle, setLegalTitle] = useState('');
  const [companyType, setCompanyType] = useState<CompanyType>('legalUZ');
  const [legalAddress, setLegalAddress] = useState('');
  const [inn, setInn] = useState('');
  const [okoned, setOkoned] = useState('');
  const [mfo, setMfo] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [director, setDirector] = useState('');
  const [directorPosition, setDirectorPosition] = useState('');
  const [chiefAccountant, setChiefAccountant] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [payerVat, setPayerVat] = useState(true);
  // moysklad «Расчётные счета» — a new org can be created with its accounts in one
  // shot (the create form carries the same cards as the edit form). Starts empty;
  // «+ Расчётный счёт» adds.
  const [accounts, setAccounts] = useState<OrgAccountCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('name_required'));
      if (accounts.some((a) => !a.name.trim())) throw new Error(t('account_name_required'));
      return api.post<{ id: string }>('/admin/organizations', {
        name,
        legalTitle: legalTitle || undefined,
        companyType,
        legalAddress: legalAddress || undefined,
        email: email || undefined,
        phone: phone || undefined,
        director: director || undefined,
        directorPosition: directorPosition || undefined,
        chiefAccountant: chiefAccountant || undefined,
        externalCode: externalCode || undefined,
        payerVat,
        uzRequisites:
          inn || okoned || mfo
            ? { inn: inn || undefined, okoned: okoned || undefined, mfo: mfo || undefined }
            : undefined,
        // New org's accounts (all new — no id/version). Omitted when none added.
        ...(accounts.length
          ? {
              accounts: accounts.map((c) => ({
                name: c.name,
                currency: c.currency,
                isDefault: c.isDefault,
                bic: c.bic,
                bankName: c.bankName,
                bankLocation: c.bankLocation,
                accountNumber: c.accountNumber,
                correspondentAccount: c.correspondentAccount,
              })),
            }
          : {}),
      });
    },
    onSuccess: (created) => router.push(`/settings/organizations/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="organizations-new-page"
      title={t('new_title')}
      breadcrumbs={[
        { label: t('title'), href: '/settings/organizations' },
        { label: t('new_title') },
      ]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/organizations"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={t('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={t('name_placeholder')}
              data-test-id="field-name"
            />
          </FormField>
          <FormField id="legalTitle" label={t('legal_title')}>
            <Input
              value={legalTitle}
              onChange={(e) => setLegalTitle(e.target.value)}
              placeholder={t('legal_title_placeholder')}
              data-test-id="field-legal-title"
            />
          </FormField>
        </div>
        <FormField id="companyType" label={t('company_type')}>
          <NativeSelect
            id="companyType"
            value={companyType}
            onChange={(e) => setCompanyType(e.target.value as CompanyType)}
            className={SELECT_CLASS}
            data-test-id="field-company-type"
          >
            <option value="legalUZ">{t('types.legalUZ')}</option>
            <option value="entrepreneurUZ">{t('types.entrepreneurUZ')}</option>
            <option value="individualUZ">{t('types.individualUZ')}</option>
          </NativeSelect>
        </FormField>
        <FormField id="legalAddress" label={t('legal_address')}>
          <Textarea
            id="legalAddress"
            value={legalAddress}
            onChange={(e) => setLegalAddress(e.target.value)}
            className={TEXTAREA_CLASS}
            placeholder={t('legal_address_placeholder')}
            data-test-id="field-legal-address"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_uz')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField id="inn" label={t('inn')}>
            <Input
              value={inn}
              onChange={(e) => setInn(e.target.value)}
              placeholder={t('inn_placeholder')}
              data-test-id="field-inn"
            />
          </FormField>
          <FormField id="okoned" label={t('okoned')}>
            <Input
              value={okoned}
              onChange={(e) => setOkoned(e.target.value)}
              data-test-id="field-okoned"
            />
          </FormField>
          <FormField id="mfo" label={t('mfo')}>
            <Input value={mfo} onChange={(e) => setMfo(e.target.value)} data-test-id="field-mfo" />
          </FormField>
        </div>
      </FormSection>

      <FormSection title={t('section_contact')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="email" label={t('email')}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('email_placeholder')}
              data-test-id="field-email"
            />
          </FormField>
          <FormField id="phone" label={t('phone')}>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('phone_placeholder')}
              data-test-id="field-phone"
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title={t('section_management')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="director" label={t('director')}>
            <Input
              value={director}
              onChange={(e) => setDirector(e.target.value)}
              data-test-id="field-director"
            />
          </FormField>
          <FormField id="directorPosition" label={t('director_position')}>
            <Input
              value={directorPosition}
              onChange={(e) => setDirectorPosition(e.target.value)}
              data-test-id="field-director-position"
            />
          </FormField>
        </div>
        <FormField id="chiefAccountant" label={t('chief_accountant')}>
          <Input
            value={chiefAccountant}
            onChange={(e) => setChiefAccountant(e.target.value)}
            data-test-id="field-chief-accountant"
          />
        </FormField>
        <FormField id="externalCode" label={t('external_code')}>
          <Input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            data-test-id="field-external-code"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_accounts')}>
        <OrganizationAccountsEditor value={accounts} onChange={setAccounts} />
      </FormSection>

      <FormSection title={t('section_tax')}>
        <FormField id="payerVat" label="">
          <label
            htmlFor="payerVat"
            className="inline-flex cursor-pointer items-center gap-2 text-sm"
          >
            <Checkbox
              id="payerVat"
              checked={payerVat}
              onCheckedChange={(v) => setPayerVat(!!v)}
              data-test-id="field-payer-vat"
            />
            <span>{t('payer_vat')}</span>
          </label>
        </FormField>
      </FormSection>
    </EditForm>
  );
}
