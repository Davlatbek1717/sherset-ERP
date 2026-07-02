'use client';

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Alert, Button, EditForm, FormField, FormSection, Icons, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface CustomEntityDetail {
  id: string;
  name: string;
  version: number;
}

interface CustomEntityValue {
  id: string;
  name: string;
  position: number;
}

interface ValuesResponse {
  items: CustomEntityValue[];
  total: number;
}

export default function EditCustomEntityPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.custom_entity_admin');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [newValueName, setNewValueName] = useState('');
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editingValueName, setEditingValueName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onConflict = useConflictReload(['custom-entity', id]);

  const { data, isLoading } = useQuery<CustomEntityDetail>({
    queryKey: ['custom-entity', id],
    queryFn: () => api.get<CustomEntityDetail>(`/custom-entities/${id}`),
    enabled: !!id,
  });

  const { data: valuesData, isLoading: valuesLoading } = useQuery<ValuesResponse>({
    queryKey: ['custom-entity-values', id],
    queryFn: () => api.get<ValuesResponse>(`/custom-entities/${id}/values`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
  }, [data]);

  const updateMut = useMutation({
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(t('name_required'));
      return api.patch<CustomEntityDetail>(`/custom-entities/${id}`, {
        name,
        version: data.version,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-entity', id] });
      qc.invalidateQueries({ queryKey: ['custom-entities'] });
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/custom-entities/${id}`),
    onSuccess: () => router.push('/settings/custom-entities'),
    onError: (e: Error) => setError(e.message),
  });

  const addValueMut = useMutation({
    mutationFn: (valueName: string) =>
      api.post<CustomEntityValue>(`/custom-entities/${id}/values`, {
        name: valueName,
        position: valuesData?.items.length ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-entity-values', id] });
      setNewValueName('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateValueMut = useMutation({
    mutationFn: ({ valueId, valueName }: { valueId: string; valueName: string }) =>
      api.patch<CustomEntityValue>(`/custom-entities/${id}/values/${valueId}`, {
        name: valueName,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-entity-values', id] });
      setEditingValueId(null);
      setEditingValueName('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteValueMut = useMutation({
    mutationFn: (valueId: string) =>
      api.delete<unknown>(`/custom-entities/${id}/values/${valueId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-entity-values', id] }),
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
      testId="custom-entities-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/custom-entities' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/settings/custom-entities"
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
        <FormField id="name" label={t('col_name')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} data-test-id="field-name" />
        </FormField>
      </FormSection>

      {/* Values section */}
      <FormSection title={t('values_section')}>
        {valuesLoading && (
          <p className="text-sm text-[var(--ms-text-muted)]">{tCommon('loading')}</p>
        )}

        {valuesData && valuesData.items.length === 0 && (
          <p className="text-sm text-[var(--ms-text-muted)]">{tCommon('no_results')}</p>
        )}

        <div className="divide-y divide-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          {valuesData?.items.map((v) => (
            <div key={v.id} className="flex items-center gap-2 px-3 py-2">
              {editingValueId === v.id ? (
                <>
                  <Input
                    value={editingValueName}
                    onChange={(e) => setEditingValueName(e.target.value)}
                    className="flex-1"
                    autoFocus
                    data-test-id={`edit-value-${v.id}`}
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      updateValueMut.mutate({ valueId: v.id, valueName: editingValueName })
                    }
                    loading={updateValueMut.isPending}
                    disabled={!editingValueName.trim()}
                  >
                    {tCommon('save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingValueId(null);
                      setEditingValueName('');
                    }}
                  >
                    {tCommon('cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{v.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingValueId(v.id);
                      setEditingValueName(v.name);
                    }}
                    data-test-id={`edit-value-btn-${v.id}`}
                  >
                    <Icons.edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      runDestructive({
                        title: tCommon('delete_confirm', { name: v.name }),
                        run: () => deleteValueMut.mutateAsync(v.id),
                      })
                    }
                    loading={deleteValueMut.isPending}
                    data-test-id={`delete-value-btn-${v.id}`}
                  >
                    <Icons.delete className="h-3.5 w-3.5 text-[var(--ms-destructive-500)]" />
                  </Button>
                </>
              )}
            </div>
          ))}

          {/* Add new value row */}
          <div className="flex items-center gap-2 px-3 py-2">
            <Input
              value={newValueName}
              onChange={(e) => setNewValueName(e.target.value)}
              placeholder={t('value_name_placeholder')}
              className="flex-1"
              data-test-id="new-value-name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newValueName.trim()) {
                  e.preventDefault();
                  addValueMut.mutate(newValueName.trim());
                }
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (newValueName.trim()) addValueMut.mutate(newValueName.trim());
              }}
              loading={addValueMut.isPending}
              disabled={!newValueName.trim()}
              data-test-id="add-value-btn"
            >
              <Icons.create className="h-3.5 w-3.5" />
              {t('add_value')}
            </Button>
          </div>
        </div>

        {addValueMut.isError && (
          <Alert tone="destructive">{(addValueMut.error as Error).message}</Alert>
        )}
      </FormSection>
    </EditForm>
  );
}
