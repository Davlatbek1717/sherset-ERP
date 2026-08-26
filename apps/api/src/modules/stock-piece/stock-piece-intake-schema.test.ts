import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PIECE_CONSUMED_REASON } from './piece-cut-core.js';

/**
 * K5 — `piece_entry` sxema qulfi (K1 `stock-piece-schema.test.ts` naqshi).
 *
 * To'rtta narsa jimgina o'zgarib ketmasligi kerak:
 *   1. uchala hujjat jadvalida `piece_entry` ustuni BOR va IXTIYORIY
 *      (mavjud qatorlar NULL bilan keladi ⇒ jonli xulq o'zgarmaydi);
 *   2. `consumed_reason` yopiq lug'ati `recount` ni ham qabul qiladi va
 *      **kod bilan SQL bir xil ro'yxatni aytadi**;
 *   3. migratsiya QOLDIQQA umuman tegmaydi (`stocks`/`stock_by_cell` yo'q);
 *   4. migratsiya IDEMPOTENT va QAYTARISH yo'li bor (F-reja 12-qoida).
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const MIGRATION_ID = '20260826120000_stock_piece_intake';
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
describe('K5 sxema — `pieceEntry` uchala hujjatda', () => {
  for (const model of ['InventoryPosition', 'SupplyPosition', 'SalesReturnPosition']) {
    it(`${model} da IXTIYORIY matn ustuni bor`, () => {
      expect(modelBlock(model)).toMatch(/pieceEntry\s+String\?\s+@map\("piece_entry"\)/);
    });
  }
});

// ---------------------------------------------------------------------------
describe('K5 migratsiyasi', () => {
  it('uchala ustun IDEMPOTENT qo`shiladi', () => {
    for (const table of ['inventory_positions', 'supply_positions', 'sales_return_positions']) {
      expect(MIGRATION).toContain(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "piece_entry" TEXT;`,
      );
    }
  });

  it('🔴 QOLDIQQA umuman tegmaydi — `stocks`/`stock_by_cell` uchramaydi', () => {
    // 2026-08-24 da savdo aynan qoldiq mexanizmiga tegilgani uchun to'xtagan
    // edi. Bu qulf shu sinfdagi o'zgarishni migratsiya darajasida to'sadi.
    const sql = MIGRATION.split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(sql).not.toContain('stocks');
    expect(sql).not.toContain('stock_by_cell');
  });

  it('`consumed_reason` lug`ati `recount` bilan kengaytiriladi', () => {
    expect(MIGRATION).toContain('DROP CONSTRAINT IF EXISTS "stock_pieces_consumed_reason_known"');
    expect(MIGRATION).toMatch(/IN \('sold', 'scrap', 'cut-loss', 'closed', 'recount'\)/);
  });

  it('🔴 KOD va SQL AYNI lug`atni aytadi', () => {
    // Ikki joyda ikki ro'yxat bo'lib ketishi bu repoda nomi bor xato-klass
    // (`PIECE_LABEL_PREFIX` bilan bir sabab): kod `recount` yozardi, DB esa
    // rad etardi va sanash post`i jimgina yiqilardi.
    const m = /IN \(([^)]*)\)/.exec(MIGRATION.split('DROP CONSTRAINT')[1] ?? '');
    const sqlValues = (m?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    expect(sqlValues.sort()).toEqual(Object.values(PIECE_CONSUMED_REASON).sort());
  });
});

// ---------------------------------------------------------------------------
describe('K5 qaytarish yo`li (12-qoida)', () => {
  const rollback = existsSync(ROLLBACK_PATH) ? readFileSync(ROLLBACK_PATH, 'utf8') : '';

  it('rollback fayli MAVJUD va idempotent', () => {
    expect(rollback.length).toBeGreaterThan(0);
    for (const table of ['inventory_positions', 'supply_positions', 'sales_return_positions']) {
      expect(rollback).toContain(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "piece_entry";`);
    }
  });

  it('`recount` qatorlarini eski lug`atga sig`diradi (aks holda ADD yiqilardi)', () => {
    expect(rollback).toContain(
      `UPDATE "stock_pieces" SET "consumed_reason" = 'closed' WHERE "consumed_reason" = 'recount';`,
    );
    expect(rollback).toMatch(/IN \('sold', 'scrap', 'cut-loss', 'closed'\)/);
  });

  it('nima yo`qolishi va tekshiruv so`rovi fayl boshida yozilgan', () => {
    expect(rollback).toContain("MA'LUMOT YO'QOLADI");
    expect(rollback).toContain('prisma migrate resolve --rolled-back');
    expect(rollback).toContain('\\copy');
  });
});
