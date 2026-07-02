'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  total: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Optional first/last page navigation (moysklad shows ◄◄ and ►► arrows). */
  onFirst?: () => void;
  onLast?: () => void;
  /** Number of rows currently visible — used for the "1-N" range. */
  visibleCount?: number;
  /** Absolute 0-based offset of the first visible row. Offset/page pagination
   *  passes this so the range reads "M-N" (e.g. 101-200); cursor callers omit
   *  it and the range stays "1-N" (default 0). */
  offset?: number;
  itemLabel?: string;
  /**
   * moysklad-parity layout: small text "1-N из {total}" on the left
   * and icon-only chevron buttons on the right (no "Oldingi"/"Keyingi"
   * labels). Default off to preserve the existing UX on other pages.
   */
  moyskladStyle?: boolean;
  /** Localized "of" connector — "из" (ru) or "/" or "dan" (uz). */
  ofLabel?: string;
}

/**
 * App-root injector for Pagination's localized strings. Without it the
 * design-system defaults leak: the moyskladStyle range connector defaults
 * to Russian «из» (leaks into the UZ UI) and the icon-button aria-labels
 * default to English (same design-system-default-leak bug-class as
 * ModalLabelsProvider / ConfirmDialog / CatalogPicker). The web app injects
 * these (RU/UZ via next-intl). A per-`<Pagination>` prop still wins over
 * the injected value, which in turn wins over the hard fallback.
 */
export interface PaginationLabels {
  /** Range connector — «из» (ru) / "dan" (uz). moyskladStyle only. */
  of?: string;
  /** aria-label for the «jump to first page» icon button (◄◄). */
  first?: string;
  /** aria-label for the «previous page» icon button (◄). */
  previous?: string;
  /** aria-label for the «next page» icon button (►). */
  next?: string;
  /** aria-label for the «jump to last page» icon button (►►). */
  last?: string;
}

const PaginationLabelsContext = React.createContext<PaginationLabels>({});

export function PaginationLabelsProvider({
  labels: { of, first, previous, next, last },
  children,
}: {
  labels: PaginationLabels;
  children: React.ReactNode;
}) {
  // Rebuild from primitives so the context value is referentially stable
  // across re-renders even when the caller passes a fresh `labels` object.
  const value = React.useMemo<PaginationLabels>(
    () => ({ of, first, previous, next, last }),
    [of, first, previous, next, last],
  );
  return (
    <PaginationLabelsContext.Provider value={value}>{children}</PaginationLabelsContext.Provider>
  );
}

/**
 * Format a number with the ru-RU thin-space thousands separator —
 * matches moysklad's "1-100 из 27 338" pagination style.
 */
function formatRu(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}

export const Pagination = React.forwardRef<HTMLDivElement, PaginationProps>(
  (
    {
      className,
      total,
      limit,
      hasPrevious,
      hasNext,
      onPrevious,
      onNext,
      onFirst,
      onLast,
      visibleCount,
      offset,
      itemLabel = 'ta yozuv',
      moyskladStyle = false,
      // No destructuring default — resolved below as
      // `ofLabel ?? context.of ?? 'из'` so the app-injected label wins.
      ofLabel,
      ...props
    },
    ref,
  ) => {
    // Resolve: explicit prop → app-root injected default → hard fallback.
    // The hard fallbacks keep standalone/test renders (no provider) working
    // exactly as before (range «из», English aria); the app injects RU/UZ.
    const labelsCtx = React.useContext(PaginationLabelsContext);
    const resolvedOf = ofLabel ?? labelsCtx.of ?? 'из';
    const firstAria = labelsCtx.first ?? 'first';
    const prevAria = labelsCtx.previous ?? 'prev';
    const nextAria = labelsCtx.next ?? 'next';
    const lastAria = labelsCtx.last ?? 'last';
    if (moyskladStyle) {
      // Range "M-N": offset/page callers pass an absolute `offset` (e.g. 100 on
      // page 2 → "101-200"); cursor callers omit it (offset 0 → "1-N").
      const start = offset ?? 0;
      const visible = visibleCount ?? Math.min(limit, total);
      // moysklad shows «1-1 из 0» for an empty list (NOT «0-0 из 0») — the range
      // floor is 1 even with nothing to show.
      const from = total === 0 ? 1 : start + 1;
      const to = total === 0 ? 1 : start + visible;
      return (
        <div
          ref={ref}
          className={cn(
            'flex items-center gap-1 py-1 text-[var(--ms-text-muted)] text-xs',
            className,
          )}
          {...props}
        >
          <span className="mr-1 tabular-nums" data-test-id="pagination-range">
            {from}-{to} {resolvedOf} {formatRu(total)}
          </span>
          {onFirst && (
            <button
              type="button"
              onClick={onFirst}
              disabled={!hasPrevious}
              aria-label={firstAria}
              className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
              data-test-id="pagination-first"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label={prevAria}
            className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
            data-test-id="pagination-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label={nextAria}
            className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
            data-test-id="pagination-next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {onLast && (
            <button
              type="button"
              onClick={onLast}
              disabled={!hasNext}
              aria-label={lastAria}
              className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
              data-test-id="pagination-last"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          )}
        </div>
      );
    }
    return (
      <div
        ref={ref}
        className={cn('flex items-center justify-between gap-4 py-2', className)}
        {...props}
      >
        <p className="text-[var(--ms-text-muted)] text-xs">
          Jami: <span className="font-medium text-[var(--ms-text-primary)]">{total}</span>{' '}
          {itemLabel}
          {total > limit && (
            <>
              , <span>{limit}</span> ta ko'rsatildi
            </>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Oldingi sahifa"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-[var(--ms-bg-muted)] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Oldingi
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Keyingi sahifa"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-[var(--ms-bg-muted)] disabled:opacity-40"
          >
            Keyingi
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  },
);
Pagination.displayName = 'Pagination';
