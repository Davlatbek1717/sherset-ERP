/**
 * F6 (POS redizayn) — header ichidagi oyna-tugmalari (spec §7).
 *
 * Qulflanadigan shartnomalar:
 *  · electronAPI YO'Q (oddiy brauzer) → hech narsa chizilmaydi, marker qo'yilmaydi;
 *  · electronAPI bor, lekin `minimize` YO'Q (eski exe ≤1.6.0) → chizilmaydi —
 *    eski qobiqda preload'ning suzuvchi uchligi o'zi turadi, ikkita uchlik
 *    bo'lmasin (spec §7 versiya-moslik matritsasi);
 *  · `minimize` bor (1.7.0+) → — ❐ ✕ chiziladi va <html> ga
 *    `data-sherset-window-controls="page"` markeri qo'yiladi (preload shu
 *    markerni ko'rib o'z uchligini bostiradi);
 *  · bosishlar to'g'ri metodlarga boradi; ✕ `requestQuit` — tasdiq dialogi
 *    main.js tomonda (E1), tasodifiy bosish savdoni yo'qotmaydi;
 *  · unmount → marker olib tashlanadi (suzuvchi uchlik qaytishi uchun);
 *  · konteyner/tugmalar `position: fixed` EMAS — desktop klaviatura-evristikasi
 *    («fixed ichida button») buzilmasin;
 *  · NOM-MOSLIK TETHERI: komponent chaqiradigan metod nomlari va marker literal
 *    HAQIQIY desktop/preload.js da bor (`fe-fixture-invents-server-field`
 *    bug-klassi: mock o'zi uydirgan nom bilan yashil qolardi).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, renderWithProviders, screen } from '@/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowControls } from '../window-controls';

const MARKER_ATTR = 'data-sherset-window-controls';

type Bridge = {
  minimize?: () => void;
  toggleWindowed?: () => void;
  requestQuit?: () => void;
};

function setBridge(bridge: Bridge | undefined) {
  (window as unknown as { electronAPI?: Bridge }).electronAPI = bridge;
}

function newBridge(): Required<Bridge> {
  return {
    minimize: vi.fn(),
    toggleWindowed: vi.fn(),
    requestQuit: vi.fn(),
  };
}

beforeEach(() => {
  document.documentElement.removeAttribute(MARKER_ATTR);
});

afterEach(() => {
  setBridge(undefined);
});

describe('WindowControls — versiya-moslik matritsasi (spec §7)', () => {
  it('electronAPI YO`Q (oddiy brauzer): hech narsa chizilmaydi, marker qo`yilmaydi', () => {
    renderWithProviders(<WindowControls />);
    expect(screen.queryByTestId('pos-window-controls')).not.toBeInTheDocument();
    expect(document.documentElement.getAttribute(MARKER_ATTR)).toBeNull();
  });

  it('eski exe (`minimize` yo`q): chizilmaydi — suzuvchi uchlik o`zi turadi', () => {
    setBridge({});
    renderWithProviders(<WindowControls />);
    expect(screen.queryByTestId('pos-window-controls')).not.toBeInTheDocument();
    expect(document.documentElement.getAttribute(MARKER_ATTR)).toBeNull();
  });

  it('yangi exe (1.7.0+): — ❐ ✕ chiziladi va marker `page` qo`yiladi', () => {
    setBridge(newBridge());
    renderWithProviders(<WindowControls />);
    expect(screen.getByTestId('pos-win-minimize')).toBeInTheDocument();
    expect(screen.getByTestId('pos-win-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('pos-win-close')).toBeInTheDocument();
    expect(document.documentElement.getAttribute(MARKER_ATTR)).toBe('page');
  });

  it('unmount: marker OLIB TASHLANADI (suzuvchi uchlik qaytadi)', () => {
    setBridge(newBridge());
    const { unmount } = renderWithProviders(<WindowControls />);
    expect(document.documentElement.getAttribute(MARKER_ATTR)).toBe('page');
    unmount();
    expect(document.documentElement.getAttribute(MARKER_ATTR)).toBeNull();
  });
});

describe('WindowControls — bosishlar to`g`ri metodlarga boradi', () => {
  it('«—» → minimize, «❐» → toggleWindowed, «✕» → requestQuit', () => {
    const bridge = newBridge();
    setBridge(bridge);
    renderWithProviders(<WindowControls />);

    fireEvent.click(screen.getByTestId('pos-win-minimize'));
    expect(bridge.minimize).toHaveBeenCalledTimes(1);
    expect(bridge.toggleWindowed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('pos-win-toggle'));
    expect(bridge.toggleWindowed).toHaveBeenCalledTimes(1);

    // ✕ — TASDIQLI yo'l (requestQuit); tasdiq dialogi main.js da (E1).
    fireEvent.click(screen.getByTestId('pos-win-close'));
    expect(bridge.requestQuit).toHaveBeenCalledTimes(1);
    expect(bridge.minimize).toHaveBeenCalledTimes(1);
  });
});

describe('WindowControls — qobiq cheklovlari', () => {
  it('konteyner ham, tugmalar ham `fixed` EMAS (klaviatura-evristika)', () => {
    setBridge(newBridge());
    renderWithProviders(<WindowControls />);
    const root = screen.getByTestId('pos-window-controls');
    for (const el of [root, ...root.querySelectorAll('button')]) {
      expect(el.className).not.toMatch(/(^|\s)fixed(\s|$)/);
      expect((el as HTMLElement).style.position).not.toBe('fixed');
    }
  });
});

describe('WindowControls ↔ desktop/preload.js nom-moslik tetheri', () => {
  // vitest cwd = apps/web (pos-header sibling qo'riqchilari bilan bir xil yo'l).
  const preloadSrc = readFileSync(join(process.cwd(), '..', '..', 'desktop', 'preload.js'), 'utf8');

  it('komponent chaqiradigan 3 metod preload electronAPI da mavjud', () => {
    for (const name of ['minimize', 'toggleWindowed', 'requestQuit'] as const) {
      expect(preloadSrc, `preload'da «${name}» metodi yo'q`).toMatch(
        new RegExp(`${name}\\s*:\\s*\\(\\)\\s*=>`),
      );
    }
  });

  it('marker literal ikkala tomonda BIR XIL', () => {
    expect(preloadSrc).toContain(MARKER_ATTR);
    // Qiymat ham: preload faqat `page` qiymatida bostiradi (W6).
    expect(preloadSrc).toMatch(/===\s*'page'/);
  });
});
