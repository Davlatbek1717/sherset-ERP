'use client';

import type * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';

export interface BulkAction {
  key: string;
  /** Visible label on the button. */
  label: React.ReactNode;
  /** Called with the full selected-id set when clicked. */
  onClick: (ids: string[]) => void;
  /** Optional leading icon element. */
  icon?: React.ReactNode;
  /** Renders as a destructive (red) button when true. */
  destructive?: boolean;
  /** Disables the button (e.g. when bulk-mutation is pending). */
  disabled?: boolean;
  testId?: string;
}

export interface BulkActionBarProps {
  selectedIds: Set<string>;
  onClear: () => void;
  actions: BulkAction[];
  /** i18n-safe label template: "{count} ta tanlandi" / "Выбрано: {count}". */
  countLabel: (count: number) => React.ReactNode;
  clearLabel?: React.ReactNode;
  className?: string;
}

/**
 * Inline bulk-action bar shown above a DataTable when rows are selected.
 * Matches moysklad.uz UX: when any row is checked, the filter row is
 * replaced (or overlaid) with a count + per-entity action buttons.
 */
export function BulkActionBar({
  selectedIds,
  onClear,
  actions,
  countLabel,
  clearLabel = 'Bekor qilish',
  className,
}: BulkActionBarProps) {
  if (selectedIds.size === 0) return null;
  const ids = Array.from(selectedIds);
  return (
    <div
      className={cn(
        'flex items-center gap-2 flex-wrap',
        'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-brand,var(--ms-border-default))]',
        'bg-[var(--ms-bg-brand-subtle,var(--ms-bg-muted))] px-3 py-2',
        className,
      )}
      data-test-id="bulk-action-bar"
    >
      <span
        className="text-sm font-medium text-[var(--ms-text-default)] mr-2"
        data-test-id="bulk-count"
      >
        {countLabel(selectedIds.size)}
      </span>
      {actions.map((a) => (
        <Button
          key={a.key}
          size="sm"
          variant={a.destructive ? 'destructive' : 'secondary'}
          onClick={() => a.onClick(ids)}
          disabled={a.disabled}
          data-test-id={a.testId ?? `bulk-action-${a.key}`}
        >
          {a.icon}
          {a.label}
        </Button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        className="ml-auto"
        data-test-id="bulk-clear"
      >
        <Icons.close className="w-4 h-4" />
        {clearLabel}
      </Button>
    </div>
  );
}
