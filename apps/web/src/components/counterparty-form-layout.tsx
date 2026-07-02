'use client';

/**
 * Shared 2-column layout primitives for the moysklad-parity counterparty card.
 *
 * Live-grounded 2026-06-20 (docs/audits/counterparty-card-1to1-2026-06-20/): moysklad's
 * counterparty card (#company/edit) is a 2-column shell — a top full-width «* Наименование»
 * input, then a LEFT stack of collapsible cards (Налоги · О контрагенте [Статус/Группы/контакты]
 * · Контактные лица · Реквизиты · Доступ, all label-LEFT) and a RIGHT region carrying the
 * activity tabs (События · Задачи · Документы · Файлы · Показатели). These primitives carry ONLY
 * the structure/chrome — the fields and tab content stay in the page.
 *
 * Mirrors product-form-layout.tsx (the products 2-col shell). Per-domain shell for now (the two
 * genuinely diverge: right column = activity tabs here vs price/stock tabs there); a shared shell
 * is a later unify-step. Applied to /[id] first (the "card" the user opens), then /new.
 */

import { Icons } from '@moysklad/ui';
import type { ReactNode } from 'react';
import { useState } from 'react';

export interface CounterpartyFormShellProps {
  /** Full-width row above both columns — the «* Наименование» input. */
  top?: ReactNode;
  /** Left column — a stack of CounterpartyFormCard(s). */
  left: ReactNode;
  /** Right column — the activity tab region. */
  right: ReactNode;
}

/**
 * 2-column shell: a narrow left card-stack (~460px, matching moysklad) and a flexible right
 * region, with an optional full-width top row. Collapses to a single column below `lg`.
 */
export function CounterpartyFormShell({ top, left, right }: CounterpartyFormShellProps) {
  return (
    <div className="space-y-4" data-test-id="counterparty-form-shell">
      {top}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="space-y-4">{left}</div>
        <div className="min-w-0">{right}</div>
      </div>
    </div>
  );
}

export interface CounterpartyFormCardProps {
  title: ReactNode;
  children: ReactNode;
  /** moysklad opens every card by default. */
  defaultOpen?: boolean;
  testId?: string;
}

/**
 * Collapsible left-column card matching moysklad's card chrome: a header row with the title + a
 * ▾ chevron disclosure, and a collapsible body. (The DS FormSection is a static card with no
 * collapse, so this re-uses the same surface tokens but adds the disclosure button.)
 */
export function CounterpartyFormCard({
  title,
  children,
  defaultOpen = true,
  testId,
}: CounterpartyFormCardProps) {
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

/**
 * A label-LEFT field row for the «О контрагенте» card (moysklad puts the field label in a fixed
 * left gutter, the control on the right). Replaces the DS FormField's label-TOP stacking inside
 * these cards. `htmlFor`/`id` wiring stays the caller's responsibility.
 */
export function CounterpartyFieldRow({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    // moysklad-measured (ms-cp-new-live-2026-06-21): ~150px label gutter + a ~240px control
    // (NOT full-width) — the input stops well short of the card's right edge, with whitespace
    // after. grounded vs the live card 2026-06-21 (control 305px→240px, label 120px→150px).
    <div className="grid grid-cols-[150px_minmax(0,240px)] items-start gap-3">
      <div className="pt-1.5 text-[var(--ms-text-muted)] text-sm">{label}</div>
      <div className="min-w-0 space-y-1">
        {children}
        {hint ? <p className="text-[var(--ms-text-muted)] text-xs">{hint}</p> : null}
      </div>
    </div>
  );
}
