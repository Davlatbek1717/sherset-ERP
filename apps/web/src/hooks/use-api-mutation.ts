'use client';

import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { useToast } from '@moysklad/ui';
import { type UseMutationOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

/**
 * Drop-in wrapper around `useMutation` that always surfaces errors
 * via toast — so a click on a button that fails server-side is never
 * silent. Use it instead of `useMutation` for any non-trivial action
 * (archive, restore, transition, sync, delete-without-confirm, etc.).
 *
 * Mental model:
 *
 *   useMutation         → no feedback, you pick onSuccess + onError
 *   useApiMutation      → guaranteed error toast, success toast opt-in
 *   useSaveMutation     → both success+error toasts (for save/update flows)
 *   useDestructiveMutation → confirm dialog + delete toast (for destructive)
 *
 * Why three siblings instead of one config-bag: each one has a tighter
 * intent + smaller cognitive footprint at the call site. The right one
 * is usually obvious from the verb.
 *
 * Behaviour:
 * - On error: shows `toast.error(errorMessage ?? common.action_failed)` with
 *   the server message as description.
 * - On success: silent unless caller passes `successMessage`.
 * - `silent: true` opts out of the error toast (rare — typically only
 *   for mutations that are immediately followed by a redirect that itself
 *   surfaces success/failure).
 *
 * Caller's `onSuccess` / `onError` still fires after the toast, so
 * existing query invalidations and navigation keep working unchanged.
 *
 * Optimistic-lock conflicts (HTTP 409 `OPTIMISTIC_LOCK`): if the caller passes
 * `onConflict`, it runs INSTEAD of the generic error toast — for the catalog
 * edit forms that means "show the reload dialog". If no `onConflict` is given,
 * a conflict still surfaces a clear, locale-aware toast (so the lost-update is
 * never silent, even on pages that haven't wired the dialog yet).
 */

export interface UseApiMutationOptions<TData, TError, TVariables, TContext>
  extends UseMutationOptions<TData, TError, TVariables, TContext> {
  /** When set, also toast.success(successMessage) after the mutation. */
  successMessage?: string;
  /** Override the error toast title. Default: `common.action_failed`. */
  errorMessage?: string;
  /** Skip toasts entirely. Use sparingly. */
  silent?: boolean;
  /**
   * Called when the error is an optimistic-lock 409 (record changed by another
   * user). When provided, the generic error toast is suppressed so the caller
   * can present a reload dialog instead.
   */
  onConflict?: (err: TError) => void;
  /**
   * Extra query keys to invalidate on success, alongside `['audit-logs']`.
   *
   * Needed because queries default to `staleTime: 30_000` with
   * `refetchOnWindowFocus: false`: after a create, going back to the list
   * within half a minute served the CACHED page, so the freshly created row
   * was missing from a `createdAt desc` list and the save looked lost
   * (2026-08-23 audit). Prefix keys work — `['products']` covers every
   * filter/page variant of the products list.
   */
  invalidateKeys?: ReadonlyArray<readonly unknown[]>;
}

export function useApiMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(options: UseApiMutationOptions<TData, TError, TVariables, TContext>) {
  const { toast } = useToast();
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const {
    successMessage,
    errorMessage,
    silent,
    onConflict,
    invalidateKeys,
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation<TData, TError, TVariables, TContext>({
    ...rest,
    onSuccess: (data, vars, onMutateResult, fnContext) => {
      // Any successful write may append an AuditLog row; refresh every mounted
      // History (Tarix) tab so it reflects the change without a manual reload.
      // The History query (use-document-history) is keyed ['audit-logs', …] and
      // is mounted eagerly by the detail tab strip, so it never refetches on its
      // own after a save — invalidate it here, in the one shared write wrapper.
      // Invalidating a non-mounted audit query is a cheap no-op (e.g. on list
      // pages), so this is safe for all useApiMutation call sites.
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      // Caller-declared lists that this write makes stale (see `invalidateKeys`).
      for (const key of invalidateKeys ?? []) {
        qc.invalidateQueries({ queryKey: key });
      }
      if (!silent && successMessage) {
        toast.success(successMessage);
      }
      onSuccess?.(data, vars, onMutateResult, fnContext);
    },
    onError: (err, vars, onMutateResult, fnContext) => {
      if (isOptimisticConflict(err)) {
        // A real concurrency conflict — the user's save lost the race. Let the
        // caller show a reload dialog; otherwise surface a clear conflict toast
        // (never the generic "action failed", and never silent).
        if (onConflict) onConflict(err);
        else if (!silent)
          toast.error(tCommon('conflict_title'), { description: tCommon('conflict_body') });
      } else if (!silent) {
        const description = err instanceof Error ? err.message : String(err);
        toast.error(errorMessage ?? tCommon('action_failed'), { description });
      }
      onError?.(err, vars, onMutateResult, fnContext);
    },
  });
}
