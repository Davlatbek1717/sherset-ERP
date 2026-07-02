'use client';

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  type PickerItem,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
type Currency = (typeof CURRENCIES)[number];

interface OrgRef {
  id: string;
  name: string;
  legalTitle: string | null;
}

interface BankAccountDetail {
  id: string;
  version: number;
  name: string;
  organizationId: string;
  organization: { id: string; name: string } | null;
  isDefault: boolean;
  currency: string;
  balanceMinor: string;
  bankName: string | null;
  accountNumber: string | null;
  bic: string | null;
  archived: boolean;
}

export default function EditBankAccountPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
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

  const { data, isLoading } = useQuery<BankAccountDetail>({
    queryKey: ['organization-account', id],
    queryFn: () => api.get<BankAccountDetail>(`/admin/organization-accounts/${id}`),
    enabled: !!id,
  });

  // Optimistic-lock conflict handler. The form re-hydrates from `data` on every
  // `[data]` change (the effect below has no `!name`/`!form` guard), so the
  // post-reload re-seed happens automatically — no second arg needed.
  const onConflict = useConflictReload(['organization-account', id]);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setOrganizationId(data.organizationId);
    setOrganizationLabel(data.organization?.name ?? data.organizationId);
    setIsDefault(data.isDefault);
    setCurrency((data.currency as Currency) ?? 'UZS');
    setBankName(data.bankName ?? '');
    setAccountNumber(data.accountNumber ?? '');
    setBic(data.bic ?? '');
  }, [data]);

  const updateMut = useMutation({
    mutationFn: () => {
      if (!data) throw new Error(tCommon('not_found'));
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      if (!organizationId)
        throw new Error(tCommon('field_required', { field: tFields('organization') }));
      return api.patch<BankAccountDetail>(`/admin/organization-accounts/${id}`, {
        // Optimistic-lock token — the version this form loaded (from the server
        // query `data`, not local state, which has no version field).
        version: data.version,
        name,
        organizationId,
        isDefault,
        currency,
        // Send null (not undefined) so emptying a field persists the clear —
        // update() skips undefined keys but writes null (schema .nullish()).
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        bic: bic || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization-account', id] });
      qc.invalidateQueries({ queryKey: ['organization-accounts'] });
    },
    onError: (e: Error) => {
      // A real optimistic-lock 409 → show the "record changed — reload?" dialog
      // instead of the inline error banner; any other error falls through.
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<BankAccountDetail>(`/admin/organization-accounts/${id}/archive`, {}),
    onSuccess: () => router.push('/settings/bank-accounts'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post<BankAccountDetail>(`/admin/organization-accounts/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization-account', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/admin/organization-accounts/${id}`),
    onSuccess: () => router.push('/settings/bank-accounts'),
    onError: (e: Error) => setError(e.message),
  });

  const { runDestructive } = useDestructiveMutation();

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

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  return (
    <EditForm
      {...editFormLabels}
      testId="bank-accounts-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/bank-accounts' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/settings/bank-accounts"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={archivedTone(data.archived)}>
            {data.archived ? tCommon('archived') : tCommon('active')}
          </Badge>
          {data.isDefault && <Badge tone="brand">{tCommon('default')}</Badge>}
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

      <FormSection title={tForm('section_main')}>
        <FormField id="name" label={t('name')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} data-test-id="field-name" />
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
        <FormField id="balance" label={t('balance')}>
          <div
            className="flex h-9 select-none items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 text-[var(--ms-text-muted)] text-sm"
            data-test-id="field-balance"
          >
            <span className="font-medium text-[var(--ms-text-primary)] tabular-nums">
              {formatMoney(BigInt(data.balanceMinor), data.currency)}
            </span>
            <span className="ml-2 text-xs">({t('balance_readonly_note')})</span>
          </div>
        </FormField>
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
