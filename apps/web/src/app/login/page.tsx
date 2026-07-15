'use client';

import { login } from '@/lib/auth-store';
import { Alert, Button, Container, FormField, Input, ShersetLogo } from '@moysklad/ui';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('auth');
  // XAVFSIZLIK (2026-07-13): maydonlar BO'SH boshlanadi. Ilgari bu yerda
  // demo-hisob (admin/admin123) oldindan to'ldirilgan va sahifa pastida ochiq
  // yozilgan edi — istalgan odam saytga kirib o'qib olishi mumkin edi.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Parolni ko'rish/yashirish (2026-07-15). Standart holat — YASHIRIN: kimdir
  // yelkangdan qarab tursa parol ochiq turmasin. Foydalanuvchi o'zi ko'z
  // tugmasini bosib tekshirishi mumkin (uzun parolda terish xatosini topish).
  const [showPassword, setShowPassword] = useState(false);
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
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password_placeholder')}
                data-test-id="login-password"
                required
                invalid={!!error}
                trailing={
                  <button
                    type="button"
                    // Ko'z tugmasi — parolni ochib/yashirib turadi. `tabIndex={-1}`:
                    // Tab bilan input → tugma → submit oqimi buzilmasin (klaviatura
                    // bilan kiruvchi Enter'ni bosib qo'ymasin).
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="pointer-events-auto flex h-5 w-5 items-center justify-center text-[var(--ms-text-muted)] transition-colors hover:text-[var(--ms-text-primary)]"
                    aria-label={showPassword ? t('password_hide') : t('password_show')}
                    aria-pressed={showPassword}
                    data-test-id="login-password-toggle"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
            </FormField>

            <Button type="submit" className="w-full" loading={pending} data-test-id="login-submit">
              {pending ? t('submitting') : t('submit')}
            </Button>
          </form>
        </div>
      </Container>
    </main>
  );
}
