'use client';

import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

/** Backend `/{entity}/{id}/position` payload (server mode). */
interface DetailPositionDto {
  current: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
}

interface DetailNavigationResult {
  position: { current: number; total: number } | undefined;
  onPrev: (() => void) | undefined;
  onNext: (() => void) | undefined;
}

/**
 * Wires the moysklad-style "1 of N ‹ ›" prev/next pagination on a
 * detail page. Two modes:
 *
 * - **Cache mode (default)** — reads react-query's cache for any successful
 *   query whose first key segment matches `entityKey` (e.g. `['customer-orders',
 *   search, cursor, filters]`) and locates the current document inside that
 *   cached `items` array. If none contains it (user landed via a direct URL),
 *   the hook returns no position so the toolbar suppresses the bar gracefully.
 *   The `total` is the cached PAGE size, not the true count.
 *
 * - **Server mode (`{ server: true }`)** — fetches `/{entityKey}/{id}/position`,
 *   so the toolbar shows the REAL total (e.g. «1 из 31023») and the ‹ › walk the
 *   WHOLE ordered set, exactly like moysklad — even on a direct-URL visit with no
 *   list cache. Opt-in per page so detail pages whose backend has no `/position`
 *   endpoint keep the cache behaviour unchanged.
 *
 * @param entityKey  The first queryKey segment used by the list page
 *                   (and the URL prefix, e.g. "customer-orders").
 * @param currentId  The current detail page's ID.
 * @param opts.server  Use the server-backed `/position` endpoint (true 1:1).
 */
export function useDetailNavigation(
  entityKey: string,
  currentId: string,
  opts?: { server?: boolean },
): DetailNavigationResult {
  const queryClient = useQueryClient();
  const router = useRouter();
  const server = opts?.server ?? false;

  // Server-backed position (real total + whole-set ‹ ›). `enabled` keeps this a
  // no-op in cache mode, but the hook is still called unconditionally (rules of
  // hooks). 30s staleTime — the list rarely changes mid-view.
  const positionQuery = useQuery<DetailPositionDto>({
    queryKey: [entityKey, 'detail-position', currentId],
    queryFn: () => api.get<DetailPositionDto>(`/${entityKey}/${currentId}/position`),
    enabled: server && !!currentId,
    staleTime: 30_000,
  });

  if (server) {
    const data = positionQuery.data;
    if (!data || data.total === 0) {
      return { position: undefined, onPrev: undefined, onNext: undefined };
    }
    return {
      position: { current: data.current, total: data.total },
      onPrev: data.prevId ? () => router.push(`/${entityKey}/${data.prevId}`) : undefined,
      onNext: data.nextId ? () => router.push(`/${entityKey}/${data.nextId}`) : undefined,
    };
  }

  // Compute on every render — iterating cached query keys is cheap, and
  // recomputing keeps prev/next correct as the user navigates between
  // detail pages without us subscribing to cache mutations.
  const candidates = queryClient.getQueriesData<{ items?: Array<{ id: string }> }>({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey[0] === entityKey &&
      query.state.status === 'success',
  });

  if (candidates.length === 0) {
    return { position: undefined, onPrev: undefined, onNext: undefined };
  }

  // Prefer caches that DO include the current ID, falling back to the
  // freshest cache otherwise (we still surface no nav in that case, but
  // we don't accidentally pick a different filter view).
  const containing = candidates.filter(
    ([, data]) => Array.isArray(data?.items) && data.items.some((i) => i.id === currentId),
  );
  const pool = containing.length > 0 ? containing : candidates;

  // pool is non-empty here (candidates.length === 0 returned above and
  // pool === candidates when containing is empty), but TS can't see
  // that through the filter so we narrow with an explicit guard.
  const seed = pool[0];
  if (!seed) {
    return { position: undefined, onPrev: undefined, onNext: undefined };
  }

  const latest = pool.reduce((best, entry) => {
    const stateBest = queryClient.getQueryState(best[0]);
    const stateCur = queryClient.getQueryState(entry[0]);
    return (stateCur?.dataUpdatedAt ?? 0) > (stateBest?.dataUpdatedAt ?? 0) ? entry : best;
  }, seed);

  const items = latest[1]?.items ?? [];
  const idx = items.findIndex((i) => i.id === currentId);

  if (idx < 0) {
    return { position: undefined, onPrev: undefined, onNext: undefined };
  }

  const total = items.length;
  const prevId = idx > 0 ? items[idx - 1]?.id : undefined;
  const nextId = idx < total - 1 ? items[idx + 1]?.id : undefined;

  return {
    position: { current: idx + 1, total },
    onPrev: prevId ? () => router.push(`/${entityKey}/${prevId}`) : undefined,
    onNext: nextId ? () => router.push(`/${entityKey}/${nextId}`) : undefined,
  };
}
