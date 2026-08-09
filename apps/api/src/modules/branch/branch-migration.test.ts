import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Faza F001 — migratsiya QO'RIQCHISI (`branches` + «Asosiy» filial backfill).
 *
 * NEGA MANBA-SKAN: migratsiya bir marta yuguradi va **prodda qo'lda**
 * qo'llanadi (`sherset_v2` sxema-drift, CLAUDE.md §7). Ya'ni uni hech qanday
 * runtime testi qoplamaydi — SQL noto'g'ri bo'lsa buni faqat prodda ko'ramiz.
 * Shu sababli fayl matnining o'zi qulflanadi.
 *
 * Uch invariant:
 *   1. **Aynan bitta standart filial** — qisman-unikal indeks (partial unique
 *      index) `WHERE is_default`. Prisma sxemasi buni ifodalay olmaydi, ya'ni
 *      u FAQAT shu SQL faylda yashaydi — tushib qolsa hech narsa sezmaydi.
 *   2. **Backfill har akkaunt uchun** — `SELECT ... FROM accounts`, bitta
 *      akkauntga qattiq bog'lanmagan (`INSERT ... VALUES` bo'lsa ko'p-ijarachi
 *      bazada faqat bittasi filial oladi).
 *   3. **REGRESSIYA QULFI** — migratsiya MAVJUD jadvallarga TEGMAYDI. F001
 *      maqsadi «xulq o'zgarmaydi»: `ALTER TABLE`/`UPDATE`/`DROP` bo'lsa bir
 *      filialli foydalanuvchi o'zgarish sezishi mumkin.
 */

// __dirname = apps/api/src/modules/branch → besh daraja yuqori = repo ildizi.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const MIGRATIONS = join(REPO_ROOT, 'packages', 'db', 'prisma', 'migrations');

function branchMigrationSql(): { dir: string; sql: string } {
  expect(existsSync(MIGRATIONS), `migratsiyalar papkasi topilmadi: ${MIGRATIONS}`).toBe(true);
  const dirs = readdirSync(MIGRATIONS).filter((d) => /branch/i.test(d));
  expect(dirs, 'F001 migratsiya papkasi topilmadi (nomida `branch` bo`lishi kerak)').not.toEqual(
    [],
  );
  const dir = dirs.sort().at(-1) as string;
  return { dir, sql: readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8') };
}

describe('F001 migratsiya — `branches` jadvali va standart filial', () => {
  const { dir, sql } = branchMigrationSql();
  const upper = sql.toUpperCase();

  it('skaner ishlayapti — SQL topildi va bo`sh emas (vakuum emas)', () => {
    expect(dir).toMatch(/branch/i);
    expect(sql.length).toBeGreaterThan(200);
  });

  it('`branches` jadvali yaratiladi', () => {
    expect(upper).toContain('CREATE TABLE');
    expect(sql).toMatch(/"branches"/);
  });

  it('AYNAN BITTA standart filial — qisman-unikal indeks qo`yilgan', () => {
    // `CREATE UNIQUE INDEX ... ON "branches" ("account_id") WHERE "is_default"`
    const partial =
      /CREATE\s+UNIQUE\s+INDEX[\s\S]*?"branches"[\s\S]*?account_id[\s\S]*?WHERE[\s\S]*?is_default/i;
    expect(
      partial.test(sql),
      'Qisman-unikal indeks yo`q — ikkita standart filial DB darajasida mumkin bo`lib qoladi',
    ).toBe(true);
  });

  it('backfill HAR akkaunt uchun ishlaydi (qattiq kodlangan bitta akkaunt emas)', () => {
    expect(upper).toContain('INSERT INTO');
    expect(sql).toMatch(/FROM\s+"?accounts"?/i);
    // `INSERT ... SELECT` naqshi: har akkauntga bitta qator.
    expect(/INSERT\s+INTO[\s\S]*?SELECT/i.test(sql)).toBe(true);
  });

  it('backfill IDEMPOTENT — ikki marta yugursa ikkinchi filial chiqmaydi', () => {
    expect(
      /ON\s+CONFLICT\s+DO\s+NOTHING/i.test(sql) || /NOT\s+EXISTS/i.test(sql),
      'Backfill takroriy ishga tushishdan himoyalanmagan',
    ).toBe(true);
  });

  it('REGRESSIYA QULFI — mavjud jadvallarga TEGMAYDI', () => {
    const forbidden = [/ALTER\s+TABLE/i, /\bDROP\s+TABLE/i, /\bUPDATE\s+"/i, /\bDELETE\s+FROM/i];
    const hits = forbidden.filter((re) => re.test(sql)).map((re) => re.source);
    expect(
      hits,
      'F001 faqat QO`SHADI — mavjud ma`lumot o`zgarsa «hech narsa o`zgarmaydi» va`dasi buziladi',
    ).toEqual([]);
  });

  it('Prisma sxemasida `Branch` modeli bor va `branches` ga xaritalangan', () => {
    const schema = readFileSync(
      join(REPO_ROOT, 'packages', 'db', 'prisma', 'schema.prisma'),
      'utf8',
    );
    const model = schema.match(/model Branch \{[\s\S]*?\n\}/)?.[0];
    expect(model, '`Branch` modeli sxemada topilmadi').toBeTruthy();
    expect(model).toContain('@@map("branches")');
    expect(model).toContain('isDefault');
    expect(model).toContain('organizationId');
  });
});
