'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Button, EditForm, FormField, FormSection, Input, NativeSelect } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface TrackingCodeDetail {
  id: string;
  cis: string;
  cis1162: string | null;
  type: string;
  status: string;
  productId: string | null;
  variantId: string | null;
  version: number;
}

export default function EditTrackingCodePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.tracking_code_admin');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [cis, setCis] = useState('');
  const [cis1162, setCis1162] = useState('');
  const [type, setType] = useState('SHOES');
  const [status, setStatus] = useState('ACTIVE');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<TrackingCodeDetail>({
    queryKey: ['tracking-code', id],
    queryFn: () => api.get<TrackingCodeDetail>(`/tracking-codes/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setCis(data.cis);
    setCis1162(data.cis1162 ?? '');
    setType(data.type);
    setStatus(data.status);
  }, [data]);

  const onConflict = useConflictReload(['tracking-code', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      if (!cis.trim()) throw new Error(t('cis_required'));
      return api.patch<TrackingCodeDetail>(`/tracking-codes/${id}`, {
        version: data.version,
        cis,
        type,
        status,
        cis1162: cis1162.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracking-code', id] });
      qc.invalidateQueries({ queryKey: ['tracking-codes'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/tracking-codes/${id}`),
    onSuccess: () => router.push('/tracking-codes'),
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
      testId="tracking-codes-edit-page"
      title={data.cis}
      breadcrumbs={[{ label: t('title'), href: '/tracking-codes' }, { label: data.cis }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate(undefined, {
          // Optimistic-lock conflicts surface via the reload dialog (onConflict),
          // not the inline error banner.
          onError: (e) => {
            if (!isOptimisticConflict(e)) setError((e as Error).message);
          },
        });
      }}
      cancelHref="/tracking-codes"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex justify-end">
        <Button
          type="button"
          variant="destructive"
          onClick={() =>
            runDestructive({
              title: tCommon('delete_confirm', { name: data.cis }),
              run: () => deleteMut.mutateAsync(),
            })
          }
          loading={deleteMut.isPending}
        >
          {tCommon('delete')}
        </Button>
      </div>

      <FormSection title={tForm('section_main')}>
        <FormField id="cis" label={t('col_cis')} required>
          <Input value={cis} onChange={(e) => setCis(e.target.value)} data-test-id="field-cis" />
        </FormField>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="type" label={t('col_type')} required>
            <NativeSelect
              value={type}
              onChange={(e) => setType(e.target.value)}
              data-test-id="field-type"
            >
              <option value="SHOES">{t('type_shoes')}</option>
              <option value="TOBACCO">{t('type_tobacco')}</option>
              <option value="MEDICINES">{t('type_medicines')}</option>
              <option value="PERFUME">{t('type_perfume')}</option>
              <option value="TIRES">{t('type_tires')}</option>
              <option value="DAIRY">{t('type_dairy')}</option>
              <option value="WATER">{t('type_water')}</option>
              <option value="BEER">{t('type_beer')}</option>
            </NativeSelect>
          </FormField>
          <FormField id="status" label={t('col_status')}>
            <NativeSelect
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              data-test-id="field-status"
            >
              <option value="ACTIVE">{t('status_active')}</option>
              <option value="RETIRED">{t('status_retired')}</option>
              <option value="TRANSFERRED">{t('status_transferred')}</option>
            </NativeSelect>
          </FormField>
        </div>
        <FormField id="cis1162" label={t('col_cis1162')}>
          <Input
            value={cis1162}
            onChange={(e) => setCis1162(e.target.value)}
            data-test-id="field-cis1162"
          />
        </FormField>
      </FormSection>
    </EditForm>
  );
}
