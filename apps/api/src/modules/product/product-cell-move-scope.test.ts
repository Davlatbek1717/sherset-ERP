import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_META,
  type RequiredPermission,
} from '../permissions/require-permission.decorator.js';
import { resolveTemplateMatrix } from '../permissions/role-templates.js';
import { requiredCellOpScope } from './product-cell-move-scope.js';
import { ProductController } from './product.controller.js';

/**
 * G6 — YACHEYKA AMALLARINING RUXSAT DARAJASI.
 *
 * 🔴 Nima o'zgardi va NEGA. Reja G6.2: TSD da joylashtirish/ko'chirish FAQAT
 * `cell-move` / `cell-place` orqali. Lekin bu ikkisi `store.update` talab
 * qilardi va TSD foydalanuvchisi — kichik omborchi (`storekeeper`), uning
 * shablonida esa `store.update = NO` (ATAYLAB —
 * `store-cell-permission.test.ts`). Ya'ni G6.2 birinchi klikdayoq 403 bo'lardi.
 *
 * Bu fayl YANGI chegarani ikki tomondan qulflaydi:
 *  (a) bazaviy talab `storecell.update` va omborchida u BOR;
 *  (b) OMBORLARARO ko'chirish (hovuzdan tashqari) hamon `store.update` —
 *      ya'ni kichik omborchi tovarni bino orasida siljita OLMAYDI;
 *  (c) ombor KARTOCHKASI hamon omborchiga yopiq (eski chegara buzilmagan).
 */

function permOf(method: keyof ProductController): RequiredPermission | undefined {
  const handler = (ProductController.prototype as Record<string, unknown>)[method as string];
  return Reflect.getMetadata(PERMISSION_META, handler as object) as RequiredPermission | undefined;
}

/**
 * ⚠️ `?? 'NO'` ATAYLAB YO'Q (`store-cell-permission.test.ts` dagi sabab):
 * katakcha topilmasligi «ruxsat yo'q» EMAS, «entity nomi xato» degani.
 */
const scopeOf = (slug: 'storekeeper' | 'warehouse_manager', entity: string, action: string) => {
  const cell = resolveTemplateMatrix(slug).find((c) => c.entity === entity && c.action === action);
  expect(cell, `${slug} matritsasida ${entity}.${action} katakchasi YO'Q`).toBeDefined();
  return cell?.scope;
};

describe('marshrut dekoratorlari — bazaviy daraja', () => {
  it('cell-move `storecell.update` talab qiladi', () => {
    expect(permOf('cellMove')).toEqual({ entity: 'storecell', action: 'update' });
  });

  it('cell-place `storecell.update` talab qiladi', () => {
    expect(permOf('cellPlace')).toEqual({ entity: 'storecell', action: 'update' });
  });

  it('cell-rebind `product.update` da QOLADI — u tovar KARTASI tahriri', () => {
    // Bu qator o'zgarsa TSD tovar kartasini tahrirlay boshlardi
    // (allowlist'da ham yo'q, lekin ikkinchi qulf kerak).
    expect(permOf('cellRebind')).toEqual({ entity: 'product', action: 'update' });
  });

  it('kichik omborchi bazaviy darajaga EGA (G6.2 shu bilan ishlaydi)', () => {
    expect(scopeOf('storekeeper', 'storecell', 'update')).toBe('ALL');
  });

  it('kichik omborchida `store.update` HAMON yo`q (eski chegara saqlanadi)', () => {
    expect(scopeOf('storekeeper', 'store', 'update')).toBe('NO');
  });

  it('katta omborchida ikkalasi ham bor (omborlararo ko`chirish uning ishi)', () => {
    expect(scopeOf('warehouse_manager', 'storecell', 'update')).toBe('ALL');
    expect(scopeOf('warehouse_manager', 'store', 'update')).toBe('ALL');
  });
});

describe('requiredCellOpScope — amalga qarab daraja ko`tarilishi', () => {
  const POOL = 'pool-store';

  it('ombor ICHIDA ko`chirish — `storecell` yetadi', () => {
    expect(requiredCellOpScope([{ storeId: 'store-a', crossStore: false }], POOL)).toBe(
      'storecell',
    );
  });

  it('HOVUZDAN haqiqiy omborga — `storecell` (F7 ning kundalik oqimi)', () => {
    expect(requiredCellOpScope([{ storeId: POOL, crossStore: true }], POOL)).toBe('storecell');
  });

  it('haqiqiy ombordan haqiqiy omborga — `store` (katta omborchining qarori)', () => {
    expect(requiredCellOpScope([{ storeId: 'store-b', crossStore: true }], POOL)).toBe('store');
  });

  it('aralash manba: bittasi ham eskalatsiya qilsa — `store`', () => {
    expect(
      requiredCellOpScope(
        [
          { storeId: 'store-a', crossStore: false },
          { storeId: POOL, crossStore: true },
          { storeId: 'store-b', crossStore: true },
        ],
        POOL,
      ),
    ).toBe('store');
  });

  it('hovuz BELGILANMAGAN akkaunt — har omborlararo ko`chirish `store` (fail-closed)', () => {
    // Hovuzsiz akkauntda `poolStoreId = null`, ya'ni istisno yo'q va xulq
    // G6 dan OLDINGIDEK qat'iy qoladi.
    expect(requiredCellOpScope([{ storeId: 'store-b', crossStore: true }], null)).toBe('store');
  });

  it('bo`sh reja — eskalatsiya yo`q', () => {
    expect(requiredCellOpScope([], POOL)).toBe('storecell');
  });
});
