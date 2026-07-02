import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { renderHookWithProviders } from '@/test-utils';
import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
/**
 * useTasksBadgeCount tests — verify the navbar Задачи tab badge gates
 * its fetch on auth resolution and returns 0 when the API hasn't
 * answered yet so the badge stays hidden during bootstrap.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTasksBadgeCount } from './use-tasks-badge-count';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn() },
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: vi.fn(),
}));

const mockedGet = vi.mocked(api.get);
const mockedUseAuth = vi.mocked(useAuth);

function authState(user: { id: string } | null) {
  return {
    user,
    initialized: true,
    accessToken: user ? 'tok' : null,
  } as unknown as ReturnType<typeof useAuth>;
}

describe('useTasksBadgeCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when the user is not authenticated yet', () => {
    mockedUseAuth.mockReturnValue(authState(null));
    const { result } = renderHookWithProviders(() => useTasksBadgeCount());
    expect(result.current).toBe(0);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('hits /tasks/badge-count and returns the server count once auth resolves', async () => {
    mockedUseAuth.mockReturnValue(authState({ id: 'u-1' }));
    mockedGet.mockResolvedValue({ count: 7 });
    const { result } = renderHookWithProviders(() => useTasksBadgeCount());
    await waitFor(() => {
      expect(result.current).toBe(7);
    });
    expect(mockedGet).toHaveBeenCalledWith('/tasks/badge-count');
  });

  it('returns 0 while the request is in flight (before the first response)', () => {
    mockedUseAuth.mockReturnValue(authState({ id: 'u-1' }));
    let _resolve: (v: unknown) => void = () => undefined;
    mockedGet.mockImplementation(
      () =>
        new Promise((res) => {
          _resolve = res;
        }),
    );
    const { result } = renderHookWithProviders(() => useTasksBadgeCount());
    expect(result.current).toBe(0);
  });

  it('treats missing count as 0 (defensive against empty response)', async () => {
    mockedUseAuth.mockReturnValue(authState({ id: 'u-1' }));
    mockedGet.mockResolvedValue({});
    const { result } = renderHookWithProviders(() => useTasksBadgeCount());
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled();
    });
    expect(result.current).toBe(0);
  });

  it('does not fire the request twice when the cache is fresh (staleTime gate)', async () => {
    mockedUseAuth.mockReturnValue(authState({ id: 'u-1' }));
    mockedGet.mockResolvedValue({ count: 3 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const r1 = renderHookWithProviders(() => useTasksBadgeCount(), { queryClient });
    await waitFor(() => expect(r1.result.current).toBe(3));
    const r2 = renderHookWithProviders(() => useTasksBadgeCount(), { queryClient });
    expect(r2.result.current).toBe(3);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});
