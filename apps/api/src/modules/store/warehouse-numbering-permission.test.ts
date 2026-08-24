import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_META,
  type RequiredPermission,
} from '../permissions/require-permission.decorator.js';
import { resolveTemplateMatrix } from '../permissions/role-templates.js';
import { TOPUP_ENTITIES } from '../permissions/template-topup.js';
import { StoreController } from './store.controller.js';

/**
 * F3 (reja 2026-08-23) — «Yangi ombor raqamlashtirish» ruxsat qulfi.
 *
 * Dizayn: marshrut ATAYLAB alohida `warehousenumbering` entity'sida, `store.
 * update`da EMAS — katta omborchi (ombor menejeri) yangi omborni o'zi
 * raqamlashtira olsin, buning uchun unga ombor KARTOCHKASINI tahrirlash
 * berilmasin. Oddiy omborchi (`storekeeper`) esa ombor TUZILMASINI yaratmaydi.
 * Bu test uchchala tomonni birga qulflaydi.
 */
function permOf(method: keyof StoreController): RequiredPermission | undefined {
  const handler = (StoreController.prototype as Record<string, unknown>)[method as string];
  return Reflect.getMetadata(PERMISSION_META, handler as object) as RequiredPermission | undefined;
}

/**
 * `?? 'NO'` ATAYLAB YO'Q — store-cell-permission.test.ts dagi bilan bir sabab:
 * katakcha topilmasligi «ruxsat yo'q» emas, «entity nomi xato» degani.
 */
const scopeOf = (
  slug: 'storekeeper' | 'warehouse_manager' | 'admin',
  entity: string,
  action: string,
) => {
  const cell = resolveTemplateMatrix(slug).find((c) => c.entity === entity && c.action === action);
  expect(cell, `${slug} matritsasida ${entity}.${action} katakchasi YO'Q`).toBeDefined();
  return cell?.scope;
};

describe('F3 — ombor raqamlashtirish `warehousenumbering` ruxsatida', () => {
  it('marshrut warehousenumbering.create talab qiladi', () => {
    expect(permOf('numberWarehouse')).toEqual({ entity: 'warehousenumbering', action: 'create' });
  });

  it('ombor menejeri (katta omborchi) raqamlashtira oladi', () => {
    expect(scopeOf('warehouse_manager', 'warehousenumbering', 'view')).toBe('ALL');
    expect(scopeOf('warehouse_manager', 'warehousenumbering', 'create')).toBe('ALL');
  });

  it('admin ham raqamlashtira oladi (defaults orqali)', () => {
    expect(scopeOf('admin', 'warehousenumbering', 'create')).toBe('ALL');
  });

  it('oddiy omborchi raqamlashtirA OLMAYDI (chegara saqlanadi)', () => {
    expect(scopeOf('storekeeper', 'warehousenumbering', 'create')).toBe('NO');
  });

  /**
   * Prod topup 2026-08-23 (F5 deploy) da yugurtirilib tasdiqlangan — shundan
   * keyin `warehousenumbering` TOPUP_ENTITIES'dan OLIB TASHLANDI (template-
   * topup qoidasi: ro'yxatda qolsa, jonlida qo'lda bekor qilingan qatorni
   * keyingi run qaytarib tiriltirishi mumkin edi).
   */
  it("TOPUP_ENTITIES'dan chiqarilgan (prod topup 2026-08-23 da o'tgan)", () => {
    expect(TOPUP_ENTITIES).not.toContain('warehousenumbering');
  });
});
