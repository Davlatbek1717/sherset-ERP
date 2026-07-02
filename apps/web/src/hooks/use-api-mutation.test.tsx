import { renderHookWithProviders } from '@/test-utils';
import { useToast } from '@moysklad/ui';
import { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
/**
 * useApiMutation tests — verify the toast-on-error contract that's
 * the whole point of using this wrapper instead of plain useMutation.
 * Used by ~80 call sites across detail pages, list pages, and bulk
 * actions; a regression here would make every failed click silent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiMutation } from './use-api-mutation';

vi.mock('@moysklad/ui', async () => {
  const actual = await vi.importActual<typeof import('@moysklad/ui')>('@moysklad/ui');
  return {
    ...actual,
    useToast: vi.fn(),
  };
});

const mockedUseToast = vi.mocked(useToast);

describe('useApiMutation', () => {
  let toastSuccess: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toastSuccess = vi.fn();
    toastError = vi.fn();
    mockedUseToast.mockReturnValue({
      toast: {
        success: toastSuccess,
        error: toastError,
        info: vi.fn(),
        warning: vi.fn(),
      },
    } as unknown as ReturnType<typeof useToast>);
  });

  it('calls mutationFn and resolves successfully', async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn }));
    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.mutateAsync(undefined);
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual({ ok: true });
  });

  it('does NOT toast success when no successMessage is given', async () => {
    const mutationFn = vi.fn().mockResolvedValue({});
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn }));
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('toasts success when successMessage is provided', async () => {
    const mutationFn = vi.fn().mockResolvedValue({});
    const { result } = renderHookWithProviders(() =>
      useApiMutation({ mutationFn, successMessage: 'Saved!' }),
    );
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Saved!');
  });

  it('always toasts error on failure (default message: common.action_failed)', async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error('Server kicked us'));
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn }));
    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        /* expected */
      }
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    const [title, opts] = toastError.mock.calls[0] ?? [];
    // common.action_failed in uz = "Amal bajarilmadi"
    expect(title).toContain('bajarilmadi');
    expect(opts?.description).toBe('Server kicked us');
  });

  it('uses custom errorMessage when provided', async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error('Boom'));
    const { result } = renderHookWithProviders(() =>
      useApiMutation({ mutationFn, errorMessage: 'Custom title' }),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        /* expected */
      }
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Custom title', { description: 'Boom' });
    });
  });

  it('skips both toasts when silent=true', async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error('Silent kill'));
    const { result } = renderHookWithProviders(() =>
      useApiMutation({ mutationFn, successMessage: 'No toast', silent: true }),
    );
    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        /* expected */
      }
    });
    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('caller onSuccess still fires after the success toast', async () => {
    const onSuccess = vi.fn();
    const mutationFn = vi.fn().mockResolvedValue({ id: '42' });
    const { result } = renderHookWithProviders(() =>
      useApiMutation({ mutationFn, successMessage: 'OK', onSuccess }),
    );
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(toastSuccess).toHaveBeenCalledWith('OK');
    expect(onSuccess).toHaveBeenCalled();
    expect(onSuccess.mock.calls[0]?.[0]).toEqual({ id: '42' });
  });

  it('caller onError still fires after the error toast', async () => {
    const onError = vi.fn();
    const err = new Error('failed');
    const mutationFn = vi.fn().mockRejectedValue(err);
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn, onError }));
    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        /* expected */
      }
    });
    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
    expect(onError.mock.calls[0]?.[0]).toBe(err);
  });

  it('invalidates the audit-logs query on success so History tabs refresh without reload', async () => {
    // Regression guard for the Phase-2 stale-History bug: a save mutation
    // invalidated the entity query but never ['audit-logs', …], so the
    // (eagerly-mounted) History tab kept showing pre-edit data until a reload.
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const mutationFn = vi.fn().mockResolvedValue({});
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn }), {
      queryClient: qc,
    });
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['audit-logs'] });
  });

  // ── Optimistic-lock conflict routing ───────────────────────────────────
  // A 409 OPTIMISTIC_LOCK is a concurrency conflict, not a generic failure: it
  // must reach the caller's onConflict (→ reload dialog) and NOT show the
  // generic "action failed" toast. Without onConflict it still surfaces a clear
  // conflict toast so the lost-update is never silent.
  function conflictError() {
    return Object.assign(new Error('Product was modified by another user.'), {
      status: 409,
      body: { code: 'OPTIMISTIC_LOCK', message: 'Product was modified by another user.' },
    });
  }

  it('routes a 409 OPTIMISTIC_LOCK to onConflict and suppresses the generic error toast', async () => {
    const onConflict = vi.fn();
    const mutationFn = vi.fn().mockRejectedValue(conflictError());
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn, onConflict }));
    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        /* expected */
      }
    });
    await waitFor(() => {
      expect(onConflict).toHaveBeenCalledTimes(1);
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('shows a conflict-specific toast (not the generic one) when no onConflict is given', async () => {
    const mutationFn = vi.fn().mockRejectedValue(conflictError());
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn }));
    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        /* expected */
      }
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    // conflict_title (uz) = "...o'zgartirildi"; must NOT be the generic "bajarilmadi".
    const [title] = toastError.mock.calls[0] ?? [];
    expect(title).toContain("o'zgartirildi");
    expect(title).not.toContain('bajarilmadi');
  });

  it('does NOT treat a plain 409 (non-OPTIMISTIC_LOCK) as a conflict', async () => {
    const onConflict = vi.fn();
    const uniqueClash = Object.assign(new Error('Duplicate value'), {
      status: 409,
      body: { message: 'Duplicate value on unique field: code' },
    });
    const mutationFn = vi.fn().mockRejectedValue(uniqueClash);
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn, onConflict }));
    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        /* expected */
      }
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('handles non-Error rejection by stringifying the value', async () => {
    const mutationFn = vi.fn().mockRejectedValue('string-not-error');
    const { result } = renderHookWithProviders(() => useApiMutation({ mutationFn }));
    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        /* expected */
      }
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    const [, opts] = toastError.mock.calls[0] ?? [];
    expect(opts?.description).toBe('string-not-error');
  });
});
