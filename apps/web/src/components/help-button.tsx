'use client';

import { Icons, Tooltip, useHotkey } from '@moysklad/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { HelpDrawer } from './help-drawer';

/**
 * Global help trigger — sits in the AppShell top-right next to the
 * NotificationBell. Hovering shows a tooltip; clicking (or pressing `?`)
 * opens the contextual `HelpDrawer`.
 */
export function HelpButton() {
  const t = useTranslations('help');
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  // Pressing `?` anywhere opens the drawer. We disable while a form
  // input is focused (the default in useHotkey) so authors can still
  // type a literal "?" character.
  useHotkey('?', () => setOpen(true), { enabled: !open });
  useHotkey('shift+/', () => setOpen(true), { enabled: !open });

  return (
    <>
      <Tooltip content={`${t('title')} · ?`} side="bottom">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('title')}
          data-testid="help-button"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
        >
          <Icons.help className="h-[18px] w-[18px]" />
        </button>
      </Tooltip>
      <HelpDrawer open={open} onOpenChange={setOpen} locale={locale} />
    </>
  );
}
