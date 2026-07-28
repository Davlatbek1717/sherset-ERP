'use client';

import type * as React from 'react';
import { cn } from '../lib/cn.ts';
import { formatDate, formatMoney } from '../lib/format.ts';
import { Badge } from '../primitives/Badge.tsx';

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'destructive';

export interface RelatedDoc {
  id: string;
  /** URL of the linked detail page, e.g. "/demands/abc-123" */
  href: string;
  /** Auto-numbered document name, e.g. "ОТ-00023" */
  name: string;
  /** Localized FSM state label (e.g. "Provedeno"). */
  stateLabel?: React.ReactNode;
  /** Badge tone for the state chip. */
  stateTone?: BadgeTone;
  /** Moment / posted date as ISO string. */
  at?: string | Date | null;
  /** Optional money total — rendered right-aligned with tabular numerals. */
  sumMinor?: string | null;
}

export interface RelatedDocsGroup {
  /** Display label for the section header, e.g. "Fakturalar". */
  label: React.ReactNode;
  docs: RelatedDoc[];
  /**
   * "Create" helper — shown as a small button in the group header if present.
   * Passed URL is pushed via <a href> so callers can wire router.push if they
   * prefer (just wrap it).
   */
  createHref?: string;
  createLabel?: React.ReactNode;
}

export interface RelatedDocsPanelProps {
  groups: RelatedDocsGroup[];
  emptyLabel?: React.ReactNode;
  className?: string;
}

/**
 * Right-column panel for the detail page that surfaces sibling documents
 * cascaded off the current entity. Matches moysklad.uz's "Связанные
 * документы" block — grouped by kind, each row is a link with state badge +
 * date + total.
 */
export function RelatedDocsPanel({
  groups,
  emptyLabel = 'Bog\u2019liq hujjatlar yo\u2019q',
  className,
}: RelatedDocsPanelProps) {
  const hasAny = groups.some((g) => g.docs.length > 0);
  if (!hasAny) {
    return (
      <div
        className={cn(
          'text-center py-6 border border-dashed border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] text-sm text-[var(--ms-text-muted)]',
          className,
        )}
        data-test-id="related-docs-empty"
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)} data-test-id="related-docs-panel">
      {groups.map((g, gi) =>
        g.docs.length > 0 || g.createHref ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: `RelatedDocsGroup.label` is a ReactNode, so there is no stable string key; the sections are stateless link lists that never reorder
          <section key={gi}>
            <header className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--ms-text-muted)]">
                {g.label}
              </h4>
              {g.createHref && (
                <a
                  href={g.createHref}
                  className="text-xs text-[var(--ms-text-brand)] hover:underline underline-offset-2"
                >
                  {g.createLabel ?? '+'}
                </a>
              )}
            </header>
            {g.docs.length > 0 && (
              <ul className="space-y-1">
                {g.docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 text-sm"
                    data-test-id={`related-doc-${d.id}`}
                  >
                    <a
                      href={d.href}
                      className="font-medium text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline underline-offset-2 truncate"
                    >
                      {d.name}
                    </a>
                    {d.stateLabel && (
                      <Badge tone={d.stateTone ?? 'neutral'} className="shrink-0">
                        {d.stateLabel}
                      </Badge>
                    )}
                    {d.sumMinor && (
                      <span className="ml-auto text-xs tabular-nums text-[var(--ms-text-muted)]">
                        {formatMoney(d.sumMinor)}
                      </span>
                    )}
                    {d.at && !d.sumMinor && (
                      <span className="ml-auto text-xs text-[var(--ms-text-muted)]">
                        {formatDate(d.at instanceof Date ? d.at.toISOString() : d.at)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null,
      )}
    </div>
  );
}
