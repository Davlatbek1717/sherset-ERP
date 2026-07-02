'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input, NativeSelect, Textarea } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Discount new page.
 *
 * UX trade-off: `rules` is a freeform JSON textarea for v1.
 * The kind-specific rule builder (tiers for accumulative, product
 * selector for product discounts, etc.) is deferred to a future sprint
 * once the UX design is finalised.
 */
export default function NewDiscountPage() {
  const router = useRouter();
  const t = useTranslations('pages.discount_admin');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [kind, setKind] = useState('special');
  const [active, setActive] = useState(true);
  const [rulesText, setRulesText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('name_required'));
      let rules: unknown = undefined;
      if (rulesText.trim()) {
        try {
          rules = JSON.parse(rulesText);
        } catch {
          throw new Error(t('rules_invalid_json'));
        }
      }
      return api.post<{ id: string }>('/discounts', {
        name,
        kind,
        active,
        ...(rules !== undefined ? { rules } : {}),
      });
    },
    onSuccess: (created) => router.push(`/discounts/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="discounts-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/discounts' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/discounts"
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
          <FormField id="kind" label={t('col_kind')} required>
            <NativeSelect
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              data-test-id="field-kind"
            >
              <option value="special">{t('kind_special')}</option>
              <option value="accumulative">{t('kind_accumulative')}</option>
              <option value="personal">{t('kind_personal')}</option>
              <option value="product">{t('kind_product')}</option>
              <option value="agent">{t('kind_agent')}</option>
            </NativeSelect>
          </FormField>
        </div>
        <FormField id="active" label={t('col_active')}>
          <NativeSelect
            value={active ? 'true' : 'false'}
            onChange={(e) => setActive(e.target.value === 'true')}
            data-test-id="field-active"
          >
            <option value="true">{t('active_yes')}</option>
            <option value="false">{t('active_no')}</option>
          </NativeSelect>
        </FormField>
      </FormSection>

      <FormSection title={t('rules_section')}>
        <p className="mb-2 text-[var(--ms-text-muted)] text-sm">{t('rules_hint')}</p>
        <FormField id="rules" label={t('col_rules')}>
          <Textarea
            id="rules"
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            rows={6}
            placeholder="{}"
            data-test-id="field-rules"
            className="bg-[var(--ms-bg-base)] font-mono"
          />
        </FormField>
      </FormSection>
    </EditForm>
  );
}
