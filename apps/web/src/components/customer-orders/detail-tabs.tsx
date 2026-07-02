'use client';

/**
 * Customer-order detail page tab strip — moysklad parity.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   customerorder/screenshots/d-default.{png,dom.html} (active tab
 *   "Главная") and d-tab-svyazannye-dokumenty.{png,dom.html}
 *   (active tab "Связанные документы").
 *
 * The captured DOM uses `<div class="tabName">` inside React tab
 * components. We mirror the visual look (underline-on-active,
 * neutral on hover) using Tailwind, and expose a `value` /
 * `onChange` API the parent page drives.
 */

import { useTranslations } from 'next-intl';

export type DetailTabValue = 'main' | 'related';

export interface DetailTabsProps {
  value: DetailTabValue;
  onChange(next: DetailTabValue): void;
}

export function DetailTabsStrip({ value, onChange }: DetailTabsProps) {
  const t = useTranslations('detail_tabs');

  return (
    <div
      role="tablist"
      className="flex items-center gap-1 border-[var(--ms-border-default)] border-b"
      data-test-id="detail-tabs-strip"
    >
      <Tab
        value="main"
        active={value === 'main'}
        label={t('main')}
        onSelect={() => onChange('main')}
      />
      <Tab
        value="related"
        active={value === 'related'}
        label={t('related_docs')}
        onSelect={() => onChange('related')}
      />
    </div>
  );
}

interface TabProps {
  value: DetailTabValue;
  active: boolean;
  label: string;
  onSelect(): void;
}

function Tab({ value, active, label, onSelect }: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      data-test-id={`detail-tab-${value}`}
      className={`-mb-px relative px-3 py-2 font-medium text-sm transition-colors ${
        active
          ? 'border-[var(--ms-text-brand)] border-b-2 text-[var(--ms-text-primary)]'
          : 'border-transparent border-b-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
      }`}
    >
      {label}
    </button>
  );
}
