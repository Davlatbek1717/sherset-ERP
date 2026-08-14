import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PinKeypad } from '@/components/pos/pin-keypad';
import { PosPinLock } from '@/components/pos/pos-pin-lock';
import { act, renderWithProviders, screen } from '@/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PIN KIRITISH YO'LI — «AYNAN BITTA NUMPAD» INVARIANTI (P6).
 *
 * Monoblokda ikki xil raqam paneli bor va ular BIR-BIRIDAN XABARSIZ:
 *   1. sahifaning o'z numpadi (`PinKeypad` — kirish ekrani);
 *   2. qobiq (Electron) klaviaturasi — `desktop/preload.js` HAR fokusda
 *      chiqaradi, agar maydon uning ro'yxatiga tushsa.
 *
 * 🔴 IKKI YOQLAMA XATO — ikkalasi ham jonli kuzatilgan sinf:
 *   • IKKI numpad: sahifa numpadi bor ekranda qobiq taniydigan maydon ham
 *     bo'lsa, kassir ustma-ust ikki panel ko'radi.
 *   • NOL numpad: maydonni `readOnly` qilib «ortiqcha panelni yashirish» —
 *     P6 rejasi aynan shuni taklif qilgan edi. **O'lchandi va RAD ETILDI**:
 *     Electron 33.4.11 / Chromium 130 da `readOnly` maydonda qobiq
 *     klaviaturasi BARIBIR chiqadi, lekin `sendInputEvent` kaliti maydonga
 *     TUSHMAYDI (o'lchov: `desktop/tools/kbd-probe/probe.js` →
 *     `readOnlyTyped: ""`). Ya'ni kassir qulf ekranida qamalib qolardi.
 *
 * Shuning uchun qulflanadigan shartnoma: har PIN ekranida kiritish yo'li
 * AYNAN BITTA bo'lsin — yo sahifa tugmalari, yo qobiq taniydigan tahrirlanadigan
 * maydon. Ikkalasi ham emas, birortasisiz ham emas.
 */

// Qulf FAQAT PIN o'rnatilgan hisobda ishlaydi (`/auth/pos-pin` → hasPin).
vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(async () => ({ hasPin: true })),
    post: vi.fn(async () => ({})),
  },
}));

// ─── Tanish maydon ro'yxati `preload.js` ning O'ZIDAN olinadi ───────────────
// Ro'yxatni bu yerga ko'chirib yozish qo'riqchini yolg'onga aylantirardi:
// preload o'zgarganda test eski ro'yxat bo'yicha yashil qolib ketardi.
const preloadSrc = readFileSync(join(process.cwd(), '..', '..', 'desktop', 'preload.js'), 'utf8');

function parseList(name: string): string[] {
  const m = preloadSrc.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  const body = m?.[1];
  if (!body) throw new Error(`preload.js da «${name}» ro'yxati topilmadi (nomi o'zgardimi?)`);
  return [...body.matchAll(/'([^']*)'/g)].map((x) => x[1] ?? '');
}

const KB_TYPES = parseList('KB_TYPES');
const KB_NUMERIC_MODES = parseList('KB_NUMERIC_MODES');

/** Qobiq klaviaturasi shu elementda chiqadimi (`preload.js` → `wanted`). */
function shellKeyboardOpens(el: Element): boolean {
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return KB_TYPES.includes((el.getAttribute('type') ?? '').toLowerCase());
}

/** Kassir kiritishi mumkin bo'lgan maydonlar (readOnly/disabled = kirita olmaydi). */
function usableFields(root: ParentNode): Element[] {
  return [...root.querySelectorAll('input, textarea')].filter(
    (el) =>
      shellKeyboardOpens(el) && !el.hasAttribute('readonly') && !(el as HTMLInputElement).disabled,
  );
}

/** Sahifaning O'Z raqam tugmalari (0–9). */
function pageDigitButtons(root: ParentNode): Element[] {
  return [...root.querySelectorAll('button')].filter((b) => /^[0-9]$/.test(b.textContent ?? ''));
}

