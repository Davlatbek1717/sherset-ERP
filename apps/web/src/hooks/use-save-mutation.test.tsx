import { renderHookWithProviders } from '@/test-utils';
import { useToast } from '@moysklad/ui';
import { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
/**
 * useSaveMutation tests — verify the toast-on-success + toast-on-error
 * contract. Used by every detail page's Save button (~17 pages); a
 * regression here would mean either silent failures (no error toast)
 * or no confirmation feedback after a successful save.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaveMutation } from './use-save-mutation';

vi.mock('@moysklad/ui', async () => {
  const actual = await vi.importActual<typeof import('@moysklad/ui')>('@moysklad/ui');
  return {
    ...actual,
    useToast: vi.fn(),
  };
});

const mockedUseToast = vi.mocked(useToast);

describe('useSaveMutation', () => {
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
    const mutationFn = vi.fn().mockResolvedValue({ id: '42' });
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn }));
    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.mutateAsync(undefined);
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual({ id: '42' });
  });

  it('toasts default success message (common.saved) on resolve', async () => {
    const mutationFn = vi.fn().mockResolvedValue({});
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn }));
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    // common.saved in uz = "Saqlandi"
    expect(toastSuccess).toHaveBeenCalledWith('Saqlandi');
  });

  it('uses custom successMessage when provided', async () => {
    const mutationFn = vi.fn().mockResolvedValue({});
    const { result } = renderHookWithProviders(() =>
      useSaveMutation({ mutationFn, successMessage: 'Done!' }),
    );
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Done!');
  });

  it('toasts default error message (common.save_failed) on reject', async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error('Server kicked us'));
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn }));
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
    // common.save_failed in uz = "Saqlashda xato"
    expect(title).toContain('Saqlash');
    expect(opts?.description).toBe('Server kicked us');
  });

  it('uses custom errorMessage when provided', async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error('Boom'));
    const { result } = renderHookWithProviders(() =>
      useSaveMutation({ mutationFn, errorMessage: 'Custom title' }),
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
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn, silent: true }));
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

  it('caller onSuccess fires with mutation data', async () => {
    const onSuccess = vi.fn();
    const mutationFn = vi.fn().mockResolvedValue({ name: 'doc' });
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn, onSuccess }));
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(toastSuccess).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
    expect(onSuccess.mock.calls[0]?.[0]).toEqual({ name: 'doc' });
  });

  it('caller onError fires with the error after the toast', async () => {
    const onError = vi.fn();
    const err = new Error('failed');
    const mutationFn = vi.fn().mockRejectedValue(err);
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn, onError }));
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
    // Regression guard for the Phase-2 stale-History bug (see use-api-mutation).
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const mutationFn = vi.fn().mockResolvedValue({});
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn }), {
      queryClient: qc,
    });
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['audit-logs'] });
  });

  // ── Optimistic-lock conflict routing ───────────────────────────────────
  function conflictError() {
    return Object.assign(new Error('Record was modified by another user.'), {
      status: 409,
      body: { code: 'OPTIMISTIC_LOCK', message: 'Record was modified by another user.' },
    });
  }

  it('routes a 409 OPTIMISTIC_LOCK to onConflict and suppresses the save_failed toast', async () => {
    const onConflict = vi.fn();
    const mutationFn = vi.fn().mockRejectedValue(conflictError());
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn, onConflict }));
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

  it('shows a conflict-specific toast (not save_failed) when no onConflict is given', async () => {
    const mutationFn = vi.fn().mockRejectedValue(conflictError());
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn }));
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
    const [title] = toastError.mock.calls[0] ?? [];
    expect(title).toContain("o'zgartirildi");
    expect(title).not.toContain('Saqlash');
  });

  it('handles non-Error rejection by stringifying the value', async () => {
    const mutationFn = vi.fn().mockRejectedValue({ status: 500 });
    const { result } = renderHookWithProviders(() => useSaveMutation({ mutationFn }));
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
    // String() on { status: 500 } => "[object Object]"
    expect(opts?.description).toBe('[object Object]');
  });
});
