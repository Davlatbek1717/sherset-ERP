'use client';

/**
 * XATO CHEGARASI (2026-07-13 UX auditi).
 *
 * Ilgari butun ilovada bitta ham `error.tsx` yo'q edi: bitta komponentda kutilmagan
 * xato bo'lsa (masalan `undefined.map()`), Next.js prodda OQ EKRAN + inglizcha
 * «Application error: a client-side exception has occurred» chiqarardi. Ish
 * kunining o'rtasida kassir uchun dastur butunlay o'lgan bo'lardi va qaytish
 * yo'li ham yo'q edi.
 *
 * Endi: tushunarli xabar + «Qayta urinish» (Next'ning `reset()` — sahifani
 * qaytadan render qiladi, ilovadan chiqmasdan) + «Bosh sahifa».
 * Xato matni yig'ilib qolsin deb ochiladigan tafsilotda ko'rsatiladi —
 * foydalanuvchi uni nusxa ko'chirib yubora oladi.
 */

import { Button, Container } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Konsolga yozamiz — brauzer devtools orqali diagnostika qilinadi.
    console.error('[app error]', error);
  }, [error]);

  return (
    <Container size="sm" className="py-16">
      <div className="rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-8 text-center">
        <div className="mb-3 text-4xl">⚠️</div>
        <h1 className="mb-2 font-semibold text-lg">{t('crash_title')}</h1>
        <p className="mb-6 text-[var(--ms-text-secondary)] text-sm">{t('crash_hint')}</p>

        <div className="flex justify-center gap-2">
          <Button onClick={reset} data-test-id="error-retry">
            {t('retry')}
          </Button>
          <Button variant="secondary" onClick={() => window.location.assign('/')}>
            {t('go_home')}
          </Button>
        </div>

        <details className="mt-6 text-left">
          <summary className="cursor-pointer text-[var(--ms-text-muted)] text-xs">
            {t('details')}
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] p-3 text-[11px] text-[var(--ms-text-secondary)]">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        </details>
      </div>
    </Container>
  );
}
