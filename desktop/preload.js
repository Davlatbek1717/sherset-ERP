/**
 * `window.electronAPI` — ESKI EXE SHARTNOMASI (spec §6.3).
 *
 * 🔴 Bu ro'yxat ikkita web faylidan kelib chiqadi va ular bilan
 * `apps/web/src/__tests__/electron-bridge-contract.test.ts` qo'riqchisi orqali
 * bog'langan:
 *   - `apps/web/src/lib/print-agent.ts` → `interface ElectronBridge`
 *     (isSherset, version, listPrinters, printSheet, pushCart,
 *      toggleCustomerDisplay, customerDisplayStatus)
 *   - `apps/web/src/lib/pos-device.ts`  → `interface ShellBridge`
 *     (getDevice, setDevice, clearDevice)
 * Metod tushib qolsa web tomon JIMGINA zaxira yo'lga tushadi: chop etish
 * brauzer popup'iga, qurilma kaliti esa DPAPI o'rniga `localStorage` ga.
 *
 * 🔴 Qurilma metodlari SINXRON (`sendSync`): `pos-device.ts` natijani darhol
 * tekshiradi, Promise unga «juftlanmagan» bo'lib ko'rinadi.
 */

const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Web qobiqni shu bayroq bilan taniydi (`print-agent.ts:67`, `pos-device.ts:29`).
  isSherset: true,
  version: ipcRenderer.sendSync('app:version'),

  // ── Chop etish (F3 da main.js tomonda to'ldiriladi) ──────────────────────
  listPrinters: () => ipcRenderer.invoke('print:list'),
  printSheet: (printerName, html, pageSizeMicrons) =>
    ipcRenderer.invoke('print:sheet', { printerName, html, pageSizeMicrons }),

  // ── Mijoz-ekran (F3) ─────────────────────────────────────────────────────
  pushCart: (payload) => ipcRenderer.send('cfd:push', payload),
  toggleCustomerDisplay: () => ipcRenderer.invoke('cfd:toggle'),
  customerDisplayStatus: () => ipcRenderer.invoke('cfd:status'),

  // ── Qurilma holati (kirish ekranidagi belgi) ─────────────────────────────
  shellStatus: () => ipcRenderer.invoke('shell:status'),

  // ── Qurilma kaliti (DPAPI, device-store.js) ──────────────────────────────
  getDevice: () => ipcRenderer.sendSync('device:get'),
  setDevice: (creds) => ipcRenderer.sendSync('device:set', creds),
  clearDevice: () => ipcRenderer.sendSync('device:clear'),
});

/**
 * Qobiqning O'Z sahifalari (setup.html / offline.html) uchun alohida ko'prik.
 * Web ilovasi buni ishlatmaydi — shuning uchun `electronAPI` shartnomasiga
 * aralashtirilmaydi.
 */
contextBridge.exposeInMainWorld('shersetShell', {
  getServerUrl: () => ipcRenderer.sendSync('config:get-server-url'),
  saveServerUrl: (url) => ipcRenderer.invoke('config:set-server-url', url),
  retry: () => ipcRenderer.invoke('shell:retry'),
  quit: () => ipcRenderer.send('shell:quit'),
  // Chiqish IMOSI shu yerga keladi (pastdagi `installExitGesture`).
  // `quit` dan farqi: main tomonda TASDIQ dialogi ko'rsatiladi — imo
  // tasodifan ham otilishi mumkin.
  requestQuit: () => ipcRenderer.send('shell:request-quit'),
});

/**
 * CHIQISH IMOSI — chap YUQORI burchakni 2 soniya ushlab turish.
 *
 * NEGA KERAK: kiosk oynadan chiqishning yagona yo'li `Ctrl+Alt+Shift+Q` edi,
 * ya'ni KLAVIATURA shart. Sensorli monoblokda klaviatura yo'q — ilovani umuman
 * yopib bo'lmasdi (2026-08-11, real qurilmada).
 *
 * 🔴 NEGA PRELOAD'DA, `webContents.executeJavaScript` bilan EMAS: web ilova
 * qat'iy CSP (`script-src 'self'`) bilan keladi; sahifaga skript ekish o'sha
 * siyosatga tayanib qolardi. Preload sahifa CSP'siga BO'YSUNMAYDI va har
 * navigatsiyada o'zi qayta ishlaydi.
 *
 * 🔴 Tinglovchilar PASSIV: `preventDefault` chaqirilmaydi va hech qanday
 * qoplama (overlay) qo'yilmaydi — aks holda burchakdagi haqiqiy tugmalar
 * bosilmay qolardi. Faqat kuzatamiz. Preload izolyatsiyalangan dunyoda
 * ishlaydi, lekin DOM umumiy — hodisalar ko'rinadi.
 */
