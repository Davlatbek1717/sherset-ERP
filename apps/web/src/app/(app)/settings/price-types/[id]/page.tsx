'use client';

import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import {
  Badge,
  Button,
  Checkbox,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
type Currency = (typeof CURRENCIES)[number];

interface PriceTypeDetail {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
  externalCode: string | null;
  archived: boolean;
}

export default function EditPriceTypePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.price_type_admin');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [isDefault, setIsDefault] = useState(false);
  const [externalCode, setExternalCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PriceTypeDetail>({
    queryKey: ['price-type', id],
    queryFn: () => api.get<PriceTypeDetail>(`/price-types/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCurrency((data.currency as Currency) ?? 'UZS');
    setIsDefault(data.isDefault);
    setExternalCode(data.externalCode ?? '');
  }, [data]);

  const updateMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('name_required'));
      return api.patch<PriceTypeDetail>(`/price-types/${id}`, {
        name,
        currency,
        isDefault,
        // null (not undefined) so emptying the field persists the clear.
        externalCode: externalCode || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-type', id] });
      qc.invalidateQueries({ queryKey: ['price-types'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<PriceTypeDetail>(`/price-types/${id}/archive`, {}),
    onSuccess: () => router.push('/settings/price-types'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post<PriceTypeDetail>(`/price-types/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-type', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/price-types/${id}`),
    onSuccess: () => router.push('/settings/price-types'),
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
      testId="price-types-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/price-types' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/settings/price-types"
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
              disabled={data.isDefault}
              title={data.isDefault ? t('archive_default_hint') : undefined}
            >
              {tCommon('archive')}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            disabled={data.isDefault}
            title={data.isDefault ? t('delete_default_hint') : undefined}
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('col_name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="field-name"
            />
          </FormField>
          <FormField id="currency" label={tFields('currency')} required>
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
          <FormField id="externalCode" label={tFields('external_code')}>
            <Input
              value={externalCode}
              onChange={(e) => setExternalCode(e.target.value)}
              data-test-id="field-external-code"
            />
          </FormField>
        </div>
        <FormField id="isDefault" label="">
          <label
            htmlFor="isDefault"
            className="inline-flex cursor-pointer items-center gap-2 text-sm"
          >
            <Checkbox
              id="isDefault"
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(!!v)}
              data-test-id="field-is-default"
            />
            <span>{t('set_default_label')}</span>
          </label>
        </FormField>
      </FormSection>
    </EditForm>
  );
}
