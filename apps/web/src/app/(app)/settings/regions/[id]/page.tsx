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

interface RegionDetail {
  id: string;
  name: string;
  code: string | null;
  externalCode: string | null;
  version: number;
}

export default function EditRegionPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.region_admin');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<RegionDetail>({
    queryKey: ['region', id],
    queryFn: () => api.get<RegionDetail>(`/regions/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCode(data.code ?? '');
    setExternalCode(data.externalCode ?? '');
  }, [data]);

  const onConflict = useConflictReload(['region', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(t('name_required'));
      return api.patch<RegionDetail>(`/regions/${id}`, {
        name,
        version: data.version,
        code: code.trim() || null,
        externalCode: externalCode.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['region', id] });
      qc.invalidateQueries({ queryKey: ['regions'] });
      setError(null);
    },
    onError: (e: unknown) => {
      if (!isOptimisticConflict(e)) setError(e instanceof Error ? e.message : String(e));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/regions/${id}`),
    onSuccess: () => router.push('/settings/regions'),
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
      testId="regions-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/regions' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/settings/regions"
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
          <FormField id="code" label={t('col_code')}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="UZ-TA"
              data-test-id="field-code"
            />
          </FormField>
        </div>
        <FormField id="externalCode" label={t('col_external_code')}>
          <Input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            data-test-id="field-external-code"
          />
        </FormField>
      </FormSection>
    </EditForm>
  );
}
