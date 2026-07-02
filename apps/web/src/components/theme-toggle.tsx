'use client';

import { Button, Icons, Tooltip, useTheme } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

/**
 * Cycles light → dark → system → light. Sits in the AppShell top-right
 * next to the Help button. Tooltip explains the next state so the cycle
 * isn't a mystery on first encounter.
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const t = useTranslations('theme');

  const next: typeof theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon =
    theme === 'system'
      ? resolvedTheme === 'dark'
        ? Icons.themeDark
        : Icons.themeLight
      : theme === 'dark'
        ? Icons.themeDark
        : Icons.themeLight;

  return (
    <Tooltip
      content={`${t('current', { mode: t(theme) })} · ${t('switch_to', { mode: t(next) })}`}
      side="bottom"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setTheme(next)}
        aria-label={t('toggle')}
        data-testid="theme-toggle"
      >
        <Icon className="h-[18px] w-[18px]" />
      </Button>
    </Tooltip>
  );
}
