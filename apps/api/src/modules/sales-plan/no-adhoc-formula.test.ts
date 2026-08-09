import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MK37 — «faktni `report/metrics/` dan ol, yangi formula yozma» qoidasini
 * MANBA ustidan qulflaydi.
 *
 * Nega source-scan: bu buzilishni na typecheck, na oddiy testlar tutadi.
 * Yangi qator yozgan odam `(Number(a) / Number(b)) * 100` deb yozsa, kod
 * ishlaydi va testlari yashil bo'ladi — tizimda o'sha nisbatni boshqacha
 * yaxlitlaydigan navbatdagi implementatsiya paydo bo'ladi. `report/metrics/
 * no-adhoc-percent.test.ts` aynan shu qo'riqchining `report/` dagi nusxasi;
 * bu modul o'sha katalogdan tashqarida bo'lgani uchun o'z qo'riqchisi kerak
 * ([[copy-paste-loses-a-branch]] — nusxa qilinganda bir shox yo'qoladi).
 */

const DIR = path.join(process.cwd(), 'src', 'modules', 'sales-plan');

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function sources(): Array<{ file: string; src: string }> {
  return fs
    .readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => ({
      file: e.name,
      src: stripComments(fs.readFileSync(path.join(DIR, e.name), 'utf8')),
    }));
}

describe('MK37 — modulda qo`lda foiz formulasi taqiqlanadi', () => {
  const files = sources();

  it('skaner haqiqatan fayllarni ko`ryapti (bo`sh ro`yxat yashil test bermasin)', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it('BigInt `Number()` orqali BO`LINMAYDI', () => {
    const offenders = files.filter((f) => /Number\([^)]*\)\s*\/\s*Number\(/.test(f.src));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('`* 100` bilan qo`lda foiz yasalmaydi', () => {
    const offenders = files.filter((f) => /\)\s*\*\s*100n?\s*\)?\s*\.?toFixed\(/.test(f.src));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('`* 10000n` bilan qo`lda ulush hisoblanmaydi', () => {
    const offenders = files.filter((f) => /\*\s*10_?000n\s*\)?\s*\//.test(f.src));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('foiz YAGONA qatlamdan import qilinadi (hisoblovchi fayl bor va u import qiladi)', () => {
    const importsLayer = files.filter((f) => /from '\.\.\/report\/metrics\/index\.js'/.test(f.src));
    // Foizni kimdir hisoblashi SHART — aks holda bu qo'riqchi bo'sh bo'lardi.
    expect(importsLayer.map((f) => f.file)).toContain('sales-plan-progress.ts');
  });

  it('modul O`Z foiz funksiyasini TA`RIFLAMAYDI', () => {
    // `budget-variance.ts` da lokal `percentText` bor — aynan shu nusxalanish
    // takrorlanmasin (u MK12 qarzi, bu yerga ko'chirilmaydi).
    const offenders = files.filter((f) =>
      /function\s+(percent|percentText|pct|toPercent)\s*\(/.test(f.src),
    );
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('fakt manbai FAQAT kunlik KPI ombori (ikkinchi sotuv formulasi yozilmaydi)', () => {
    // `Demand`/`RetailSale` dan sotuvni bu yerda qayta hisoblash = ikkinchi
    // haqiqat. Fakt faqat `employeeDailyKpiMetric` dan o'qiladi.
    const offenders = files.filter((f) =>
      /prisma\.client\.(demand|retailSale|cashierSession)\b/.test(f.src),
    );
    expect(offenders.map((f) => f.file)).toEqual([]);
  });
});
