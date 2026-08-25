import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * K1 — `stock_pieces` sxema qulfi (G4 `retail-allocation-schema.test.ts` naqshi).
 *
 * Beshta narsa jimgina o'zgarib ketmasligi kerak:
 *   1. `cell_id` NULL bo'la olishi (E1 — jonlida qoldiqning ~94 % i yacheykasiz);
 *   2. yorliq unikalligi (K-reja 7.3) — AKKAUNT ichida, `products.code` naqshi;
 *   3. FK siyosati (store RESTRICT, cell/source SET NULL — bo'lak yo'qolmaydi);
 *   4. model qoidalari SQL darajasida ham (CHECK): `whole` ⟹ yorliqsiz va h.k.;
 *   5. migratsiya IDEMPOTENT (deploy bazalari `_prisma_migrations` bilan
 *      kuzatilmasligi mumkin — 20260809140000 eslatmasi) va QAYTARISH yo'li bor
 *      (F-reja 2-bo'lim, 12-qoida).
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const MIGRATION_ID = '20260825230000_stock_piece_registry';
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

describe('schema — Product.pieceTracked', () => {
  it('bayroq bor va default FALSE (mavjud tovarlar xulqi o‘zgarmaydi)', () => {
    expect(modelBlock('Product')).toMatch(
      /pieceTracked\s+Boolean\s+@default\(false\)\s+@map\("piece_tracked"\)/,
    );
  });
});

describe('schema — StockPiece', () => {
  const block = modelBlock('StockPiece');

  it('jadval nomi va kalit maydonlari', () => {
    expect(block).toContain('@@map("stock_pieces")');
    expect(block).toMatch(/storeId\s+String\s+@map\("store_id"\)/);
    expect(block).toMatch(/assortmentId\s+String\s+@map\("assortment_id"\)/);
    expect(block).toMatch(/length\s+Decimal\s+@db\.Decimal\(20, 6\)/);
    expect(block).toMatch(/whole\s+Boolean\s+@default\(false\)/);
    expect(block).toMatch(/status\s+String\s+@default\("active"\)/);
  });

  it('🔴 cellId NULL bo‘la oladi (E1 — yacheykasiz qoldiq ham reyestrga kiradi)', () => {
    expect(block).toMatch(/cellId\s+String\?\s+@map\("cell_id"\)/);
  });

  it('yorliq AKKAUNT ichida unikal (K-reja 7.3), global emas', () => {
    expect(block).toContain('@@unique([accountId, label])');
    expect(block).not.toMatch(/label\s+String\?\s+@unique/);
  });

  it('uzunlik `StockByCell.qty` bilan BIR XIL aniqlikda (aks holda sverka abadiy farq berardi)', () => {
    const qty = /qty\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(20, 6\)/.test(
      modelBlock('StockByCell'),
    );
    expect(qty).toBe(true);
    expect(block).toMatch(/length\s+Decimal\s+@db\.Decimal\(20, 6\)/);
  });

  it('FK siyosati: account CASCADE, store RESTRICT, cell/source SET NULL', () => {
    expect(block).toMatch(/account\s+Account\s+@relation\([^)]*onDelete: Cascade/);
    expect(block).toMatch(/store\s+Store\s+@relation\([^)]*onDelete: Restrict/);
    expect(block).toMatch(/cell\s+StoreCell\?\s+@relation\([^)]*onDelete: SetNull/);
    expect(block).toMatch(/sourcePiece\s+StockPiece\?\s+@relation\([^)]*onDelete: SetNull/);
  });

  it('kesim tarixi zanjiri (o‘ziga havola) bor', () => {
    expect(block).toContain('cutPieces   StockPiece[] @relation("StockPieceCut")');
  });

  it('Account/Store/StoreCell dan back-reference bor', () => {
    expect(modelBlock('Account')).toContain('stockPieces');
    expect(modelBlock('Store')).toContain('stockPieces');
    expect(modelBlock('StoreCell')).toContain('stockPieces');
  });
});

describe('migratsiya — idempotent DDL', () => {
  it('ustun ADD COLUMN IF NOT EXISTS bilan (qayta yugurtirish no-op)', () => {
    expect(MIGRATION).toContain(
      'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "piece_tracked" BOOLEAN NOT NULL DEFAULT false',
    );
  });

  it('jadval IF NOT EXISTS, indekslar ham', () => {
    expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS "stock_pieces"');
    expect(MIGRATION).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "stock_pieces_account_id_label_key"',
    );
    const idx = MIGRATION.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
    expect(idx.length).toBe(3);
  });

  it('har FK duplicate_object bilan himoyalangan', () => {
    const fks = MIGRATION.match(/ADD CONSTRAINT "stock_pieces_\w+_fkey"/g) ?? [];
    const guards = MIGRATION.match(/EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;/g) ?? [];
    expect(fks.length).toBe(4);
    expect(guards.length).toBe(fks.length);
  });

  it('FK siyosati SQL darajasida ham mos', () => {
    expect(MIGRATION).toMatch(/"account_id"\) REFERENCES "accounts"[\s\S]{0,40}ON DELETE CASCADE/);
    expect(MIGRATION).toMatch(/"store_id"\) REFERENCES "stores"[\s\S]{0,40}ON DELETE RESTRICT/);
    expect(MIGRATION).toMatch(/"cell_id"\) REFERENCES "store_cells"[\s\S]{0,40}ON DELETE SET NULL/);
    expect(MIGRATION).toMatch(
      /"source_piece_id"\) REFERENCES "stock_pieces"[\s\S]{0,40}ON DELETE SET NULL/,
    );
  });

  it('🔴 model qoidalari CHECK bo‘lib ham turadi (guard bilan ikki qavat)', () => {
    expect(MIGRATION).toMatch(
      /CONSTRAINT "stock_pieces_whole_has_no_label"[\s\S]{0,60}CHECK \(NOT "whole" OR "label" IS NULL\)/,
    );
    expect(MIGRATION).toMatch(
      /CONSTRAINT "stock_pieces_length_nonnegative"[\s\S]{0,60}CHECK \("length" >= 0\)/,
    );
    expect(MIGRATION).toMatch(
      /CONSTRAINT "stock_pieces_active_length_positive"[\s\S]{0,80}CHECK \("status" <> 'active' OR "length" > 0\)/,
    );
    expect(MIGRATION).toMatch(
      /CONSTRAINT "stock_pieces_status_known"[\s\S]{0,60}CHECK \("status" IN \('active', 'consumed'\)\)/,
    );
  });

  it('🔴 migratsiya MAVJUD jadvallarga TEGMAYDI (faqat `products` ga ustun qo‘shadi)', () => {
    // Yagona ruxsat etilgan ALTER — `products` ga ustun qo'shish.
    const alters = MIGRATION.match(/^ALTER TABLE "(\w+)"/gm) ?? [];
    expect(alters).toEqual(['ALTER TABLE "products"']);
    // Ma'lumot ko'chiradigan/o'chiradigan bayonot YO'Q. Tekshiruv BAYONOT
    // BOSHIDAN ketadi — `ON DELETE CASCADE` FK siyosati, u boshqa narsa.
    expect(MIGRATION).not.toMatch(/^\s*(UPDATE|DELETE\s+FROM|INSERT\s+INTO|DROP)\b/im);
    // Qoldiq jadvallariga umuman tegilmagan.
    expect(MIGRATION).not.toContain('"stocks"');
    expect(MIGRATION).not.toContain('"stock_by_cell"');
  });
});

describe('qaytarish yo‘li (F-reja 12-qoida)', () => {
  it('rollback skripti bor va migratsiya papkasidan TASHQARIDA', () => {
    expect(existsSync(ROLLBACK_PATH)).toBe(true);
    expect(
      existsSync(join(ROOT, 'packages', 'db', 'prisma', 'migrations', MIGRATION_ID, 'down.sql')),
    ).toBe(false);
  });

  it('ikkala qo‘shilgan narsani ham tushiradi, idempotent', () => {
    const down = readFileSync(ROLLBACK_PATH, 'utf8');
    expect(down).toContain('DROP TABLE IF EXISTS "stock_pieces"');
    expect(down).toContain('ALTER TABLE "products" DROP COLUMN IF EXISTS "piece_tracked"');
  });

  it('yugurtirish buyrug‘i va yo‘qoladigan ma‘lumot ogohlantirishi faylning O‘ZIDA', () => {
    const down = readFileSync(ROLLBACK_PATH, 'utf8');
    expect(down).toContain('prisma db execute');
    expect(down).toMatch(/MA'LUMOT YO'QOLADI/);
  });
});
