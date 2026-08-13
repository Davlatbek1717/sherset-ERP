import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * QOBIQ CHIQISH TUGMASI (✕, o'ng-yuqori burchak) — XULQ QO'RIQCHISI.
 *
 * NEGA KERAK (2026-08-13, egasining talabi): burchak-imosi (chap-yuqorini
 * 2 soniya ushlash) KO'RINMAS — uni bilmagan odam ilovadan chiqa olmaydi.
 * Egasi Chrome'dagi «X» ga o'xshash ko'rinadigan belgi so'radi.
 *
 * Qulflanadigan shartnomalar:
 *   E1. Tugma `shell:request-quit` yuboradi — `shell:quit` EMAS: main tomonda
 *       tasdiq dialogi bor, tasodifiy bosishda savdo yo'qolmasin.
 *   E2. Tugma YALANG <button> (fixed) — konteyner div ICHIDA EMAS. Sabab:
 *       `desktop-touch-keyboard.test.ts` dagi `keyboardRoot()` evristikasi
 *       «fixed element ichida button bor» deb qidiradi; konteynerli tugma
 *       klaviatura ildizi bilan adashtirilardi.
 *   E3. Qobiqning o'z file:// sahifalarida (setup/offline/updating) chizilmaydi:
 *       setup oynasi ramkali (haqiqiy X bor), offline'da esa o'z yo'llari bor.
 *   E4. Burchak-imosi OLIB TASHLANMAYDI — tugma unga qo'shimcha, o'rnini bosmaydi.
 */

const WEB = process.cwd(); // apps/web
const REPO = join(WEB, '..', '..');
const preloadSrc = readFileSync(join(REPO, 'desktop', 'preload.js'), 'utf8');

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

/** O'ng-yuqoridagi chiqish tugmasi — body'ning bevosita farzandi. */
function exitButton(): HTMLButtonElement | null {
  const found = [...document.body.children].find(
    (el) =>
      el instanceof HTMLButtonElement &&
      el.style.position === 'fixed' &&
      el.style.right !== '' &&
      el.style.top !== '',
  );
  return (found as HTMLButtonElement | undefined) ?? null;
}

let shell: { sends: IpcCall[] };

beforeEach(() => {
  document.body.innerHTML = '';
  shell = loadPreload();
});

describe('chiqish tugmasi — o`ng-yuqori burchakda', () => {
  it('tugma chiziladi va fixed o`ng-yuqorida turadi', () => {
    const btn = exitButton();
    expect(btn, 'chiqish tugmasi topilmadi').not.toBeNull();
    expect(btn?.textContent?.trim()).toBe('✕');
  });

  it('E2 — YALANG <button>, konteyner ichida emas (klaviatura evristikasi)', () => {
    // `keyboardRoot()` «fixed element ichida button bor» deb qidiradi;
    // yalang buttonda descendant button yo'q — adashtirmaydi.
    const btn = exitButton();
    expect(btn?.parentElement).toBe(document.body);
    expect(btn?.querySelector('button')).toBeNull();
  });

  it('E1 — bosilsa `shell:request-quit` ketadi (tasdiq dialogli yo`l)', () => {
    exitButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(shell.sends).toEqual([{ channel: 'shell:request-quit', payload: undefined }]);
  });

  it('E1 — tugma tanasida tasdiqsiz `shell:quit` YO`Q', () => {
    // Tasdiqsiz chiqish — savdo o'rtasida savat yo'qolishi degani.
    // (`shersetShell.quit` ko'prigi alohida va qonuniy: uni qobiqning O'Z
    // sahifalari — setup/offline — o'z tasdiqlari bilan chaqiradi.)
    const code = stripComments(preloadSrc);
    const at = code.indexOf('function installExitButton');
    const end = code.indexOf('function ', at + 10);
    const body = code.slice(at, end > at ? end : undefined);
    expect(body).not.toMatch(/send\(\s*'shell:quit'/);
    expect(body).toMatch(/send\(\s*'shell:request-quit'/);
  });

  it('E3 — qobiqning file:// sahifalarida chizilmaydi (manba sharti)', () => {
    const code = stripComments(preloadSrc);
    const at = code.indexOf('function installExitButton');
    expect(at, 'installExitButton topilmadi').toBeGreaterThan(0);
    expect(code.slice(at, at + 400)).toContain("location.protocol === 'file:'");
  });

  it('E4 — burchak-imosi (installExitGesture) joyida qoladi', () => {
    expect(preloadSrc).toContain('function installExitGesture');
    expect(preloadSrc).toMatch(/installExitGesture\(\);/);
  });

  it('uslublar CSSOM bilan — <style> teg ekilmaydi (CSP)', () => {
    expect(document.querySelectorAll('style').length).toBe(0);
    expect(exitButton()?.getAttribute('style') ?? '').not.toBe('');
  });
});
