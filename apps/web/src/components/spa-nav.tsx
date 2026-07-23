'use client';

import { isUnsavedDirty } from '@/hooks/use-unsaved-guard';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Global client-side navigation for plain `<a href>` links.
 *
 * The design system (AppShell module tabs, SubNav strips, ListView create
 * buttons, DataTable № cells…) renders framework-agnostic `<a>` anchors, so
 * every module/tab/row click was a FULL document reload — re-downloading every
 * chunk, re-running auth bootstrap, permissions and i18n on each navigation.
 * Instead of threading a Link component through the design system and 70+
 * pages, this one listener upgrades every qualifying in-app anchor click to
 * `router.push` (SPA navigation), preserving the mounted layout, React Query
 * cache and auth state across sections.
 *
 * Composes with <UnsavedNavGuard>: the guard registers its capture-phase
 * listener FIRST (mounted earlier in the tree), so when a form is dirty it
 * preventDefault()s and we see `e.defaultPrevented` → skip; the guard then
 * router.push()es itself after the user confirms.
 *
 * Left alone (browser-owned): modified/middle clicks (new tab), external
 * origins, `target` links, downloads, `#` fragments, `/api/*` (backend files —
 * PDFs, attachments) and anchors opting out via `data-no-spa="true"`.
 */

/** Pure predicate: the in-app destination for this anchor click, or null to let the browser handle it. */
export function spaNavDestination(
  anchor: HTMLAnchorElement,
  e: Pick<
    MouseEvent,
    'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
  >,
): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    return null;
  }
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;
  if (anchor.dataset.noSpa === 'true') return null;
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  // External origin (https://…, mailto:, tel:) → real navigation.
  if (url.origin !== window.location.origin) return null;
  // Backend-proxied paths are documents/files, not app routes — a client-side
  // push would render the app 404 shell instead of streaming the file.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
  return url.pathname + url.search + url.hash;
}

/** Same-origin app route worth prefetching on hover (no click-state checks). */
function prefetchDestination(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download') || anchor.dataset.noSpa === 'true') return null;
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
  return url.pathname + url.search;
}

export function SpaNavigation() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest('a');
      if (!anchor) return;
      // Dirty form → the UnsavedNavGuard owns this click (it confirms, then
      // pushes). Checked here too so the hand-off is safe in EITHER listener
      // registration order, not just the usual guard-first one.
      if (isUnsavedDirty()) return;
      const dest = spaNavDestination(anchor, e);
      if (dest === null) return;
      e.preventDefault();
      router.push(dest);
    };

    // Hover-prefetch: warms the target route's chunks + RSC payload while the
    // pointer is still over the link, so the subsequent click paints instantly
    // in production builds (next dev ignores prefetch). Next's router dedupes
    // repeat prefetches of the same URL internally.
    const onHover = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest('a');
      if (!anchor) return;
      const dest = prefetchDestination(anchor);
      if (dest === null) return;
      router.prefetch(dest);
    };

    // Capture phase, registered AFTER UnsavedNavGuard's capture listener
    // (mount order) so the dirty-form confirm keeps priority.
    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseover', onHover, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mouseover', onHover, true);
    };
  }, [router]);

  return null;
}
