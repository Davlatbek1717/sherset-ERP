'use client';

import * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';

/**
 * Collapsible orange-bar panel — moysklad's b-disclosure-panel-orange.
 * Used for the «Задачи» and «Файлы» blocks at the bottom of every
 * editor. Click the header to toggle; an optional header-action slot
 * (typically «+ Задача» or «+ Файл») stays clickable without
 * triggering the toggle.
 *
 * Defaults to OPEN because the moysklad parity screenshots all show
 * both panels open by default — pages don't need to opt in.
 */
export interface DocumentDisclosurePanelProps {
  title: React.ReactNode;
  children: React.ReactNode;
  /** Optional element rendered to the right of the title (e.g.
   *  «+ Задача» button). Click events on this slot are stopped from
   *  bubbling so they don't toggle the panel. */
  headerAction?: React.ReactNode;
  defaultOpen?: boolean;
  testId?: string;
  className?: string;
}

export function DocumentDisclosurePanel({
  title,
  children,
  headerAction,
  defaultOpen = true,
  testId,
  className,
}: DocumentDisclosurePanelProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section
      className={cn(
        'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]',
        className,
      )}
      data-test-id={testId}
    >
      <header className="flex items-center gap-2 border-l-4 border-l-[var(--ms-warning-300,#f5a623)] px-3 py-2">
        <button
          type="button"
          className="flex flex-1 cursor-pointer select-none items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <Icons.down
            className={cn(
              'h-4 w-4 text-[var(--ms-text-muted)] transition-transform',
              !open && '-rotate-90',
            )}
          />
          <span className="font-medium text-[var(--ms-text-primary)] text-sm">{title}</span>
        </button>
        {headerAction && <span className="ml-auto">{headerAction}</span>}
      </header>
      {open && (
        <div className="border-[var(--ms-border-default)] border-t p-3">{children}</div>
      )}
    </section>
  );
}
