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

const { contextBridge, ipcRenderer } = require('electron');

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
const KB_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const KB_SYMBOLS = ['@', '.', '-', '_', '/', ':'];
/** Klaviatura chiqadigan maydon turlari. */
const KB_TYPES = ['text', 'password', 'email', 'url', 'search', 'tel', 'number', ''];

function installTouchKeyboard() {
  let root = null;
  let shift = false;
  /** @type {HTMLElement | null} */
  let target = null;

  const styles = (el, obj) => {
    for (const k of Object.keys(obj)) el.style[k] = obj[k];
  };

  const send = (key) => ipcRenderer.send('kbd:key', key);

  const makeKey = (label, onPress, flex) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.textContent = label;
    styles(b, {
      flex: String(flex || 1),
      minWidth: '0',
      height: '52px',
      margin: '3px',
      fontSize: '19px',
      fontWeight: '600',
      color: '#0f172a',
      background: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      cursor: 'pointer',
    });
    // Fokus maydonda QOLISHI shart — aks holda kalit hech qayerga tushmaydi.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', onPress);
    return b;
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

    for (const row of KB_ROWS) {
      const r = document.createElement('div');
      styles(r, { display: 'flex' });
      for (const ch of row) {
        r.appendChild(
          makeKey(ch, (e) => {
            const btn = e.currentTarget;
            send(shift ? btn.textContent.toUpperCase() : btn.textContent.toLowerCase());
          }),
        );
      }
      root.appendChild(r);
    }

    const last = document.createElement('div');
    styles(last, { display: 'flex' });
    last.appendChild(
      makeKey(
        'ABC',
        () => {
          shift = !shift;
          for (const b of root.querySelectorAll('button')) {
            const t = b.textContent;
            if (t.length === 1 && /[a-z]/i.test(t))
              b.textContent = shift ? t.toUpperCase() : t.toLowerCase();
          }
        },
        1.4,
      ),
    );
    for (const s of KB_SYMBOLS) last.appendChild(makeKey(s, () => send(s)));
    last.appendChild(makeKey('␣', () => send(' '), 3));
    last.appendChild(makeKey('⌫', () => send('Backspace'), 1.4));
    last.appendChild(
      makeKey(
        'Yashirish',
        () => {
          root.style.display = 'none';
        },
        2,
      ),
    );
    root.appendChild(last);

    document.body.appendChild(root);
  };

  const wanted = (el) =>
    !!el &&
    ((el.tagName === 'INPUT' && KB_TYPES.includes((el.getAttribute('type') || '').toLowerCase())) ||
      el.tagName === 'TEXTAREA');

  document.addEventListener('focusin', (e) => {
    if (!wanted(e.target)) return;
    target = e.target;
    if (!root) build();
    root.style.display = 'block';
    // Maydon klaviatura ostida qolib ketmasin.
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' });
    }
  });

  document.addEventListener('focusout', () => {
    // Kechikish: tugma bosilganda fokus bir lahza yo'qolishi mumkin.
    setTimeout(() => {
      if (!root) return;
      if (!wanted(document.activeElement)) root.style.display = 'none';
    }, 150);
  });
}

function installShellHelpers() {
  installExitGesture();
  installTouchKeyboard();
}

// Preload `document` tayyor bo'lishidan oldin ham ishlashi mumkin.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installShellHelpers, { once: true });
} else {
  installShellHelpers();
}
