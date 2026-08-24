/**
 * Qobiq REJIMI — bitta kod bazasi, ikki dastur (F8, ombor-restrukturizatsiya).
 *
 *  - `kassa`    — Sherset Kassa: kiosk oyna, PIN-kirish (`/kassa-kirish`),
 *                 ekran klaviaturasi, mijoz-ekran, chiqish-imosi.
 *  - `omborchi` — Sherset Omborchi: ODDIY ramkali oyna, ERP login (`/omborchi`
 *                 sahifasi, sessiya bo'lmasa web o'zi /login ga olib boradi),
 *                 kiosk yordamchilari YO'Q. Chop etish ko'prigi (printSheet)
 *                 va avtoyangilanish saqlanadi — kanal faqat boshqa katalogda.
 *
 * Rejim manbasi (ustuvorlik tartibida):
 *  1. `SHERSET_SHELL_MODE` muhit o'zgaruvchisi — dasturchi rejimi uchun
 *     (`SHERSET_SHELL_MODE=omborchi pnpm run dev`).
 *  2. package.json dagi `shersetMode` maydoni — PAKETLANGAN omborchi build'iga
 *     uni electron-builder `extraMetadata` yozadi (`omborchi.builder.json`).
 *  3. Hech biri yo'q — `kassa` (eski xulq baytma-bayt saqlanadi).
 *
 * 🔴 Bu fayl FAQAT main jarayonda ishlaydi. Preload (sandbox) package.json ni
 * o'qiy olmaydi — unga rejim `additionalArguments` orqali beriladi (main.js).
 */

let pkgMode = '';
try {
  pkgMode = require('./package.json').shersetMode || '';
} catch {
  // package.json o'qilmasa — kassa (xavfsiz sukut).
}

const raw = process.env.SHERSET_SHELL_MODE || pkgMode;
const id = raw === 'omborchi' ? 'omborchi' : 'kassa';

module.exports = {
  id,
  isKassa: id === 'kassa',
  isOmborchi: id === 'omborchi',
};
