import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * OYNA BOSHQARUV TUGMALARI (— ❐ ✕) — XULQ QO'RIQCHISI.
 *
 * TARIX: 1.6.0 da bu fayl `desktop-exit-button.test.ts` edi va BITTA ✕
 * tugmasini qulflardi. 2026-08-13 da egasi Chrome'dagi kabi UCHLIKNI so'radi
 * (P01): «—» ilovadan chiqmasdan ish stoliga (minimize), «❐» kiosk ↔ oynali
 * rejim, «✕» tasdiq dialogli chiqish — test yangi niyat bilan qayta yozildi.
 * 2026-08-14 (F6, POS redizayn, 1.8.0 — 1.7.0 raqami suppression'siz binar
 * bilan allaqachon kanalda edi) niyat YANA kengaydi: uchlik endi
 * web-header ichiga singdiriladi (`components/pos/window-controls.tsx`),
 * preload'ning suzuvchi uchligi esa MOSLIK ZAXIRASI bo'lib qoladi — faqat
 * sahifa o'z tugmalarini chizmaganda (eski web, POS bo'lmagan sahifa)
 * ko'rinadi. Eski «suzuvchi uchlik doim turadi» niyati shu kuni bekor bo'ldi;
 * test o'chirilmadi, qayta yozildi (spec §7 versiya-moslik matritsasi).
 *
 * Qulflanadigan shartnomalar (1.6.0/P01 dan meros, niyati o'zgarmagan):
 *   E1. ✕ `shell:request-quit` yuboradi — `shell:quit` EMAS: main tomonda
 *       tasdiq dialogi bor, tasodifiy bosishda savdo yo'qolmasin.
 *   E2. Suzuvchi zaxira-tugmalarning har biri YALANG <button> (fixed) —
 *       konteyner div ICHIDA EMAS. Sabab: `desktop-touch-keyboard.test.ts`
 *       dagi `keyboardRoot()` evristikasi «fixed element ichida button bor»
 *       deb qidiradi; konteynerli tugma klaviatura ildizi bilan adashtirilardi.
 *       (Header ichidagi web-tugmalar oddiy oqimda, fixed EMAS — ular bu
 *       evristikaga umuman ko'rinmaydi.)
 *   E3. Qobiqning o'z file:// sahifalarida (setup/offline/updating) chizilmaydi.
 *   E4. Burchak-imosi OLIB TASHLANMAYDI — tugmalar unga qo'shimcha.
 *   W1. «—» `shell:minimize`, «❐» `shell:toggle-windowed` yuboradi; main.js
 *       da ikkala ishlovchi mavjud.
 *   W2. Close-qo'riqchi KONFIGga bog'lanadi (`!allowQuit && serverBase()`),
 *       `isKiosk()` ga EMAS: «❐» oynali rejimga o'tkazganda `isKiosk()` false
 *       bo'lib qolardi va Alt+F4 / taskbar-close ilovani JIM yopib yuborardi.
 *
 * Yangi shartnomalar (F6, 2026-08-14):
 *   W5. `electronAPI` 3 metod beradi: `minimize`/`toggleWindowed`/`requestQuit`
 *       — web-header tugmalari shu metodlar orqali yuradi, kanallar W1/E1
 *       bilan BIR XIL. (Web tomondagi nom-moslik tetheri —
 *       `components/pos/__tests__/window-controls.test.tsx` da.)
 *   W6. Sahifa `<html data-sherset-window-controls="page">` markerini qo'ysa
 *       preload suzuvchi uchligi CHIZILMAYDI / OLIB TASHLANADI
 *       (MutationObserver `documentElement` atributlarida). Faqat `page`
 *       qiymati bostiradi — notanish qiymat eski xulqni saqlaydi.
 *   W7. Marker YO'Q bo'lsa (eski web) uchlik chiziladi; marker olib tashlansa
 *       (POS sahifasidan chiqildi) uchlik QAYTADI va hech qachon ikkilanmaydi.
 */

/** W6 marker atributi — preload va `window-controls.tsx` bilan BIR XIL literal. */
const MARKER_ATTR = 'data-sherset-window-controls';

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

function loadPreload(): {
  sends: IpcCall[];
  exposed: Record<string, Record<string, unknown>>;
} {
  const sends: IpcCall[] = [];
  // W5 — `exposeInMainWorld` argumentlari yozib olinadi: electronAPI metodlari
  // haqiqiy preload kodida chaqirib ko'riladi (grep emas, ijro).
  const exposed: Record<string, Record<string, unknown>> = {};
  const electron = {
    contextBridge: {
      exposeInMainWorld: (name: string, api: Record<string, unknown>) => {
        exposed[name] = api;
      },
    },
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
  return { sends, exposed };
}

/** MutationObserver mikrotask'da otiladi — bitta makrotask kutish yetarli. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

let shell: ReturnType<typeof loadPreload>;

beforeEach(() => {
  document.body.innerHTML = '';
  // Oldingi test qoldirgan marker keyingisiga ta'sir qilmasin (W6/W7).
  document.documentElement.removeAttribute(MARKER_ATTR);
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

describe('W5 — electronAPI oyna metodlari (F6, web-header tugmalari shunga tayanadi)', () => {
  const CONTRACT = [
    ['minimize', 'shell:minimize'],
    ['toggleWindowed', 'shell:toggle-windowed'],
    // ✕ ham TASDIQLI yo'ldan (E1) — `shell:quit` metodi ATAYLAB berilmaydi.
    ['requestQuit', 'shell:request-quit'],
  ] as const;

  for (const [name, channel] of CONTRACT) {
    it(`electronAPI.${name}() → «${channel}»`, () => {
      const api = shell.exposed.electronAPI as Record<string, (() => void) | undefined>;
      const fn = api?.[name];
      expect(typeof fn, `electronAPI.${name} berilmagan`).toBe('function');
      fn?.();
      expect(shell.sends).toEqual([{ channel, payload: undefined }]);
    });
  }

  it('tasdiqsiz chiqish METODI yo`q (electronAPI orqali ham `shell:quit` yuborilmaydi)', () => {
    // Manba kesimi: exposeInMainWorld('electronAPI' blokida 'shell:quit' bo'lmasin.
    const code = stripComments(preloadSrc);
    const at = code.indexOf("exposeInMainWorld('electronAPI'");
    expect(at, 'electronAPI bloki topilmadi').toBeGreaterThan(0);
    const end = code.indexOf('exposeInMainWorld', at + 10);
    const body = code.slice(at, end > at ? end : undefined);
    expect(body).not.toMatch(/'shell:quit'/);
  });
});

describe('W6/W7 — marker bilan bostirish (spec §7 versiya-moslik matritsasi)', () => {
  it('W7 — marker YO`Q (eski web): suzuvchi uchlik chiziladi', () => {
    const labels = controlButtons().map((b) => b.textContent?.trim());
    expect(labels).toContain('—');
    expect(labels).toContain('❐');
    expect(labels).toContain('✕');
  });

  it('W6 — marker OLDINDAN turgan bo`lsa uchlik umuman chizilmaydi', () => {
    document.body.innerHTML = '';
    document.documentElement.setAttribute(MARKER_ATTR, 'page');
    loadPreload();
    expect(controlButtons()).toEqual([]);
  });

  it('W6 — marker KEYIN qo`yilsa uchlik OLIB TASHLANADI (MutationObserver)', async () => {
    // Real ketma-ketlik shu: preload DOMContentLoaded'da chizadi, React
    // keyin mount bo'lib markerni qo'yadi.
    expect(controlButtons().length).toBeGreaterThanOrEqual(3);
    document.documentElement.setAttribute(MARKER_ATTR, 'page');
    await flush();
    expect(controlButtons()).toEqual([]);
  });

  it('W6 — faqat `page` qiymati bostiradi (notanish qiymat = eski xulq)', async () => {
    document.documentElement.setAttribute(MARKER_ATTR, 'boshqa-qiymat');
    await flush();
    expect(controlButtons().length).toBeGreaterThanOrEqual(3);
  });

  it('W7 — marker olib tashlansa uchlik QAYTADI va ikkilanmaydi', async () => {
    document.documentElement.setAttribute(MARKER_ATTR, 'page');
    await flush();
    expect(controlButtons()).toEqual([]);
    // POS sahifasidan chiqildi (komponent unmount markerini olib tashladi).
    document.documentElement.removeAttribute(MARKER_ATTR);
    await flush();
    // ANIQ 3 ta — qayta chizishda dublikat TAQIQ (bir necha observer/navigatsiya
    // yig'ilib qolsa ham DOM'dagi mavjud tugmalar qayta yaratilmaydi).
    const labels = controlButtons().map((b) => b.textContent?.trim());
    expect(labels.length).toBe(3);
    expect([...labels].sort()).toEqual(['—', '❐', '✕'].sort());
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
