import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * QOBIQ EKRAN KLAVIATURASI — XULQ QO'RIQCHISI (F3).
 *
 * 🔴 Bu qo'riqchi manba-grep EMAS: `desktop/preload.js` HAQIQATAN yugurtiriladi
 * (happy-dom + soxta `electron` moduli) va klaviatura xulqi o'lchanadi. Sabab:
 * grep «kirill bormi» degan savolga javob beradi, «kirill harfi bosilganda
 * `kbd:key` ga o'sha harf ketadimi» degan savolga emas — F3 ning butun qiymati
 * esa ikkinchisida.
 *
 * Qulflanadigan shartnomalar (rejaning §3–4 bandlari):
 *   K1. Kalit FAQAT `ipcRenderer.send('kbd:key', …)` orqali ketadi — hech qachon
 *       `input.value = …` bilan emas (React holatini yangilamaydi, matn keyingi
 *       render'da yo'qoladi).
 *   K2. Uslublar FAQAT CSSOM orqali — sahifaga `<style>` teg EKILMAYDI
 *       (`style-src` CSP siyosati uni yeydi).
 *   K3. Hujjat darajasidagi tinglovchilar PASSIV — sahifaning haqiqiy tugmalari
 *       bosilishi to'sib qo'yilmaydi (chiqish imosi hodisasi).
 *   K4. Raqamli maydonda QWERTY emas, NUMPAD chiqadi.
 *   K5. Harf layoutida kirill mavjud va til tanlovi navigatsiyadan keyin tiklanadi.
 *
 * Yorliq: bu **jsdom/happy-dom** o'lchovi — «qaysi kalit `kbd:key` ga ketdi»
 * degan savolgacha. «O'sha belgi Chromium'ga yetdimi» degan savol boshqa
 * qatlamda va u **P6 da HAQIQIY Electron'da o'lchandi** (33.4.11 / Chromium 130,
 * prod bilan bir xil `sandbox: true` + izolyatsiyalangan dunyo):
 * kirill (`ф Ф я ў қ ғ ҳ`) ham, lotin ham, `⌫` ham yetadi va boshqariladigan
 * (React naqshidagi) maydonda qoladi; til tanlovi `localStorage` da saqlanib,
 * navigatsiyadan keyin tiklanadi. Qayta yugurtirish: `desktop/tools/kbd-probe/`.
 * O'lchanmagani — QURILMANING O'ZI (monoblok, barmoq): F4/P6 hisobotlariga qara.
 */

const WEB = process.cwd(); // apps/web
const REPO = join(WEB, '..', '..');
const preloadPath = join(REPO, 'desktop', 'preload.js');
const mainPath = join(REPO, 'desktop', 'main.js');

const preloadSrc = readFileSync(preloadPath, 'utf8');
const mainSrc = readFileSync(mainPath, 'utf8');

/** Izohsiz kod — xulq da'volari izohdagi so'zdan yashil bo'lib qolmasin. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:/])\/\/.*$/gm, '$1');

// ─── preload'ni HAQIQATAN yugurtirish ────────────────────────────────────────

interface IpcCall {
  channel: string;
  payload: unknown;
}

interface Shell {
  sends: IpcCall[];
}

/**
 * `desktop/preload.js` ni shu hujjatga yuklaydi (sahifa navigatsiyasining
 * ekvivalenti — preload har navigatsiyada qaytadan ishlaydi).
 */
function loadPreload(): Shell {
  const sends: IpcCall[] = [];
  const electron = {
    contextBridge: { exposeInMainWorld: () => undefined },
    ipcRenderer: {
      send: (channel: string, payload: unknown) => {
        sends.push({ channel, payload });
      },
      sendSync: () => '0.0.0-test',
      invoke: async () => ({}),
      on: () => undefined,
    },
  };
  const require_ = (name: string): unknown => {
    if (name === 'electron') return electron;
    throw new Error(`preload sandbox'da «${name}» modulini so'radi (sandbox: true da mumkin emas)`);
  };
  const module_ = { exports: {} };
  const run = new Function('require', 'module', 'exports', preloadSrc);
  run(require_, module_, module_.exports);
  return { sends };
}

