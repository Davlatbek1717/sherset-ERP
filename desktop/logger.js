/**
 * Qurilma logi — FAYLGA.
 *
 * NEGA: paketlangan Electron ilovasida konsol YO'Q. `console.warn` ga yozilgan
 * updater xatolari, chop nosozliklari va offline sabablari hech qayerda
 * ko'rinmasdi — «chek chiqmayapti» shikoyati kelganda tekshiradigan narsa
 * bo'lmasdi (K05).
 *
 * Fayl: `%APPDATA%/<app>/kassa.log`, ~0.5 MB da bir marta `kassa.log.1` ga
 * ko'chadi (ikki fayldan ortiq saqlanmaydi — kassa diskini to'ldirmasin).
 *
 * 🔴 Log yozilmasa savdo TO'XTAMAYDI: har xato jim yutiladi. Bu yerda
 * «jim muvaffaqiyatsizlik» ATAYLAB — log yordamchi, mahsulot emas.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const MAX_BYTES = 512 * 1024;

function logPath() {
  return path.join(app.getPath('userData'), 'kassa.log');
}

function rotate(file) {
  try {
    if (fs.statSync(file).size < MAX_BYTES) return;
    fs.renameSync(file, `${file}.1`);
  } catch {
    // Fayl yo'q yoki band — rotatsiya kerak emas.
  }
}

function write(scope, message) {
  const line = `${new Date().toISOString()} [${scope}] ${message}\n`;
  try {
    const file = logPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotate(file);
    fs.appendFileSync(file, line, 'utf8');
  } catch {
    // Diskka yozib bo'lmadi — savdo davom etadi.
  }
  // Dev rejimda terminalda ham ko'rinsin (biome: noConsoleLog ⇒ warn).
  console.warn(line.trimEnd());
}

module.exports = { write, logPath, MAX_BYTES };
