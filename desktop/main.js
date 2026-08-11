/**
 * Sherset Kassa — Electron kiosk o'rami (spec §3, §6).
 *
 * YUPQA O'RAM (spec §3.1): savdo mantiqi web'da qoladi, bu jarayon faqat
 * (a) kiosk oynani ochadi, (b) qurilma kalitini DPAPI bilan saqlaydi,
 * (c) aloqa uzilganda tushunarli ekran ko'rsatadi va o'zi qaytadi,
 * (d) F3: chekni Windows DRAYVERI orqali bosadi va mijoz-ekranni boshqaradi.
 *
 * F3 (spec §6.4–6.5): chop etish va mijoz-ekran ishlovchilari haqiqiy —
 * `print:sheet` yashirin oyna orqali drayverga beradi, `cfd:*` ikkinchi
 * monitordagi oynani boshqaradi. Har ikkalasi ham xatoni JIM YUTMAYDI:
 * web tomon `{ ok:false, error }` / `{ open:false, error }` ni ko'radi.
 *
 * Server manzili kodga QOTIRILMAYDI (spec §3.2): konfiguratsiyadan, u bo'lmasa
 * build vaqtidagi `SHERSET_SERVER_URL` dan olinadi, u ham bo'lmasa birinchi
 * ishga tushishda `setup.html` da so'raladi.
 */

const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, Menu, app, dialog, ipcMain, screen, shell } = require('electron');
const store = require('./device-store');

// Build vaqtida beriladigan default (elektron-builder `extraMetadata`/env orqali).
const DEFAULT_SERVER_URL = store.normalizeServerUrl(process.env.SHERSET_SERVER_URL || '');

const HEALTH_PATH = '/api/v1/health'; // apps/api: setGlobalPrefix('api/v1') + HealthController
const ENTRY_PATH = '/kassa-kirish'; // kassir har doim shu ekrandan boshlaydi
const CFD_PATH = '/customer-display'; // mijoz-ekran sahifasi (apps/web)
const HEALTH_POLL_MS = 5000;

// Chop etish (spec §6.4).
const PRINT_LOAD_TIMEOUT_MS = 15000; // HTML render vaqti
const PRINT_JOB_TIMEOUT_MS = 60000; // drayver javob bermasa ham va'da tugasin
const MICRONS_PER_PX = 264.5833; // 1px = 1/96 dyuym = 25400/96 mikron
const DEFAULT_WIDTH_MICRONS = 80000; // 80mm chek — eski exe'ning legacy o'lchami
const MIN_HEIGHT_MICRONS = 20000; // 20mm — drayver 0 balandlikni rad etadi
const TAIL_MICRONS = 4000; // 4mm quyruq: oxirgi qator kesilmasin

const isDev = !app.isPackaged;

/** @type {BrowserWindow | null} */
let win = null;
/** Mijoz-ekran oynasi (2-monitor). Yopiq bo'lsa null. @type {BrowserWindow | null} */
let cfdWin = null;
/** Oxirgi savat — oyna keyin ochilsa ham darhol to'g'ri holatni ko'rsatadi. */
let lastCart = { lines: [], discountPct: 0 };
/** Chop etish faylining nomi takrorlanmasin (bir vaqtda ikki chek bo'lishi mumkin). */
let printSeq = 0;
/** @type {NodeJS.Timeout | null} */
let healthTimer = null;
/** Oyna faqat shu bayroq bilan yopiladi — Alt+F4 kassirni chiqarib yubormasin. */
let allowQuit = false;

function serverBase() {
  return store.getServerUrl() || DEFAULT_SERVER_URL;
}

function localPage(name) {
  return path.join(__dirname, name);
}

// ─── Aloqa holati ───────────────────────────────────────────────────────────

