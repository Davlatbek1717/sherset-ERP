'use client';

import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { EditForm, FormField, FormSection, Input, NativeSelect, Textarea } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const TEXTAREA_CLASS =
  'w-full min-h-[80px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)] font-mono';

type ChannelKind =
  | 'telegram'
  | 'instagram'
  | 'website'
  | 'marketplace_uzum'
  | 'marketplace_olcha'
  | 'custom';

const KINDS: ChannelKind[] = [
  'telegram',
  'instagram',
  'website',
  'marketplace_uzum',
  'marketplace_olcha',
  'custom',
];

export default function NewSalesChannelPage() {
  const router = useRouter();
  const t = useTranslations('pages.sales_channels');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('telegram');
  const [externalRef, setExternalRef] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [settingsText, setSettingsText] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseSettings = (): Record<string, unknown> | null | undefined => {
    const trimmed = settingsText.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Throw synchronously: checking the settingsError STATE in the mutation
      // read a stale value (React state isn't updated mid-callback), so invalid
      // settings JSON was silently dropped and the channel saved without it.
      setSettingsError(t('invalid_json'));
      throw new Error(t('invalid_json'));
    }
  };

  const createMut = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error(t('name_required'));
      setSettingsError(null);
      const settings = parseSettings();
      return api.post<{ id: string }>('/sales-channels', {
        name,
        kind,
        externalRef: externalRef || undefined,
        externalCode: externalCode || undefined,
        settings,
      });
    },
    onSuccess: (created) => router.push(`/ecommerce/channels/${created.id}`),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <EditForm
      {...editFormLabels}
      testId="sales-channel-new-page"
      title={t('new_title')}
      breadcrumbs={[{ label: t('title'), href: '/ecommerce/channels' }, { label: t('new_title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createMut.mutate();
      }}
      cancelHref="/ecommerce/channels"
      saving={createMut.isPending}
      error={error}
    >
      <FormSection title={t('section_main')}>
        <FormField id="name" label={t('name')} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder={t('name_placeholder')}
            data-test-id="field-name"
          />
        </FormField>

        <FormField id="kind" label={t('kind')}>
          <NativeSelect
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ChannelKind)}
            className={SELECT_CLASS}
            data-test-id="field-kind"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="externalRef" label={t('external_ref')}>
          <Input
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            placeholder={t('external_ref_placeholder')}
            data-test-id="field-external-ref"
          />
        </FormField>

        <FormField id="externalCode" label={t('external_code')}>
          <Input
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            data-test-id="field-external-code"
          />
        </FormField>
      </FormSection>

      <FormSection title={t('section_settings')}>
        <FormField id="settings" label={t('settings_label')}>
          <Textarea
            id="settings"
            value={settingsText}
            onChange={(e) => {
              setSettingsText(e.target.value);
              setSettingsError(null);
            }}
            className={TEXTAREA_CLASS}
            placeholder={'{\n  "key": "value"\n}'}
            data-test-id="field-settings"
          />
          {settingsError && <p className="mt-1 text-red-600 text-xs">{settingsError}</p>}
          <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('settings_hint')}</p>
        </FormField>
      </FormSection>
    </EditForm>
  );
}
