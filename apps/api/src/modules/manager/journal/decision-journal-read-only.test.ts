import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 MK21 rejasining 1-testi — «ekran MAVJUD jurnaldan o'qiydi (yangi jadval
 * yo'q)».
 *
 * TZ «qaror jurnali qabul hodisa jurnalidan texnik jihatdan chiqadi — alohida
 * ekran qilinmaydi» degan edi; egasi ekranni tanladi. Tanlov ekran haqida —
 * **ma'lumot modeli haqida emas**. Ikkinchi yozuvchi ochilsa, o'sha zahoti ikki
 * haqiqat manbai paydo bo'lardi: hodisa jurnali va uning nusxasi. Bu holat
 * birlik-test bilan isbotlanmaydi (u YO'Q xususiyat), shuning uchun test manba
 * matnini skanerlaydi — `queue-does-not-block.test.ts` bilan bir uslubda.
 */

const JOURNAL_DIR = import.meta.dirname;
const SCHEMA = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'prisma',
  'schema.prisma',
);

/**
 * Jurnal FAQAT shu jadvallardan o'qiydi. Har biri — allaqachon mavjud,
 * append-only hodisa jurnali yoki unga ism/yorliq beruvchi karta.
 */
const ALLOWED_TABLES = new Set([
  // Hodisa jurnallari (qarorlarning o'zi).
  'employeeDailyKpiEvent',
  'managerWorkItemEvent',
  'cashierSessionAcceptanceEvent',
  'supplyApprovalEvent',
  // Yorliq/natija uchun o'qishlar.
  'employeeDailyKpi',
  'managerWorkItem',
  'cashierSession',
  'supply',
  'employee',
  'hrBonusFineLog',
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.ts')) yield full;
  }
}

function sourceFiles(): Array<{ rel: string; src: string }> {
  return [...walk(JOURNAL_DIR)]
    .filter((f) => !f.endsWith('.test.ts'))
    .map((f) => ({ rel: relative(JOURNAL_DIR, f), src: readFileSync(f, 'utf8') }));
}

describe('🔴 MK21 — qaror jurnali YANGI JADVAL ochmaydi', () => {
  it('sxemada qaror-jurnali modeli yo`q', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1] as string);
    const suspicious = models.filter((m) => /decision/i.test(m));
    expect(suspicious).toEqual([]);

    const maps = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1] as string);
    expect(maps.filter((t) => /decision/i.test(t))).toEqual([]);
  });

  it('jurnal moduli hech narsa YOZMAYDI (create/update/delete/upsert yo`q)', () => {
    const writers: string[] = [];
    const write = /\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

    for (const { rel, src } of sourceFiles()) {
      if (write.test(src)) writers.push(rel);
    }

    expect(writers).toEqual([]);
  });

  it('faqat MAVJUD jadvallardan o`qiydi (ruxsat ro`yxati)', () => {
    const used = new Set<string>();
    for (const { src } of sourceFiles()) {
      for (const m of src.matchAll(/(?:prisma|tx)\.client\.(\w+)\./g)) used.add(m[1] as string);
      for (const m of src.matchAll(/this\.prisma\.client\.(\w+)\./g)) used.add(m[1] as string);
    }

    expect([...used].filter((t) => !ALLOWED_TABLES.has(t))).toEqual([]);
  });

  it('HTTP sirti faqat O`QISH (yozuvchi metod yo`q)', () => {
    const offenders: string[] = [];
    for (const { rel, src } of sourceFiles()) {
      if (!rel.endsWith('.controller.ts')) continue;
      const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/@(Post|Put|Patch|Delete)\(/.test(noComments)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
