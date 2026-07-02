'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import {
  Badge,
  Button,
  Checkbox,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Provider = 'gmail' | 'yandex' | 'mailru' | 'custom';

interface EmailConfig {
  id: string;
  provider: Provider;
  fromName: string | null;
  fromEmail: string;
  replyTo: string | null;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  hasPassword: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMsg: string | null;
}

const PRESETS: Record<
  Exclude<Provider, 'custom'>,
  { host: string; port: number; secure: boolean }
> = {
  gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
  yandex: { host: 'smtp.yandex.com', port: 465, secure: true },
  mailru: { host: 'smtp.mail.ru', port: 465, secure: true },
};

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

export default function EmailSettingsPage() {
  const qc = useQueryClient();
  const t = useTranslations('pages.email_settings');
  const tCommon = useTranslations('common');
  const editFormLabels = useEditFormLabels();

  const [provider, setProvider] = useState<Provider>('custom');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<EmailConfig | null>({
    queryKey: ['email-config'],
    queryFn: () => api.get<EmailConfig | null>('/email/config'),
  });

  useEffect(() => {
    if (!data) return;
    setProvider(data.provider as Provider);
    setFromName(data.fromName ?? '');
    setFromEmail(data.fromEmail);
    setReplyTo(data.replyTo ?? '');
    setHost(data.host);
    setPort(String(data.port));
    setSecure(data.secure);
    setUsername(data.username);
    // Never echo password back
    setPassword('');
  }, [data]);

  // Apply preset when provider switches and host/port are still default
  const applyPreset = (p: Provider) => {
    setProvider(p);
    if (p === 'custom') return;
    const preset = PRESETS[p];
    setHost(preset.host);
    setPort(String(preset.port));
    setSecure(preset.secure);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      if (!fromEmail.trim()) throw new Error(t('from_required'));
      if (!host.trim()) throw new Error(t('host_required'));
      if (!username.trim()) throw new Error(t('username_required'));
      if (!data && !password) throw new Error(t('password_required'));
      const body = {
        provider,
        fromName,
        fromEmail,
        replyTo,
        host,
        port: Number(port),
        secure,
        username,
        ...(password ? { password } : {}),
      };
      return api.put<EmailConfig>('/email/config', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-config'] });
      setPassword('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>('/email/config/test', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-config'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useApiMutation({
    mutationFn: () => api.delete<{ ok: true }>('/email/config'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-config'] });
    },
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading)
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;

  return (
    <EditForm
      {...editFormLabels}
      testId="email-settings-page"
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

      <FormSection title={t('title')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="provider" label={t('provider')}>
            <NativeSelect
              id="provider"
              value={provider}
              onChange={(e) => applyPreset(e.target.value as Provider)}
              className={SELECT_CLASS}
              data-test-id="field-provider"
            >
              <option value="gmail">{t('providers.gmail')}</option>
              <option value="yandex">{t('providers.yandex')}</option>
              <option value="mailru">{t('providers.mailru')}</option>
              <option value="custom">{t('providers.custom')}</option>
            </NativeSelect>
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="fromName" label={t('from_name')}>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder='"My Company" Ltd.'
              data-test-id="field-from-name"
            />
          </FormField>
          <FormField id="fromEmail" label={t('from_email')} required>
            <Input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="noreply@company.uz"
              data-test-id="field-from-email"
            />
          </FormField>
        </div>

        <FormField id="replyTo" label={t('reply_to')}>
          <Input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="support@company.uz"
            data-test-id="field-reply-to"
          />
        </FormField>
      </FormSection>

      <FormSection title="SMTP">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField id="host" label={t('host')} required>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.gmail.com"
              data-test-id="field-host"
            />
          </FormField>
          <FormField id="port" label={t('port')} required>
            <Input
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              data-test-id="field-port"
            />
          </FormField>
          <FormField id="secure" label="">
            <label
              htmlFor="secure"
              className="mt-7 inline-flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id="secure"
                checked={secure}
                onCheckedChange={(v) => setSecure(!!v)}
                data-test-id="field-secure"
              />
              <span>{t('secure')}</span>
            </label>
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="username" label={t('username')} required>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@company.uz"
              data-test-id="field-username"
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
              data-test-id="field-password"
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
              data-test-id="test-button"
            >
              {t('test_button')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                runDestructive({
                  title: tCommon('confirm_delete'),
                  run: () => deleteMut.mutateAsync(),
                });
              }}
              loading={deleteMut.isPending}
              data-test-id="delete-button"
            >
              {t('delete_button')}
            </Button>
          </div>
        )}
      </FormSection>
    </EditForm>
  );
}
