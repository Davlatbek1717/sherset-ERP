'use client';

import { login } from '@/lib/auth-store';
import { Alert, Button, Container, FormField, Input, PasswordInput } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      const redirect = params?.get('redirect') ?? '/';
      router.replace(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_invalid'));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ms-bg-navbar)]">
      <Container size="sm" className="py-10">
        <div className="overflow-hidden rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-lg)]">
          <div className="bg-[var(--ms-brand-500)] px-6 py-4 text-white">
            <h1 className="font-semibold text-xl">МойСклад</h1>
            <p className="mt-0.5 text-white/80 text-xs">{t('login_title')}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 p-6" data-test-id="login-form">
            {error && <Alert tone="destructive">{error}</Alert>}

            <FormField id="email" label={t('email_label')} required>
              {/* type=text: the API accepts email OR username (moysklad-style
                  логин), but type=email's native validation silently blocked
                  every username login (owner flow: employee card sets a
                  username+password → that pair must work here). */}
              <Input
                id="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('email_placeholder')}
                data-test-id="login-email"
                required
                invalid={!!error}
              />
            </FormField>

            <FormField id="password" label={t('password_label')} required>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password_placeholder')}
                data-test-id="login-password"
                required
                invalid={!!error}
                showLabel={tCommon('show_password')}
                hideLabel={tCommon('hide_password')}
              />
            </FormField>

            <Button type="submit" className="w-full" loading={pending} data-test-id="login-submit">
              {pending ? t('submitting') : t('submit')}
            </Button>

            <p className="pt-2 text-center text-[var(--ms-text-muted)] text-xs">
              Demo: admin@demo.local / admin123
            </p>
          </form>
        </div>
      </Container>
    </main>
  );
}