/** Klaviatura ildizi — pastga yopishtirilgan, tugmali panel. */
function keyboardRoot(): HTMLElement | null {
  const found = [...document.body.children]
    .reverse()
    .find(
      (el) =>
        el instanceof HTMLElement &&
        el.style.position === 'fixed' &&
        el.querySelector('button') !== null,
    );
  return (found as HTMLElement | undefined) ?? null;
}

function keyLabels(): string[] {
  const root = keyboardRoot();
  if (!root) return [];
  return [...root.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
}

function keyButton(label: string): HTMLButtonElement {
  const root = keyboardRoot();
  const btn = [...(root?.querySelectorAll('button') ?? [])].find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  if (!btn) throw new Error(`«${label}» tugmasi yo'q. Bor: ${keyLabels().join(' ')}`);
  return btn as HTMLButtonElement;
}

function press(label: string): void {
  keyButton(label).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function visible(): boolean {
  const root = keyboardRoot();
  return !!root && root.style.display !== 'none';
}

/** Maydon yaratib fokus hodisasini beradi (haqiqiy `focusin` bilan). */
function focusField(attrs: Record<string, string>): HTMLInputElement {
  const input = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
  document.body.appendChild(input);
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  return input;
}

const LATIN_LETTERS = /^[a-z]$/i;
const CYRILLIC_LETTERS = /^[Ѐ-ӿ]$/;

let shell: Shell;

beforeEach(() => {
  document.body.innerHTML = '';
  try {
    window.localStorage.clear();
  } catch {
    // happy-dom localStorage'i yo'q bo'lsa — preload ham unga tayanmasligi kerak
  }
  shell = loadPreload();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('K4 — raqamli maydon NUMPAD ochadi (QWERTY emas)', () => {
  it('inputmode="decimal" (F2 savat oynasi) → numpad', () => {
    focusField({ type: 'text', inputmode: 'decimal' });
    const labels = keyLabels();
    expect(labels.length, 'klaviatura umuman chiqmadi').toBeGreaterThan(0);
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(labels, `«${d}» yo'q`).toContain(d);
    }
    expect(labels).toContain('.');
    expect(labels).toContain('⌫');
    // Harf tugmasi BO'LMASIN — numpadning butun ma'nosi shunda.
    expect(labels.filter((l) => LATIN_LETTERS.test(l) || CYRILLIC_LETTERS.test(l))).toEqual([]);
  });

  it('type="number" → numpad', () => {
    focusField({ type: 'number' });
    expect(keyLabels().filter((l) => LATIN_LETTERS.test(l))).toEqual([]);
    expect(keyLabels()).toContain('7');
  });

  it('inputmode="tel" (mijoz telefoni) → numpad', () => {
    focusField({ type: 'text', inputmode: 'tel' });
    expect(keyLabels().filter((l) => LATIN_LETTERS.test(l))).toEqual([]);
    expect(keyLabels()).toContain('0');
  });

  it('oddiy matn maydoni → HARF layouti', () => {
    focusField({ type: 'text' });
    const labels = keyLabels();
    expect(labels.filter((l) => LATIN_LETTERS.test(l)).length).toBeGreaterThanOrEqual(26);
  });

  it('matn → raqam maydoniga o`tilganda layout ALMASHADI (eskisi qolib ketmaydi)', () => {
    focusField({ type: 'text' });
    expect(keyLabels()).toContain('q');
    focusField({ type: 'text', inputmode: 'decimal' });
    expect(keyLabels()).not.toContain('q');
    expect(keyLabels()).toContain('7');
  });

  it('numpad tugmalari harf tugmalaridan KATTA (sensorli maqsad)', () => {
    focusField({ type: 'text' });
    const letterH = Number.parseInt(keyButton('a').style.height, 10);
    focusField({ type: 'text', inputmode: 'decimal' });
    const numH = Number.parseInt(keyButton('7').style.height, 10);
    expect(letterH).toBeGreaterThan(0);
    expect(numH).toBeGreaterThan(letterH);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('K5 — kirill harflari va til tanlovi', () => {
  it('harf layoutida RU (kirill) ga o`tish tugmasi bor', () => {
    focusField({ type: 'text' });
    expect(keyLabels()).toContain('РУС');
  });

  it('РУС bosilganda kirill chiqadi, lotin ketadi', () => {
    focusField({ type: 'text' });
    press('РУС');
    const labels = keyLabels();
    expect(labels.filter((l) => CYRILLIC_LETTERS.test(l)).length).toBeGreaterThanOrEqual(30);
    expect(labels.filter((l) => LATIN_LETTERS.test(l))).toEqual([]);
  });

  it('o`zbek kirill harflari ham bor (ў қ ғ ҳ) — RU alifbosida yo`q', () => {
    focusField({ type: 'text' });
    press('РУС');
    for (const ch of ['ў', 'қ', 'ғ', 'ҳ']) {
      expect(keyLabels(), `«${ch}» yo'q`).toContain(ch);
    }
  });

  it('kirill rejimida lotinga QAYTISH mumkin', () => {
    focusField({ type: 'text' });
    press('РУС');
    press('ABC');
    expect(keyLabels().filter((l) => LATIN_LETTERS.test(l)).length).toBeGreaterThanOrEqual(26);
  });

  it('til tanlovi SAHIFA NAVIGATSIYASIDAN keyin ham tiklanadi', () => {
    focusField({ type: 'text' });
    press('РУС');
    // Navigatsiya: preload butunlay qaytadan ishlaydi, DOM yo'qoladi.
    document.body.innerHTML = '';
    shell = loadPreload();
    focusField({ type: 'text' });
    expect(keyLabels().filter((l) => CYRILLIC_LETTERS.test(l)).length).toBeGreaterThanOrEqual(30);
  });

  it('o`zbek lotinidagi apostrof (o`, g`) kiritish mumkin', () => {
    focusField({ type: 'text' });
    expect(keyLabels()).toContain("'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('K1 — kalit `kbd:key` orqali ketadi (sendInputEvent shartnomasi)', () => {
  it('harf bosilsa AYNAN o`sha belgi yuboriladi', () => {
    focusField({ type: 'text' });
    press('a');
    expect(shell.sends).toEqual([{ channel: 'kbd:key', payload: 'a' }]);
  });

  it('shift bosilgach harflar BOSH harf bo`ladi va bosh harf yuboriladi', () => {
    focusField({ type: 'text' });
    press('⇧');
    press('A');
    expect(shell.sends).toEqual([{ channel: 'kbd:key', payload: 'A' }]);
  });

  it('kirill harfi ham o`zi yuboriladi', () => {
    focusField({ type: 'text' });
    press('РУС');
    press('й');
    expect(shell.sends).toEqual([{ channel: 'kbd:key', payload: 'й' }]);
  });

  it('⌫ — `Backspace` nomi bilan (main.js keyDown/keyUp ga aylantiradi)', () => {
    focusField({ type: 'text', inputmode: 'decimal' });
    press('⌫');
    expect(shell.sends).toEqual([{ channel: 'kbd:key', payload: 'Backspace' }]);
  });

  it('numpad raqami yuboriladi', () => {
    focusField({ type: 'text', inputmode: 'decimal' });
    press('7');
    press('.');
    expect(shell.sends.map((s) => s.payload)).toEqual(['7', '.']);
  });

  it('🔴 maydon qiymati TO`G`RIDAN-TO`G`RI yozilmaydi (React holati yo`qolardi)', () => {
    const input = focusField({ type: 'text' });
    press('a');
    // Kalit main'ga ketdi, DOM qiymati esa o'zgarmadi — haqiqiy klaviatura
    // hodisasini Chromium beradi (`sendInputEvent`), preload emas.
    expect(input.value).toBe('');
    const kb = stripComments(preloadSrc).slice(
      stripComments(preloadSrc).indexOf('function installTouchKeyboard'),
    );
    expect(kb).not.toMatch(/\.value\s*=[^=]/);
  });

  it('main.js `kbd:key` ni sendInputEvent ga uzatadi', () => {
    const code = stripComments(mainSrc);
    const at = code.indexOf("ipcMain.on('kbd:key'");
    expect(at, "main.js da `kbd:key` ishlovchisi yo'q").toBeGreaterThan(0);
    const body = code.slice(at, at + 700);
    expect(body).toContain('sendInputEvent');
    expect(body).not.toMatch(/\.value\s*=[^=]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('K2 — uslublar faqat CSSOM (CSP `style-src`)', () => {
  it('sahifaga <style> teg EKILMAYDI', () => {
    focusField({ type: 'text' });
    expect(document.querySelectorAll('style').length).toBe(0);
    expect(document.querySelectorAll('link[rel="stylesheet"]').length).toBe(0);
  });

  it('klaviatura uslublari INLINE (element.style) bilan qo`yilgan', () => {
    focusField({ type: 'text' });
    const root = keyboardRoot();
    expect(root?.style.position).toBe('fixed');
    expect(root?.getAttribute('style') ?? '').not.toBe('');
  });

  it("manbada `createElement('style')` / `innerHTML` yo`q", () => {
    const code = stripComments(preloadSrc);
    expect(code).not.toMatch(/createElement\(\s*['"]style['"]/);
    expect(code).not.toMatch(/insertRule|adoptedStyleSheets|innerHTML/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('K3 — tinglovchilar PASSIV (sahifa tugmalari to`silmaydi)', () => {
  it('sahifaning haqiqiy tugmasi bosilishi bekor QILINMAYDI', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true });
      btn.dispatchEvent(ev);
      expect(ev.defaultPrevented, `${type} bekor qilindi`).toBe(false);
    }
  });

  it('maydon fokusi (focusin) bekor QILINMAYDI', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = new FocusEvent('focusin', { bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('`preventDefault` FAQAT o`z tugmalarimizning `mousedown` ida chaqiriladi', () => {
    // Fokus maydonda qolishi uchun bu bitta chaqiruv SHART (aks holda bosilgan
    // harf hech qayerga tushmaydi). Boshqa hech qayerda bo'lmasin.
    const code = stripComments(preloadSrc);
    const hits = [...code.matchAll(/\.preventDefault\s*\(/g)];
    expect(hits.length, 'preventDefault chaqiruvi topilmadi (vacuity)').toBeGreaterThan(0);
    for (const h of hits) {
      const before = code.slice(Math.max(0, (h.index ?? 0) - 160), h.index ?? 0);
      expect(before, `preventDefault mousedown'dan tashqarida: …${before.slice(-80)}`).toContain(
        'mousedown',
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ko`rinish/yashirish xulqi', () => {
  it('«Yashirish» klaviaturani yopadi', () => {
    focusField({ type: 'text' });
    expect(visible()).toBe(true);
    press('Yashirish');
    expect(visible()).toBe(false);
  });

  it('klaviatura kerak bo`lmagan elementda chiqmaydi (checkbox)', () => {
    focusField({ type: 'checkbox' });
    expect(keyboardRoot()).toBeNull();
  });

  it('textarea ham harf layoutini ochadi', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(keyLabels().filter((l) => LATIN_LETTERS.test(l)).length).toBeGreaterThanOrEqual(26);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * K6 — `readOnly` klaviaturani YASHIRMAYDI (P6 o'lchovi).
 *
 * 🔴 Nima uchun qulflanadi: P6 rejasi PIN ekranidagi «ikki numpad» ni maydonni
 * `readOnly` qilib yechishni taklif qilgan edi. Haqiqiy Electron'da o'lchandi
 * (`desktop/tools/kbd-probe/probe.js`): `readOnly` maydonda qobiq klaviaturasi
 * BARIBIR chiqadi, lekin `sendInputEvent` kaliti maydonga tushmaydi
 * (`readOnlyTyped: ""`). Ya'ni `readOnly` — «panelni yashirish» vositasi EMAS,
 * u faqat «panel bor, lekin hech nima yozilmaydi» holatini yasaydi.
 *
 * Agar kelajakda preload `readOnly` maydonni ATAYLAB filtrlasa, bu test
 * qizaradi — o'shanda `pin-entry-single-numpad.test.tsx` dagi «kiritish yo'li
 * aynan bitta» invarianti qayta ko'rib chiqilsin (ikkisi bog'liq).
 */
describe('K6 — `readOnly` maydon (P6 o`lchovi)', () => {
  it('readOnly raqamli maydonda klaviatura BARIBIR chiqadi', () => {
    focusField({ type: 'password', inputmode: 'numeric', readonly: 'readonly' });
    expect(visible()).toBe(true);
    expect(keyLabels()).toContain('7');
  });

  it('tahrirlanadigan PIN maydoni ham xuddi shu numpadni ochadi', () => {
    focusField({ type: 'password', inputmode: 'numeric' });
    expect(keyLabels().filter((l) => LATIN_LETTERS.test(l))).toHaveLength(0);
    expect(keyLabels()).toContain('0');
  });
});
