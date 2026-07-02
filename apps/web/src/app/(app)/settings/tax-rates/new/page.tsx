'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewTaxRatePage() {
  const router = useRouter();
  const t = useTranslations('pages.tax_rate_admin');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [rate, setRate] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      const parsed = Number.parseFloat(rate);
      if (Number.isNaN(parsed)) throw new Error(t('rate_required'));
      return api.post<{ id: string }>('/tax-rates', {
        rate: parsed,
        ...(comment.trim() ? { comment } : {}),
      });
    },
    onSuccess: (created) => router.push(`/settings/tax-rates/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="tax-rates-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/settings/tax-rates' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/settings/tax-rates"
      saving={createMut.isPending}
      error={error}
    >
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
              autoFocus
              placeholder={t('rate_placeholder')}
              data-test-id="field-rate"
            />
          </FormField>
          <FormField id="comment" label={t('col_comment')}>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="..."
              data-test-id="field-comment"
            />
          </FormField>
        </div>
      </FormSection>
    </EditForm>
  );
}