function installExitGesture() {
  const CORNER_PX = 64; // burchak kvadrati
  const HOLD_MS = 2000; // shuncha ushlansa — chiqish so'raladi
  const MOVE_TOL_PX = 24; // barmoq shuncha siljisa — bekor (skroll/tortish)

  let timer = null;
  let x0 = 0;
  let y0 = 0;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.clientX > CORNER_PX || e.clientY > CORNER_PX) return;
      x0 = e.clientX;
      y0 = e.clientY;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        ipcRenderer.send('shell:request-quit');
      }, HOLD_MS);
    },
    true,
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - x0) > MOVE_TOL_PX || Math.abs(e.clientY - y0) > MOVE_TOL_PX)
        cancel();
    },
    true,
  );

  document.addEventListener('pointerup', cancel, true);
  document.addEventListener('pointercancel', cancel, true);
}

/**
 * EKRAN KLAVIATURASI — qobiqning O'ZINIKI.
 *
 * NEGA WINDOWS'NIKI EMAS: sensorli monoblokda Windows klaviaturasi Electron
 * oynasi uchun umuman chiqmadi (2026-08-11, real qurilma). `TabTip.exe` ni
 * majburan ishga tushirish yo'li ham bor, lekin u Windows versiyasiga qarab
 * turlicha xulq qiladi va men uni o'lchay olmayman. O'z klaviaturamiz —
 * deterministik: qaysi Windows bo'lishidan qat'i nazar ishlaydi.
 *
 * 🔴 NEGA `sendInputEvent` (main orqali), `input.value = …` EMAS: sahifa React
 * bilan yozilgan va u `value` ni O'Z kuzatuvchisi bilan boshqaradi — qiymatni
 * to'g'ridan-to'g'ri yozish React holatini yangilamay, matn keyingi
 * render'da YO'QOLARDI. `webContents.sendInputEvent` esa Chromium darajasida
 * HAQIQIY klaviatura hodisasini beradi: React uni oddiy yozuvdan farqlay
 * olmaydi. Shuning uchun tugma bosilganda main'ga kalit yuboriladi.
 *
 * 🔴 Uslublar faqat CSSOM (`el.style.x = …`) orqali: `<style>` tegi sahifaning
 * `style-src` siyosatiga tushardi, CSSOM esa CSP'dan tashqarida.
 */
const KB_LATIN_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
/**
 * ЙЦУКЕН + O'ZBEK KIRILLI (`ў қ ғ ҳ` — rus alifbosida YO'Q, oxirgi qatorda).
 * Mijoz nomi, izoh, manzil kirillda yoziladi; F3 gacha ularni umuman kiritib
 * bo'lmasdi (2026-08-11, real qurilma).
 */
const KB_CYRILLIC_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
  ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
  ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ё', 'ў', 'қ', 'ғ', 'ҳ'],
];
/**
 * Raqamli maydon layouti — kassa terminali tartibida (7-8-9 tepada).
 * `⌫` shu yerda: raqam kiritishda eng ko'p ishlatiladigan ikkinchi tugma.
 */
const KB_NUMBER_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '⌫'],
];
// `'` — o'zbek lotinidagi `o'`/`g'` uchun SHART (ism/nom yozib bo'lmasdi).
const KB_SYMBOLS = ['@', '.', '-', '_', '/', ':', "'"];
/** Klaviatura chiqadigan maydon turlari. */
const KB_TYPES = ['text', 'password', 'email', 'url', 'search', 'tel', 'number', ''];
/** Shu turlar/rejimlarda QWERTY emas, numpad chiqadi (reja F3 §1). */
const KB_NUMERIC_TYPES = ['number', 'tel'];
const KB_NUMERIC_MODES = ['decimal', 'numeric', 'tel'];

const KEY_H = '46px'; // harf tugmasi
const NUM_KEY_H = '68px'; // raqam tugmasi — barmoq uchun ataylab kattaroq
const BACKSPACE = '⌫';
// F5 boshqaruv tugmalari: klaviaturasiz qurilmada tasdiqlash (K13) va matn
// o'rtasidagi xatoni tuzatish (K14) uchun. `main.js` ularni keyDown/keyUp ga
// aylantiradi (kbd-probe bilan o'lchangan).
const ENTER = '⏎';
const ARROW_LEFT = '◀';
const ARROW_RIGHT = '▶';

