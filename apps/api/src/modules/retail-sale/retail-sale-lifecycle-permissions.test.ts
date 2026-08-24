import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { isKioskAllowed } from '../auth/kiosk-policy.js';
import { PermissionsGuard } from '../permissions/permissions.guard.js';
import { type PermissionScope, isAtLeast } from '../permissions/permissions.types.js';
import {
  PERMISSION_META,
  type RequiredPermission,
} from '../permissions/require-permission.decorator.js';
import { type RoleTemplateSlug, resolveTemplateMatrix } from '../permissions/role-templates.js';
import { RetailSaleController } from './retail-sale.controller.js';

/**
 * P3 — CHEK HAYOT SIKLI RUXSAT SHARTNOMASI (2026-08-12).
 *
 * 🔴 NEGA BU FAYL BOR — o'lchangan prod hodisasi, taxmin emas.
 *
 * 2026-08-12 da prodda: Kassir 1 va Kassir 2 da 4 ta chek `picking` holatida
 * qotgan, `posted` = 0, `sales_count` = 0. Sabab «omborchi yo'q» deb
 * o'ylanardi. Jonli probe (mavjud bo'lmagan UUID bilan, yozuvsiz) boshqasini
 * ko'rsatdi:
 *
 *   Kassir 1 → POST /retail-sales/<id>/post   → 403 «retailsale.approve
 *                                                uchun kamida OWN kerak (sizda: NO)»
 *   Kassir 1 → POST /retail-sales/<id>/cancel → 403 (aynan shu)
 *
 * Ya'ni kassir chekni yaratardi va yig'ishga yuborardi, lekin uni na TO'LAY,
 * na BEKOR QILA olardi — savdo zanjiri oxirida devor turardi va chek abadiy
 * osilib qolardi. Hech bir mavjud gate buni ko'rmadi: shablon o'z ichida
 * izchil edi, kiosk marshruti ochiq edi, hamma unit test yashil edi. Yetmagan
 * narsa — ROL MATRITSASI va ENDPOINT TALABINI BIR JOYDA solishtiruvchi
 * tekshiruv.
 *
 * Shu fayl aynan shuni qiladi: HAQIQIY `PermissionsGuard` + HAQIQIY
 * `Reflector` + controller prototipidagi HAQIQIY handler, shablondan
 * hisoblangan HAQIQIY matritsa bilan. Ya'ni «qog'ozda ruxsat bor-u amalda
 * 403» holati bu yerda qizil bo'ladi (`mutation-guard-coverage.test.ts`
 * naqshi).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Yordamchilar — haqiqiy guard, soxta faqat `require` hisoblagichi
// ─────────────────────────────────────────────────────────────────────────────

/** Shablondan `entity.action → scope` xaritasi (matritsaning O'ZI, qo'lda emas). */
function scopesOfTemplate(slug: RoleTemplateSlug): Record<string, PermissionScope> {
  const out: Record<string, PermissionScope> = {};
  for (const { entity, action, scope } of resolveTemplateMatrix(slug)) {
    out[`${entity}.${action}`] = scope;
  }
  return out;
}

function guardFor(scopes: Record<string, PermissionScope>) {
  const permissions = {
    require: async (
      _employeeId: string,
      entity: string,
      action: string,
      requiredScope: PermissionScope = 'OWN',
    ) => {
      const scope = scopes[`${entity}.${action}`] ?? 'NO';
      if (!isAtLeast(scope, requiredScope)) {
        throw new ForbiddenException(`Ruxsat yo'q: ${entity}.${action} (sizda: ${scope})`);
      }
      return scope;
    },
  };
  return new PermissionsGuard(
    new Reflector() as never,
    permissions as never,
    {
      verifyAccessToken: async () => ({ sub: 'emp-1', accountId: 'acc-1' }),
    } as never,
  );
}

