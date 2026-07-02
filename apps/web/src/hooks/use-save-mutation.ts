'use client';

import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { useToast } from '@moysklad/ui';
import { type UseMutationOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

/**
 * Drop-in wrapper around `useMutation` for "save / create / update"
 * actions that surfaces a toast on success and on error so the user
 * always gets feedback for actions they triggered. Mirrors the existing
 * `useDestructiveMutation` (delete + confirm) but for non-destructive
 * writes.
 *
 * Why a hook instead of repeating the boilerplate at each call site:
 *   1. Adds toast in one place — easy to swap to a global behaviour
 *      (sound, banner, push) without crawling 45+ detail pages.
 *   2. Keeps the standard mutation lifecycle hooks (`onSuccess`,
 *      `onError`) usable — caller can still invalidate queries,
 *      navigate, reset state.
 *   3. Reads i18n strings centrally (common.{saved, save_failed}) so
 *      the toast text follows the user's chosen locale automatically.
 *
 * Usage:
 *
 *   const saveMut = useSaveMutation({
 *     mutationFn: () => api.patch(`/cash-in/${id}`, payload),
 *     onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-in', id] }),
 *   });
 *
 * Pass `silent: true` to skip both toasts (rare — usually for chained
 * background saves where the parent already toasts).
 */

export interface UseSaveMutationOptions<TData, TError, TVariables, TContext>
  extends UseMutationOptions<TData, TError, TVariables, TContext> {
  /** Override the success toast title. Defaults to common.saved. */
  successMessage?: string;
  /** Override the error toast title. Defaults to common.save_failed. */
  errorMessage?: string;
  /** Skip both toasts. */
  silent?: boolean;
  /**
   * Called when the error is an optimistic-lock 409 (record changed by another
   * user). When provided it runs INSTEAD of the error toast, so the caller can
   * show a reload dialog. Without it, a conflict shows a clear conflict toast
   * (never the generic "save failed", never silent).
   */
  onConflict?: (err: TError) => void;
}

export function useSaveMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(options: UseSaveMutationOptions<TData, TError, TVariables, TContext>) {
  const { toast } = useToast();
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { successMessage, errorMessage, silent, onConflict, onSuccess, onError, ...rest } = options;

  return useMutation<TData, TError, TVariables, TContext>({
    ...rest,
    onSuccess: (data, vars, onMutateResult, fnContext) => {
      // A successful save/update may append an AuditLog row; refresh every
      // mounted History (Tarix) tab so it reflects the change without a reload.
      // The History query (['audit-logs', …]) is mounted eagerly by the detail
      // tab strip and never refetches on its own — invalidate it here.
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      if (!silent) {
        toast.success(successMessage ?? tCommon('saved'));
      }
      onSuccess?.(data, vars, onMutateResult, fnContext);
    },
    onError: (err, vars, onMutateResult, fnContext) => {
      if (isOptimisticConflict(err)) {
        if (onConflict) onConflict(err);
        else if (!silent)
          toast.error(tCommon('conflict_title'), { description: tCommon('conflict_body') });
      } else if (!silent) {
        const description = err instanceof Error ? err.message : String(err);
        toast.error(errorMessage ?? tCommon('save_failed'), { description });
      }
      onError?.(err, vars, onMutateResult, fnContext);
    },
  });
}
