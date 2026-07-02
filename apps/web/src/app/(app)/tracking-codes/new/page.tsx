'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input, NativeSelect } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewTrackingCodePage() {
  const router = useRouter();
  const t = useTranslations('pages.tracking_code_admin');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [cis, setCis] = useState('');
  const [type, setType] = useState('SHOES');
  const [status, setStatus] = useState('ACTIVE');
  const [cis1162, setCis1162] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!cis.trim()) throw new Error(t('cis_required'));
      return api.post<{ id: string }>('/tracking-codes', {
        cis,
        type,
        status,
        ...(cis1162.trim() ? { cis1162 } : {}),
      });
    },
    onSuccess: (created) => router.push(`/tracking-codes/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="tracking-codes-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/tracking-codes' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/tracking-codes"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={tForm('section_main')}>
        <FormField id="cis" label={t('col_cis')} required>
          <Input
            value={cis}
            onChange={(e) => setCis(e.target.value)}
            autoFocus
            placeholder={t('cis_placeholder')}
            data-test-id="field-cis"
          />
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
            placeholder="..."
            data-test-id="field-cis1162"
          />
        </FormField>
      </FormSection>
    </EditForm>
  );
}
