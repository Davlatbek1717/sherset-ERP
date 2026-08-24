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
 *      ya'ni Electron o'zi hech qachon o'rnatmaydi; o'rnatish ikki yo'lda,
 *      ikkalasi ham `runInstaller` orqali: (a) BOOT — ilova endi ochilib,
 *      oyna hamon kirish ekranida turganda (`main.js` → `installOnBoot()`,
 *      o'rnatgach ilova O'ZI qaytadi); (b) kassir «Chiqish» bosganda
 *      (`main.js` → `quitShell()` → `installOnQuit()`, ilova qaytmaydi).
 *   3. Har qanday nosozlik — JIM. Kassir kassada yangilanish xatosi bilan
 *      nima qilishni bilmaydi; log yoziladi, savdo davom etadi.
 *
 * Nima uchun `electron-updater` LAZY require qilinadi: `desktop/` monorepo
 * workspace'ida emas (`pnpm-workspace.yaml` izohi) va dasturchi mashinasida
 * bog'liqliklar o'rnatilmagan bo'lishi mumkin. Yuqorida `require` qilinsa,
 * butun qobiq shu sababdan ishga tushmasdi.
 */

const { app } = require('electron');
const logger = require('./logger');
const mode = require('./mode');

/**
 * Nginx statik kanali — deploy/nginx-*.conf dagi `location /downloads/` bilan
 * BIR XIL ildizdan. Har dastur O'Z katalogini so'raydi (F8): kassa va omborchi
 * bitta kanalda tursa, `latest.yml` bir-birinikini bosib ketardi.
 */
const UPDATE_PATH = mode.isOmborchi ? '/downloads/omborchi/' : '/downloads/desktop/';

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
  // F2 (K05): endi FAYLGA yoziladi — paketlangan ilovada konsol yo'q edi.
  logger.write('updater', message);
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
    log(
      `yangi versiya yuklab olindi: ${info?.version}; keyingi boot yoki «Chiqish» da o'rnatiladi`,
    );
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
 * YAGONA o'rnatish nuqtasi. Ikkala yo'l ham shu yerdan o'tadi — bayroqlar
 * bir joyda, biri jimgina eskirmaydi.
 *
 * @param {boolean} relaunchAfter `true` — o'rnatgandan keyin ilova QAYTADI
 *   (boot yo'li: qurilma yolg'iz turadi, uni hech kim qo'lda ochmaydi).
 *   `false` — «Chiqish» yo'li: kassir yopishni so'radi.
 * @returns {boolean} `true` — o'rnatuvchi ishga tushdi va jarayonni O'ZI yopadi.
 */
function runInstaller(relaunchAfter) {
  stop();
  if (!ready) return false;
  try {
    // (isSilent = true) — kassir NSIS oynasini ko'rmaydi.
    getUpdater().quitAndInstall(true, relaunchAfter);
    return true;
  } catch (err) {
    log(`o'rnatib bo'lmadi: ${err?.message || err}`);
    return false;
  }
}

/** Kassir «Chiqish» bosganda (`main.js` → `quitShell()`). Ilova QAYTMAYDI. */
function installOnQuit() {
  return runInstaller(false);
}

/** Ishga tushish oynasi: savdo yo'q, o'rnatamiz va ilova QAYTADI. */
function installOnBoot() {
  return runInstaller(true);
}

/**
 * Yuklab olingan yangilanish bor-yo'qligini `ms` gacha kutadi.
 *
 * 🔴 NEGA KUTISH KERAK: `checkForUpdates()` tarmoqqa chiqadi va oldingi
 * sessiyada yuklab olingan fayl keshdan topilsa ham `update-downloaded`
 * bir necha yuz millisekunddan keyin otiladi. Darhol so'ralsa javob doim
 * «yo'q» bo'lardi va boot yo'li HECH QACHON ishlamasdi.
 */
function waitForPending(ms) {
  if (!started) return Promise.resolve(false);
  if (ready) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        getUpdater().removeListener('update-downloaded', onDone);
      } catch {
        // Updater hali yaratilmagan — tozalash kerak emas.
      }
      resolve(v);
    };
    const onDone = () => finish(true);
    const timer = setTimeout(() => finish(ready), ms);
    try {
      getUpdater().once('update-downloaded', onDone);
    } catch {
      finish(false);
    }
  });
}

module.exports = {
  start,
  stop,
  installOnQuit,
  installOnBoot,
  waitForPending,
  isUpdateReady,
  UPDATE_PATH,
  CHECK_INTERVAL_MS,
};
