/**
 * SpaNavigation — the global anchor-click → router.push upgrade.
 *
 * Filter matrix is covered through the pure `spaNavDestination` predicate
 * (no events dispatched — keeps jsdom's "navigation not implemented" noise
 * out). Integration tests then prove the document-level listener actually
 * intercepts clicks, defers to an earlier capture listener (UnsavedNavGuard)
 * and to a dirty form, and prefetches on hover.
 */
import { renderWithProviders } from '@/test-utils';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpaNavigation, spaNavDestination } from './spa-nav';

const push = vi.fn();
const prefetch = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, prefetch, replace: vi.fn(), back: vi.fn() }),
}));

let dirty = false;
vi.mock('@/hooks/use-unsaved-guard', () => ({
  isUnsavedDirty: () => dirty,
}));

function anchor(href: string, mutate?: (a: HTMLAnchorElement) => void): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  mutate?.(a);
  return a;
}

const plainClick = {
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

describe('spaNavDestination (filter matrix)', () => {
  it('returns the path for a plain left-click on an internal link', () => {
    expect(spaNavDestination(anchor('/demands'), plainClick)).toBe('/demands');
  });

  it('preserves query string and hash', () => {
    expect(spaNavDestination(anchor('/calls/new?counterpartyId=7#top'), plainClick)).toBe(
      '/calls/new?counterpartyId=7#top',
    );
  });

  it('resolves relative hrefs against the current origin', () => {
    expect(spaNavDestination(anchor('demands/5'), plainClick)).toMatch(/\/demands\/5$/);
  });

  it.each([
    ['metaKey', { ...plainClick, metaKey: true }],
    ['ctrlKey', { ...plainClick, ctrlKey: true }],
    ['shiftKey', { ...plainClick, shiftKey: true }],
    ['altKey', { ...plainClick, altKey: true }],
    ['middle button', { ...plainClick, button: 1 }],
    ['already handled', { ...plainClick, defaultPrevented: true }],
  ])('lets the browser own %s clicks', (_label, evt) => {
    expect(spaNavDestination(anchor('/demands'), evt)).toBeNull();
  });

  it('skips target="_blank" links (print forms, files)', () => {
    const blank = anchor('/print/demand/1', (a) => {
      a.target = '_blank';
    });
    expect(spaNavDestination(blank, plainClick)).toBeNull();
  });

  it('intercepts explicit target="_self"', () => {
    const self = anchor('/demands', (a) => {
      a.target = '_self';
    });
    expect(spaNavDestination(self, plainClick)).toBe('/demands');
  });

  it('skips download links', () => {
    expect(
      spaNavDestination(
        anchor('/files/x.pdf', (a) => a.setAttribute('download', '')),
        plainClick,
      ),
    ).toBeNull();
  });

  it('skips external origins, mailto: and tel:', () => {
    expect(spaNavDestination(anchor('https://moysklad.uz/x'), plainClick)).toBeNull();
    expect(spaNavDestination(anchor('mailto:a@b.uz'), plainClick)).toBeNull();
    expect(spaNavDestination(anchor('tel:+998901234567'), plainClick)).toBeNull();
  });

  it('skips backend /api/* paths (attachments, PDFs stream from the API)', () => {
    expect(spaNavDestination(anchor('/api/v1/attachments/9/raw'), plainClick)).toBeNull();
    expect(spaNavDestination(anchor('/api'), plainClick)).toBeNull();
    // …but a page that merely STARTS with "api" is still an app route.
    expect(spaNavDestination(anchor('/apis'), plainClick)).toBe('/apis');
  });

  it('skips hash-only and empty hrefs', () => {
    expect(spaNavDestination(anchor('#section'), plainClick)).toBeNull();
    expect(spaNavDestination(anchor(''), plainClick)).toBeNull();
  });

  it('honours the data-no-spa opt-out', () => {
    const optOut = anchor('/demands', (a) => {
      a.dataset.noSpa = 'true';
    });
    expect(spaNavDestination(optOut, plainClick)).toBeNull();
  });
});

describe('<SpaNavigation /> document listener', () => {
  let a: HTMLAnchorElement;

  beforeEach(() => {
    dirty = false;
    push.mockClear();
    prefetch.mockClear();
    a = anchor('/demands/abc?x=1');
    document.body.appendChild(a);
  });

  afterEach(() => {
    a.remove();
  });

  it('upgrades a plain click to router.push and prevents the full reload', () => {
    renderWithProviders(<SpaNavigation />);
    const cancelled = !fireEvent.click(a);
    expect(cancelled).toBe(true); // preventDefault() ran → no document navigation
    expect(push).toHaveBeenCalledWith('/demands/abc?x=1');
  });

  it('works when the click lands on a child of the anchor (icon/label spans)', () => {
    const span = document.createElement('span');
    span.textContent = 'Отгрузки';
    a.appendChild(span);
    renderWithProviders(<SpaNavigation />);
    fireEvent.click(span);
    expect(push).toHaveBeenCalledWith('/demands/abc?x=1');
  });

  it('defers to an earlier capture listener that already handled the click', () => {
    // Simulates UnsavedNavGuard: registered BEFORE SpaNavigation mounts, so it
    // sees the click first and preventDefault()s it.
    const guard = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('click', guard, true);
    try {
      renderWithProviders(<SpaNavigation />);
      fireEvent.click(a);
      expect(push).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', guard, true);
    }
  });

  it('stands down while a form is dirty (UnsavedNavGuard owns the click)', () => {
    dirty = true;
    // Prevent jsdom's real navigation once our listener has declined.
    a.addEventListener('click', (e) => e.preventDefault());
    renderWithProviders(<SpaNavigation />);
    fireEvent.click(a);
    expect(push).not.toHaveBeenCalled();
  });

  it('prefetches the route on hover', () => {
    renderWithProviders(<SpaNavigation />);
    fireEvent.mouseOver(a);
    expect(prefetch).toHaveBeenCalledWith('/demands/abc?x=1');
  });

  it('does not prefetch external or /api links on hover', () => {
    renderWithProviders(<SpaNavigation />);
    const ext = anchor('https://moysklad.uz/help');
    const api = anchor('/api/v1/attachments/9/raw');
    document.body.append(ext, api);
    fireEvent.mouseOver(ext);
    fireEvent.mouseOver(api);
    expect(prefetch).not.toHaveBeenCalled();
    ext.remove();
    api.remove();
  });

  it('removes listeners on unmount', () => {
    const { unmount } = renderWithProviders(<SpaNavigation />);
    unmount();
    a.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(a);
    expect(push).not.toHaveBeenCalled();
  });
});
