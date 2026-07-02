'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Badge, Button, EditForm, FormField, FormSection, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ExpenseItemDetail {
  id: string;
  name: string;
  code: string | null;
  externalCode: string | null;
  description: string | null;
  archived: boolean;
  version: number;
}

export default function EditExpenseItemPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.expense_item_admin');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ExpenseItemDetail>({
    queryKey: ['expense-item', id],
    queryFn: () => api.get<ExpenseItemDetail>(`/expense-items/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCode(data.code ?? '');
    setDescription(data.description ?? '');
  }, [data]);

  const onConflict = useConflictReload(['expense-item', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(t('name_required'));
      return api.patch<ExpenseItemDetail>(`/expense-items/${id}`, {
        version: data.version,
        name,
        code: code.trim() || null,
        description: description.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-item', id] });
      qc.invalidateQueries({ queryKey: ['expense-items'] });
      setError(null);
    },
    onError: (e) => {
      if (!isOptimisticConflict(e)) setError((e as Error).message);
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<ExpenseItemDetail>(`/expense-items/${id}/archive`, {}),
    onSuccess: () => router.push('/settings/expense-items'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post<ExpenseItemDetail>(`/expense-items/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-item', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/expense-items/${id}`),
    onSuccess: () => router.push('/settings/expense-items'),
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
      testId="expense-items-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/expense-items' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/settings/expense-items"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={archivedTone(data.archived)}>
            {data.archived ? tCommon('archived') : tCommon('active')}
          </Badge>
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
