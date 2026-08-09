import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNKNOWN_CASHIER_ID, cashierSliceKey, isUnknownCashier } from './cashier-slice.js';

/**
 * Analitika TZ §9 (X2) — kassir kesimining YAGONA formulasi.
 *
 * Muammo: hisobotlarda xodim kesimi hujjat **egasi** (`owner_id`) bo'yicha
 * ketardi; kassir kesimi (`cashier_sessions.cashier_id`) umuman yo'q edi
 * (`report/` da `cashierId` 0 marta uchrardi, 2026-08-09 grep). «Bu kassir
 * qancha sotdi?» degan savolga tizim javob bera olmasdi.
 *
 * Ikki qoida shu qatlamda muhrlanadi:
 *   1. Kassir kesimi **hech qachon** egaga qaytmaydi — funksiya `ownerId` ni
 *      umuman qabul qilmaydi, shuning uchun «bo'sh bo'lsa egani olaman» degan
 *      fallback yozib bo'lmaydi (dizayn bilan qulflangan).
 *   2. Kassiri aniqlanmagan tushum **ko'rinadi** — alohida «noma'lum» guruhga
 *      tushadi, jimgina tashlab yuborilmaydi va 0 deb ko'rsatilmaydi.
 */

describe('cashierSliceKey — kassir kesimi kaliti', () => {
  it('kassir bor bo`lsa — kassirning id`si', () => {
    expect(cashierSliceKey('3f1a8d2e-0000-4000-8000-000000000001')).toBe(
      '3f1a8d2e-0000-4000-8000-000000000001',
    );
  });

  it('smena (kassir) yo`q bo`lsa — «noma`lum» guruhi, tashlab yuborilmaydi', () => {
    expect(cashierSliceKey(null)).toBe(UNKNOWN_CASHIER_ID);
    expect(cashierSliceKey(undefined)).toBe(UNKNOWN_CASHIER_ID);
  });

  it('bo`sh satr ham «noma`lum» — soxta guruh yasalmaydi', () => {
    expect(cashierSliceKey('')).toBe(UNKNOWN_CASHIER_ID);
  });

  it('«noma`lum» kaliti UUID EMAS — baza so`roviga adashib tushmaydi', () => {
    // `employees.id` — `uuid` ustuni; sentinel u yerga tushsa Prisma xato beradi.
    expect(UNKNOWN_CASHIER_ID).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(isUnknownCashier(UNKNOWN_CASHIER_ID)).toBe(true);
    expect(isUnknownCashier('3f1a8d2e-0000-4000-8000-000000000001')).toBe(false);
  });
});

/**
 * X4 (formulalar tarqoqligi) shu kesimda takrorlanmasin: sentinelni ikkinchi
 * joyda qo'lda yozgan fayl — ikkinchi formula. Buni na typecheck, na test
 * tutadi (satr bir xil ko'rinadi), shuning uchun manba skaneri.
 */
const REPORT_DIR = path.join(process.cwd(), 'src', 'modules', 'report');

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function reportSourcesOutsideMetrics(): Array<{ file: string; src: string }> {
  const out: Array<{ file: string; src: string }> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
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

describe('report/ — kassir kesimi formulasi yagona qatlamda', () => {
  const files = reportSourcesOutsideMetrics();

  it('skaner haqiqatan fayllarni ko`ryapti (bo`sh ro`yxat yashil test bermasin)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('«noma`lum kassir» sentineli qo`lda yozilmaydi', () => {
    const offenders = files.filter((f) => f.src.includes(`'${UNKNOWN_CASHIER_ID}'`));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('kassir kesimini o`qiydigan fayl kalitni yagona qatlamdan oladi', () => {
    const usesCashierSlice = files.filter((f) => /cashier_sessions|cashierSliceKey/.test(f.src));
    // Kesimni ishlatadigan fayl bo'lishi SHART — aks holda test hech narsani
    // qo'riqlamaydi (kesim o'chirilsa ham yashil qolardi).
    expect(usesCashierSlice.length).toBeGreaterThan(0);
    const notImporting = usesCashierSlice.filter(
      (f) => !/cashierSliceKey/.test(f.src) || !/from '\.\/metrics\/index\.js'/.test(f.src),
    );
    expect(notImporting.map((f) => f.file)).toEqual([]);
  });
});
