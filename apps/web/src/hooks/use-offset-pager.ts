'use client';

import { useCallback, useState } from 'react';

/**
 * Offset («page-number») pagination — the moysklad 1:1 pager.
 *
 * moysklad's list pager is offset-based: it shows an absolute "M-N из total"
 * range and lets you jump to the previous / first / LAST page. Cursor
 * pagination (forward-only `nextCursor`) can't do any of that — «previous»
 * could only reset to page 1, «last» was unreachable, and the range was
 * always "1-N". This hook drives the offset pager instead.
 *
 * Contract: the list API must accept a 0-based `page` (→ `skip = page*limit`)
 * and return `total`. `page` / `offset` / navigation are total-independent
 * (usable before the query resolves); `props(total)` derives the ListView
 * pager props once `total` is known.
 *
 *   const pager = useOffsetPager(pageSize);
 *   // params: page: String(pager.page)
 *   // on any filter/search/sort change: pager.reset()
 *   // <ListView {...pager.props(data?.total)} limit={pageSize} />
 */
export function useOffsetPager(limit: number) {
  const [page, setPage] = useState(0);

  const onNext = useCallback(() => setPage((p) => p + 1), []);
  const onPrevious = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const onFirst = useCallback(() => setPage(0), []);
  /** Call on any filter / search / sort change to return to page 1. */
  const reset = useCallback(() => setPage(0), []);

  const props = useCallback(
    (total: number | undefined) => {
      const lastPage = total && total > 0 ? Math.max(0, Math.ceil(total / limit) - 1) : 0;
      return {
        hasPrevious: page > 0,
        hasNext: total !== undefined && (page + 1) * limit < total,
        onNext,
        onPrevious,
        onFirst,
        onLast: () => setPage(lastPage),
        /** absolute 0-based offset of the first visible row (for the "M-N" range). */
        paginationOffset: page * limit,
      };
    },
    [page, limit, onNext, onPrevious, onFirst],
  );

  return { page, offset: page * limit, reset, props };
}
