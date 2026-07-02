'use client';

import { login } from '@/lib/auth-store';
import { Alert, Button, Container, FormField, Input, ShersetLogo } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('auth');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(username, password);
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
            <ShersetLogo variant="white" height={32} />
            <p className="mt-1.5 text-white/80 text-xs">{t('login_title')}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 p-6" data-test-id="login-form">
            {error && <Alert tone="destructive">{error}</Alert>}

            <FormField id="username" label={t('login_label')} required>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('login_placeholder')}
                data-test-id="login-username"
                required
                invalid={!!error}
              />
            </FormField>

            <FormField id="password" label={t('password_label')} required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password_placeholder')}
                data-test-id="login-password"
                required
                invalid={!!error}
              />
            </FormField>

            <Button type="submit" className="w-full" loading={pending} data-test-id="login-submit">
              {pending ? t('submitting') : t('submit')}
            </Button>

            <p className="pt-2 text-center text-[var(--ms-text-muted)] text-xs">
              Demo: admin / admin123
            </p>
          </form>
        </div>
      </Container>
    </main>
  );
}
