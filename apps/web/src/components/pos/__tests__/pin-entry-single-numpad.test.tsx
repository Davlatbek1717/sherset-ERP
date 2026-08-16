import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PinKeypad } from '@/components/pos/pin-keypad';
import { renderWithProviders } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * 🔴 QULF EKRANI (`PosPinLock`) 2026-08-16 da BUTUNLAY OLIB TASHLANDI (egasi:
 * «ekran qulf kerak emas umuman»), shuning uchun uning ikki bloki shu yerdan
 * ham ketdi. Invariant YO'QOLMADI — PIN endi ikki ekranda kiritiladi:
 * kirish (`PinKeypad`, yuqorida) va ATAYLAB kassir almashtirish
 * (`CashierSelectScreen`). Ikkinchisining «bitta numpad» qamrovi O'Z faylida:
 * `cashier-select-screen.test.tsx` → «PIN bosqichi (bitta-numpad invarianti)».
 * Bu yerga nusxa qilinmadi — ikki nusxa bo'lsa biri eskirardi.
 */
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
