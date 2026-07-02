'use client';

import { useEffect } from 'react';

/**
 * Tracks whether any mounted form currently has unsaved changes, so the global
 * <UnsavedNavGuard> can show the in-app ConfirmDialog (a styled modal) before
 * letting an in-app navigation discard those edits.
 *
 * Why no native `beforeunload`:
 * - Project rule: no native `window.confirm` / `alert` — the design-system
 *   ConfirmDialog modal is used instead (user request 2026-06-14).
 * - `beforeunload` only fires on a hard unload (tab close / refresh / external
 *   nav), NOT on Next.js client-side navigation — which is the common "leave
 *   the open form" case. So it both showed a banned native alert and missed
 *   the vector that actually matters.
 *
 * The registry is a simple mounted-count: every form that passes `isDirty=true`
 * increments it on mount and decrements on cleanup (including when it navigates
 * away). `isUnsavedDirty()` is read by the guard at click time, so no React
 * re-render is needed to keep it current.
 */
let dirtyCount = 0;

/** True while at least one mounted form reports unsaved changes. */
export function isUnsavedDirty(): boolean {
  return dirtyCount > 0;
}

export function useUnsavedGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    dirtyCount += 1;
    return () => {
      dirtyCount -= 1;
    };
  }, [isDirty]);
}
