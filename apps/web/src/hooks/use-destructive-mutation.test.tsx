import { renderHookWithProviders } from '@/test-utils';
import { useConfirm, useToast } from '@moysklad/ui';
import { act } from '@testing-library/react';
/**
 * useDestructiveMutation tests — verify the confirm-then-run-then-toast
 * pattern that every detail-page Delete button relies on. Used by 17+
 * pages; a regression here would either skip the confirm dialog
 * (silent destructive operations) or skip the toast (silent failures).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDestructiveMutation } from './use-destructive-mutation';

vi.mock('@moysklad/ui', async () => {
  const actual = await vi.importActual<typeof import('@moysklad/ui')>('@moysklad/ui');
  return {
    ...actual,
    useConfirm: vi.fn(),
    useToast: vi.fn(),
  };
});

const mockedUseConfirm = vi.mocked(useConfirm);
const mockedUseToast = vi.mocked(useToast);

describe('useDestructiveMutation', () => {
  let confirmFn: ReturnType<typeof vi.fn>;
  let toastSuccess: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    confirmFn = vi.fn().mockResolvedValue(true);
    toastSuccess = vi.fn();
    toastError = vi.fn();
    mockedUseConfirm.mockReturnValue({
      confirm: confirmFn,
    } as unknown as ReturnType<typeof useConfirm>);
    mockedUseToast.mockReturnValue({
      toast: {
        success: toastSuccess,
        error: toastError,
        info: vi.fn(),
        warning: vi.fn(),
      },
    } as unknown as ReturnType<typeof useToast>);
  });

  it('shows the confirm dialog with the supplied title', async () => {
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    await act(async () => {
      await result.current.runDestructive({
        title: '"Demo" o\'chirilsinmi?',
        run: vi.fn().mockResolvedValue(undefined),
      });
    });
    expect(confirmFn).toHaveBeenCalled();
    expect(confirmFn.mock.calls[0]?.[0]).toMatchObject({
      title: '"Demo" o\'chirilsinmi?',
      tone: 'destructive',
    });
  });

  it('uses the default description when none supplied', async () => {
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    await act(async () => {
      await result.current.runDestructive({
        title: 'Delete?',
        run: vi.fn().mockResolvedValue(undefined),
      });
    });
    expect(confirmFn.mock.calls[0]?.[0]).toMatchObject({
      description: "Bu amalni qaytarib bo'lmaydi.",
    });
  });

  it('uses the supplied description', async () => {
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    await act(async () => {
      await result.current.runDestructive({
        title: 'Delete?',
        description: 'Custom warning here',
        run: vi.fn().mockResolvedValue(undefined),
      });
    });
    expect(confirmFn.mock.calls[0]?.[0]).toMatchObject({
      description: 'Custom warning here',
    });
  });

  it("uses default O'chirish / Bekor qilish labels", async () => {
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    await act(async () => {
      await result.current.runDestructive({
        title: 'Delete?',
        run: vi.fn().mockResolvedValue(undefined),
      });
    });
    expect(confirmFn.mock.calls[0]?.[0]).toMatchObject({
      confirmLabel: "O'chirish",
      cancelLabel: 'Bekor qilish',
    });
  });

  it('skips run() and returns false when user cancels', async () => {
    confirmFn.mockResolvedValueOnce(false);
    const run = vi.fn();
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.runDestructive({
        title: 'Delete?',
        run,
      });
    });
    expect(run).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(returnValue).toBe(false);
  });

  it('runs the operation and toasts default success when user confirms', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.runDestructive({
        title: 'Delete?',
        run,
      });
    });
    expect(run).toHaveBeenCalledTimes(1);
    // Localized default success toast (common.deleted, uz locale in test provider).
    expect(toastSuccess).toHaveBeenCalledWith("O'chirildi");
    expect(returnValue).toBe(true);
  });

  it('uses custom successMessage when provided', async () => {
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    await act(async () => {
      await result.current.runDestructive({
        title: 'Delete?',
        successMessage: 'Bye!',
        run: vi.fn().mockResolvedValue(undefined),
      });
    });
    expect(toastSuccess).toHaveBeenCalledWith('Bye!');
  });

  it('skips success toast when successMessage is null', async () => {
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    await act(async () => {
      await result.current.runDestructive({
        title: 'Delete?',
        successMessage: null,
        run: vi.fn().mockResolvedValue(undefined),
      });
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('toasts error when run() rejects (default title "Amal bajarilmadi")', async () => {
    const run = vi.fn().mockRejectedValue(new Error('Server kicked us'));
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.runDestructive({
        title: 'Delete?',
        run,
      });
    });
    expect(toastError).toHaveBeenCalledWith('Amal bajarilmadi', {
      description: 'Server kicked us',
    });
    expect(returnValue).toBe(false);
  });

  it('uses custom errorMessage when provided', async () => {
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    await act(async () => {
      await result.current.runDestructive({
        title: 'Delete?',
        errorMessage: 'Failed to delete!',
        run: vi.fn().mockRejectedValue(new Error('Boom')),
      });
    });
    expect(toastError).toHaveBeenCalledWith('Failed to delete!', { description: 'Boom' });
  });

  it('handles non-Error rejection by stringifying the value', async () => {
    const { result } = renderHookWithProviders(() => useDestructiveMutation());
    await act(async () => {
      await result.current.runDestructive({
        title: 'Delete?',
        run: vi.fn().mockRejectedValue('string-not-error'),
      });
    });
    expect(toastError).toHaveBeenCalledWith('Amal bajarilmadi', {
      description: 'string-not-error',
    });
  });
});
