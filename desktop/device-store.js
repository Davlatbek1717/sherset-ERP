/**
 * Kassa qurilmasining doimiy konfiguratsiyasi (spec §3.2, §6.1).
 *
 * IKKI XIL MA'LUMOT, IKKI XIL HIMOYA:
 *  - `serverUrl` — SIR EMAS (domen). Ochiq saqlanadi, chunki shifrlash
 *    mavjud bo'lmasa ham ilova ishga tusha olishi kerak.
 *  - `device` (deviceId + deviceSecret) — SIR. Windows DPAPI (`safeStorage`)
 *    bilan shifrlanadi. 🔴 Shifrlash mavjud bo'lmasa kalit OCHIQ YOZILMAYDI:
 *    `setDevice` xato qaytaradi va qobiq buni ekranda ko'rsatadi. Jimgina
 *    ochiq saqlash — «hech narsa shikoyat qilmaydi» bug-klassi.
 *
 * Fayl: `%APPDATA%/<app>/kassa-config.json` (Windows).
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const FILE_NAME = 'kassa-config.json';

function configPath() {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function readRaw() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Fayl yo'q yoki buzilgan — bo'sh konfiguratsiya (juftlash ekrani chiqadi).
    return {};
  }
}

function writeRaw(obj) {
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Atomik yozuv: yarim yozilgan konfiguratsiya qurilmani «juftlanmagan»
  // holatga tushirib qo'ymasin.
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

// ─── Server manzili ─────────────────────────────────────────────────────────

/**
 * Kiritilgan manzilni kanonik `scheme://host` ko'rinishiga keltiradi.
 * Sxemasiz kiritilsa `https://` qo'yiladi (kassa prodda TLS orqali ishlaydi).
 * Yaroqsiz bo'lsa `null` — chaqiruvchi xato ko'rsatadi, taxmin qilmaydi.
 */
function normalizeServerUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  // Yo'l/query tashlab yuboriladi — ilova yo'llarini qobiqning o'zi qo'shadi.
  return `${parsed.protocol}//${parsed.host}`;
}

function getServerUrl() {
  const value = readRaw().serverUrl;
  return typeof value === 'string' && value ? value : null;
}

function setServerUrl(input) {
  const url = normalizeServerUrl(input);
  if (!url) return { ok: false, error: "Manzil noto'g'ri. Namuna: erp.sherset.uz" };
  const raw = readRaw();
  raw.serverUrl = url;
  writeRaw(raw);
  return { ok: true, url };
}

// ─── Qurilma kaliti (DPAPI) ─────────────────────────────────────────────────

function isCreds(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.deviceId === 'string' &&
    value.deviceId !== '' &&
    typeof value.deviceSecret === 'string' &&
    value.deviceSecret !== '' &&
    typeof value.name === 'string'
  );
}

/**
 * 🔴 SINXRON: `apps/web/src/lib/pos-device.ts:44-47` natijani darhol tekshiradi.
 * Promise qaytarilsa qurilma HECH QACHON topilmaydi (jim «juftlanmagan» sikli).
 */
function getDevice() {
  const blob = readRaw().device;
  if (typeof blob !== 'string' || !blob) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(blob, 'base64')));
    // Yarim yozuv bilan kirishga urinmaymiz — «juftlanmagan» ekrani aniqroq.
    return isCreds(parsed)
      ? { deviceId: parsed.deviceId, deviceSecret: parsed.deviceSecret, name: parsed.name }
      : null;
  } catch {
    return null;
  }
}

function setDevice(creds) {
  if (!isCreds(creds)) return { ok: false, error: "Qurilma ma'lumoti to'liq emas." };
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      error:
        'Bu kompyuterda shifrlash (DPAPI) mavjud emas. Qurilma kaliti OCHIQ saqlanmaydi — administratorga murojaat qiling.',
    };
  }
  const payload = {
    deviceId: creds.deviceId,
    deviceSecret: creds.deviceSecret,
    name: creds.name,
  };
  const raw = readRaw();
  raw.device = safeStorage.encryptString(JSON.stringify(payload)).toString('base64');
  writeRaw(raw);
  return { ok: true };
}

function clearDevice() {
  const raw = readRaw();
  // `undefined` — `JSON.stringify` bunday kalitni faylga umuman yozmaydi,
  // ya'ni natija `delete` bilan bir xil (biome: `noDelete`).
  raw.device = undefined;
  writeRaw(raw);
  return { ok: true };
}

// ─── Mijoz-ekran holati ─────────────────────────────────────────────────────

/**
 * Mijoz-ekran ochiq qoldirilganmi. Qurilma qayta ishga tushganda (yangilanish,
 * elektr) kassir tugmani QAYTA bosishi kerak edi (K19) — endi qobiq o'zi
 * tiklaydi. Bu sir emas, ochiq saqlanadi.
 */
function getCustomerDisplayOpen() {
  return readRaw().customerDisplayOpen === true;
}

function setCustomerDisplayOpen(open) {
  const raw = readRaw();
  raw.customerDisplayOpen = open === true;
  writeRaw(raw);
}

module.exports = {
  configPath,
  normalizeServerUrl,
  getServerUrl,
  setServerUrl,
  getDevice,
  setDevice,
  clearDevice,
  getCustomerDisplayOpen,
  setCustomerDisplayOpen,
};
