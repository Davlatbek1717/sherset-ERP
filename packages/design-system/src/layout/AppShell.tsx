'use client';

import { Menu } from 'lucide-react';
import * as React from 'react';
import { Drawer } from '../feedback/Drawer.tsx';
import { cn } from '../lib/cn.ts';
import { DropdownMenu } from '../primitives/DropdownMenu.tsx';

export interface NavItem {
  key: string;
  label: React.ReactNode;
  href: string;
  icon?: React.ReactNode;
  /**
   * Optional Tailwind text-* class applied to the icon span — gives each
   * module its own brand colour the way moysklad.uz does (orange shopping,
   * teal cart, blue warehouse, etc.). Not used for the active state, which
   * always wins via the `text-[var(--ms-text-brand)]` rule below.
   */
  iconColorClass?: string;
  active?: boolean;
  badge?: React.ReactNode;
}

export interface AppShellProps {
  brand?: React.ReactNode;
  primaryNav: NavItem[];
  user?: {
    name: string;
    email?: string;
    avatar?: string;
  };
  /**
   * Optional slot rendered in the top-right between the nav and the user
   * block — designed for compact controls like a locale switcher.
   */
  topRightExtras?: React.ReactNode;
  topBanner?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onLogout?: () => void;
  /** Opens the settings hub — rendered as a "Sozlamalar" item in the account menu. */
  onSettings?: () => void;
}

/**
 * Top-level app layout — mirrors Moysklad's navbar + main structure.
 * Dark navy top bar (#091739) with module tabs, optional orange trial
 * banner above, then main content.
 */
