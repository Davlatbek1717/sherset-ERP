import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Q1 — `Debt.sourceDocType` / `Debt.sourceDocId` sxema qulfi.
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q1.
 *
 * Uch narsa jimgina o'zgarib ketmasligi kerak:
 *   1. ikkala ustun NULLABLE (mavjud 650+ qator backfill'siz yashaydi va
 *      qo'lda ochilgan `QRZ-` qarzlar hech qachon manba talab qilmaydi);
 *   2. `@@unique([accountId, sourceDocType, sourceDocId])` — Q2 ning
 *      idempotentligi AYNAN shu indeksga tayanadi (`P2002`), izohga emas;
 *   3. migratsiya IDEMPOTENT — deploy bazalari har doim ham
 *      `_prisma_migrations` bilan kuzatilmaydi (20260809140000 eslatmasi),
 *      shuning uchun skript ikki marta yugurishi mumkin.
 *
 * ⚠️ NULL SEMANTIKASI. Postgres unique indeksi NULL larni TAKRORLANUVCHI
 * sanamaydi (`NULL != NULL`), ya'ni (NULL, NULL) qatorlar cheksiz bo'lishi
 * mumkin. Bu — migratsiyaning butun xavfsizligi (backfill kerak emas), lekin
 * bu YERDA faqat NIYAT qulflanadi: haqiqiy Postgres xulqi lokal dev bazada
 * o'lchandi va Q1 hisobotida raqami bilan yozilgan.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SCHEMA = readFileSync(join(ROOT, 'packages', 'db', 'prisma', 'schema.prisma'), 'utf8');
const MIGRATION_DIR = '20260825120000_debt_source_doc';
const MIGRATION = readFileSync(
  join(ROOT, 'packages', 'db', 'prisma', 'migrations', MIGRATION_DIR, 'migration.sql'),
  'utf8',
);

function modelBlock(name: string): string {
  const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA);
  if (!m?.[1]) throw new Error(`model ${name} topilmadi`);
  return m[1];
}

describe('schema — Debt.sourceDocType / sourceDocId', () => {
  const block = modelBlock('Debt');

  it('🔴 ikkala ustun NULLABLE (mavjud qatorlar backfill talab qilmaydi)', () => {
    expect(block).toMatch(
      /sourceDocType\s+String\?\s+@map\("source_doc_type"\)\s+@db\.VarChar\(32\)/,
    );
    expect(block).toMatch(/sourceDocId\s+String\?\s+@map\("source_doc_id"\)\s+@db\.Uuid/);
  });

  it("🔴 unique bog'lam mavjud — Q2 idempotentligi shunga tayanadi", () => {
    expect(block).toMatch(/@@unique\(\[accountId, sourceDocType, sourceDocId\]\)/);
  });

  it('`balanceAdopted` ustuni SAQLANIB qoladi (yangi ustun uni almashtirmaydi)', () => {
    // Ikkisi turli savolga javob beradi: `balanceAdopted` — «balansga
    // yozamizmi?» (PUL), `sourceDoc*` — «qaysi hujjatdan?» (MANBA). Biri
    // ikkinchisining o'rniga qo'yilsa P1 simmetriyasi buzilardi.
    expect(block).toMatch(/balanceAdopted\s+Boolean\s+@default\(false\)/);
  });

  it("hujjat-nomi bo'yicha eski unique buzilmagan", () => {
    expect(block).toMatch(/@@unique\(\[accountId, name\]\)/);
  });
});

describe('migratsiya — idempotent DDL', () => {
  it("ustunlar ADD COLUMN IF NOT EXISTS bilan qo'shiladi", () => {
    expect(MIGRATION).toMatch(
      /ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "source_doc_type" VARCHAR\(32\)/,
    );
    expect(MIGRATION).toMatch(/ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "source_doc_id" UUID/);
  });

  it('unique indeks IF NOT EXISTS bilan yaratiladi (qayta yugurtirish no-op)', () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
  });

  it('🔴 indeks nomi Prisma generatsiya qiladigan nom bilan AYNAN bir xil', () => {
    // Boshqa nom bilan yaratilsa keyingi `migrate diff` uni «drift» deb
    // ko'rib ikkinchi indeksni qo'shardi (ikki xil nom, bitta shart).
    expect(MIGRATION).toContain('"debts_account_id_source_doc_type_source_doc_id_key"');
    expect(MIGRATION).toMatch(/ON "debts"\("account_id", "source_doc_type", "source_doc_id"\)/);
  });

  it("migratsiyada NOT NULL yoki DEFAULT yo'q (backfill'siz xavfsiz)", () => {
    expect(MIGRATION).not.toMatch(/source_doc_(type|id)"\s+\w+[^;]*NOT NULL/);
    expect(MIGRATION).not.toMatch(/source_doc_(type|id)"\s+\w+[^;]*DEFAULT/);
  });

  it("migratsiya UPDATE / DELETE qilmaydi — Q1 da ma'lumot qimirlamaydi", () => {
    expect(MIGRATION).not.toMatch(/\bUPDATE\s+"?debts"?/i);
    expect(MIGRATION).not.toMatch(/\bDELETE\s+FROM/i);
  });
});
