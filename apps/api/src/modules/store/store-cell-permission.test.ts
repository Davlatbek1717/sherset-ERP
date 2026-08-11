import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_META,
  type RequiredPermission,
} from '../permissions/require-permission.decorator.js';
import { resolveTemplateMatrix } from '../permissions/role-templates.js';
import { StoreController } from './store.controller.js';

/**
 * TZ v3 §3 — «bog'lash/sanash = storecell (omborchi roli yetadi)».
 *
 * Muammo (2026-08-10 da o'lchandi): yacheyka amallari `store.update` talab
 * qilardi, `storekeeper` shablonida esa faqat `store.view` bor edi ⇒ omborchi
 * «Scan»/«Sanash» oynalarini umuman ishlata olmasdi, ammo hech narsa
 * yiqilmasdi (403 faqat jonli klikda ko'rinardi).
 *
 * Bu test ikki tomonni birga qulflaydi: (a) marshrutlar AYNAN `storecell`
 * talab qiladi, (b) omborchi shablonida shu ruxsat bor va (c) ombor
 * kartochkasining O'ZINI tahrirlash omborchiga ochilmagan.
 */
function permOf(method: keyof StoreController): RequiredPermission | undefined {
  const handler = (StoreController.prototype as Record<string, unknown>)[method as string];
  return Reflect.getMetadata(PERMISSION_META, handler as object) as RequiredPermission | undefined;
}

/**
 * ⚠️ `?? 'NO'` ATAYLAB YO'Q. `resolveTemplateMatrix` TO'LIQ matritsani
 * (`NO` katakchalar bilan) qaytaradi, shuning uchun katakcha topilmasligi —
 * «ruxsat yo'q» EMAS, «entity nomi xato yozilgan» degani. Zaxira qiymat
 * bo'lsa, «`NO` bo'lishi kerak» assertlari entity o'chib ketgan holatda ham
 * yashil qolardi (review 2026-08-10 da o'lchangan vacuity).
 */
const scopeOf = (slug: 'storekeeper' | 'warehouse_manager', entity: string, action: string) => {
  const cell = resolveTemplateMatrix(slug).find((c) => c.entity === entity && c.action === action);
  expect(cell, `${slug} matritsasida ${entity}.${action} katakchasi YO'Q`).toBeDefined();
  return cell?.scope;
};

