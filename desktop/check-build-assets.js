/**
 * Yig'ishdan OLDINGI qo'riqchi (`pnpm run dist` shuni birinchi chaqiradi).
 *
 * Nima uchun kerak: `build/icon.ico` — BINAR fayl, repo'da yo'q (uni operator
 * qo'shadi, `README.md` → «Installer yig'ish»). U yo'q bo'lganda
 * electron-builder ning o'z xatosi tushunarsiz bo'ladi (yoki eng yomoni —
 * default Electron ikonkasi bilan JIM davom etadi va kassa PC'sida Electron
 * logotipli ilova paydo bo'ladi). Bu skript o'rniga ANIQ xabar beradi.
 */

const { existsSync } = require('node:fs');
const { join } = require('node:path');

const REQUIRED = [
  {
    path: 'build/icon.ico',
    why: 'Windows installer va yorliq ikonkasi. Kamida 256×256, ko`p o`lchamli .ico.',
  },
];

const missing = REQUIRED.filter((item) => !existsSync(join(__dirname, item.path)));

if (missing.length > 0) {
  console.error('\n[dist] Yig`ish TO`XTATILDI — kerakli fayllar yo`q:\n');
  for (const item of missing) {
    console.error(`  desktop/${item.path}\n      ${item.why}`);
  }
  console.error('\nFaylni qo`shing va qayta urinib ko`ring.\n');
  process.exit(1);
}
