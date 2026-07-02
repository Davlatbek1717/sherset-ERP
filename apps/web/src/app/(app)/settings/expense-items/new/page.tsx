'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewExpenseItemPage() {
  const router = useRouter();
  const t = useTranslations('pages.expense_item_admin');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('name_required'));
      return api.post<{ id: string }>('/expense-items', {
        name,
        ...(code.trim() ? { code } : {}),
        ...(description.trim() ? { description } : {}),
      });
    },
    onSuccess: (created) => router.push(`/settings/expense-items/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="expense-items-new-page"
      title={t('new_title')}
      breadcrumbs={[
        { label: t('title'), href: '/settings/expense-items' },
        { label: t('new_title') },
      ]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/expense-items"
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
          <FormField id="code" label={t('col_code')}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ADV"
              data-test-id="field-code"
            />
          </FormField>
        </div>
        <FormField id="description" label={t('description')}>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-test-id="field-description"
          />
        </FormField>
      </FormSection>
    </EditForm>
  );
}