describe('TZ v3 §3 — yacheyka amallari `storecell` ruxsatida', () => {
  const READ: Array<keyof StoreController> = ['cellStock', 'cellProducts'];
  const WRITE: Array<keyof StoreController> = [
    'setCellStock',
    'assignCellProducts',
    'bindCellProductIfEmpty',
  ];

  for (const m of READ) {
    it(`${m} — storecell.view`, () => {
      expect(permOf(m)).toEqual({ entity: 'storecell', action: 'view' });
    });
  }

  for (const m of WRITE) {
    it(`${m} — storecell.update`, () => {
      expect(permOf(m)).toEqual({ entity: 'storecell', action: 'update' });
    });
  }

  it('omborchi yacheyka amallarini bajara oladi', () => {
    expect(scopeOf('storekeeper', 'storecell', 'view')).toBe('ALL');
    expect(scopeOf('storekeeper', 'storecell', 'update')).toBe('ALL');
  });

  it('omborchi ombor KARTOCHKASINI tahrirlay olmaydi (chegara saqlanadi)', () => {
    expect(scopeOf('storekeeper', 'store', 'update')).toBe('NO');
  });

  /**
   * TZ §3 ning ATAYLAB qilingan assimetriyasi: bog'lash/sanash omborchiga
   * ochiq, lekin BOG'LASHNI CHIQARIB TASHLASH (Scan'dagi «chiqarib qo'shish»)
   * — `store.update`, ya'ni omborchida YO'Q. Bu qator o'zgarsa, destruktiv
   * amal jimgina omborchiga ochilib ketadi.
   */
  it('chiqarish (unbind) `store.update` da QOLADI — omborchida yo`q', () => {
    expect(permOf('unassignCellProduct')).toEqual({ entity: 'store', action: 'update' });
    expect(scopeOf('storekeeper', 'store', 'update')).toBe('NO');
  });

  it('ombor menejerida ham storecell bor', () => {
    expect(scopeOf('warehouse_manager', 'storecell', 'update')).toBe('ALL');
  });

  /**
   * EGASINING QARORI (2026-08-11 · Q2). `store.update` na omborchida, na ombor
   * menejerida yo'q edi ⇒ «chiqarib qo'shish» tugmasi FAQAT admin/egada
   * ko'rinardi, ya'ni TZ §1.2 ning uchinchi varianti amalda o'lik edi. Endi u
   * ombor menejerida bor. Assimetriya SAQLANADI: omborchi bog'laydi/sanaydi,
   * lekin CHIQARA olmaydi (yuqoridagi test) — bu ikki qator birga o'qiladi.
   */
  it('ombor menejeri chiqara OLADI (`store.update` = ALL), omborchi — YO`Q', () => {
    expect(scopeOf('warehouse_manager', 'store', 'update')).toBe('ALL');
    expect(scopeOf('storekeeper', 'store', 'update')).toBe('NO');
  });

  /**
   * Q2 grant'i `['store', 'cashdesk']` juftligidan AJRATILDI — `cashdesk`
   * yozuv huquqini yo'l-yo'lakay olib qo'ymasligi kerak (kassa entity'si bu
   * qarorning doirasida emas).
   */
  it('Q2 kassani yon ta`sir sifatida OCHMAYDI', () => {
    expect(scopeOf('warehouse_manager', 'cashdesk', 'update')).toBe('NO');
  });

  /**
   * Review 2026-08-10 — ZAXIRA YO'L teshigi. `GET admin/stores/cells/by-barcode`
   * da `@RequirePermission` UMUMAN yo'q edi: u yacheykani AKKAUNT BO'YLAB topib,
   * tarkibi va qoldig'i bilan qaytaradi, ya'ni yuqoridagi `storecell.view`
   * qulflarini bitta shtrix-kod bilan chetlab o'tsa bo'lardi. Ikkala oyna ham
   * (kartochka yuklangandan KEYIN yaratilgan yacheyka uchun) aynan shu yo'ldan
   * yuradi, shuning uchun u `view` darajasida turadi — `update` emas.
   */
  it('cellByBarcode — storecell.view (ruxsatsiz zaxira yo`l qolmaydi)', () => {
    expect(permOf('cellByBarcode')).toEqual({ entity: 'storecell', action: 'view' });
  });

  /**
   * Tarkibiy qo'riqchi: yuqoridagi ro'yxat QO'LDA yuritiladi, ya'ni yangi
   * yacheyka marshruti qo'shilib, ruxsati unutilsa hech narsa yiqilmasdi
   * (aynan `cells/by-barcode` bilan bo'lgan hodisa). Bu test marshrut yo'lida
   * «cell» bor HAR BIR handlerni Nest metadatasidan topadi va har birida
   * ruxsat deklaratsiyasi borligini talab qiladi.
   */
  it('yo`lida «cell» bor HAR BIR marshrutda ruxsat deklaratsiyasi bor', () => {
    const proto = StoreController.prototype as Record<string, unknown>;
    const cellRoutes = Object.getOwnPropertyNames(proto).filter((m) => {
      if (m === 'constructor') return false;
      const handler = proto[m];
      if (typeof handler !== 'function') return false;
      const path = Reflect.getMetadata('path', handler) as unknown;
      return typeof path === 'string' && path.toLowerCase().includes('cell');
    });
    // Ro'yxat bo'sh chiqsa test VAKUUM bo'lardi (metadata kaliti o'zgargan…).
    expect(cellRoutes.length).toBeGreaterThan(5);
    for (const m of cellRoutes) {
      expect(permOf(m as keyof StoreController), `${m} — ruxsatsiz marshrut`).toBeDefined();
    }
  });

  it('zona/yacheyka KONFIGURATSIYASI store.update da qoladi (omborchiga emas)', () => {
    expect(permOf('createZone')).toEqual({ entity: 'store', action: 'update' });
    expect(permOf('updateCell')).toEqual({ entity: 'store', action: 'update' });
  });
});
