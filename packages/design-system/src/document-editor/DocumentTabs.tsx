'use client';

import * as React from 'react';
import { cn } from '../lib/cn.ts';

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
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setKey(t.key)}
              className={cn(
                'relative px-4 py-2 text-sm transition-colors',
                isActive
                  ? 'font-medium text-[var(--ms-text-brand)]'
                  : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]',
              )}
              data-test-id={`doc-tab-${t.key}`}
            >
              {t.label}
              {isActive && (
                <span
                  aria-hidden
                  className="-bottom-px absolute left-0 right-0 h-0.5 bg-[var(--ms-text-brand)]"
                />
              )}
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
