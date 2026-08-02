import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Analitika TZ §4/X4 — hisobot modulida QO'LDA foiz formulasi qaytmasin.
 *
 * Nega source-scan: bu buzilishni na typecheck, na testlar tutadi. Yangi
 * hisobot yozgan odam `(Number(a) / Number(b)) * 100` deb yozsa, kod ishlaydi,
 * testlari yashil bo'ladi — va tizimda o'sha ratio'ni boshqacha yaxlitlaydigan
 * BESHINCHI implementatsiya paydo bo'ladi. 2026-08-02 da to'rttasi bir vaqtda
 * bor edi (profitability · pnl · unit-economics · abc-analysis), uchtasi
 * BigInt'ni Float orqali bo'lardi.
 *
 * Taqiqning ikki qismi bor:
 *   1. BigInt'ni `Number()` orqali bo'lish — 2^53 tiyindan katta yig'indida
 *      jimgina aniqlik yo'qotadi (yillik agregat shunga yetadi);
 *   2. har joyda o'z yaxlitlash qoidasi — bir ratio ikki ekranda ikki xil
 *      ko'rinadi, bu esa hisobotga ishonchni yo'q qiladi.
 */

const REPORT_DIR = path.join(process.cwd(), 'src', 'modules', 'report');

/** Izohlar skanerdan olib tashlanadi — repo konventsiyasi (pos-shell-height). */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function reportSources(): Array<{ file: string; src: string }> {
  const out: Array<{ file: string; src: string }> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      // Yagona qatlamning O'ZI — bo'linish aynan shu yerda bo'lishi kerak.
      if (full.includes(`${path.sep}metrics${path.sep}`)) continue;
      out.push({
        file: path.relative(REPORT_DIR, full),
        src: stripComments(fs.readFileSync(full, 'utf8')),
      });
    }
  };
  walk(REPORT_DIR);
  return out;
}

describe('report/ — qo`lda foiz formulasi taqiqlanadi', () => {
  const files = reportSources();

  it('skaner haqiqatan fayllarni ko`ryapti (bo`sh ro`yxat yashil test bermasin)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('BigInt Number() orqali BO`LINMAYDI', () => {
    // `Number(x) / Number(y)` — aynan yo'qotilgan shakl.
    const offenders = files.filter((f) => /Number\([^)]*\)\s*\/\s*Number\(/.test(f.src));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('`* 100` bilan qo`lda foiz yasalmaydi', () => {
    // `… * 100).toFixed(` yoki `(… ) * 100` ko'rinishidagi foiz yasash.
    const offenders = files.filter((f) => /\)\s*\*\s*100\s*\)\s*\.toFixed\(/.test(f.src));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('`* 10000n` bilan qo`lda ulush hisoblanmaydi', () => {
    const offenders = files.filter((f) => /\*\s*10000n\s*\)\s*\/\s*/.test(f.src));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('foiz ishlatadigan hisobotlar yagona qatlamdan import qiladi', () => {
    // Agar faylda `Pct`/`Percent`/`share` maydoni bo'lsa-yu, `metrics/` dan
    // hech narsa olmasa — formulani o'zi yozgan bo'lishi mumkin.
    const usesPercent = files.filter((f) =>
      /marginPercent|profitGoodsPct|profitSalesPct|cumulativeShare/.test(f.src),
    );
    const notImporting = usesPercent.filter((f) => !/from '\.\/metrics\/index\.js'/.test(f.src));
    expect(notImporting.map((f) => f.file)).toEqual([]);
  });
});
