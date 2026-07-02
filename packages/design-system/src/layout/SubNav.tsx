'use client';

import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface SubNavItem {
  key: string;
  label: React.ReactNode;
  href: string;
  active?: boolean;
}

export interface SubNavProps extends React.HTMLAttributes<HTMLElement> {
  items: SubNavItem[];
}

/**
 * Module-level cross-page tab strip. Sits between the top blue navbar
 * and the page content. Mirrors moysklad's sub-navigation:
 *
 * - Light grey background (NOT the brand-blue navbar) — see screenshots
 *   in docs/moysklad-reference/visual-captures/03-module/customerorder/
 * - Inactive tabs: brand-BLUE link text (moysklad parity), hover deepens
 * - Active tab: same blue, bold + 2px brand bottom border
 * - Hairline bottom border separates the strip from the page content
 *
 * Items array is data-driven so the consuming layout can build per-module
 * tab sets (sales / purchases / money / ...) and pass the right one based
 * on the current pathname.
 */
export const SubNav = React.forwardRef<HTMLElement, SubNavProps>(
  ({ className, items, ...props }, ref) => (
    <nav
      ref={ref}
      aria-label="Module sub-navigation"
      className={cn(
        'border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)]',
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-stretch overflow-x-auto px-4">
        {items.map((item) => (
          <a
            key={item.key}
            href={item.href}
            data-active={item.active ? 'true' : undefined}
            className={cn(
              // moysklad parity (user 2026-06-22): sub-nav links are BLUE and a
              // notch BIGGER than the rest of the chrome — not the faded grey
              // we had. Inactive = brand blue (normal weight); active = same
              // blue but bold + the 2px brand underline. 13px (was text-sm ⇒
              // 10.5px at the 12px root) matches moysklad's roomier strip.
              // py-3 (was py-2.5): with the navbar now a measured 58px, py-3 makes
              // the strip ~41px so the total top-chrome lands on moysklad's 99px.
              'inline-flex items-center border-b-2 border-transparent px-4 py-3 text-[13px] transition-colors',
              'text-[var(--ms-text-brand)] hover:text-[var(--ms-brand-600)]',
              item.active &&
                'border-[var(--ms-brand-500)] font-semibold text-[var(--ms-text-brand)] hover:text-[var(--ms-text-brand)]',
            )}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  ),
);
SubNav.displayName = 'SubNav';
