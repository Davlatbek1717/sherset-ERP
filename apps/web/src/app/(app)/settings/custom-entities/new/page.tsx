'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewCustomEntityPage() {
  const router = useRouter();
  const t = useTranslations('pages.custom_entity_admin');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('name_required'));
      return api.post<{ id: string }>('/custom-entities', { name });
    },
    onSuccess: (created) => router.push(`/settings/custom-entities/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="custom-entities-new-page"
      title={t('new_title')}
      breadcrumbs={[
        { label: t('title'), href: '/settings/custom-entities' },
        { label: t('new_title') },
      ]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/custom-entities"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={tForm('section_main')}>
        <FormField id="name" label={t('col_name')} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder={t('name_placeholder')}
            data-test-id="field-name"
          />
        </FormField>
      </FormSection>
    </EditForm>
  );
}