/**
 * Til tanlovi SAQLANADI: preload har navigatsiyada noldan ishga tushadi, ya'ni
 * saqlanmasa kassir har sahifa almashganda «РУС» ni qaytadan bosardi.
 *
 * 🔴 `localStorage` ATAYLAB (main'ga IPC emas): yangi IPC kanali qo'shilsa
 * `main.js` bilan ikkinchi shartnoma paydo bo'lardi. Saqlagich yo'q bo'lsa
 * (`file://` sahifa, o'chirilgan storage) — jim lotinga tushadi, klaviatura
 * baribir ishlaydi.
 */
const KB_LANG_STORAGE_KEY = 'sherset.kbd.lang';

function readKeyboardLang() {
  try {
    return window.localStorage.getItem(KB_LANG_STORAGE_KEY) === 'cyr' ? 'cyr' : 'latin';
  } catch {
    return 'latin';
  }
}

function writeKeyboardLang(lang) {
  try {
    window.localStorage.setItem(KB_LANG_STORAGE_KEY, lang);
  } catch {
    // Saqlanmasa ham joriy sahifada ishlaydi — jim o'tamiz.
  }
}

function installTouchKeyboard() {
  let root = null;
  /** Tugmalar shu konteynerda — layout almashganda FAQAT u qayta quriladi. */
  let panel = null;
  let shift = false;
  /** Harf alifbosi: 'latin' | 'cyr' — navigatsiyalar orasida saqlanadi. */
  let lang = readKeyboardLang();
  /** Joriy layout: 'latin' | 'cyr' | 'num'. `null` = hali chizilmagan. */
  let layout = null;
  /** @type {HTMLElement | null} */
  let target = null;

  const styles = (el, obj) => {
    for (const k of Object.keys(obj)) el.style[k] = obj[k];
  };

  const send = (key) => ipcRenderer.send('kbd:key', key);

  const makeKey = (label, onPress, opts) => {
    const o = opts || {};
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.textContent = label;
    styles(b, {
      flex: String(o.flex || 1),
      minWidth: '0',
      height: o.height || KEY_H,
      margin: '2px',
      fontSize: o.fontSize || '19px',
      fontWeight: '600',
      color: '#0f172a',
      background: o.active ? '#cbd5e1' : '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      cursor: 'pointer',
    });
    // Fokus maydonda QOLISHI shart — aks holda kalit hech qayerga tushmaydi.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', onPress);
    return b;
  };

  const makeRow = () => {
    const r = document.createElement('div');
    styles(r, { display: 'flex' });
    return r;
  };

  /**
   * Klaviatura `position: fixed` — sahifaning pastidagi maydon uning ORTIDA
   * qolardi (K15). `scrollIntoView` yordam beradi, lekin sahifa oxirida
   * skroll qiladigan joy YO'Q. Shuning uchun `<body>` ga vaqtincha pastki
   * bo'shliq qo'shamiz va yashirilganda qaytaramiz.
   */
  const applyInset = () => {
    if (!root) return;
    document.body.style.paddingBottom = `${root.offsetHeight}px`;
  };

  const clearInset = () => {
    document.body.style.paddingBottom = '';
  };

  const hide = () => {
    if (root) root.style.display = 'none';
    clearInset();
  };

  /** Harf layoutining pastki qatori: shift · til · belgilar · probel · ⌫ · yashirish. */
  const letterFooter = () => {
    const r = makeRow();
    r.appendChild(
      makeKey(
        '⇧',
        () => {
          shift = !shift;
          render();
        },
        { flex: 1.3, active: shift },
      ),
    );
    r.appendChild(
      makeKey(
        lang === 'cyr' ? 'ABC' : 'РУС',
        () => {
          lang = lang === 'cyr' ? 'latin' : 'cyr';
          layout = lang;
          shift = false;
          writeKeyboardLang(lang);
          render();
        },
        { flex: 1.6 },
      ),
    );
    for (const s of KB_SYMBOLS) r.appendChild(makeKey(s, () => send(s)));
    r.appendChild(makeKey('␣', () => send(' '), { flex: 3 }));
    r.appendChild(makeKey(BACKSPACE, () => send('Backspace'), { flex: 1.4 }));
    r.appendChild(makeKey(ARROW_LEFT, () => send('Left'), { flex: 1 }));
    r.appendChild(makeKey(ARROW_RIGHT, () => send('Right'), { flex: 1 }));
    r.appendChild(makeKey(ENTER, () => send('Enter'), { flex: 1.6 }));
    r.appendChild(makeKey('Yashirish', hide, { flex: 2 }));
    return r;
  };

  const numberFooter = () => {
    const r = makeRow();
    r.appendChild(makeKey(ARROW_LEFT, () => send('Left'), { height: KEY_H }));
    r.appendChild(makeKey(ARROW_RIGHT, () => send('Right'), { height: KEY_H }));
    // Summa kiritib darhol tasdiqlash — kassaning eng ko'p takrorlanadigan amali.
    r.appendChild(makeKey(ENTER, () => send('Enter'), { height: KEY_H, flex: 1.4 }));
    r.appendChild(makeKey('Yashirish', hide, { height: KEY_H, flex: 1.4 }));
    return r;
  };

  const render = () => {
    if (!panel) return;
    panel.textContent = ''; // eski tugmalar ketadi (`innerHTML` CSP/lint sababli emas)
    const numeric = layout === 'num';
    const rows = numeric ? KB_NUMBER_ROWS : layout === 'cyr' ? KB_CYRILLIC_ROWS : KB_LATIN_ROWS;
    // Numpad tor va markazda: 1280px ekranda uchta tugma butun enga cho'zilsa
    // barmoq nishoni emas, «taxta» bo'lib qolardi.
    styles(panel, { maxWidth: numeric ? '520px' : 'none', margin: '0 auto' });
    const height = numeric ? NUM_KEY_H : KEY_H;
    const fontSize = numeric ? '26px' : '19px';
    for (const row of rows) {
      const r = makeRow();
      for (const ch of row) {
        if (ch === BACKSPACE) {
          r.appendChild(makeKey(BACKSPACE, () => send('Backspace'), { height, fontSize }));
          continue;
        }
        // Yorliq va yuboriladigan belgi BIR XIL bo'lishi shart: ilgari kalit
        // tugmaning `textContent` idan o'qilardi va shift holati ikki joyda
        // (yorliq + o'qish) saqlanardi.
        const key = shift ? ch.toUpperCase() : ch;
        r.appendChild(makeKey(key, () => send(key), { height, fontSize }));
      }
      panel.appendChild(r);
    }
    panel.appendChild(numeric ? numberFooter() : letterFooter());
  };

  const build = () => {
    root = document.createElement('div');
    styles(root, {
      position: 'fixed',
      left: '0',
      right: '0',
      bottom: '0',
      zIndex: '2147483647',
      background: '#e2e8f0',
      borderTop: '2px solid #94a3b8',
      padding: '6px',
      display: 'none',
      boxShadow: '0 -6px 20px rgba(0,0,0,.25)',
    });
    panel = document.createElement('div');
    root.appendChild(panel);
    document.body.appendChild(root);
  };

  const attr = (el, name) => (el.getAttribute(name) || '').toLowerCase();

  /** Pul/miqdor/telefon maydoni — QWERTY emas, numpad. */
  const numericField = (el) =>
    KB_NUMERIC_TYPES.includes(attr(el, 'type')) || KB_NUMERIC_MODES.includes(attr(el, 'inputmode'));

  const wanted = (el) =>
    !!el &&
    ((el.tagName === 'INPUT' && KB_TYPES.includes(attr(el, 'type'))) || el.tagName === 'TEXTAREA');

  document.addEventListener('focusin', (e) => {
    if (!wanted(e.target)) return;
    target = e.target;
    if (!root) build();
    const next = numericField(target) ? 'num' : lang;
    if (next !== layout) {
      layout = next;
      shift = false;
      render();
    }
    root.style.display = 'block';
    // Bo'shliq skrolldan OLDIN — aks holda `scrollIntoView` eski (kalta)
    // balandlik bilan hisoblab, maydonni baribir panel ortida qoldirardi.
    applyInset();
    // Maydon klaviatura ostida qolib ketmasin.
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' });
    }
  });

  document.addEventListener('focusout', () => {
    // Kechikish: tugma bosilganda fokus bir lahza yo'qolishi mumkin.
    setTimeout(() => {
      if (!root) return;
      if (!wanted(document.activeElement)) {
        root.style.display = 'none';
        clearInset();
      }
    }, 150);
  });
}

/**
 * Sensorli «pinch» zoom layoutni buzadi va kassir uni qaytara olmaydi (K10) —
 * kiosk oynada masshtab tugmalari ham, menyu ham yo'q.
 *
 * 🔴 `preventDefault` ISHLATILMAYDI (K3 qo'riqchisi) — bu Chromium'ning
 * o'z chegarasi, hodisa to'silmaydi.
 */
function lockZoom() {
  try {
    webFrame.setVisualZoomLevelLimits(1, 1);
  } catch {
    // Eski Chromium — zoom qulflanmaydi, qolgan hammasi ishlaydi.
  }
}

function installShellHelpers() {
  lockZoom();
  installExitGesture();
  installTouchKeyboard();
}

// Preload `document` tayyor bo'lishidan oldin ham ishlashi mumkin.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installShellHelpers, { once: true });
} else {
  installShellHelpers();
}
