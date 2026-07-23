'use client';

import type * as React from 'react';
import { cn } from '../lib/cn.ts';

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
   * Interactive user-block slot — when provided it REPLACES the static
   * `user` block entirely (the app renders its own trigger + account
   * dropdown, e.g. the moysklad-parity UserMenu). `user` stays as the
   * static fallback for callers without a menu.
   */
  userSlot?: React.ReactNode;
  /**
   * Optional slot rendered in the top-right between the nav and the user
   * block — designed for compact controls like a locale switcher.
   */
  topRightExtras?: React.ReactNode;
  /**
   * Mobile (≤767px) burger + nav sheet slot (typically `<MobileNavSheet>`).
   * Rendered FIRST in the navbar row inside a `md:hidden` wrapper; when
   * provided, the desktop module tab strip is hidden below `md` (the sheet
   * replaces it). Desktop rendering is untouched.
   */
  mobileMenu?: React.ReactNode;
  topBanner?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
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
  userSlot,
  topRightExtras,
  mobileMenu,
  topBanner,
  children,
  className,
}: AppShellProps) {
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
        {/* Large monitors (≥1600px, owner 2026-07-19): the chrome row is capped
            at the laptop-proven 1440px and centred — full-bleed 2560px read as
            stretched/unprofessional. The bar's navy background still spans the
            whole viewport (this inner row is what centres). <1600px unchanged. */}
        <div className="flex items-center px-4 max-md:px-2 h-[58px] gap-1 min-[1600px]:mx-auto min-[1600px]:w-full min-[1600px]:max-w-[1440px]">
          {/* Mobile burger — replaces the module tab strip below `md`. */}
          {mobileMenu && <div className="md:hidden shrink-0 flex items-center">{mobileMenu}</div>}
          {brand && <div className="shrink-0 mr-4 max-md:mr-2 flex items-center">{brand}</div>}

          <nav
            className={cn(
              // Below `md` the tab strip yields to the burger sheet (when the
              // app provides one) — 14 module tabs never fit a phone bar.
              mobileMenu && 'max-md:hidden',
              // `overflow-y-hidden` is REQUIRED, not cosmetic: setting
              // overflow-x to auto makes the spec compute overflow-y to
              // `auto` too, so the navbar (42px at the app's 12px root
              // font-size) surfaced a spurious VERTICAL scrollbar whenever
              // a tab's content was a hair taller than the bar. Pinning
              // overflow-y to hidden kills that track — tab content now
              // fits the bar, so nothing is clipped.
              'flex items-center gap-0 flex-1 overflow-x-auto overflow-y-hidden',
              // Hide the horizontal scrollbar that overflow-x-auto
              // surfaces — moysklad's navbar never shows a scroll
              // track even when tabs overflow, so we mirror that and
              // let users swipe / shift-wheel instead.
              '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
            )}
          >
            {primaryNav.map((item) => {
              // moysklad parity (user 2026-07-06 «bo'limlar orasidagi chiziqlarni
              // ham olib tashla»): NO dividers between module tabs. moysklad's own
              // `topMenu-new-separator` cells are 0-width/transparent (grounded
              // invisible), so the tabs sit flush — the uniform min-w-[68px] cell
              // width (not a divider) is what keeps the icons evenly spaced.
              return (
                <a
                  key={item.key}
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
                    // min-w-[68px] gives every module cell a UNIFORM width
                    // (moysklad parity: their module cells are a fixed ~68px —
                    // separators MEASURED at even 68px deltas 133→201→269→337,
                    // scripts/ground-navbar-measure.mjs). Without a min-width our
                    // cells were label-width, so icon-center gaps ranged a jagged
                    // 47–76px (short «CRM/HR/Склад» collapsed, long «Производство»
                    // bulged) — the «icons not evenly spaced» the user flagged.
                    // Now every icon sits on a uniform 68px pitch, matching
                    // moysklad. Long labels (Производство/Показатели) still grow
                    // past the min, exactly as they do in moysklad too.
                    'relative flex flex-col items-center justify-start min-w-[68px] px-2.5 pt-[13px] h-[58px] text-[11px] font-medium gap-0.5',
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
              );
            })}
          </nav>

          {/* With the tab strip hidden on mobile its flex-1 is gone too — this
              spacer keeps the icon cluster + user block pinned right. */}
          {mobileMenu && <div aria-hidden className="md:hidden flex-1" />}

          {/* Right-side icon cluster — chats, bell, help, locale.
              Spacing widened to ~12 px (gap-3) to match moysklad's
              breathing room between the threads/bell/help triplet. */}
          {topRightExtras && (
            <div className="shrink-0 flex items-center gap-3 pl-4 max-md:gap-1 max-md:pl-1 text-white/85">
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
          {userSlot ??
            (user && (
              <div className="shrink-0 flex items-center gap-2.5 pl-4 border-l border-white/15 ml-3">
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
              </div>
            ))}
        </div>
      </header>

      {/* The single internal scroll container: fills the height left by the
          navbar and scrolls its own content. List pages that opt into
          DataTable `fillHeight` fill this exactly (no double scroll); taller
          form/detail pages scroll here normally. */}
      <main className="flex flex-col">
        {/* Large monitors: page content centres at the same 1440px cap as the
            navbar row; the app-grey backdrop fills the sides evenly. */}
        <div className="flex w-full flex-col min-[1600px]:mx-auto min-[1600px]:max-w-[1440px]">
          {children}
        </div>
      </main>
    </div>
  );
}
