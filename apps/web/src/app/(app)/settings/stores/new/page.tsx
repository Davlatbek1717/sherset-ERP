'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input, NativeSelect } from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

interface Employee {
  id: string;
  name: string;
}

export default function NewStorePage() {
  const router = useRouter();
  const t = useTranslations('pages.stores');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: employees } = useQuery<{ rows: Employee[] }>({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/hr/employees?limit=200'),
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error('Ombor nomi kiritilishi shart');
      return api.post<{ id: string }>('/admin/stores', {
        name,
        code: code || undefined,
        ownerId: ownerId || undefined,
      });
    },
    onSuccess: (created) => router.push(`/settings/stores/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="stores-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/stores' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/stores"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={tForm('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label="Nomi" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Asosiy ombor"
              data-test-id="field-name"
            />
          </FormField>

          <FormField id="code" label="Raqami">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="01"
              data-test-id="field-code"
            />
          </FormField>

          <FormField id="ownerId" label="Mas'ul xodim">
            <NativeSelect
              id="ownerId"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className={SELECT_CLASS}
              data-test-id="field-owner"
            >
              <option value="">— tanlanmagan —</option>
              {employees?.rows.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      </FormSection>
    </EditForm>
  );
}
