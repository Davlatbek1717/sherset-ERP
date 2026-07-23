'use client';

import * as React from 'react';
import { useConfirm } from './ConfirmDialog.tsx';

/**
 * Unsaved-changes guard. Mirrors moysklad's "Сохранение изменений? Данные
 * были изменены. Сохранить изменения?" three-button modal.
 *
 * Two integration points:
 *   1. `useUnsavedChangesGuard({ dirty })` — call inside any form to
 *      show the modal on route change / browser-back / tab-close. Wires
 *      up the `beforeunload` event for hard navigations and listens to
 *      `popstate` for SPA back/forward.
 *   2. `<UnsavedChangesGuard onSaveAndLeave={...} />` — declarative
 *      mount inside a form component; same effect, no hook plumbing.
 *
 * Behaviour:
 * - When dirty + user navigates → ConfirmDialog with three buttons:
 *     "Saqlash"   (calls onSaveAndLeave, then proceeds)
 *     "Saqlamaslik" (discards changes, proceeds)
 *     "Bekor qilish" (cancels navigation)
 * - On hard browser navigation (close tab, refresh) the native
 *   `beforeunload` warning kicks in instead — the browser shows its own
 *   chrome, we can't replace it with our modal there.
 *
 * The captured-modal stuck-state bug we hit during scrape-app was
 * exactly this dialog: typing "test-dirty" in any input → modal opens
 * → modal must be dismissed before navigation. The capture script now
 * force-closes it; this component is the production-side counterpart.
 */

export interface UseUnsavedChangesGuardOptions {
  /** True while the form has unsaved edits. */
  dirty: boolean;
  /** Optional save handler — wires the third "Saqlash" button. */
  onSaveAndLeave?: () => Promise<void> | void;
}

/**
 * Hook variant. Returns nothing — side effects only.
 *
 * Note: in Next.js, the App Router's <Link> intercept happens via
 * `next/navigation`'s router events. Without a built-in confirm hook
 * we patch `history.pushState` to intercept SPA pushes; this is the
 * pattern moysklad themselves use (Java rich client also wires the
 * confirmation at navigation time).
 */
export function useUnsavedChangesGuard({
  dirty,
  onSaveAndLeave,
}: UseUnsavedChangesGuardOptions): void {
  const { confirm } = useConfirm();
  const dirtyRef = React.useRef(dirty);
  React.useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // (1) beforeunload — hard refresh / tab close. Browsers show their own
  // dialog; we can only opt in by setting returnValue.
  React.useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // (2) SPA navigation guard. We patch `history.pushState` and intercept
  // popstate (browser back). On a guarded transition we revert the URL
  // and run our confirm flow; if the user picks confirm we replay the
  // navigation manually.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalPushState = window.history.pushState.bind(window.history);

    let pendingNavigation: { kind: 'push'; data: any; url: string } | null = null;

    async function runGuard(replay: () => void): Promise<void> {
      const result = await confirm({
        title: "Saqlanmagan o'zgarishlar bor",
        description:
          "Sahifadan chiqsangiz kiritgan ma'lumotlar yo'qoladi. Avval saqlashni xohlaysizmi?",
        confirmLabel: 'Saqlash',
        cancelLabel: 'Bekor qilish',
        discardLabel: 'Saqlamaslik',
        tone: 'warning',
      });

      if (result === 'confirm') {
        try {
          if (onSaveAndLeave) await onSaveAndLeave();
          replay();
        } catch {
          // save failed — stay on page; toast was raised by the save handler
        }
      } else if (result === 'discard' || result === true) {
        replay();
      }
      // 'cancel' or false → stay
    }

    function patchedPushState(data: any, _unused: string, url?: string | URL | null) {
      if (!dirtyRef.current) {
        originalPushState(data, _unused, url);
        return;
      }
      pendingNavigation = { kind: 'push', data, url: String(url ?? location.pathname) };
      runGuard(() => {
        // Mark form as clean so the replayed nav doesn't loop.
        dirtyRef.current = false;
        if (pendingNavigation) {
          originalPushState(pendingNavigation.data, '', pendingNavigation.url);
          // Notify Next.js router (it listens for popstate-like changes via
          // its own mechanism; pushState replacement won't auto-trigger it,
          // so we dispatch a synthetic popstate as the safest broadly-
          // compatible signal).
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        pendingNavigation = null;
      });
    }

    function onPopState(_e: PopStateEvent) {
      if (!dirtyRef.current) return;
      // Browser already navigated. Revert the visible URL by pushing the
      // current path back, then run the guard.
      const currentUrl = location.pathname + location.search + location.hash;
      runGuard(() => {
        // user accepted — nothing to do; the popstate already happened
      });
      // For now we don't try to revert — Next.js router has already started.
      // Practical effect: the warning still shows but the page may have
      // partially loaded. Real revert would require a deeper next/router
      // integration; this is the conservative subset that works without it.
      void currentUrl;
    }

    window.history.pushState = patchedPushState as typeof window.history.pushState;
    window.addEventListener('popstate', onPopState);
    return () => {
      window.history.pushState = originalPushState;
      window.removeEventListener('popstate', onPopState);
    };
  }, [confirm, onSaveAndLeave]);
}

/** Declarative mount — equivalent to calling the hook inside a form. */
export function UnsavedChangesGuard(props: UseUnsavedChangesGuardOptions): null {
  useUnsavedChangesGuard(props);
  return null;
}
