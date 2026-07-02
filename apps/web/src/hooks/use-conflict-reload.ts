'use client';

import { useConfirm } from '@moysklad/ui';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

/**
 * Builds the `onConflict` handler for an edit form's save mutation.
 *
 * On an optimistic-lock 409 (the record was changed by someone else while this
 * form was open), it shows a localized warning dialog offering to reload the
 * latest copy; on confirm it invalidates the detail query so the form
 * re-hydrates from the server (the user's unsaved edits are discarded — moysklad
 * does the same). Declining leaves the form as-is so the user can copy their
 * changes out before reloading manually.
 *
 * Shared so every catalog edit form gets the identical conflict UX from one
 * place. Pass the same query key the detail page loads with, e.g.
 * `useConflictReload(['product', id])`.
 *
 * `onReloaded` (optional) runs AFTER the refetch settles. Forms that hydrate a
 * react-hook-form via `form.reset(data)` on every `[data]` change re-hydrate
 * automatically and need nothing here. Forms that hydrate a local edit-state
 * object once (the `if (data && !form) setForm(…)` pattern — most document
 * forms) must pass `() => setForm(null)` so the now-fresh `data` re-seeds the
 * form; otherwise the reload would refresh the cache but leave the stale edits
 * on screen (contradicting the dialog's "your unsaved changes will be lost").
 */
export function useConflictReload(queryKey: QueryKey, onReloaded?: () => void): () => void {
  const { confirm } = useConfirm();
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  return () => {
    void (async () => {
      const ok = await confirm({
        title: tCommon('conflict_title'),
        description: tCommon('conflict_body'),
        confirmLabel: tCommon('conflict_reload'),
        tone: 'warning',
      });
      if (ok) {
        await qc.invalidateQueries({ queryKey });
        onReloaded?.();
      }
    })();
  };
}