async function probeHealth() {
  const base = serverBase();
  if (!base) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${base}${HEALTH_PATH}`, { signal: ctrl.signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function stopHealthPolling() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

/**
 * Chrome'ning xato sahifasi o'rniga tushunarli ekran (spec §3.1) + fonda
 * `/health` so'rovi; server tiklanganda kassir hech narsa bosmasdan qaytadi.
 */
function showOffline(reason) {
  if (!win) return;
  win.loadFile(localPage('offline.html'), { query: { reason: String(reason || '') } });
  stopHealthPolling();
  healthTimer = setInterval(async () => {
    if (await probeHealth()) {
      stopHealthPolling();
      loadApp();
    }
  }, HEALTH_POLL_MS);
}

function loadApp() {
  if (!win) return;
  const base = serverBase();
  if (!base) {
    win.loadFile(localPage('setup.html'));
    return;
  }
  stopHealthPolling();
  win.loadURL(`${base}${ENTRY_PATH}`);
}

// ─── Kiosk oyna ─────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    kiosk: true,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: isDev,
    },
  });

  win.once('ready-to-show', () => win?.show());

  // Kassir oynani yopa olmasin (Alt+F4, tizim tugmasi) — chiqish faqat
  // operator kaliti (Ctrl+Alt+Shift+Q) yoki `app.quit()` orqali.
  win.on('close', (e) => {
    if (!allowQuit) e.preventDefault();
  });
  win.on('closed', () => {
    win = null;
    stopHealthPolling();
    // Kassir oynasi yopilsa mijoz-ekran ham ketadi — aks holda `window-all-
    // closed` hech qachon otilmay, ilova ko'rinmas holda tirik qolardi.
    closeCustomerDisplay();
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    // Operator chiqish kaliti (README'da yozilgan, kassirga aytilmaydi).
    if (input.control && input.alt && input.shift && key === 'q') {
      event.preventDefault();
      quitShell();
      return;
    }
    const devtools = key === 'f12' || (input.control && input.shift && key === 'i');
    if (devtools && !isDev) event.preventDefault();
    if (input.control && key === 'w') event.preventDefault();
    if (input.alt && key === 'f4') event.preventDefault();
  });

  // Kiosk oynasi hech qachon boshqa saytga ketmaydi (spec §6.2).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const base = serverBase();
    const sameApp = base && url.startsWith(base);
    const localFile = url.startsWith('file://');
    if (sameApp || localFile) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED — navigatsiya almashdi, xato emas
    showOffline(errorDescription || `xato ${errorCode}`);
  });
  win.webContents.on('render-process-gone', () => loadApp());

  loadApp();
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

function quitShell() {
  allowQuit = true;
  stopHealthPolling();
  closeCustomerDisplay();
  app.quit();
}

// ─── Chop etish (spec §6.4) ─────────────────────────────────────────────────
// Yashirin oyna HTML'ni Chromium bilan renderlaydi, qog'ozga esa WINDOWS
// DRAYVERI bosadi — ESC/POS kodpage muammosi yo'q, kirill va o'zbekcha
// to'g'ri chiqadi. Chaqiruv shakli `apps/web/src/lib/print-agent.ts`
// (`ElectronBridge.printSheet`) dan keladi, teskarisi emas.

function errMessage(e) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * O'rnatilgan printerlar nomi.
 * 🔴 Sinxron `webContents.getPrinters()` Electron 25+ da olib tashlangan —
 * faqat `getPrintersAsync()`. Nom sifatida `name` olinadi, chunki keyin
 * `print({ deviceName })` aynan shu qiymatni kutadi (`displayName` emas).
 */
async function listPrinters() {
  const contents = win?.webContents;
  if (!contents) return [];
  try {
    const printers = await contents.getPrintersAsync();
    return printers.map((p) => p.name).filter((n) => typeof n === 'string' && n !== '');
  } catch {
    return [];
  }
}

/** Va'da berilgan vaqtda tugamasa — tushunarli xato (osilib qolmaydi). */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Qog'oz o'lchami (mikron). Web `pageSizeMicrons` bersa — o'shani beramiz
 * (senik/label uchun MAJBURIY). Bermasa chek rejimi: eni 80mm, bo'yi esa
 * MAZMUN bo'yicha o'lchanadi — aks holda drayver A4 gacha cho'zib, har
 * chekda bir varaq qog'oz sarflardi.
 */
function paperWidthMicrons(requested) {
  const reqW = Number(requested?.width);
  return reqW > 0 ? Math.round(reqW) : DEFAULT_WIDTH_MICRONS;
}

async function resolvePageSize(jobWin, requested) {
  const width = paperWidthMicrons(requested);
  const reqH = Number(requested?.height);
  if (reqH > 0) return { width, height: Math.round(reqH) };

  let px = 0;
  try {
    px = Number(
      await jobWin.webContents.executeJavaScript(
        'Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 0)',
      ),
    );
  } catch {
    px = 0;
  }
  const height = Math.round(px * MICRONS_PER_PX) + TAIL_MICRONS;
  // NaN ham shu shartga tushadi (`NaN > x` → false) — 0 balandlik ketmaydi.
  return { width, height: height > MIN_HEIGHT_MICRONS ? height : MIN_HEIGHT_MICRONS };
}

