'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { Checkbox, EditForm, FormField, FormSection, Input, NativeSelect } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
type Currency = (typeof CURRENCIES)[number];

export default function NewPriceTypePage() {
  const router = useRouter();
  const t = useTranslations('pages.price_type_admin');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [isDefault, setIsDefault] = useState(false);
  const [externalCode, setExternalCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('name_required'));
      return api.post<{ id: string }>('/price-types', {
        name,
        currency,
        isDefault,
        externalCode: externalCode || undefined,
      });
    },
    onSuccess: (created) => router.push(`/settings/price-types/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="price-types-new-page"
      title={t('new_title')}
      breadcrumbs={[
        { label: t('title'), href: '/settings/price-types' },
        { label: t('new_title') },
      ]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/price-types"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={tForm('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('col_name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={t('name_placeholder')}
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
