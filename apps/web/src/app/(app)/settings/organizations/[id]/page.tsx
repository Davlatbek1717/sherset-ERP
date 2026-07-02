'use client';

import {
  type OrgAccountCard,
  OrganizationAccountsEditor,
} from '@/components/organization-accounts-editor';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Badge,
  Button,
  Checkbox,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const TEXTAREA_CLASS =
  'w-full min-h-[80px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)]';

type CompanyType = 'legalUZ' | 'entrepreneurUZ' | 'individualUZ';

interface OrganizationDetail {
  id: string;
  name: string;
  legalTitle: string | null;
  companyType: CompanyType;
  legalAddress: string | null;
  email: string | null;
  phone: string | null;
  director: string | null;
  directorPosition: string | null;
  chiefAccountant: string | null;
  externalCode: string | null;
  payerVat: boolean;
  archived: boolean;
  version: number;
  uzRequisites: { inn?: string | null; okoned?: string | null; mfo?: string | null } | null;
  // moysklad «Расчётные счета» — the org's settlement accounts, edited inline.
  accounts: Array<{
    id: string;
    name: string;
    currency: string;
    isDefault: boolean;
    bankName: string | null;
    bankLocation: string | null;
    accountNumber: string | null;
    correspondentAccount: string | null;
    bic: string | null;
    balanceMinor: string;
    version: number;
  }>;
}

export default function EditOrganizationPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.organizations');
  const tCommon = useTranslations('common');
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
  const [accounts, setAccounts] = useState<OrgAccountCard[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onConflict = useConflictReload(['organization', id]);

  const { data, isLoading } = useQuery<OrganizationDetail>({
    queryKey: ['organization', id],
    queryFn: () => api.get<OrganizationDetail>(`/admin/organizations/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setLegalTitle(data.legalTitle ?? '');
    setCompanyType(data.companyType);
    setLegalAddress(data.legalAddress ?? '');
    setInn(data.uzRequisites?.inn ?? '');
    setOkoned(data.uzRequisites?.okoned ?? '');
    setMfo(data.uzRequisites?.mfo ?? '');
    setEmail(data.email ?? '');
    setPhone(data.phone ?? '');
    setDirector(data.director ?? '');
    setDirectorPosition(data.directorPosition ?? '');
    setChiefAccountant(data.chiefAccountant ?? '');
    setExternalCode(data.externalCode ?? '');
    setPayerVat(data.payerVat);
    // moysklad «Расчётный счёт» cards — key by the real id so edits/deletes are
    // tracked; null bank fields become '' for the controlled inputs.
    setAccounts(
      (data.accounts ?? []).map((a) => ({
        key: a.id,
        id: a.id,
        version: a.version,
        name: a.name,
        currency: a.currency,
        bic: a.bic ?? '',
        bankName: a.bankName ?? '',
        bankLocation: a.bankLocation ?? '',
        accountNumber: a.accountNumber ?? '',
        correspondentAccount: a.correspondentAccount ?? '',
        balanceMinor: a.balanceMinor,
        isDefault: a.isDefault,
      })),
    );
    setVersion(data.version);
  }, [data]);

  const updateMut = useMutation({
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(t('name_required'));
      // Every «Расчётный счёт» card needs its required name (the value shown in
      // document account pickers) before the bundle can save.
      if (accounts.some((a) => !a.name.trim())) throw new Error(t('account_name_required'));
      return api.patch<OrganizationDetail>(`/admin/organizations/${id}`, {
        name,
        // Header fields: send null (not undefined) so emptying a field persists
        // the clear — update() skips undefined keys but writes null (.nullish()).
        legalTitle: legalTitle || null,
        companyType,
        legalAddress: legalAddress || null,
        email: email || null,
        phone: phone || null,
        director: director || null,
        directorPosition: directorPosition || null,
        chiefAccountant: chiefAccountant || null,
        externalCode: externalCode || null,
        payerVat,
        version,
        // uzRequisites is a JSON column replaced wholesale: its inn/okoned/mfo
        // sub-fields stay `|| undefined` (their schema is .optional(), rejects
        // null; omitting a sub-key clears it via the wholesale replace). When
        // ALL three are empty, send null to clear the whole object (not undefined,
        // which would leave the old requisites untouched).
        uzRequisites:
          inn || okoned || mfo
            ? { inn: inn || undefined, okoned: okoned || undefined, mfo: mfo || undefined }
            : null,
        // FULL desired account set (replace semantics): cards with an id update,
        // cards without create, and any existing account dropped from the list is
        // deleted server-side (guarded by balance + ledger checks). Empty bank
        // fields are sent as-is — the API coerces '' → null.
        accounts: accounts.map((c) => ({
          // Existing card → send id + its optimistic-lock version; new card → neither.
          ...(c.id ? { id: c.id } : {}),
          ...(c.id && c.version !== undefined ? { version: c.version } : {}),
          name: c.name,
          currency: c.currency,
          isDefault: c.isDefault,
          bic: c.bic,
          bankName: c.bankName,
          bankLocation: c.bankLocation,
          accountNumber: c.accountNumber,
          correspondentAccount: c.correspondentAccount,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', id] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<OrganizationDetail>(`/admin/organizations/${id}/archive`, {}),
    onSuccess: () => router.push('/settings/organizations'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post<OrganizationDetail>(`/admin/organizations/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/admin/organizations/${id}`),
    onSuccess: () => router.push('/settings/organizations'),
    onError: (e: Error) => setError(e.message),
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  return (
    <EditForm
      {...editFormLabels}
      testId="organizations-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/organizations' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/settings/organizations"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={archivedTone(data.archived)}>
            {data.archived ? tCommon('archived') : tCommon('active')}
          </Badge>
        </div>
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

      <FormSection title={t('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="field-name"
            />
          </FormField>
          <FormField id="legalTitle" label={t('legal_title')}>
            <Input
              value={legalTitle}
              onChange={(e) => setLegalTitle(e.target.value)}
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
            data-test-id="field-legal-address"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_uz')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField id="inn" label={t('inn')}>
            <Input value={inn} onChange={(e) => setInn(e.target.value)} data-test-id="field-inn" />
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
              data-test-id="field-email"
            />
          </FormField>
          <FormField id="phone" label={t('phone')}>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
