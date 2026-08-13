import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * OYNA BOSHQARUV TUGMALARI (o'ng-yuqori uchlik: — ❐ ✕) — XULQ QO'RIQCHISI.
 *
 * TARIX: 1.6.0 da bu fayl `desktop-exit-button.test.ts` edi va BITTA ✕
 * tugmasini qulflardi. 2026-08-13 da egasi Chrome'dagi kabi UCHLIKNI so'radi
 * (P01): «—» ilovadan chiqmasdan ish stoliga (minimize), «❐» kiosk ↔ oynali
 * rejim, «✕» tasdiq dialogli chiqish. Eski «faqat bitta ✕» niyati shu kuni
 * KENGAYDI — test o'chirilmadi, yangi niyat bilan qayta yozildi.
 *
 * Qulflanadigan shartnomalar (1.6.0 dan meros, niyati o'zgarmagan):
 *   E1. ✕ `shell:request-quit` yuboradi — `shell:quit` EMAS: main tomonda
 *       tasdiq dialogi bor, tasodifiy bosishda savdo yo'qolmasin.
 *   E2. Har tugma YALANG <button> (fixed) — konteyner div ICHIDA EMAS. Sabab:
 *       `desktop-touch-keyboard.test.ts` dagi `keyboardRoot()` evristikasi
 *       «fixed element ichida button bor» deb qidiradi; konteynerli tugma
 *       klaviatura ildizi bilan adashtirilardi.
 *   E3. Qobiqning o'z file:// sahifalarida (setup/offline/updating) chizilmaydi.
 *   E4. Burchak-imosi OLIB TASHLANMAYDI — tugmalar unga qo'shimcha.
 *
 * Yangi shartnomalar (P01, 2026-08-13):
 *   W1. «—» `shell:minimize`, «❐» `shell:toggle-windowed` yuboradi; main.js
 *       da ikkala ishlovchi mavjud.
 *   W2. Close-qo'riqchi KONFIGga bog'lanadi (`!allowQuit && serverBase()`),
 *       `isKiosk()` ga EMAS: «❐» oynali rejimga o'tkazganda `isKiosk()` false
 *       bo'lib qolardi va Alt+F4 / taskbar-close ilovani JIM yopib yuborardi.
 */

const WEB = process.cwd(); // apps/web
const REPO = join(WEB, '..', '..');
const preloadSrc = readFileSync(join(REPO, 'desktop', 'preload.js'), 'utf8');
const mainSrc = readFileSync(join(REPO, 'desktop', 'main.js'), 'utf8');

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:/])\/\/.*$/gm, '$1');

interface IpcCall {
  channel: string;
  payload: unknown;
}

function loadPreload(): { sends: IpcCall[] } {
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
    webFrame: { setVisualZoomLevelLimits: () => undefined },
  };
  const require_ = (name: string): unknown => {
    if (name === 'electron') return electron;
    throw new Error(`preload sandbox'da «${name}» modulini so'radi`);
  };
  const module_ = { exports: {} };
  const run = new Function('require', 'module', 'exports', preloadSrc);
  run(require_, module_, module_.exports);
  return { sends };
}

/** Body'ning bevosita farzandi bo'lgan yalang fixed tugmalar (o'ngga yopishgan). */
function controlButtons(): HTMLButtonElement[] {
  return [...document.body.children].filter(
    (el): el is HTMLButtonElement =>
      el instanceof HTMLButtonElement && el.style.position === 'fixed' && el.style.right !== '',
  );
}

function buttonByLabel(label: string): HTMLButtonElement | null {
  return controlButtons().find((b) => b.textContent?.trim() === label) ?? null;
}

let shell: { sends: IpcCall[] };

beforeEach(() => {
  document.body.innerHTML = '';
  shell = loadPreload();
});

