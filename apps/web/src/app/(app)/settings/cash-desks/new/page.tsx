'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input, NativeSelect } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB'] as const;
type Currency = (typeof CURRENCIES)[number];

export default function NewCashDeskPage() {
  const router = useRouter();
  const t = useTranslations('pages.cash_desks');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(tCommon('field_required', { field: tFields('name') }));
      return api.post<{ id: string }>('/admin/cash-desks', { name, currency });
    },
    onSuccess: (created) => router.push(`/settings/cash-desks/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="cash-desks-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/cash-desks' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/cash-desks"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={tForm('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Asosiy kassa"
              data-test-id="field-name"
            />
          </FormField>
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
        </div>
      </FormSection>
    </EditForm>
  );
}
