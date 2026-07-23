'use client';

import * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';

// moysklad new-design tab icons, keyed by tab key so callers don't repeat them.
// (`main` = the positions tab on the /new editors.) Closest design-system glyphs
// to moysklad's clipboard / document / folder / book / speech-bubble set.
const TAB_ICONS: Record<string, React.ReactNode> = {
  main: <Icons.grid className="h-4 w-4" />,
  positions: <Icons.grid className="h-4 w-4" />,
  related: <Icons.document className="h-4 w-4" />,
  files: <Icons.file className="h-4 w-4" />,
  tasks: <Icons.tasks className="h-4 w-4" />,
  events: <Icons.chat className="h-4 w-4" />,
};

/**
 * Tab strip used inside document editors — Главная / Связанные
 * документы. Mirrors moysklad's gwt-TabPanel chrome. Tab content is
 * lazy-rendered: only the active tab's body is mounted, so heavy
 * panels (e.g. RelatedDocs graph) don't pay the cost when inactive.
 */
export interface DocumentTab {
  key: string;
  label: React.ReactNode;
  content: React.ReactNode;
}

export interface DocumentTabsProps {
  tabs: DocumentTab[];
  /** Controlled active tab key. */
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  className?: string;
  testId?: string;
}

export function DocumentTabs({
  tabs,
  activeKey,
  defaultActiveKey,
  onChange,
  className,
  testId,
}: DocumentTabsProps) {
  const [internal, setInternal] = React.useState(defaultActiveKey ?? tabs[0]?.key ?? '');
  const current = activeKey ?? internal;
  const active = tabs.find((t) => t.key === current) ?? tabs[0];

  const setKey = (k: string) => {
    setInternal(k);
    onChange?.(k);
  };

  return (
    <div className={cn('flex flex-col', className)} data-test-id={testId ?? 'doc-tabs'}>
      <nav
        role="tablist"
        className="flex border-[var(--ms-border-default)] border-b"
        aria-label="Document sections"
      >
        {tabs.map((t) => {
          const isActive = t.key === current;
          return (
            // moysklad parity: the GWT editor tab strip uses BOXED tabs (selected
            // tab = white card with top/side borders joining the content area,
            // gwt-TabBarItem-selected), NOT an underline (grounded 2026-07-03 on
            // the #supply/edit capture + the live PR editor screenshot).
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setKey(t.key)}
              className={cn(
                'relative rounded-t-[var(--ms-radius-default)] border border-b-0 px-4 py-2 text-sm transition-colors',
                isActive
                  ? '-mb-px border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] font-medium text-[var(--ms-text-primary)]'
                  : 'border-transparent text-[var(--ms-text-brand)] hover:text-[var(--ms-text-primary)]',
              )}
              data-test-id={`doc-tab-${t.key}`}
            >
              <span className="inline-flex items-center gap-1.5">
                {TAB_ICONS[t.key] ? (
                  <span className="text-[var(--ms-text-muted)]" aria-hidden>
                    {TAB_ICONS[t.key]}
                  </span>
                ) : null}
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="pt-3" role="tabpanel" data-test-id={`doc-tab-content-${active?.key}`}>
        {active?.content}
      </div>
    </div>
  );
}
