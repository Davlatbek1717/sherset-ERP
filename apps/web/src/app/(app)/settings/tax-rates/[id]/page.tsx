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

interface TaxRateDetail {
  id: string;
  rate: string | number;
  comment: string | null;
  shared: boolean;
  archived: boolean;
  version: number;
}

export default function EditTaxRatePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.tax_rate_admin');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [rate, setRate] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<TaxRateDetail>({
    queryKey: ['tax-rate', id],
    queryFn: () => api.get<TaxRateDetail>(`/tax-rates/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setRate(String(Number(data.rate)));
    setComment(data.comment ?? '');
  }, [data]);

  const onConflict = useConflictReload(['tax-rate', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      const parsed = Number.parseFloat(rate);
      if (Number.isNaN(parsed)) throw new Error(t('rate_required'));
      return api.patch<TaxRateDetail>(`/tax-rates/${id}`, {
        version: data.version,
        rate: parsed,
        comment: comment.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-rate', id] });
      qc.invalidateQueries({ queryKey: ['tax-rates'] });
    },
    onError: (e: Error) => {
      if (!isOptimisticConflict(e)) setError(e.message);
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<TaxRateDetail>(`/tax-rates/${id}/archive`, {}),
    onSuccess: () => router.push('/settings/tax-rates'),
    onError: (e: Error) => setError(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post<TaxRateDetail>(`/tax-rates/${id}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-rate', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/tax-rates/${id}`),
    onSuccess: () => router.push('/settings/tax-rates'),
    onError: (e: Error) => setError(e.message),
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  const displayName = `${Number(data.rate).toFixed(2)}%`;

  return (
    <EditForm
      {...editFormLabels}
      testId="tax-rates-edit-page"
      title={t('edit_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/tax-rates' }, { label: displayName }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/settings/tax-rates"
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
                title: tCommon('delete_confirm', { name: displayName }),
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
          <FormField id="rate" label={t('rate_label')} required>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              data-test-id="field-rate"
            />
          </FormField>
          <FormField id="comment" label={t('col_comment')}>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              data-test-id="field-comment"
            />
          </FormField>
        </div>
      </FormSection>
    </EditForm>
  );
}