describe('kirish ekrani (PinKeypad) — sahifa numpadi', () => {
  beforeEach(() => {
    renderWithProviders(
      <PinKeypad
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        disabled={false}
        maxLength={4}
      />,
    );
  });

  it('sahifaning o`z raqam tugmalari bor (kiritish yo`li)', () => {
    expect(pageDigitButtons(document.body).length).toBe(10);
  });

  it('🔴 <input> RENDER QILINMAYDI — aks holda monoblokda IKKI numpad chiqardi', () => {
    // Bu ekranda qobiq klaviaturasi ATAYLAB chaqirilmaydi: maydon yo'q ⇒
    // `preload.js` ning `focusin` tinglovchisi hech qachon ishlamaydi.
    expect(document.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(usableFields(document.body)).toHaveLength(0);
  });
});

describe('qulf ekrani (PosPinLock) — qobiq klaviaturasi', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    renderWithProviders(<PosPinLock />);
    // Ikki qadam ATAYLAB: avval `/auth/pos-pin` javobi qo'llanadi (`hasPin`),
    // va FAQAT shundan keyin harakatsizlik taymeri qo'yiladi. Bitta
    // `advanceTimersByTime` da taymer hali mavjud emas edi — qulf tushmasdi.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('qulf ekrani chiqadi (o`rnatish sanity)', () => {
    expect(screen.getByTestId('pos-pin-lock')).toBeTruthy();
  });

  it('🔴 PIN maydoni readOnly/disabled EMAS — aks holda qobiq kaliti TUSHMAYDI', () => {
    const input = screen.getByTestId('pos-pin-input');
    expect(input.hasAttribute('readonly')).toBe(false);
    expect((input as HTMLInputElement).disabled).toBe(false);
  });

  it('maydon qobiq NUMPADINI chaqiradi (raqamli `inputMode`)', () => {
    const input = screen.getByTestId('pos-pin-input');
    expect(shellKeyboardOpens(input)).toBe(true);
    expect(KB_NUMERIC_MODES).toContain((input.getAttribute('inputmode') ?? '').toLowerCase());
  });

  it('🔴 sahifa O`Z raqam tugmalarini chizmaydi — aks holda IKKI numpad', () => {
    expect(pageDigitButtons(screen.getByTestId('pos-pin-lock'))).toHaveLength(0);
  });
});

describe('qulf ekrani — smena YO`Q (F8): kassir-tanlash, invariant saqlanadi', () => {
  /**
   * F8 (spec §8.4): qulf tushganda kassirning OCHIQ sessiyasi bo'lmasa —
   * PIN-maydon o'rniga kassir-tanlash ekrani (boshqa kassir o'z PIN'i bilan
   * ishga tushadi). Bitta-numpad invarianti BU tarmoqda ham amal qiladi:
   * karta-ekranida ham, PIN bosqichida ham <input> yo'q — faqat sahifa
   * tugmalari (`PinKeypad`).
   */
  const DEVICE = { deviceId: 'dev-1', deviceSecret: 'sec-1', name: 'Kassa-1' };

  beforeEach(async () => {
    // Kassa ish o'rni mezoni (`isPosWorkstation`) — juftlangan qurilma kaliti.
    localStorage.setItem('sherset.pos-device', JSON.stringify(DEVICE));
    const { api } = await import('@/lib/api-client');
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/cashier-sessions/current') return null;
      if (path === '/auth/pos-pin/candidates') {
        return { cashiers: [{ employeeId: 'e-1', name: 'Alisher Kassir' }] };
      }
      return { hasPin: true };
    });

    vi.useFakeTimers();
    renderWithProviders(<PosPinLock />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    });
    // React Query boshlang'ich fetch'ni taymer orqali rejalashtiradi — real
    // taymerga o'tishdan OLDIN flush qilinmasa kandidat-so'rov yo'qolib,
    // ekran abadiy «Yuklanmoqda»da qolardi (o'lchandi).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    // Keyingi interaksiyalar (karta bosish, so'rovlar) real taymerlarda.
    vi.useRealTimers();
  });

  afterEach(async () => {
    localStorage.removeItem('sherset.pos-device');
    const { api } = await import('@/lib/api-client');
    vi.mocked(api.get).mockImplementation(async () => ({ hasPin: true }));
  });

  it('qulf o`rnida kassir-tanlash ekrani, PIN-maydon YO`Q', async () => {
    expect(screen.getByTestId('pos-pin-lock')).toBeTruthy();
    expect(await screen.findByTestId('cashier-select-screen')).toBeTruthy();
    expect(screen.queryByTestId('pos-pin-input')).toBeNull();
    // Karta-ekranida qobiq taniydigan maydon ham yo'q.
    expect(usableFields(document.body)).toHaveLength(0);
  });

  it('🔴 karta bosilsa PIN bosqichi: sahifa tugmalari BOR, <input> YO`Q', async () => {
    const card = await screen.findByText('Alisher Kassir');
    await act(async () => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(pageDigitButtons(document.body).length).toBe(10);
    expect(document.querySelectorAll('input, textarea')).toHaveLength(0);
  });
});

describe('umumiy invariant — kiritish yo`li AYNAN BITTA', () => {
  it('preload ro`yxatlari haqiqatan o`qildi (qo`riqchi bo`sh qolmasin)', () => {
    // Regex parse'i jimgina bo'sh ro'yxat qaytarsa yuqoridagi testlar
    // «hech narsa tanimaydi» holatida ham yashil bo'lib qolardi.
    expect(KB_TYPES).toContain('password');
    expect(KB_NUMERIC_MODES).toContain('numeric');
  });

  it('kirish ekrani: sahifa tugmalari BOR, qobiq maydoni YO`Q', () => {
    renderWithProviders(
      <PinKeypad
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        disabled={false}
        maxLength={4}
      />,
    );
    const hasPageNumpad = pageDigitButtons(document.body).length > 0;
    const hasShellField = usableFields(document.body).length > 0;
    expect(hasPageNumpad !== hasShellField).toBe(true);
  });
});
