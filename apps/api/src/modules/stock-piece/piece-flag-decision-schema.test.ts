import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * K6 — «qaror qilindimi?» sxema qulfi (K1/K5 schema-test naqshi).
 *
 * To'rtta narsa jimgina o'zgarib ketmasligi kerak:
 *   1. `Product` da IKKALA ustun ham BOR va IXTIYORIY (mavjud qatorlar NULL
 *      bilan keladi ⇒ deploy kuni jonli xulq o'zgarmaydi);
 *   2. FK **SET NULL** — xodim ishdan ketsa QAROR kuchda qoladi;
 *   3. migratsiya QOLDIQQA va REYESTRGA umuman tegmaydi;
 *   4. migratsiya IDEMPOTENT va QAYTARISH yo'li bor (F-reja 12-qoida).
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const MIGRATION_ID = '20260826170000_piece_tracking_decision';
const SCHEMA = readFileSync(join(ROOT, 'packages', 'db', 'prisma', 'schema.prisma'), 'utf8');
const MIGRATION = readFileSync(
  join(ROOT, 'packages', 'db', 'prisma', 'migrations', MIGRATION_ID, 'migration.sql'),
  'utf8',
);
const ROLLBACK_PATH = join(
  ROOT,
  'packages',
  'db',
  'scripts',
  'rollback',
  `${MIGRATION_ID}_down.sql`,
);

function modelBlock(name: string): string {
  const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA);
  if (!m?.[1]) throw new Error(`model ${name} topilmadi`);
  return m[1];
}

// ---------------------------------------------------------------------------
describe('K6 sxema — qaror ustunlari', () => {
  const product = modelBlock('Product');

  it('`pieceTrackedDecidedAt` — IXTIYORIY vaqt ustuni', () => {
    expect(product).toMatch(
      /pieceTrackedDecidedAt\s+DateTime\?\s+@map\("piece_tracked_decided_at"\)/,
    );
  });

  it('`pieceTrackedDecidedById` — IXTIYORIY uuid', () => {
    expect(product).toMatch(
      /pieceTrackedDecidedById\s+String\?\s+@map\("piece_tracked_decided_by_id"\)/,
    );
  });

  it('🔴 FK — SET NULL (xodim ketsa QAROR kuchda qoladi)', () => {
    // CASCADE bo'lsa tovar qayta «hal qilinmagan» bo'lib ro'yxatga qaytardi
    // va K6 pilotining hisobi buzilardi.
    expect(product).toMatch(/ProductPieceFlagDecidedBy[^\n]*onDelete: SetNull/);
  });

  it('bayroqning O`ZI o`zgarmagan (K1 dagi ustun)', () => {
    expect(product).toMatch(/pieceTracked\s+Boolean\s+@default\(false\)\s+@map\("piece_tracked"\)/);
  });
});

// ---------------------------------------------------------------------------
describe('K6 migratsiyasi', () => {
  const sqlOnly = MIGRATION.split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

  it('ikkala ustun IDEMPOTENT qo`shiladi', () => {
    expect(MIGRATION).toContain(
      'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "piece_tracked_decided_at" TIMESTAMPTZ;',
    );
    expect(MIGRATION).toContain(
      'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "piece_tracked_decided_by_id" UUID;',
    );
  });

  it('FK `duplicate_object` bilan yutiladi (qayta yugurish no-op)', () => {
    expect(MIGRATION).toContain('WHEN duplicate_object THEN NULL');
    expect(MIGRATION).toContain('ON DELETE SET NULL');
  });

  it('🔴 QOLDIQQA va REYESTRGA umuman tegmaydi', () => {
    // 2026-08-24 da savdo aynan qoldiq mexanizmiga tegilgani uchun to'xtagan
    // edi. Bu qulf shu sinfdagi o'zgarishni migratsiya darajasida to'sadi.
    for (const word of ['stocks', 'stock_by_cell', 'stock_pieces', 'retail_sale']) {
      expect(sqlOnly, word).not.toContain(word);
    }
  });

  it('yagona tegilgan jadval — `products`', () => {
    const tables = [...sqlOnly.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(tables)]).toEqual(['products']);
  });

  it('bayroqning qiymatiga TEGMAYDI (`UPDATE` yo`q)', () => {
    // Migratsiya hech bir tovarda bayroqni yoqmaydi — yoyish qo'lda va
    // bosqichma-bosqich (K-Q10, K6/4 pilot).
    expect(sqlOnly).not.toMatch(/UPDATE\s+"products"/);
  });
});

// ---------------------------------------------------------------------------
describe('K6 qaytarish yo`li (12-qoida)', () => {
  const rollback = existsSync(ROLLBACK_PATH) ? readFileSync(ROLLBACK_PATH, 'utf8') : '';

  it('rollback fayli MAVJUD va idempotent', () => {
    expect(rollback.length).toBeGreaterThan(0);
    expect(rollback).toContain(
      'ALTER TABLE "products" DROP COLUMN IF EXISTS "piece_tracked_decided_at";',
    );
    expect(rollback).toContain(
      'ALTER TABLE "products" DROP COLUMN IF EXISTS "piece_tracked_decided_by_id";',
    );
  });

  it('🔴 qaytarish BAYROQNI o`chirmaydi (kassa xulqi o`zgarmasin)', () => {
    expect(rollback).not.toMatch(/DROP COLUMN IF EXISTS "piece_tracked";/);
    expect(rollback).not.toMatch(/UPDATE\s+"products"\s+SET\s+"piece_tracked"/);
  });

  it('nima yo`qolishi, eksport va tekshiruv so`rovi fayl boshida yozilgan', () => {
    expect(rollback).toContain("MA'LUMOT YO'QOLADI");
    expect(rollback).toContain('prisma migrate resolve --rolled-back');
    expect(rollback).toContain('\\copy');
  });
});
