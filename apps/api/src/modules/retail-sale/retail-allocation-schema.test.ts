import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * G4 — `retail_sale_position_allocations` sxema qulfi.
 *
 * Bu jadval chek qatorining KO'P OMBORLI taqsimotini saqlaydi va rezerv,
 * yig'ish topshirig'i hamda `post()` deltalari uchun YAGONA haqiqat manbai
 * bo'ladi. Uch narsa jimgina o'zgarib ketmasligi kerak:
 *   1. `cell_id` NULL bo'la olishi (E1 — qoldiqning ~94 % i yacheykasiz);
 *   2. FK siyosati (store RESTRICT — qoldiq izi; cell SET NULL — yacheyka
 *      o'chsa taqsimot ombor darajasiga tushadi, yo'qolmaydi);
 *   3. migratsiya IDEMPOTENT (deploy bazalari `_prisma_migrations` bilan
 *      kuzatilmasligi mumkin — 20260809140000 eslatmasi).
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SCHEMA = readFileSync(join(ROOT, 'packages', 'db', 'prisma', 'schema.prisma'), 'utf8');
const MIGRATION = readFileSync(
  join(
    ROOT,
    'packages',
    'db',
    'prisma',
    'migrations',
    '20260825020000_retail_sale_position_allocation',
    'migration.sql',
  ),
  'utf8',
);

function modelBlock(name: string): string {
  const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA);
  if (!m?.[1]) throw new Error(`model ${name} topilmadi`);
  return m[1];
}

describe('schema — RetailSalePositionAllocation', () => {
  const block = modelBlock('RetailSalePositionAllocation');

  it('jadval nomi va kalit maydonlari', () => {
    expect(block).toContain('@@map("retail_sale_position_allocations")');
    expect(block).toMatch(/positionId\s+String\s+@map\("position_id"\)/);
    expect(block).toMatch(/storeId\s+String\s+@map\("store_id"\)/);
    expect(block).toMatch(/qty\s+Decimal\s+@db\.Decimal\(20, 6\)/);
  });

  it('🔴 cellId NULL bo‘la oladi (E1 — yacheykasiz qoldiq ham manba)', () => {
    expect(block).toMatch(/cellId\s+String\?\s+@map\("cell_id"\)/);
  });

  it('kassirning qo‘lda tanlovi belgilanadi (Q1-v2: «kassir o‘zgartira oladi»)', () => {
    expect(block).toMatch(/manual\s+Boolean\s+@default\(false\)/);
  });

  it('FK siyosati: position CASCADE, store RESTRICT, cell SET NULL', () => {
    expect(block).toMatch(/position RetailSalePosition @relation\([^)]*onDelete: Cascade/);
    expect(block).toMatch(/store\s+Store\s+@relation\([^)]*onDelete: Restrict/);
    expect(block).toMatch(/cell\s+StoreCell\?\s+@relation\([^)]*onDelete: SetNull/);
  });

  it('RetailSalePosition dan back-reference bor', () => {
    expect(modelBlock('RetailSalePosition')).toContain(
      'allocations RetailSalePositionAllocation[]',
    );
  });

  it('pozitsiyaga `cellId` ustuni QO‘SHILMAGAN (bo‘linish bitta ustunga sig‘maydi)', () => {
    expect(modelBlock('RetailSalePosition')).not.toMatch(/^\s*cellId/m);
  });
});

describe('migratsiya — idempotent DDL', () => {
  it('jadval va indekslar IF NOT EXISTS bilan', () => {
    expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS "retail_sale_position_allocations"');
    const idx = MIGRATION.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
    expect(idx.length).toBe(2);
  });

  it('har FK duplicate_object bilan himoyalangan (qayta yugurtirish no-op)', () => {
    const fks =
      MIGRATION.match(/ADD CONSTRAINT "retail_sale_position_allocations_\w+_fkey"/g) ?? [];
    const guards = MIGRATION.match(/EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;/g) ?? [];
    expect(fks.length).toBe(4);
    expect(guards.length).toBe(fks.length);
  });

  it('FK siyosati SQL darajasida ham mos', () => {
    expect(MIGRATION).toMatch(
      /"position_id"\) REFERENCES "retail_sale_positions"[\s\S]{0,40}ON DELETE CASCADE/,
    );
    expect(MIGRATION).toMatch(/"store_id"\) REFERENCES "stores"[\s\S]{0,40}ON DELETE RESTRICT/);
    expect(MIGRATION).toMatch(/"cell_id"\) REFERENCES "store_cells"[\s\S]{0,40}ON DELETE SET NULL/);
  });
});
