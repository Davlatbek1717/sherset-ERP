import { renderHookWithProviders } from '@/test-utils';
import { QueryClient } from '@tanstack/react-query';
/**
 * useDetailNavigation tests — verify the moysklad "1 of N" prev/next
 * pagination wires correctly off the most recent list-query cache for
 * each entity, preferring caches that actually contain the current ID
 * and degrading gracefully when no cache is available.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDetailNavigation } from './use-detail-navigation';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Server mode hits `/{entity}/{id}/position` via api.get. Seeded-cache tests
// (staleTime Infinity) read the position from cache without ever calling this;
// the un-seeded «loading» test asserts the endpoint path is requested.
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ api: { get: getMock } }));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
}

describe('useDetailNavigation', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('returns no position/handlers when no list cache exists', () => {
    const queryClient = makeClient();
    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'doc-2'),
      { queryClient },
    );
    expect(result.current.position).toBeUndefined();
    expect(result.current.onPrev).toBeUndefined();
    expect(result.current.onNext).toBeUndefined();
  });

  it('returns the correct position when the current ID is in the middle of a cached list', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['customer-orders', '', undefined, {}], {
      items: [{ id: 'doc-1' }, { id: 'doc-2' }, { id: 'doc-3' }],
      total: 3,
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'doc-2'),
      { queryClient },
    );

    expect(result.current.position).toEqual({ current: 2, total: 3 });
    expect(result.current.onPrev).toBeDefined();
    expect(result.current.onNext).toBeDefined();
  });

  it('navigates to the prev document URL when onPrev is called', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['demands', '', undefined], {
      items: [{ id: 'd-A' }, { id: 'd-B' }, { id: 'd-C' }],
      total: 3,
    });

    const { result } = renderHookWithProviders(() => useDetailNavigation('demands', 'd-B'), {
      queryClient,
    });
    result.current.onPrev?.();
    expect(pushMock).toHaveBeenCalledWith('/demands/d-A');
  });

  it('navigates to the next document URL when onNext is called', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['demands', '', undefined], {
      items: [{ id: 'd-A' }, { id: 'd-B' }, { id: 'd-C' }],
      total: 3,
    });

    const { result } = renderHookWithProviders(() => useDetailNavigation('demands', 'd-B'), {
      queryClient,
    });
    result.current.onNext?.();
    expect(pushMock).toHaveBeenCalledWith('/demands/d-C');
  });

  it('disables onPrev at the first position', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['supplies', '', undefined, {}], {
      items: [{ id: 'sup-1' }, { id: 'sup-2' }],
      total: 2,
    });

    const { result } = renderHookWithProviders(() => useDetailNavigation('supplies', 'sup-1'), {
      queryClient,
    });
    expect(result.current.position).toEqual({ current: 1, total: 2 });
    expect(result.current.onPrev).toBeUndefined();
    expect(result.current.onNext).toBeDefined();
  });

  it('disables onNext at the last position', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['supplies', '', undefined, {}], {
      items: [{ id: 'sup-1' }, { id: 'sup-2' }],
      total: 2,
    });

    const { result } = renderHookWithProviders(() => useDetailNavigation('supplies', 'sup-2'), {
      queryClient,
    });
    expect(result.current.position).toEqual({ current: 2, total: 2 });
    expect(result.current.onPrev).toBeDefined();
    expect(result.current.onNext).toBeUndefined();
  });

  it('returns no nav when the current ID is not in any cached list', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['invoices-out', '', undefined, {}], {
      items: [{ id: 'inv-A' }, { id: 'inv-B' }],
      total: 2,
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('invoices-out', 'inv-XYZ'),
      { queryClient },
    );

    expect(result.current.position).toBeUndefined();
    expect(result.current.onPrev).toBeUndefined();
    expect(result.current.onNext).toBeUndefined();
  });

  it('ignores caches whose first key segment does not match the entityKey', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['customer-orders', '', undefined, {}], {
      items: [{ id: 'co-1' }, { id: 'co-2' }],
      total: 2,
    });
    queryClient.setQueryData(['demands', '', undefined, {}], {
      items: [{ id: 'co-2' }, { id: 'co-3' }], // same id, wrong entity
      total: 2,
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'co-2'),
      { queryClient },
    );

    expect(result.current.position).toEqual({ current: 2, total: 2 });
    result.current.onPrev?.();
    expect(pushMock).toHaveBeenCalledWith('/customer-orders/co-1');
  });

  it('prefers a cache that contains the current ID over a fresher cache that does not', () => {
    const queryClient = makeClient();

    // First (older) cache contains the current ID:
    queryClient.setQueryData(['customer-orders', '', undefined, { state: 'draft' }], {
      items: [{ id: 'co-1' }, { id: 'co-target' }, { id: 'co-3' }],
      total: 3,
    });

    // Second (fresher) cache is for a different filter — does NOT
    // contain the current ID. Set it AFTER so its dataUpdatedAt is
    // newer.
    queryClient.setQueryData(['customer-orders', 'search-foo', undefined, {}], {
      items: [{ id: 'co-other-1' }, { id: 'co-other-2' }],
      total: 2,
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'co-target'),
      { queryClient },
    );

    expect(result.current.position).toEqual({ current: 2, total: 3 });
    result.current.onNext?.();
    expect(pushMock).toHaveBeenCalledWith('/customer-orders/co-3');
  });

  it('survives caches without an items array (defensive)', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['customer-orders', '', undefined, {}], {
      // missing `items`
      total: 0,
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'co-1'),
      { queryClient },
    );

    expect(result.current.position).toBeUndefined();
    expect(result.current.onPrev).toBeUndefined();
    expect(result.current.onNext).toBeUndefined();
  });

  it('handles an empty items array gracefully', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['payments-in', '', undefined, {}], {
      items: [],
      total: 0,
    });

    const { result } = renderHookWithProviders(() => useDetailNavigation('payments-in', 'pay-1'), {
      queryClient,
    });

    expect(result.current.position).toBeUndefined();
  });
});

describe('useDetailNavigation — server mode ({ server: true })', () => {
  const posKey = (entity: string, id: string) => [entity, 'detail-position', id];

  beforeEach(() => {
    pushMock.mockClear();
    getMock.mockReset();
    // Default: never resolves — so an un-seeded enabled query stays «loading»
    // and never performs a real fetch in jsdom.
    getMock.mockImplementation(() => new Promise(() => {}));
  });

  it('shows the REAL total + handlers straight from the server payload', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(posKey('customer-orders', 'doc-X'), {
      current: 7,
      total: 31023,
      prevId: 'doc-prev',
      nextId: 'doc-next',
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'doc-X', { server: true }),
      { queryClient },
    );

    expect(result.current.position).toEqual({ current: 7, total: 31023 });
    expect(result.current.onPrev).toBeDefined();
    expect(result.current.onNext).toBeDefined();
    expect(getMock).not.toHaveBeenCalled(); // cache hit, no fetch
  });

  it('navigates via prevId / nextId from the server payload', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(posKey('customer-orders', 'doc-X'), {
      current: 7,
      total: 31023,
      prevId: 'doc-prev',
      nextId: 'doc-next',
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'doc-X', { server: true }),
      { queryClient },
    );

    result.current.onPrev?.();
    expect(pushMock).toHaveBeenCalledWith('/customer-orders/doc-prev');
    result.current.onNext?.();
    expect(pushMock).toHaveBeenCalledWith('/customer-orders/doc-next');
  });

  it('disables onPrev when prevId is null (first record)', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(posKey('customer-orders', 'first'), {
      current: 1,
      total: 31023,
      prevId: null,
      nextId: 'doc-2',
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'first', { server: true }),
      { queryClient },
    );

    expect(result.current.position).toEqual({ current: 1, total: 31023 });
    expect(result.current.onPrev).toBeUndefined();
    expect(result.current.onNext).toBeDefined();
  });

  it('disables onNext when nextId is null (last record)', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(posKey('customer-orders', 'last'), {
      current: 31023,
      total: 31023,
      prevId: 'doc-prev',
      nextId: null,
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'last', { server: true }),
      { queryClient },
    );

    expect(result.current.onNext).toBeUndefined();
    expect(result.current.onPrev).toBeDefined();
  });

  it('returns no position when the account has zero records (total 0)', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(posKey('customer-orders', 'doc-X'), {
      current: 1,
      total: 0,
      prevId: null,
      nextId: null,
    });

    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'doc-X', { server: true }),
      { queryClient },
    );

    expect(result.current.position).toBeUndefined();
  });

  it('requests the /position endpoint and shows nothing while loading', () => {
    const queryClient = makeClient();
    const { result } = renderHookWithProviders(
      () => useDetailNavigation('customer-orders', 'pending', { server: true }),
      { queryClient },
    );

    expect(result.current.position).toBeUndefined();
    expect(getMock).toHaveBeenCalledWith('/customer-orders/pending/position');
  });

  it('never calls the server in cache mode (no opt-in)', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['customer-orders', '', undefined, {}], {
      items: [{ id: 'c-1' }, { id: 'c-2' }],
      total: 2,
    });

    renderHookWithProviders(() => useDetailNavigation('customer-orders', 'c-1'), { queryClient });
    expect(getMock).not.toHaveBeenCalled();
  });
});