describe('oyna boshqaruv tugmalari — uchlik (P01, 2026-08-13)', () => {
  it('uchchala tugma chiziladi: — ❐ ✕', () => {
    const labels = controlButtons().map((b) => b.textContent?.trim());
    expect(labels).toContain('—');
    expect(labels).toContain('❐');
    expect(labels).toContain('✕');
  });

  it('E2 — har biri YALANG <button> (klaviatura evristikasi buzilmasin)', () => {
    const buttons = controlButtons();
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) {
      expect(b.parentElement).toBe(document.body);
      expect(b.querySelector('button')).toBeNull();
    }
  });

  it('W1 — «—» bosilsa `shell:minimize` ketadi', () => {
    buttonByLabel('—')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shell.sends).toEqual([{ channel: 'shell:minimize', payload: undefined }]);
  });

  it('W1 — «❐» bosilsa `shell:toggle-windowed` ketadi', () => {
    buttonByLabel('❐')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shell.sends).toEqual([{ channel: 'shell:toggle-windowed', payload: undefined }]);
  });

  it('E1 — «✕» hamon TASDIQLI yo`ldan yuradi (`shell:request-quit`)', () => {
    buttonByLabel('✕')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shell.sends).toEqual([{ channel: 'shell:request-quit', payload: undefined }]);
  });

  it('E1 — tugmalar tanasida tasdiqsiz `shell:quit` YO`Q', () => {
    // Tasdiqsiz chiqish — savdo o'rtasida savat yo'qolishi degani.
    // (`shersetShell.quit` ko'prigi alohida va qonuniy: uni qobiqning O'Z
    // sahifalari — setup/offline — o'z tasdiqlari bilan chaqiradi.)
    // Kanal nomlari `WINDOW_BUTTONS` konfiguratsiyasida, ishlovchi esa
    // `installWindowControls` da — kesim ikkalasini ham qamraydi.
    const code = stripComments(preloadSrc);
    const at = code.indexOf('const WINDOW_BUTTONS');
    expect(at, 'WINDOW_BUTTONS topilmadi').toBeGreaterThan(0);
    const fnAt = code.indexOf('function installWindowControls', at);
    const end = code.indexOf('function ', fnAt + 10);
    const body = code.slice(at, end > at ? end : undefined);
    expect(body).not.toMatch(/'shell:quit'/);
    expect(body).toMatch(/'shell:request-quit'/);
  });

  it('E3 — qobiqning file:// sahifalarida chizilmaydi (manba sharti)', () => {
    const code = stripComments(preloadSrc);
    const at = code.indexOf('function installWindowControls');
    expect(at, 'installWindowControls topilmadi').toBeGreaterThan(0);
    expect(code.slice(at, at + 400)).toContain("location.protocol === 'file:'");
  });

  it('E4 — burchak-imosi (installExitGesture) joyida qoladi', () => {
    expect(preloadSrc).toContain('function installExitGesture');
    expect(preloadSrc).toMatch(/installExitGesture\(\);/);
  });

  it('uslublar CSSOM bilan — <style> teg ekilmaydi (CSP)', () => {
    expect(document.querySelectorAll('style').length).toBe(0);
    for (const b of controlButtons()) {
      expect(b.getAttribute('style') ?? '').not.toBe('');
    }
  });
});

describe('main.js — oyna boshqaruv ishlovchilari', () => {
  it('W1 — minimize va toggle-windowed ishlovchilari bor', () => {
    expect(mainSrc).toContain("ipcMain.on('shell:minimize'");
    expect(mainSrc).toContain("ipcMain.on('shell:toggle-windowed'");
  });

  it('W2 — 🔴 close-qo`riqchi kiosk`ka emas KONFIGga bog`langan (oynali rejimda Alt+F4 jim yopmasin)', () => {
    expect(mainSrc).not.toMatch(/allowQuit && win\?\.isKiosk\(\)/);
    expect(mainSrc).toMatch(/!allowQuit && serverBase\(\)/);
  });
});
