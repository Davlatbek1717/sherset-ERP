'use client';

import { setLocale } from '@/app/actions/locale';
import { type Locale, localeMeta, locales } from '@/i18n/config';
import { NativeSelect } from '@moysklad/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Compact locale picker. Calls the `setLocale` server action which sets the
 * NEXT_LOCALE cookie and revalidates the layout, then refreshes the router so
 * the page re-renders with the new messages without a full reload.
 *
 * `variant`: 'navbar' (default) — white text/border for the blue top bar;
 * 'plain' — dark text/border for light surfaces (e.g. the mobile nav Drawer,
 * where the navbar-white styling would be invisible). 2026-07-20j.
 */
export function LocaleSwitcher({ variant = 'navbar' }: { variant?: 'navbar' | 'plain' }) {
  const current = useLocale() as Locale;
  const t = useTranslations('locale');
  const [pending, start] = useTransition();
  const router = useRouter();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    start(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <label
      className={
        variant === 'plain'
          ? 'inline-flex items-center gap-1 text-[var(--ms-text-secondary)] text-sm'
          : 'inline-flex items-center gap-1 text-sm text-white/80'
      }
      data-test-id="locale-switcher"
    >
      <span className="sr-only">{t('switcher_label')}</span>
      <NativeSelect
        value={current}
        onChange={onChange}
        disabled={pending}
        // Style the SELECT (not the wrapper) — a border in `className` would sit on
        // the wrapper while the select keeps its own border, giving the double line
        // the user flagged. selectClassName overrides the select's resting border to
        // white for the blue navbar (single, crisp border). The 'plain' variant uses
        // the default dark-on-light input styling for light surfaces (Drawer).
        selectClassName={
          variant === 'plain'
            ? 'h-8 px-2 text-sm'
            : 'h-7 border-white/40 bg-transparent px-2 text-white text-xs focus:border-white/70 disabled:opacity-60'
        }
      >
        {locales.map((l) => (
          <option key={l} value={l} className="text-[var(--ms-text-primary)]">
            {localeMeta[l].flag} {localeMeta[l].nativeLabel}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
