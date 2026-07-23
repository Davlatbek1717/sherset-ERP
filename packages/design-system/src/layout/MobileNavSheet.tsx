'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, Menu, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';
import type { NavItem } from './AppShell.tsx';
import type { SubNavItem } from './SubNav.tsx';

/**
 * Mobile (≤767px) navigation sheet — the phone replacement for the desktop
 * module navbar + sub-nav strip. Renders its own 40×40 burger trigger (white,
 * for the navy navbar) and a left slide-in panel listing every module; modules
 * with sub-pages expand accordion-style so ALL sections stay reachable on a
 * phone. Desktop keeps the pixel-parity navbar untouched — the app mounts this
 * inside a `md:hidden` wrapper.
 *
 * Links are plain `<a href>` on purpose: the app's spa-nav interceptor
 * (apps/web spa-nav.tsx) upgrades them to router.push, and UnsavedNavGuard
 * still sees them. The (app) layout PERSISTS across route changes, so every
 * link click also closes the sheet explicitly — otherwise it would stay open
 * after navigation.
 */

export interface MobileNavSection extends NavItem {
  /** Sub-pages of the module — rendered as an accordion under the row. */
  items?: SubNavItem[];
}

export interface MobileNavSheetProps {
  sections: MobileNavSection[];
  /** Sheet header title (e.g. «Меню»). */
  title: React.ReactNode;
  /** aria-label for the burger trigger. */
  triggerLabel: string;
  /** aria-label for the close (X) button. */
  closeLabel: string;
}

export function MobileNavSheet({ sections, title, triggerLabel, closeLabel }: MobileNavSheetProps) {
  const [open, setOpen] = React.useState(false);
  const activeKey = sections.find((s) => s.active)?.key ?? null;
  const [expanded, setExpanded] = React.useState<string | null>(activeKey);

  // Re-open lands on the CURRENT module expanded, not a stale one from the
  // previous open (the layout — and this state — survives SPA navigation).
  const onOpenChange = (next: boolean) => {
    if (next) setExpanded(activeKey);
    setOpen(next);
  };
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          data-testid="mobile-nav-trigger"
          className={cn(
            'flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[var(--ms-radius-default)]',
            'text-white/90 transition-colors hover:bg-white/10 hover:text-white',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60',
          )}
        >
          <Menu className="h-6 w-6" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-[var(--ms-z-overlay)] bg-black/30 backdrop-blur-[1px]',
            'data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'duration-150',
          )}
        />
        <Dialog.Content
          data-testid="mobile-nav-sheet"
          aria-describedby={undefined}
          className={cn(
            'fixed top-0 left-0 z-[var(--ms-z-modal)] flex h-dvh w-[85vw] max-w-[320px] flex-col',
            'border-[var(--ms-border-default)] border-r bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-lg)]',
            'focus:outline-none',
            'data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
            'duration-200',
          )}
        >
          <header className="flex items-center gap-3 border-[var(--ms-border-default)] border-b px-4 py-3">
            <Dialog.Title className="flex-1 truncate font-semibold text-[15px] text-[var(--ms-text-primary)]">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={closeLabel}
              className={cn(
                'flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[var(--ms-radius-default)]',
                'text-[var(--ms-text-muted)] transition-colors',
                'hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)]',
              )}
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </header>

          <nav className="min-h-0 flex-1 overflow-y-auto py-1" aria-label={triggerLabel}>
            {sections.map((section) => {
              const hasItems = !!section.items?.length;
              const isExpanded = expanded === section.key;
              return (
                <div key={section.key} className="border-[var(--ms-border-default)] border-b">
                  <div className="flex items-stretch">
                    <a
                      href={section.href}
                      onClick={close}
                      data-testid={`mobile-nav-${section.key}`}
                      className={cn(
                        'flex min-h-[46px] min-w-0 flex-1 items-center gap-3 px-4 text-[15px]',
                        section.active
                          ? 'bg-[var(--ms-bg-selected)] font-semibold text-[var(--ms-text-brand)]'
                          : 'text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]',
                      )}
                    >
                      {section.icon && (
                        <span
                          aria-hidden
                          className={cn(
                            'text-lg leading-none',
                            !section.active && section.iconColorClass,
                          )}
                        >
                          {section.icon}
                        </span>
                      )}
                      <span className="truncate">{section.label}</span>
                    </a>
                    {hasItems && (
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        data-testid={`mobile-nav-${section.key}-toggle`}
                        onClick={() => setExpanded(isExpanded ? null : section.key)}
                        className={cn(
                          'flex w-[44px] shrink-0 items-center justify-center',
                          'text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]',
                        )}
                      >
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            'h-4 w-4 transition-transform duration-150',
                            isExpanded && 'rotate-180',
                          )}
                        />
                      </button>
                    )}
                  </div>
                  {hasItems && isExpanded && (
                    // Owner 2026-07-18: sub-pages need BIGGER text + a divider
                    // between every row (13px undivided list read as cramped).
                    <div className="divide-y divide-[var(--ms-border-default)] border-[var(--ms-border-default)] border-t">
                      {section.items?.map((item) => (
                        <a
                          key={item.key}
                          href={item.href}
                          onClick={close}
                          className={cn(
                            'flex min-h-[44px] items-center py-2 pr-4 pl-11 text-[15px] leading-snug',
                            item.active
                              ? 'bg-[var(--ms-bg-selected)] font-semibold text-[var(--ms-text-brand)]'
                              : 'text-[var(--ms-text-brand)] hover:bg-[var(--ms-bg-hover)]',
                          )}
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