/**
 * Tayyor HTML → tanlangan printer, dialogsiz.
 * Har qanday yo'lda `{ ok, error? }` qaytaradi: web `ok:false` ni ko'rsa
 * kassirga xato ko'rsatadi, jim yo'qolgan chek bo'lmaydi.
 */
async function printHtml(payload) {
  const printerName = payload?.printerName;
  const html = payload?.html;
  if (typeof printerName !== 'string' || printerName === '') {
    return { ok: false, error: 'Printer tanlanmagan (sozlamalarda chek printerini belgilang).' };
  }
  if (typeof html !== 'string' || html.trim() === '') {
    return { ok: false, error: "Bo'sh hujjat — chop etilmadi." };
  }

  printSeq += 1;
  // data: URL emas, VAQTINCHA FAYL: uzun chek data-URL chegarasiga urilardi
  // va UTF-8 kodlash ishonchsiz bo'lardi (kirill/o'zbekcha).
  const tmpFile = path.join(app.getPath('temp'), `sherset-print-${Date.now()}-${printSeq}.html`);
  let jobWin = null;
  try {
    fs.writeFileSync(tmpFile, html, 'utf8');
    jobWin = new BrowserWindow({
      show: false,
      // Oyna eni QOG'OZ eniga teng: balandlik shu kenglikdagi joylashuvdan
      // o'lchanadi. Odatiy 800px oynada `width:100%` li shakl kalta chiqib,
      // chek oxiri kesilardi.
      width: Math.max(
        200,
        Math.round(paperWidthMicrons(payload?.pageSizeMicrons) / MICRONS_PER_PX),
      ),
      height: 800,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: false,
      },
    });
    await withTimeout(
      jobWin.loadFile(tmpFile),
      PRINT_LOAD_TIMEOUT_MS,
      'Chek shakli yuklanmadi (vaqt tugadi).',
    );
    const pageSize = await resolvePageSize(jobWin, payload?.pageSizeMicrons);
    const target = jobWin;
    return await new Promise((resolve) => {
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        resolve(r);
      };
      const timer = setTimeout(
        () => finish({ ok: false, error: 'Printer javob bermadi (vaqt tugadi).' }),
        PRINT_JOB_TIMEOUT_MS,
      );
      try {
        target.webContents.print(
          {
            silent: true, // dialogsiz — kassir hech narsa bosmaydi
            deviceName: printerName,
            printBackground: true,
            margins: { marginType: 'none' }, // HTML'da @page{margin:0}
            pageSize,
          },
          (success, failureReason) => {
            clearTimeout(timer);
            finish(
              success ? { ok: true } : { ok: false, error: failureReason || 'Chop etilmadi.' },
            );
          },
        );
      } catch (e) {
        clearTimeout(timer);
        finish({ ok: false, error: errMessage(e) });
      }
    });
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  } finally {
    if (jobWin && !jobWin.isDestroyed()) jobWin.destroy();
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Vaqtinchalik fayl o'chmasa ham chek chiqqan — jim o'tamiz.
    }
  }
}

// ─── Mijoz-ekran (spec §6.5) ────────────────────────────────────────────────

/** Kassir monitoridan boshqa displey (bo'lmasa null). */
function externalDisplay() {
  const displays = screen.getAllDisplays();
  if (displays.length < 2) return null;
  const primaryId = screen.getPrimaryDisplay().id;
  return displays.find((d) => d.id !== primaryId) ?? null;
}

/** Savatni shakl jihatidan xavfsiz holga keltirish (sahifa `lines.map` qiladi). */
function normalizeCart(payload) {
  return {
    lines: Array.isArray(payload?.lines) ? payload.lines : [],
    discountPct: Number.isFinite(Number(payload?.discountPct)) ? Number(payload.discountPct) : 0,
  };
}

function sendCart() {
  if (cfdWin && !cfdWin.isDestroyed()) cfdWin.webContents.send('cfd:cart', lastCart);
}

