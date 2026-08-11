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
// 2. QAYTARISH — kassirga ATAYLAB YOPIQ (egasi qarori 2026-08-12)
// ─────────────────────────────────────────────────────────────────────────────

describe('P3 — qaytarish kassirga ochilmaydi', () => {
  /**
   * `post`/`cancel` ni ochish uchun kassirga `retailsale.approve` berildi.
   * Qaytarish AYNI ruxsatda o'tirgan edi, ya'ni bu o'zgarish kassadan PUL
   * CHIQARISHNI ham jimgina ochib yuborardi. Shuning uchun `refund`
   * `salesreturn.create` ga ko'chirildi. Bu test — o'sha ko'chirishning
   * qulfi: kimdir uni `retailsale.approve` ga qaytarsa, qaytarish kassirga
   * JIM ochiladi va hech narsa qizarmasdi.
   */
  it('refund `retailsale.approve` da EMAS', () => {
    const req = permissionOf(C.refund);
    expect(req).toEqual({ entity: 'salesreturn', action: 'create' });
  });

  it('kassir qaytara olmaydi', async () => {
    expect(await allows('cashier', C.refund)).toBe(false);
  });

  it('admin va menejer qaytara oladi', async () => {
    expect(await allows('admin', C.refund)).toBe(true);
    expect(await allows('sales_manager', C.refund)).toBe(true);
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
