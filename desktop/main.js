/**
 * Sherset Kassa — Electron kiosk o'rami (spec §3, §6).
 *
 * YUPQA O'RAM (spec §3.1): savdo mantiqi web'da qoladi, bu jarayon faqat
 * (a) kiosk oynani ochadi, (b) qurilma kalitini DPAPI bilan saqlaydi,
 * (c) aloqa uzilganda tushunarli ekran ko'rsatadi va o'zi qaytadi.
 * Chop etish va mijoz-ekran — F3 fazasi (pastdagi IPC ishlovchilari hozircha
 * OCHIQ xato qaytaradi, jimgina «ishladi» demaydi).
 *
 * Server manzili kodga QOTIRILMAYDI (spec §3.2): konfiguratsiyadan, u bo'lmasa
 * build vaqtidagi `SHERSET_SERVER_URL` dan olinadi, u ham bo'lmasa birinchi
 * ishga tushishda `setup.html` da so'raladi.
 */

const path = require('node:path');
const { BrowserWindow, Menu, app, dialog, ipcMain, shell } = require('electron');
const store = require('./device-store');
const updater = require('./updater'); // F4 — avtoyangilanish (spec §8.3)

// Build vaqtida beriladigan default (elektron-builder `extraMetadata`/env orqali).
const DEFAULT_SERVER_URL = store.normalizeServerUrl(process.env.SHERSET_SERVER_URL || '');

const HEALTH_PATH = '/api/v1/health'; // apps/api: setGlobalPrefix('api/v1') + HealthController
const ENTRY_PATH = '/kassa-kirish'; // kassir har doim shu ekrandan boshlaydi
const HEALTH_POLL_MS = 5000;

const isDev = !app.isPackaged;

/** @type {BrowserWindow | null} */
let win = null;
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
  // 🔴 Yangilanish AYNAN shu yerda o'rnatiladi (spec §8.3) — savdo o'rtasida
  // emas. `true` qaytsa o'rnatuvchi jarayonni o'zi yopadi.
  if (updater.installOnQuit()) return;
  app.quit();
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

  // ── F3 fazasi: chop etish va mijoz-ekran ────────────────────────────────
  // Hozircha OCHIQ xato — `print-agent.ts` ko'prik mavjud bo'lsa HTTP-agentga
  // qaytmaydi (`:105-118`), shuning uchun jim «ok» qaytarish chekni yo'qotardi.
  ipcMain.handle('print:list', () => []);
  ipcMain.handle('print:sheet', () => ({
    ok: false,
    error: 'Chop etish qobiqning bu versiyasida hali ulanmagan (F3).',
  }));
  ipcMain.on('cfd:push', () => undefined);
  ipcMain.handle('cfd:toggle', () => ({
    open: false,
    error: 'Mijoz-ekran qobiqning bu versiyasida hali ulanmagan (F3).',
  }));
  ipcMain.handle('cfd:status', () => ({ open: false }));
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
    updater.start(serverBase); // manzil hali yo'q bo'lsa o'zi kutadi (updater.js)
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    allowQuit = true;
  });
}
