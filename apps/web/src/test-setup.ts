/**
 * Vitest setup — installs jest-dom matchers and ResizeObserver/
 * matchMedia stubs that React component tests rely on.
 *
 * Lives at apps/web/src/test-setup.ts and is wired in vitest.config.ts
 * via `setupFiles`.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Codebase convention is `data-test-id` (with hyphen between test and
// id, matching moysklad's GWT app + design-system primitives), not
// the testing-library default `data-testid`. Configure once globally.
configure({ testIdAttribute: 'data-test-id' });

// Auto-clean the DOM between tests so leftover portals don't leak.
afterEach(() => {
  cleanup();
});

// happy-dom doesn't ship ResizeObserver — Radix uses it for popover
// positioning, so stub it out.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
// biome-ignore lint/suspicious/noExplicitAny: setting global stub
(globalThis as any).ResizeObserver = ResizeObserverStub;

// Radix DropdownMenu also pokes at scrollTo / matchMedia.
if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// scrollTo is sometimes called by Radix — stub if absent.
if (!('scrollTo' in Element.prototype)) {
  // biome-ignore lint/suspicious/noExplicitAny: prototype patch
  (Element.prototype as any).scrollTo = () => undefined;
}

// hasPointerCapture / setPointerCapture / releasePointerCapture are
// used by Radix when handling pointer events but happy-dom doesn't
// implement them — stub no-ops to avoid runtime errors.
for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
  if (!(method in Element.prototype)) {
    // biome-ignore lint/suspicious/noExplicitAny: prototype patch
    (Element.prototype as any)[method] = () => false;
  }
}