function openCustomerDisplay() {
  const base = serverBase();
  if (!base) return { open: false, error: 'Server manzili sozlanmagan.' };
  const target = externalDisplay();
  if (!target) {
    return { open: false, error: 'Ikkinchi ekran topilmadi — mijoz monitorini ulang.' };
  }
  cfdWin = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    fullscreen: true,
    frame: false,
    skipTaskbar: true,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      // 🔴 Alohida `partition` BERILMAYDI: sahifa `refresh()` bilan kassir
      // bilan UMUMIY cookie sessiyasidan token oladi. Ajratilsa mijoz-ekran
      // abadiy bo'sh qolardi (rasm ham, savat ham).
      preload: path.join(__dirname, 'preload-customer.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: isDev,
    },
  });
  cfdWin.on('closed', () => {
    cfdWin = null;
  });
  cfdWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Sahifa ko'tarilishi bilan JORIY savatni beramiz — aks holda ekran
  // keyingi o'zgarishgacha bo'sh turardi.
  cfdWin.webContents.on('did-finish-load', () => sendCart());
  // Yuklanmasa oynani YOPAMIZ: mijoz turgan ekranda Chrome'ning xato sahifasi
  // osilib qolgandan ko'ra o'chiq ekran yaxshi (kassir tugmani qayta bosadi).
  cfdWin.webContents.on('did-fail-load', (_e, errorCode, _desc, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 = ERR_ABORTED
    closeCustomerDisplay();
  });
  cfdWin.loadURL(`${base}${CFD_PATH}`);
  return { open: true };
}

/** Ochiq bo'lsa yopadi (yopiq bo'lsa hech narsa qilmaydi). @returns yopildimi */
function closeCustomerDisplay() {
  if (!cfdWin || cfdWin.isDestroyed()) {
    cfdWin = null;
    return false;
  }
  cfdWin.destroy();
  cfdWin = null;
  return true;
}

function toggleCustomerDisplay() {
  if (closeCustomerDisplay()) return { open: false };
  return openCustomerDisplay();
}

// ─── IPC — preload.js ochgan ko'priklar ─────────────────────────────────────

function registerIpc() {
  ipcMain.on('app:version', (e) => {
    e.returnValue = app.getVersion();
  });

  // Qurilma kaliti — SINXRON (pos-device.ts natijani darhol tekshiradi).
  ipcMain.on('device:get', (e) => {
    e.returnValue = store.getDevice();
  });
  ipcMain.on('device:set', (e, creds) => {
    const res = store.setDevice(creds);
    // 🔴 Jim muvaffaqiyatsizlik TAQIQ: web `setDevice` natijasini ko'rmaydi,
    // shuning uchun xatoni qobiqning o'zi ko'rsatadi.
    if (!res.ok) dialog.showErrorBox('Qurilma saqlanmadi', res.error);
    e.returnValue = res;
  });
  ipcMain.on('device:clear', (e) => {
    e.returnValue = store.clearDevice();
  });

  // Server manzili (setup.html).
  ipcMain.on('config:get-server-url', (e) => {
    e.returnValue = serverBase() || '';
  });
  ipcMain.handle('config:set-server-url', async (_e, url) => {
    const normalized = store.normalizeServerUrl(url);
    if (!normalized) return { ok: false, error: "Manzil noto'g'ri. Namuna: erp.sherset.uz" };
    const saved = store.setServerUrl(normalized);
    if (!saved.ok) return saved;
    // Manzil saqlandi, lekin javob bermasa — kassirni bo'sh ekranga tashlamaymiz.
    if (!(await probeHealth())) {
      return { ok: false, error: 'Server javob bermadi. Manzil va tarmoqni tekshiring.' };
    }
    loadApp();
    return { ok: true, url: normalized };
  });

  ipcMain.handle('shell:retry', async () => {
    const ok = await probeHealth();
    if (ok) loadApp();
    return { ok };
  });
  ipcMain.on('shell:quit', () => quitShell());

  // ── Chop etish (spec §6.4) ──────────────────────────────────────────────
  // 🔴 `print-agent.ts` ko'prik mavjud bo'lsa HTTP-agentga QAYTMAYDI, ya'ni
  // bu yerdagi javob oxirgi so'z: jim «ok» qaytarish chekni yo'qotardi.
  ipcMain.handle('print:list', () => listPrinters());
  ipcMain.handle('print:sheet', (_e, payload) => printHtml(payload));

  // ── Mijoz-ekran (spec §6.5) ─────────────────────────────────────────────
  ipcMain.on('cfd:push', (_e, payload) => {
    lastCart = normalizeCart(payload);
    sendCart();
  });
  ipcMain.handle('cfd:toggle', () => toggleCustomerDisplay());
  ipcMain.handle('cfd:status', () => ({ open: cfdWin != null && !cfdWin.isDestroyed() }));
}

// ─── Ishga tushish ──────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  // Ikkinchi nusxa: kassada bitta oyna bo'lishi kerak.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    allowQuit = true;
  });
}
