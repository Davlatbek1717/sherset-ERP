import { api } from '@/lib/api-client';
import { renderHookWithProviders } from '@/test-utils';
import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
/**
 * useDocumentHistory tests — verify the audit-log fetch is gated on a
 * truthy entityId (so the hook can be called eagerly without firing
 * a request before data loads), and the cache key scopes per
 * (entity, entityId) so different docs don't collide.
 *
 * The hook backs every detail page's "Tarix" tab via DetailContentTabs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentHistory } from './use-document-history';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);

describe('useDocumentHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue({ items: [], total: 0 });
  });

  it('fires the audit-logs request with correct entity + entityId query params', async () => {
    renderHookWithProviders(() => useDocumentHistory('CustomerOrder', 'doc-42'));
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });
    const url = mockedGet.mock.calls[0]?.[0] as string;
    expect(url).toContain('/audit-logs?');
    expect(url).toContain('entity=CustomerOrder');
    expect(url).toContain('entityId=doc-42');
  });

  it('skips the fetch when entityId is undefined (lazy gate)', () => {
    renderHookWithProviders(() => useDocumentHistory('CustomerOrder', undefined));
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('skips the fetch when entityId is null', () => {
    renderHookWithProviders(() => useDocumentHistory('CustomerOrder', null));
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('skips the fetch when entityId is empty string', () => {
    renderHookWithProviders(() => useDocumentHistory('CustomerOrder', ''));
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('returns the items from the response', async () => {
    const items = [
      {
        id: '1',
        entity: 'CustomerOrder',
        entityId: 'doc-1',
        action: 'create',
        at: '2026-04-20T12:00:00Z',
        user: null,
        fieldChanges: null,
        context: null,
      },
    ];
    mockedGet.mockResolvedValueOnce({ items, total: 1 });
    const { result } = renderHookWithProviders(() => useDocumentHistory('CustomerOrder', 'doc-1'));
    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
    expect(result.current.data?.items).toEqual(items);
  });

  it('URL-encodes entity and entityId values containing special characters', async () => {
    renderHookWithProviders(() => useDocumentHistory('Order/Sub', 'with space'));
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });
    const url = mockedGet.mock.calls[0]?.[0] as string;
    expect(url).toContain('entity=Order%2FSub');
    expect(url).toContain('entityId=with%20space');
  });

  it('caches per (entity, entityId) — same key dedupes the fetch', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    renderHookWithProviders(() => useDocumentHistory('CustomerOrder', 'doc-A'), {
      queryClient: qc,
    });
    renderHookWithProviders(() => useDocumentHistory('CustomerOrder', 'doc-A'), {
      queryClient: qc,
    });
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });
    // Second hook should hit the cache, so api.get fires only once.
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('different entityIds produce different cache buckets', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    renderHookWithProviders(() => useDocumentHistory('CustomerOrder', 'doc-A'), {
      queryClient: qc,
    });
    renderHookWithProviders(() => useDocumentHistory('CustomerOrder', 'doc-B'), {
      queryClient: qc,
    });
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });
    // Second is a different cache key, so a new fetch fires.
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
