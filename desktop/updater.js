/**
 * Sherset Kassa — avtoyangilanish (spec §8.3).
 *
 * SHARTNOMA (uch band, uchalasi ham qo'riqchi test bilan qulflangan —
 * `apps/web/src/__tests__/kassa-installer-config.test.ts`):
 *
 *   1. Kanal manzili SERVERDAN keladi, kodga QOTIRILMAYDI (spec §3.2).
 *      Qurilma qaysi do'kon serveriga juftlangan bo'lsa, yangilanishni ham
 *      o'sha serverdan oladi: `<server>` + `UPDATE_PATH` (nginx statik
 *      `location`, ichida `latest.yml` + `.exe`).
 *   2. Yangi versiya FONDA yuklab olinadi (`autoDownload = true`), lekin
 *      🔴 SAVDO O'RTASIDA O'RNATILMAYDI. `autoInstallOnAppQuit = false` —
 *      ya'ni Electron o'zi hech qachon o'rnatmaydi; o'rnatish faqat kassir
 *      «Chiqish» bosganda (`main.js` → `quitShell()` → `installOnQuit()`).
 *   3. Har qanday nosozlik — JIM. Kassir kassada yangilanish xatosi bilan
 *      nima qilishni bilmaydi; log yoziladi, savdo davom etadi.
 *
 * Nima uchun `electron-updater` LAZY require qilinadi: `desktop/` monorepo
 * workspace'ida emas (`pnpm-workspace.yaml` izohi) va dasturchi mashinasida
 * bog'liqliklar o'rnatilmagan bo'lishi mumkin. Yuqorida `require` qilinsa,
 * butun qobiq shu sababdan ishga tushmasdi.
 */

const { app } = require('electron');

/** Nginx statik kanali — deploy/nginx-*.conf dagi `location` bilan BIR XIL. */
const UPDATE_PATH = '/downloads/desktop/';

/** Spec §8.3 — ishga tushganda va har 4 soatda tekshiriladi. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Birinchi ishga tushishda server manzili hali yo'q (setup ekrani ochiladi).
 * Shuning uchun manzil paydo bo'lguncha kutamiz — aks holda avtoyangilanish
 * faqat KEYINGI ishga tushishda tirilardi.
 */
const BASE_RETRY_MS = 60 * 1000;

/** @type {import('electron-updater').AppUpdater | null} */
let updater = null;
/** @type {NodeJS.Timeout | null} */
let pollTimer = null;
/** @type {NodeJS.Timeout | null} */
let retryTimer = null;
let started = false;
/** Yuklab olingan va o'rnatishga TAYYOR versiya bormi. */
let ready = false;

function log(message) {
  // console.log emas: biome `noConsoleLog`; bu yerdagi yozuv operator uchun.
  console.warn(`[updater] ${message}`);
}

function getUpdater() {
  if (updater) return updater;
  const mod = require('electron-updater');
  updater = mod.autoUpdater;

  updater.autoDownload = true;
  // 🔴 Electron o'zi o'rnatmasin — vaqtni BIZ tanlaymiz (spec §8.3).
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;

  updater.on('update-downloaded', (info) => {
    // Faqat bayroq qo'yiladi. Bu yerda o'rnatish boshlansa kassa savdo
    // o'rtasida qayta ishga tushardi — aynan shu taqiqlangan.
    ready = true;
    log(`yangi versiya yuklab olindi: ${info?.version}; «Chiqish» da o'rnatiladi`);
  });
  updater.on('update-not-available', () => log('yangilanish yo`q'));
  updater.on('error', (err) => log(`xato (jim o'tkazildi): ${err?.message || err}`));

  return updater;
}

async function check() {
  try {
    await getUpdater().checkForUpdates();
  } catch (err) {
    log(`tekshiruv muvaffaqiyatsiz: ${err?.message || err}`);
  }
}

function beginWithBase(getServerBase) {
  retryTimer = null;
  let base = '';
  try {
    base = String(getServerBase() || '');
  } catch {
    base = '';
  }
  if (!base) {
    // Server manzili hali kiritilmagan (setup.html). Keyinroq qaytamiz.
    retryTimer = setTimeout(() => beginWithBase(getServerBase), BASE_RETRY_MS);
    return;
  }

  const url = `${base.replace(/\/+$/, '')}${UPDATE_PATH}`;
  try {
    getUpdater().setFeedURL({ provider: 'generic', url, channel: 'latest' });
  } catch (err) {
    log(`kanalni sozlab bo'lmadi: ${err?.message || err}`);
    return;
  }
  log(`kanal: ${url}`);
  void check();
  pollTimer = setInterval(() => void check(), CHECK_INTERVAL_MS);
}

/**
 * Avtoyangilanishni yoqadi. `getServerBase` — `main.js` dagi `serverBase()`
 * (manzil konfiguratsiyadan keladi, shuning uchun funksiya sifatida beriladi).
 *
 * @param {() => string} getServerBase
 * @returns {{ started: boolean, reason?: string }}
 */
function start(getServerBase) {
  if (started) return { started: false, reason: 'already-started' };
  // Paketlanmagan (dasturchi) rejimda `app-update.yml` yo'q — electron-updater
  // har chaqiruvda xato beradi. Ataylab umuman yoqilmaydi.
  if (!app.isPackaged) return { started: false, reason: 'dev' };
  started = true;
  beginWithBase(getServerBase);
  return { started: true };
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pollTimer = null;
  retryTimer = null;
}

/** Yuklab olingan yangilanish o'rnatishga tayyormi. */
function isUpdateReady() {
  return ready;
}

/**
 * Kassir «Chiqish» bosganda chaqiriladi (`main.js` → `quitShell()`).
 *
 * @returns {boolean} `true` — o'rnatuvchi ishga tushdi va jarayonni O'ZI
 *   yopadi (chaqiruvchi `app.quit()` qilmasligi kerak); `false` — o'rnatiladigan
 *   narsa yo'q, odatdagidek chiqiladi.
 */
function installOnQuit() {
  stop();
  if (!ready) return false;
  try {
    // (isSilent = true) — kassir NSIS oynasini ko'rmaydi; `perMachine: true`
    // bo'lgani uchun Windows baribir UAC so'raydi (README da yozilgan).
    // (isForceRunAfter = false) — «Chiqish» bosilgan, ilova qaytadan ochilmaydi.
    getUpdater().quitAndInstall(true, false);
    return true;
  } catch (err) {
    log(`o'rnatib bo'lmadi: ${err?.message || err}`);
    return false;
  }
}

module.exports = { start, stop, installOnQuit, isUpdateReady, UPDATE_PATH, CHECK_INTERVAL_MS };