function ctxFor(handler: unknown) {
  const req = {
    headers: { authorization: 'Bearer tok-1' },
    url: '/api/v1/retail-sales',
    user: { sub: 'emp-1', accountId: 'acc-1' },
  };
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

function permissionOf(handler: unknown): RequiredPermission | undefined {
  return Reflect.getMetadata(PERMISSION_META, handler as object) as RequiredPermission | undefined;
}

/** Chek hayot siklining har bo'g'ini: [nom, handler, kiosk yo'li]. */
const C = RetailSaleController.prototype;
const LIFECYCLE: Array<[step: string, handler: unknown, route: string]> = [
  ['create (savat → chek)', C.create, '/retail-sales'],
  ['send-to-picking (omborchiga)', C.sendToPicking, '/retail-sales/x/send-to-picking'],
  ['mark-ready (tayyor)', C.markReady, '/retail-sales/x/mark-ready'],
  ['post (to‘lov)', C.post, '/retail-sales/x/post'],
  ['cancel (bekor qilish)', C.cancel, '/retail-sales/x/cancel'],
];

async function allows(slug: RoleTemplateSlug, handler: unknown): Promise<boolean> {
  try {
    await guardFor(scopesOfTemplate(slug)).canActivate(ctxFor(handler));
    return true;
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. KASSIR — zanjirni BOSHIDAN OXIRIGACHA o'tkaza olishi SHART
// ─────────────────────────────────────────────────────────────────────────────

describe('P3 — kassir chek zanjirini oxirigacha o‘tkazadi', () => {
  it.each(LIFECYCLE)('kassir: %s — ruxsat bor', async (_step, handler) => {
    expect(await allows('cashier', handler)).toBe(true);
  });

  /**
   * Bu — yuqoridagi `it.each` ning takrori EMAS. U har bo'g'inni ALOHIDA
   * tekshiradi va bittasi tushib qolsa ham qolganlari yashil qoladi; bu esa
   * ZANJIR sifatida qulflaydi: «bironta bo'g'in yopiq» = savdo tugamaydi.
   * Xabar aynan shu jumlani chiqaradi, chunki qizil testni o'qiyotgan odam
   * uchun muhimi — qaysi bo'g'in savdoni to'xtatgani.
   */
  it('zanjirda birorta ham uzilish yo‘q (prod 2026-08-12 hodisasi)', async () => {
    const blocked: string[] = [];
    for (const [step, handler] of LIFECYCLE) {
      if (!(await allows('cashier', handler))) blocked.push(step);
    }
    expect(blocked, "kassir uchun yopiq bo'g'in — chek shu yerda qotadi").toEqual([]);
  });

  it('har bo‘g‘in kiosk marshrutida ham ochiq (ikkinchi qatlam)', () => {
    // Ruxsat matritsasi va kiosk allowlist — IKKI mustaqil qulf. Biri ochiq,
    // ikkinchisi yopiq bo'lsa kassir baribir 403 oladi.
    for (const [step, , route] of LIFECYCLE) {
      expect(isKioskAllowed('POST', route), `${step} → POST ${route}`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. QAYTARISH — kassirga OCHIQ (F6: 2026-08-12 qarori 2026-08-13 da BEKOR)
// ─────────────────────────────────────────────────────────────────────────────

describe('F6 — qaytarish kassirga ochiq (alohida ruxsatda)', () => {
  /**
   * Tarix, chunki bu katakcha ikki marta ag'darilgan:
   *  · 2026-08-12 (P3): «kassadan pul chiqishi menejer qarori» — refund
   *    `retailsale.approve` dan `salesreturn.create` ga ko'chirildi va
   *    kassirga BERILMADI (shu faylda «kassir qaytara olmaydi» qulflangan edi).
   *  · 2026-08-13 (F6): egasi o'sha qarorni BEKOR qildi — «kassir istalgan
   *    chekga vozvrat qilishi kerak». Endi cashier shablonida
   *    `salesreturn.view/create = ALL`.
   *
   * `salesreturn.create` ga KO'CHIRISH esa amal qiladi: refund alohida
   * katakchada turgani uchun uni rolga berish/olish `post`/`cancel` ga
   * tegmaydi. Kimdir refund'ni `retailsale.approve` ga qaytarsa, bu boshqaruv
   * nuqtasi yo'qoladi — birinchi test shuni qulflaydi.
   */
  it('refund `retailsale.approve` da EMAS — alohida boshqaruv nuqtasi', () => {
    const req = permissionOf(C.refund);
    expect(req).toEqual({ entity: 'salesreturn', action: 'create' });
  });

  it('kassir qaytara oladi (F6, egasi 2026-08-13)', async () => {
    expect(await allows('cashier', C.refund)).toBe(true);
  });

  it('admin va menejer qaytara oladi', async () => {
    expect(await allows('admin', C.refund)).toBe(true);
    expect(await allows('sales_manager', C.refund)).toBe(true);
  });

  it('refund kiosk marshrutida ham ochiq (ikkinchi qatlam)', () => {
    // Ruxsat berildi-yu KioskGuard yopiq bo'lsa — kassir baribir 403 olardi.
    expect(isKioskAllowed('POST', '/retail-sales/x/refund')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. OMBORCHI — yig'adi, lekin PUL OLMAYDI
// ─────────────────────────────────────────────────────────────────────────────

describe('P3 — omborchi chekni yig‘adi, pulga tegmaydi', () => {
  /**
   * Prodda `storekeeper` shablonida `retailsale` UMUMAN yo'q edi: omborchi
   * `mark-ready` bosganda 403 olardi va yig'ish zanjirining o'rtasi uzilgan
   * turardi (kassir o'zi «tayyor» qilishidan boshqa yo'l yo'q edi).
   */
  it('omborchi «tayyor» qila oladi', async () => {
    expect(await allows('storekeeper', C.markReady)).toBe(true);
  });

  it('omborchi yig‘iladigan cheklarni ko‘radi', async () => {
    expect(await allows('storekeeper', C.list)).toBe(true);
  });

  it.each([
    ['post (to‘lov)', C.post],
    ['cancel (bekor qilish)', C.cancel],
    ['refund (qaytarish)', C.refund],
  ])('omborchi %s qila OLMAYDI', async (_step, handler) => {
    expect(await allows('storekeeper', handler)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. G2 — KONTROL: faqat KATTA omborchi (egasi qoidasi, 2026-08-23)
// ─────────────────────────────────────────────────────────────────────────────

describe('G2 — kontrol oqimi ruxsatlari (`retailcontrol`)', () => {
  const CONTROL: Array<[step: string, handler: unknown]> = [
    ['control-queue (navbat)', C.controlQueue],
    ['control-approve («To‘liq»)', C.controlApprove],
    ['control-edit (tarkib tahriri)', C.controlEdit],
  ];

  /**
   * Endpointlar `retailsale` EMAS, alohida `retailcontrol` ostida — chunki
   * `retailsale.view/update` oddiy omborchida HAM bor (u «tayyor» bosadi),
   * kontrol esa faqat katta omborchiniki. Kimdir buni `retailsale` ga
   * qaytarsa, storekeeper o'z ishini o'zi «qabul qilib» yuborar edi.
   */
  it('uchala endpoint ham `retailcontrol` entity ostida', () => {
    expect(permissionOf(C.controlQueue)).toEqual({ entity: 'retailcontrol', action: 'view' });
    expect(permissionOf(C.controlApprove)).toEqual({ entity: 'retailcontrol', action: 'update' });
    expect(permissionOf(C.controlEdit)).toEqual({ entity: 'retailcontrol', action: 'update' });
  });

  it.each(CONTROL)('katta omborchi (warehouse_manager): %s — ruxsat bor', async (_s, handler) => {
    expect(await allows('warehouse_manager', handler)).toBe(true);
  });

  it.each(CONTROL)('oddiy omborchi (storekeeper): %s — YO‘Q', async (_s, handler) => {
    expect(await allows('storekeeper', handler)).toBe(false);
  });

  it.each(CONTROL)('kassir: %s — YO‘Q (kontrol kiosk ishi emas)', async (_s, handler) => {
    expect(await allows('cashier', handler)).toBe(false);
  });

  it('admin/egasi kontrolni ko‘ra oladi (to‘liq matritsa)', async () => {
    expect(await allows('admin', C.controlApprove)).toBe(true);
    expect(await allows('owner', C.controlEdit)).toBe(true);
  });
});
