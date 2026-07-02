'use client';

import { isUnsavedDirty } from '@/hooks/use-unsaved-guard';
import { useConfirm } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Global unsaved-changes guard for in-app navigation.
 *
 * When a form has unsaved changes (see {@link useUnsavedGuard}) and the user
 * clicks an in-app link, this intercepts the click and shows the styled
 * ConfirmDialog ("leave without saving?") instead of silently discarding the
 * edits — and instead of the native browser "Leave site?" alert, which the
 * project bans and which never fired on client-side navigation anyway.
 *
 * Scope: in-app <a>/<Link> clicks (sidebar, top nav, breadcrumbs, record
 * pager…). External links, new-tab / modified clicks and same-page anchors are
 * left to the browser. Add `data-no-guard="true"` to an anchor to opt out.
 */
export function UnsavedNavGuard() {
  const { confirm } = useConfirm();
  const router = useRouter();
  const t = useTranslations('unsaved_changes');

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Plain left-clicks only — let middle/modifier clicks (open-in-new-tab)
      // and already-handled events through untouched.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (
        !href ||
        href.startsWith('#') ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        anchor.dataset.noGuard === 'true'
      ) {
        return;
      }
      const url = new URL(href, window.location.href);
      // External origin → real unload, let the browser own it.
      if (url.origin !== window.location.origin) return;
      // Same page (e.g. query-less re-click) → not a navigation away.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      if (!isUnsavedDirty()) return;

      // Dirty + leaving: block the client navigation and ask first.
      e.preventDefault();
      e.stopPropagation();
      const dest = url.pathname + url.search + url.hash;
      void confirm({
        title: t('title'),
        description: t('description'),
        confirmLabel: t('leave'),
        cancelLabel: t('stay'),
        tone: 'warning',
      }).then((res) => {
        if (res === true || res === 'confirm') {
          router.push(dest);
        }
      });
    }

    // Capture phase: run before Next's <Link> click handler so we can stop it.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [confirm, router, t]);

  return null;
}
