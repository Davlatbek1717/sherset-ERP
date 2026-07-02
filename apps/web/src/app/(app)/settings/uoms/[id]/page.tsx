'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Button, EditForm, FormField, FormSection, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface UomDetail {
  id: string;
  name: string;
  code: string | null;
  externalCode: string | null;
  description: string | null;
  shared: boolean;
  version: number;
}

export default function EditUomPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.uom_admin');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  // «Полное наименование» (full name) → Uom.description. The BE already accepts
  // it; the edit form just never bound it (so it was list-column-only and
  // unsettable). edit-default.html:175 = Краткое / Полное / Цифровой код stack.
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<UomDetail>({
    queryKey: ['uom', id],
    queryFn: () => api.get<UomDetail>(`/uoms/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setDescription(data.description ?? '');
    setCode(data.code ?? '');
  }, [data]);

  const onConflict = useConflictReload(['uom', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(t('name_required'));
      return api.patch<UomDetail>(`/uoms/${id}`, {
        version: data.version,
        name,
        description: description.trim() || null,
        code: code.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uom', id] });
      qc.invalidateQueries({ queryKey: ['uoms'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/uoms/${id}`),
    onSuccess: () => router.push('/settings/uoms'),
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
      testId="uoms-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/uoms' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate(undefined, {
          onError: (e) => {
            if (!isOptimisticConflict(e)) setError((e as Error).message);
          },
        });
      }}
      cancelHref="/settings/uoms"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex justify-end">
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

      <FormSection title={tForm('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('col_name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              data-test-id="field-code"
            />
          </FormField>
        </div>
      </FormSection>
    </EditForm>
  );
}
