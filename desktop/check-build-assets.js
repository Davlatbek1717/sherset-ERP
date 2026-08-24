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

// `node check-build-assets.js omborchi` — omborchi build'i O'Z ikonkasini
// talab qiladi (F8): ikki dastur bitta ikonka bilan chiqsa foydalanuvchi
// panelda ularni ajrata olmaydi.
const target = process.argv[2] === 'omborchi' ? 'omborchi' : 'kassa';

const REQUIRED =
  target === 'omborchi'
    ? [
        {
          path: 'build/icon-omborchi.ico',
          why: 'Sherset Omborchi ikonkasi. Tiklash: node tools/icon/gen-omborchi-icon.js',
        },
      ]
    : [
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
