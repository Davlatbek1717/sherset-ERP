'use client';

import type * as React from 'react';
import { cn } from '../lib/cn.ts';
import { formatDate } from '../lib/format.ts';
import { Avatar } from '../primitives/Avatar.tsx';

export interface AuditEntry {
  id: string;
  action: string;
  at: string | Date;
  user: { id: string; name: string; email: string } | null;
  fieldChanges: Record<string, { before?: unknown; after?: unknown }> | null;
  context?: Record<string, unknown> | null;
}

export interface HistoryTimelineProps {
  entries: AuditEntry[];
  /**
   * Optional action-label translator. If absent, the raw action string (e.g.
   * "demand.post") is rendered verbatim.
   */
  translateAction?: (action: string) => React.ReactNode;
  /**
   * Optional field-name translator — renders "vatEnabled" as "NDS faol".
   */
  translateField?: (field: string) => React.ReactNode;
  /**
   * Optional diff-value translator. Returns a localised string for values the
   * caller knows how to map (e.g. the FSM status slug on a transition entry),
   * or `undefined` to fall back to the default `formatValue` rendering. Receives
   * the entry's action so the caller can scope translation (e.g. only the
   * `from` field of a `transition:*` entry).
   */
  translateValue?: (field: string, value: unknown, action: string) => React.ReactNode | undefined;
  emptyLabel?: React.ReactNode;
  /** Column headers of the per-entry diff table (moysklad: Поле / Было / Стало). */
  fieldHeader?: string;
  beforeHeader?: string;
  afterHeader?: string;
  className?: string;
}

// Internal/bookkeeping fields moysklad never surfaces in the audit diff (we record
// them on every update() but they're not user-facing) — hidden so the panel reads 1:1.
const INTERNAL_FIELDS = new Set(['version', 'updatedAt', 'createdAt']);
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') {
    // moysklad shows a localised date, not the raw ISO string (e.g. the «Дата» diff).
    if (ISO_DATETIME.test(v)) return formatDate(v);
    return v.length > 80 ? `${v.slice(0, 77)}...` : v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  } catch {
    return '[object]';
  }
}

/**
 * moysklad «История изменений» change-history list. Each entry is a flat block
 * (NO timeline rail/dots) with the editor's avatar + bold name + ", <action>
 * <timestamp>", followed by a three-column «Поле / Было / Стало» diff table —
 * mirroring the live audit modal 1:1. Used by the top-right «Изменения» modal
 * and the detail page's History tab.
 */
export function HistoryTimeline({
  entries,
  translateAction,
  translateField,
  translateValue,
  emptyLabel = 'Tarix yo’q',
  fieldHeader = 'Поле',
  beforeHeader = 'Было',
  afterHeader = 'Стало',
  className,
}: HistoryTimelineProps) {
  if (entries.length === 0) {
    return (
      <div
        className={cn(
          'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] border-dashed py-6 text-center text-[var(--ms-text-muted)] text-sm',
          className,
        )}
        data-test-id="history-empty"
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {entries.map((e) => {
        const diffs = e.fieldChanges
          ? Object.entries(e.fieldChanges).filter(
              ([field, change]) =>
                change && typeof change === 'object' && !INTERNAL_FIELDS.has(field),
            )
          : [];
        return (
          <div key={e.id} data-test-id={`history-entry-${e.id}`}>
            {/* «Бекзод Н., изменено 24.06.2026 16:20» — avatar + bold name +
                muted ", <action> <timestamp>" (moysklad header line). */}
            <div className="flex items-center gap-2 text-sm">
              {e.user && <Avatar name={e.user.name} size="sm" />}
              {e.user && (
                <span className="font-semibold text-[var(--ms-text-primary)]">{e.user.name}</span>
              )}
              <span className="text-[var(--ms-text-muted)]">
                {e.user ? ', ' : ''}
                {translateAction ? translateAction(e.action) : e.action}{' '}
                {formatDate(e.at instanceof Date ? e.at.toISOString() : e.at)}
              </span>
            </div>
            {diffs.length > 0 && (
              /* OWNER 2026-07-17: «jadval chiziqlari qalinroq, ajralib tursin»
                 — 2px + border-strong separators (same philosophy as the
                 2026-07-14 global darker-borders override). */
              <table
                className="mt-2 w-full table-fixed border-[var(--ms-border-strong)] border-t-2 text-sm"
                data-test-id="history-diff-table"
              >
                <thead>
                  <tr className="border-[var(--ms-border-strong)] border-b-2 text-left text-[var(--ms-text-muted)] text-xs">
                    <th className="w-[200px] py-1 pr-4 font-normal">{fieldHeader}</th>
                    <th className="py-1 pr-4 font-normal">{beforeHeader}</th>
                    <th className="py-1 font-normal">{afterHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map(([field, change]) => {
                    // Let the caller localise a value it recognises (e.g. an FSM
                    // status slug); fall back to the default formatter otherwise.
                    const before = translateValue?.(field, change.before, e.action);
                    const after = translateValue?.(field, change.after, e.action);
                    return (
                      <tr
                        key={field}
                        className="border-[var(--ms-border-strong)] border-t-2 align-top"
                      >
                        <td className="break-words py-1.5 pr-4 text-[var(--ms-text-muted)]">
                          {translateField ? translateField(field) : field}
                        </td>
                        <td className="break-words py-1.5 pr-4 text-[var(--ms-text-primary)]">
                          {before === undefined ? formatValue(change.before) : before}
                        </td>
                        <td className="break-words py-1.5 text-[var(--ms-text-primary)]">
                          {after === undefined ? formatValue(change.after) : after}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
