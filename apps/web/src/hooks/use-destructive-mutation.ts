'use client';

import { useConfirm, useToast } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Helper for the recurring "destructive action with confirm + toast"
 * pattern used by every detail page (delete document, delete row, ...).
 *
 * Replaces the legacy:
 *   if (confirm(`"${name}" o'chirilsinmi?`)) deleteMut.mutate();
 * with:
 *   await runDestructive({
 *     title: `"${name}" o'chirilsinmi?`,
 *     run: () => deleteMut.mutateAsync(),
 *   });
 *
 * Why a hook (not a component): callers already use TanStack mutations;
 * wrapping them as a button would force prop-drilling. The hook composes
 * the confirm + toast at the call site, keeping mutation lifecycle hooks
 * (onSuccess / onError) intact.
 */
export interface DestructiveActionOptions {
  /** Headline ("Hujjatni o'chirishni xohlaysizmi?"). */
  title: string;
  /** Optional secondary line — defaults to "qaytarib bo'lmaydi" warning. */
  description?: string;
  /** Confirm button label — defaults to "O'chirish". */
  confirmLabel?: string;
  /** Toast message on success. Skip toast when null. */
  successMessage?: string | null;
  /** Toast message on error. Falls back to e.message. */
  errorMessage?: string;
  /** The actual destructive operation. Returning anything = success. */
  run: () => Promise<unknown>;
}

export function useDestructiveMutation() {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  // Localized fallbacks (were hardcoded Latin-uz, which leaked into the RU
  // locale on every delete because the no-hardcoded gate is Cyrillic-only).
  const t = useTranslations('common');

  const runDestructive = useCallback(
    async (opts: DestructiveActionOptions): Promise<boolean> => {
      const ok = await confirm({
        title: opts.title,
        description: opts.description ?? t('action_irreversible'),
        confirmLabel: opts.confirmLabel ?? t('delete'),
        cancelLabel: t('cancel'),
        tone: 'destructive',
      });
      if (!ok) return false;

      try {
        await opts.run();
        if (opts.successMessage !== null) {
          toast.success(opts.successMessage ?? t('deleted'));
        }
        return true;
      } catch (e) {
        toast.error(opts.errorMessage ?? t('action_failed'), {
          description: e instanceof Error ? e.message : String(e),
        });
        return false;
      }
    },
    [confirm, toast, t],
  );

  return { runDestructive };
}
