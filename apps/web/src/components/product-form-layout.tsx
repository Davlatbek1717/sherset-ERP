'use client';

/**
 * Shared 2-column layout primitives for the moysklad-parity product editor.
 *
 * moysklad's product create/edit form (#good/edit) is a 2-column shell: a LEFT
 * stack of collapsible cards (Изображения · Общие данные · Дополнительные поля ·
 * Особенности учета) and a RIGHT tab strip (Цены · Модификации · Аналоги ·
 * Упаковка · Остатки · История · Файлы). These primitives carry ONLY the
 * structure/chrome — the fields and tab content stay in the page.
 *
 * Built for /products/new first (flagship 1). /products/[id] keeps its own
 * FormSection layout today; it can adopt this same shell in a later flagship,
 * which is why the shell lives here rather than inline in the page.
 */

import { Icons } from '@moysklad/ui';
import type { ReactNode } from 'react';
import { useState } from 'react';

export interface ProductFormShellProps {
  /** Left column — a stack of ProductFormCard(s). */
  left: ReactNode;
  /** Right column — the tab strip. */
  right: ReactNode;
}

/**
 * 2-column shell: a narrow left card-stack (~460px, matching moysklad) and a
 * right tab region (~765px). Collapses to a single column below `lg`.
 *
 * moysklad parity (pixel-grounded 2026-06-25, hist-0-full.png — left ≈457px,
 * right ≈765px, total ≈1252px): the product card is NOT full-width. It is capped
 * and LEFT-aligned with whitespace on the right — so the right column (and its
 * tables, e.g. «История») never stretches across the whole viewport.
 */
export function ProductFormShell({ left, right }: ProductFormShellProps) {
  return (
    <div
      className="grid max-w-[1240px] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]"
      data-test-id="product-form-shell"
    >
      <div className="space-y-4">{left}</div>
      <div className="min-w-0">{right}</div>
    </div>
  );
}

export interface ProductFormCardProps {
  title: ReactNode;
  children: ReactNode;
  /** moysklad opens every card by default. */
  defaultOpen?: boolean;
  testId?: string;
}

/**
 * Collapsible left-column card matching moysklad's card chrome: a header row
 * with the title + a ▾ chevron disclosure, and a collapsible body. (The DS
 * FormSection is a static card with no collapse, so this re-uses the same
 * surface tokens but adds the disclosure button.)
 */
export function ProductFormCard({
  title,
  children,
  defaultOpen = true,
  testId,
}: ProductFormCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const ChevronDown = Icons.down;
  return (
    <section
      className="rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]"
      data-test-id={testId}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        data-test-id={testId ? `${testId}-toggle` : undefined}
      >
        <span className="font-semibold text-[var(--ms-text-primary)] text-base">{title}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-[var(--ms-text-muted)] transition-transform ${
            open ? '' : '-rotate-90'
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-4 border-[var(--ms-border-default)] border-t px-4 py-4">
          {children}
        </div>
      )}
    </section>
  );
}
