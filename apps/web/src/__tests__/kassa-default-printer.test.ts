import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * B1 — bo'sh printer nomi «Windows sukut printeri» degani.
 *
 * Nega manba-qulfi: `desktop/` Electron main-process kodi, uni Vitest ichida
 * ishga tushirib bo'lmaydi (`electron` moduli yo'q). Shuning uchun repo
 * konvensiyasi bo'yicha manba matni tekshiriladi — xuddi `kiosk-shell.test.ts`
 * va `kassa-installer-config.test.ts` dagidek. Bu zaif qulf, lekin regressiyani
 * (eski `return {ok:false}` shoxi qaytib kelishini) tutadi.
 *
 * 🔴 Tekshiruv IZOHSIZ manba ustida: `kassa-installer-config.test.ts` da
 * o'lchangan bug-klassi — xulq-shartnomasi izohda ham aynan shu matn bilan
 * yozilgan bo'lsa, kod buzilganda test YASHIL qolardi.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const mainSrc = readFileSync(join(ROOT, 'desktop', 'main.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'desktop', 'package.json'), 'utf8')) as {
  version: string;
};

/** Izohlarni olib tashlaydi — qarang: `kassa-installer-config.test.ts`. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const mainCode = stripComments(mainSrc);

describe('B1 — qobiq sukut printerga bosadi', () => {
  it('izohsiz manba vacuity emas', () => {
    // stripComments buzilib bo'sh natija bersa pastdagi «yo'q» tekshiruvlari
    // yolg'on-yashil bo'lardi.
    expect(mainCode).toContain('async function printHtml(payload)');
    expect(mainCode).toContain('webContents.print(');
  });

  it('bo`sh printer nomi uchun XATO qaytarmaydi', () => {
    expect(mainCode).not.toContain('Printer tanlanmagan (sozlamalarda chek printerini belgilang).');
  });

  it('deviceName faqat nom bo`lganda uzatiladi', () => {
    // Shartli spread — bo'sh string `deviceName` sifatida ketsa Electron uni
    // printer nomi deb qabul qilib xato beradi (sukut printerga tushmaydi).
    expect(mainCode).toContain('...(printerName ? { deviceName: printerName } : {})');
    expect(mainCode).not.toContain('deviceName: printerName,');
  });

  it('bo`sh HUJJAT tekshiruvi JOYIDA qoladi', () => {
    expect(mainCode).toContain("Bo'sh hujjat — chop etilmadi.");
  });

  it('versiya 1.4.0 dan past emas (B2 darvozasi shunga tayanadi)', () => {
    const [maj = 0, min = 0] = pkg.version.split('.').map(Number);
    expect(maj * 1000 + min).toBeGreaterThanOrEqual(1 * 1000 + 4);
  });
});
