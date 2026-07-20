'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { type SmsConfig, type SmsContacts, smsApi } from '@/lib/sms-api';
import { Badge, Button, EditForm, FormField, FormSection, Input, NativeSelect } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

export default function SmsSettingsPage() {
  const qc = useQueryClient();
  const t = useTranslations('pages.sms_settings');
  const tCommon = useTranslations('common');
  const editFormLabels = useEditFormLabels();

  const [provider, setProvider] = useState('eskiz');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [senderId, setSenderId] = useState('');
  const [phone, setPhone] = useState('');
  const [card, setCard] = useState('');
  const [cardOwner, setCardOwner] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SmsConfig | null>({
    queryKey: ['sms-config'],
    queryFn: () => smsApi.getConfig(),
  });
  const contacts = useQuery<SmsContacts>({
    queryKey: ['sms-contacts'],
    queryFn: () => smsApi.getContacts(),
  });

  useEffect(() => {
    if (!data) return;
    setProvider(data.provider);
    setEmail(data.email);
    setSenderId(data.senderId ?? '');
    setPassword('');
  }, [data]);
  useEffect(() => {
    if (!contacts.data) return;
    setPhone(contacts.data.phone ?? '');
    setCard(contacts.data.card ?? '');
    setCardOwner(contacts.data.cardOwner ?? '');
  }, [contacts.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error(t('email'));
      if (!data && !password) throw new Error(t('password'));
      await smsApi.saveConfig({ provider, email, ...(password ? { password } : {}), senderId });
      await smsApi.saveContacts({
        phone: phone || null,
        card: card || null,
        cardOwner: cardOwner || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-config'] });
      qc.invalidateQueries({ queryKey: ['sms-contacts'] });
      setPassword('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => smsApi.testConfig(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-config'] }),
    onError: (e: Error) => setError(e.message),
  });
  const deleteMut = useApiMutation({
    mutationFn: () => smsApi.deleteConfig(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-config'] }),
  });
  const { runDestructive } = useDestructiveMutation();

  if (isLoading)
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;

  return (
    <EditForm
      {...editFormLabels}
      testId="sms-settings-page"
      title={t('title')}
      subtitle={t('description')}
      breadcrumbs={[{ label: tCommon('actions'), href: '/' }, { label: t('title') }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        saveMut.mutate();
      }}
      cancelHref="/"
      saving={saveMut.isPending}
      error={error}
    >
      {data?.lastTestedAt && (
        <div className="flex items-center gap-2">
          {data.lastTestOk ? (
            <Badge tone="success">{t('test_ok')}</Badge>
          ) : (
            <Badge tone="destructive">{t('test_failed')}</Badge>
          )}
          {data.lastTestMsg && (
            <span className="text-[var(--ms-text-muted)] text-xs">{data.lastTestMsg}</span>
          )}
        </div>
      )}
      <div className="flex gap-3 text-sm">
        <Link className="text-[var(--ms-accent)] underline" href="/settings/sms/templates">
          {t('templates_link')}
        </Link>
      </div>

      <FormSection title={t('title')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="provider" label={t('provider')}>
            <NativeSelect
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="eskiz">Eskiz</option>
              <option value="playmobile">Play Mobile</option>
              <option value="custom">Custom</option>
            </NativeSelect>
          </FormField>
          <FormField id="senderId" label={t('sender_id')}>
            <Input
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              placeholder="4546"
            />
          </FormField>
          <FormField id="email" label={t('email')} required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.uz"
            />
          </FormField>
          <FormField
            id="password"
            label={t('password')}
            hint={data ? t('password_hint') : undefined}
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </FormField>
        </div>
        {data && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => testMut.mutate()}
              loading={testMut.isPending}
            >
              {t('test_button')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                runDestructive({
                  title: tCommon('confirm_delete'),
                  run: () => deleteMut.mutateAsync(),
                })
              }
              loading={deleteMut.isPending}
            >
              {t('delete_button')}
            </Button>
          </div>
        )}
      </FormSection>

      <FormSection title={t('contacts_title')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField id="phone" label={t('contact_phone')}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998..." />
          </FormField>
          <FormField id="card" label={t('contact_card')}>
            <Input value={card} onChange={(e) => setCard(e.target.value)} />
          </FormField>
          <FormField id="cardOwner" label={t('contact_card_owner')}>
            <Input value={cardOwner} onChange={(e) => setCardOwner(e.target.value)} />
          </FormField>
        </div>
      </FormSection>
    </EditForm>
  );
}
