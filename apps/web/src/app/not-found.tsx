/**
 * 404 — sahifa topilmadi (2026-07-13 UX auditi).
 *
 * Ilgari noto'g'ri URL Next.js ning inglizcha standart 404 sahifasini berardi —
 * ilova menyusi ham yo'q edi, foydalanuvchi «qamalib» qolardi.
 */

import { Button, Container } from '@moysklad/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <Container size="sm" className="py-20">
      <div className="rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-8 text-center">
        <div className="mb-2 font-bold text-4xl text-[var(--ms-text-muted)]">404</div>
        <h1 className="mb-2 font-semibold text-lg">{t('not_found_title')}</h1>
        <p className="mb-6 text-[var(--ms-text-secondary)] text-sm">{t('not_found_hint')}</p>
        <Button asChild>
          <Link href="/">{t('go_home')}</Link>
        </Button>
      </div>
    </Container>
  );
}
