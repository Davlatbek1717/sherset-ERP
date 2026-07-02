'use client';

import { cn } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

interface HomepageTab {
  key: 'metrics' | 'documents' | 'audit' | 'files' | 'trash' | 'onboarding';
  /**
   * Where clicking the tab takes you. `null` = not yet implemented; tab is
   * rendered disabled with a muted style. We mirror moysklad.uz's full tab
   * set for visual fidelity even when the destination doesn't exist yet —
   * the operator sees the same affordance and the missing tabs make the
   * future scope explicit.
   */
  href: string | null;
}

const TABS: HomepageTab[] = [
  { key: 'metrics', href: '/' },
  { key: 'documents', href: '/customer-orders' },
  { key: 'trash', href: '/korzina' },
  { key: 'audit', href: '/settings/audit-log' },
  { key: 'files', href: '/files' },
  { key: 'onboarding', href: '/getting-started' },
];

/**
 * The page-level tab strip moysklad.uz renders directly under its top
 * AppShell on every "Показатели" view. Pure-CSS underline indicator —
 * matches the moysklad.uz screenshots from `docs/moysklad-reference/`.
 */
export function HomepageTabs({ activeKey }: { activeKey: HomepageTab['key'] }) {
  const t = useTranslations('pages.homepage.tabs');

  return (
    <nav
      aria-label="Homepage sections"
      className="-mx-4 sm:-mx-6 lg:-mx-8 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)]"
    >
      <ul className="flex items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {TABS.map((tab) => {
          const isActive = tab.key === activeKey;
          const isDisabled = tab.href === null;
          const className = cn(
            'relative inline-flex h-9 shrink-0 items-center px-3 text-sm transition-colors',
            isActive
              ? 'font-semibold text-[var(--ms-text-brand)]'
              : isDisabled
                ? 'cursor-not-allowed text-[var(--ms-text-muted)]/60'
                : 'text-[var(--ms-text-secondary)] hover:text-[var(--ms-text-primary)]',
          );
          const content = (
            <>
              {t(tab.key)}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-sm bg-[var(--ms-bg-brand)]"
                />
              )}
            </>
          );
          return (
            <li key={tab.key}>
              {isDisabled ? (
                <span aria-disabled="true" className={className}>
                  {content}
                </span>
              ) : (
                <a
                  href={tab.href ?? '#'}
                  aria-current={isActive ? 'page' : undefined}
                  className={className}
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