export function AppShell({
  brand,
  primaryNav,
  user,
  topRightExtras,
  topBanner,
  children,
  className,
  onLogout,
  onSettings,
}: AppShellProps) {
  // <lg (1024px, matches the lg:flex-row breakpoint already used e.g. in
  // stores/[id]/page.tsx): the horizontal tab strip below has no room for
  // 12+ module tabs, so it collapses behind a hamburger + slide-in <Drawer>
  // instead (2026-07-20f — the whole app shell had no mobile nav at all).
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <div
      className={cn(
        // Natural document scroll — the app grows with its content and the
        // document body scrolls (NO inner scroll boxes), per the user's repeated
        // «remove inner scrolls completely» request. The navbar keeps its own
        // `sticky top-0`; list pages render totals in natural flow. Keeping the
        // shell unbounded also makes any leftover DataTable `fillHeight` inert
        // (no height-bounded ancestor ⇒ the grid never gets an internal scrollbar).
        'min-h-screen flex flex-col bg-[var(--ms-bg-app)]',
        className,
      )}
    >
      {topBanner && (
        <div className="bg-[var(--ms-warning-500)] text-white text-xs px-4 py-2 text-center">
          {topBanner}
        </div>
      )}

      {/* moysklad parity (user 2026-06-20): the module navbar is NOT pinned — it
          scrolls away with the page (natural document scroll). The document SAVE
          toolbar pins instead (see DocumentToolbar / DetailToolbar `sticky top-0`),
          so actions stay reachable while the nav frees vertical space. */}
      <header className="ms-navbar">
        {/* Navbar height = 58px, MEASURED from live moysklad (2026-06-23,
            scripts/ground-navbar-measure.mjs): their module cell is 58px tall
            (a 24px icon at top:15 + the 11px label directly below), and the
            whole top-chrome is 99px. We MUST use a FIXED px height, not h-14:
            the app root font is 12px, so a rem-based h-14 shrinks to 42px —
            exactly the «bizniki past/cho'zilgan» gap the user flagged (ours
            read flat & stretched vs moysklad's taller, denser bar). */}
        <div className="flex items-center px-4 h-[58px] gap-1">
          {brand && <div className="shrink-0 mr-4 flex items-center">{brand}</div>}

          {/* <lg: hamburger opens the mobile nav <Drawer> below. The
              horizontal tab strip (with 12+ modules) has no room to be
              usable at phone/tablet widths. */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden flex shrink-0 items-center justify-center h-9 w-9 rounded-[var(--ms-radius-default)] text-white/85 hover:bg-white/10 hover:text-white"
            aria-label="Menyu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          {/* Mobile-only spacer: the hidden <nav> below normally carries
              flex-1 to push topRightExtras/user block to the right edge. */}
          <div className="flex-1 lg:hidden" aria-hidden />

          <nav
            className={cn(
              // `overflow-y-hidden` is REQUIRED, not cosmetic: setting
              // overflow-x to auto makes the spec compute overflow-y to
              // `auto` too, so the navbar (42px at the app's 12px root
              // font-size) surfaced a spurious VERTICAL scrollbar whenever
              // a tab's content was a hair taller than the bar. Pinning
              // overflow-y to hidden kills that track — tab content now
              // fits the bar, so nothing is clipped.
              // <lg (2026-07-20f): hidden — 12+ tabs have no usable room at
              // phone/tablet widths, replaced by the hamburger+Drawer above.
              'hidden lg:flex items-center gap-0 flex-1 overflow-x-auto overflow-y-hidden',
              // Hide the horizontal scrollbar that overflow-x-auto
              // surfaces — moysklad's navbar never shows a scroll
              // track even when tabs overflow, so we mirror that and
              // let users swipe / shift-wheel instead.
              '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
            )}
          >
            {primaryNav.map((item, idx) => {
              // A thin vertical separator sits BETWEEN each tab pair (not before
              // the first, and not flush against the active white pill which already
              // separates itself). USER REQUEST (2026-06-23): the lines must be
              // clearly visible — moysklad's own `topMenu-new-separator` cells are
              // 0-width/transparent in this account (grounded: invisible), but the
              // user wants visible dividers, so we render white/30 (not the old
              // white/15 that washed out on the medium-blue bar).
              const showSeparator = idx > 0 && !item.active && !primaryNav[idx - 1]?.active;
              return (
                <React.Fragment key={item.key}>
                  {showSeparator && (
                    <span aria-hidden className="self-center h-[34px] w-px bg-white/30 mx-0.5" />
                  )}
                  <a
                    href={item.href}
                    className={cn(
                      // moysklad parity: active tab is a SOFT WHITE TAB with
                      // BRAND-BLUE label + icon (not just dark gray) — matches
                      // moysklad's exact two-tone treatment, and its square
                      // bottom edge connects down to the sub-nav strip.
                      // Inactive tabs render as a subtle ghost on the medium-
                      // blue navbar.
                      // moysklad-MEASURED cell (2026-06-23): 24px icon at top:15,
                      // 11px label directly below, cell ~75px wide. We mirror it
                      // with pt-[13px] + gap-0.5 in a 58px-tall cell, and px-2.5
                      // so the 14 tabs pack TIGHT («kichik joyni egalagan») instead
                      // of the stretched px-4 cells the user flagged. The active
                      // tab fills the full 58px so its white pill squares down onto
                      // the sub-nav strip (moysklad's connected-tab look).
                      'relative flex flex-col items-center justify-start px-2.5 pt-[13px] h-[58px] text-[11px] font-medium gap-0.5',
                      'transition-colors duration-[var(--ms-duration-fast)]',
                      'whitespace-nowrap rounded-t-md',
                      item.active
                        ? 'bg-white text-[var(--ms-text-brand)]'
                        : 'text-white/85 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {item.icon && (
                      <span
                        className={cn(
                          'relative text-base leading-none',
                          // Per-module brand icon colour for INACTIVE tabs only
                          // (matches moysklad's muted brand accents on the lighter
                          // navbar). Active tab inherits the dark text colour so
                          // the icon sits on the white pill cleanly.
                          !item.active && item.iconColorClass,
                        )}
                        aria-hidden
                      >
                        {item.icon}
                        {/* moysklad-style overdue/active count badge anchored to
                        the icon's top-right corner, NOT inline with the label
                        (matches the screenshot of the live moysklad navbar). */}
                        {item.badge && (
                          <span className="-top-1 -right-2 absolute pointer-events-none">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </a>
                </React.Fragment>
              );
            })}
          </nav>

          {/* Right-side icon cluster — chats, bell, help, locale.
              Spacing widened to ~12 px (gap-3) to match moysklad's
              breathing room between the threads/bell/help triplet. */}
          {topRightExtras && (
            <div className="shrink-0 flex items-center gap-3 pl-4 text-white/85">
              {topRightExtras}
            </div>
          )}

          {/* User-block — moysklad parity:
              · two-line text (last name + email) right-aligned
              · circular avatar
              · small dropdown arrow (▾) on the far right indicating
                the account menu opens here
              · own left-border separator with extra padding for visual
                weight (matches moysklad's user-panel-new) */}
          {user && (
            <DropdownMenu
              align="end"
              trigger={
                <button
                  type="button"
                  className="shrink-0 flex items-center gap-2.5 pl-4 border-l border-white/15 ml-3 cursor-pointer hover:opacity-80 transition-opacity bg-transparent"
                >
                  <div className="text-right text-[11px] leading-tight">
                    <div className="font-medium text-white">{user.name}</div>
                    {user.email && <div className="text-white/65 text-[10px]">{user.email}</div>}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/15 text-white flex items-center justify-center text-xs font-semibold">
                    {user.avatar ?? user.name[0]?.toUpperCase()}
                  </div>
                  <span aria-hidden className="text-white/65 text-[10px] leading-none">
                    ▾
                  </span>
                </button>
              }
            >
              {onSettings && (
                <DropdownMenu.Item onSelect={onSettings}>Sozlamalar</DropdownMenu.Item>
              )}
              {onLogout && (
                <DropdownMenu.Item onSelect={onLogout} destructive>
                  Chiqish
                </DropdownMenu.Item>
              )}
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* The single internal scroll container: fills the height left by the
          navbar and scrolls its own content. List pages that opt into
          DataTable `fillHeight` fill this exactly (no double scroll); taller
          form/detail pages scroll here normally. */}
      <main className="flex flex-col">{children}</main>

      {/* Mobile module nav (2026-07-20f) — same primaryNav list as the
          desktop tab strip above, rendered vertically. */}
      <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen} title={brand ?? 'Menyu'}>
        <nav className="flex flex-col gap-0.5 p-2">
          {primaryNav.map((item) => (
            <a
              key={item.key}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-[var(--ms-radius-default)] px-3 py-2.5 font-medium text-sm transition-colors',
                item.active
                  ? 'bg-[var(--ms-bg-selected)] text-[var(--ms-text-brand)]'
                  : 'text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]',
              )}
            >
              {item.icon && (
                <span
                  className={cn(
                    'relative text-base leading-none',
                    !item.active && item.iconColorClass,
                  )}
                  aria-hidden
                >
                  {item.icon}
                </span>
              )}
              <span className="flex-1">{item.label}</span>
              {item.badge}
            </a>
          ))}
        </nav>
      </Drawer>
    </div>
  );
}
