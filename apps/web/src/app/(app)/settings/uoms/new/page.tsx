'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewUomPage() {
  const router = useRouter();
  const t = useTranslations('pages.uom_admin');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  // «Полное наименование» (full name) → Uom.description. moysklad's uom edit
  // form is a 3-field stack (Краткое / Полное / Цифровой код, edit-default.html:175);
  // the BE already accepts description (uom.schema/service) — it was only the
  // form that never exposed it, so a user could never set it from the UI.
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('name_required'));
      return api.post<{ id: string }>('/uoms', {
        name,
        ...(description.trim() ? { description } : {}),
        ...(code.trim() ? { code } : {}),
      });
    },
    onSuccess: (created) => router.push(`/settings/uoms/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="uoms-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/uoms' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/uoms"
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
          <FormField id="description" label={t('col_full_name')}>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-test-id="field-description"
            />
          </FormField>
          <FormField id="code" label={t('col_code')}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="796"
              data-test-id="field-code"
            />
          </FormField>
        </div>
      </FormSection>
    </EditForm>
  );
}
