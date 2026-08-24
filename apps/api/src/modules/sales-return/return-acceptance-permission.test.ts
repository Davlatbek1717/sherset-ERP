import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { PermissionsGuard } from '../permissions/permissions.guard.js';
import { type PermissionScope, isAtLeast } from '../permissions/permissions.types.js';
import {
  PERMISSION_META,
  type RequiredPermission,
} from '../permissions/require-permission.decorator.js';
import { type RoleTemplateSlug, resolveTemplateMatrix } from '../permissions/role-templates.js';
import { TOPUP_ENTITIES } from '../permissions/template-topup.js';
import { SalesReturnAcceptanceController } from './sales-return-acceptance.controller.js';
import { SalesReturnController } from './sales-return.controller.js';

/**
 * G3 — VOZVRAT QABULI RUXSAT SHARTNOMASI (2026-08-24).
 *
 * Ikki qoidani bir joyda qulflaydi (`retail-sale-lifecycle-permissions.test.ts`
 * naqshi: HAQIQIY guard + HAQIQIY matritsa):
 *
 *  1. **Qabul — faqat KATTA omborchi.** Oqim ВП hujjatini yaratib
 *     O'TKAZADI: mijoz balansiga kredit yozadi va (G1 orqali) kassadan pul
 *     chiqishiga yo'l ochadi. Oddiy omborchi (`storekeeper`) buni qila
 *     olmasligi SHART. Shu bilan birga katta omborchiga umumiy
 *     `salesreturn.create/approve` ham BERILMAYDI — u butun `/sales-returns`
 *     modulini (mass-edit, delete, ixtiyoriy narxda hujjat) ochib yuborardi.
 *
 *  2. **Kirim narxi — faqat katta omborchida.** Egasining qoidasi (reja
 *     1-bo'lim): «Ombor xodimlari narx ko'rmaydi; kirim narxi faqat katta
 *     omborchiga». Ta'minot hujjati (`supply`) aynan kirim narxini ko'rsatadi.
 */

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
    { verifyAccessToken: async () => ({ sub: 'emp-1', accountId: 'acc-1' }) } as never,
  );
}

function ctxFor(handler: unknown) {
  const req = {
    headers: { authorization: 'Bearer tok-1' },
    url: '/api/v1/sales-returns/acceptance/targets',
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

async function allows(slug: RoleTemplateSlug, handler: unknown): Promise<boolean> {
  try {
    await guardFor(scopesOfTemplate(slug)).canActivate(ctxFor(handler));
    return true;
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
}

const A = SalesReturnAcceptanceController.prototype;
const ACCEPTANCE: Array<[step: string, handler: unknown]> = [
  ['targets (omborlar/BRAK)', A.targets],
  ['receipts (chek qidiruvi)', A.receipts],
  ['source (qaytariladigan qatorlar)', A.source],
  ['accept (hujjat yaratish)', A.accept],
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Qabul oqimi — entity va rollar
// ─────────────────────────────────────────────────────────────────────────────

describe('G3 — qabul oqimi `returnacceptance` entity ostida', () => {
  it("o'qish endpointlari view, qabulning o'zi create", () => {
    expect(permissionOf(A.targets)).toEqual({ entity: 'returnacceptance', action: 'view' });
    expect(permissionOf(A.receipts)).toEqual({ entity: 'returnacceptance', action: 'view' });
    expect(permissionOf(A.source)).toEqual({ entity: 'returnacceptance', action: 'view' });
    expect(permissionOf(A.accept)).toEqual({ entity: 'returnacceptance', action: 'create' });
  });

  it.each(ACCEPTANCE)('katta omborchi (warehouse_manager): %s — ruxsat bor', async (_s, h) => {
    expect(await allows('warehouse_manager', h)).toBe(true);
  });

  it.each(ACCEPTANCE)('oddiy omborchi (storekeeper): %s — YO‘Q', async (_s, h) => {
    expect(await allows('storekeeper', h)).toBe(false);
  });

  it.each(ACCEPTANCE)('kassir: %s — YO‘Q (qabul kiosk ishi emas)', async (_s, h) => {
    expect(await allows('cashier', h)).toBe(false);
  });

  it('admin/egasi qabul qila oladi (to‘liq matritsa)', async () => {
    expect(await allows('admin', A.accept)).toBe(true);
    expect(await allows('owner', A.accept)).toBe(true);
  });

  it('zanjirda uzilish yo‘q — katta omborchi chekdan hujjatgacha o‘tadi', async () => {
    const blocked: string[] = [];
    for (const [step, handler] of ACCEPTANCE) {
      if (!(await allows('warehouse_manager', handler))) blocked.push(step);
    }
    expect(blocked, "katta omborchi uchun yopiq bo'g'in — qabul shu yerda to'xtaydi").toEqual([]);
  });
});

/**
 * Tor entity'ning MA'NOSI: qabul ochilgani bilan umumiy vozvrat moduli
 * ochilmaydi. Bu shunchaki «yana bir tekshiruv» emas — kimdir
 * `returnacceptance` o'rniga `salesreturn.create/approve` bersa, katta
 * omborchi ixtiyoriy narx bilan hujjat yaratib, uni mass-edit qilib,
 * o'chira oladigan bo'lardi.
 */
describe('G3 — qabul umumiy `/sales-returns` modulini OCHMAYDI', () => {
  const S = SalesReturnController.prototype;

  it('katta omborchi ВП ro‘yxatini/kartasini KO‘RADI (READ_ONLY_BASE)', async () => {
    expect(await allows('warehouse_manager', S.list)).toBe(true);
    expect(await allows('warehouse_manager', S.findById)).toBe(true);
  });

  it.each([
    ['create (qo‘lda hujjat)', S.create],
    ['transition (post/unpost/cancel)', S.transition],
    ['delete', S.delete],
    ['massEdit', S.massEdit],
  ])('katta omborchi: %s — YO‘Q', async (_s, h) => {
    expect(await allows('warehouse_manager', h)).toBe(false);
  });

  it('oddiy omborchi ВП modulida umuman yo‘q', async () => {
    expect(await allows('storekeeper', S.list)).toBe(false);
    expect(await allows('storekeeper', S.create)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Kirim narxi ko'rinishi (reja 4-vazifa)
// ─────────────────────────────────────────────────────────────────────────────

describe('G3 — kirim narxi FAQAT katta omborchida (`supply`)', () => {
  it('katta omborchi ta‘minot hujjatini ko‘radi (kirim narxi unga ochiq)', () => {
    expect(scopesOfTemplate('warehouse_manager')['supply.view']).toBe('ALL');
  });

  /**
   * 🔴 Bu qator 2026-08-24 gacha `storekeeper` da BOR edi
   * («qabulni ko'radi va yopadi»), ya'ni oddiy omborchi ta'minot hujjati
   * orqali KIRIM NARXINI ko'rardi — egasining qoidasiga zid. Olib tashlandi.
   */
  it('oddiy omborchida `supply` bo‘yicha BIRORTA ham musbat katakcha yo‘q', () => {
    const scopes = scopesOfTemplate('storekeeper');
    const positive = Object.entries(scopes)
      .filter(([k, v]) => k.startsWith('supply.') && v !== 'NO')
      .map(([k, v]) => `${k}=${v}`);
    expect(positive, 'omborchi kirim narxini ko‘rmasligi kerak').toEqual([]);
  });

  it('boshqa xarid hujjatlari ham oddiy omborchida yopiq (narx qatlami)', () => {
    const scopes = scopesOfTemplate('storekeeper');
    for (const entity of ['purchaseorder', 'invoicein', 'purchasereturn', 'facturein']) {
      expect(scopes[`${entity}.view`] ?? 'NO').toBe('NO');
    }
  });

  it('omborchining O‘Z ishi ochiq qoladi (yacheyka, inventarizatsiya, yig‘ish)', () => {
    const scopes = scopesOfTemplate('storekeeper');
    expect(scopes['storecell.update']).toBe('ALL');
    expect(scopes['inventory.create']).toBe('ALL');
    expect(scopes['retailsale.update']).toBe('ALL');
    expect(scopes['label.print']).toBe('ALL');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Topup — jonli rollarga yetib borishi
// ─────────────────────────────────────────────────────────────────────────────

describe('G3 — `returnacceptance` jonli rollarga topup bilan yetadi', () => {
  /**
   * ⚠️ Bu assert PRODDA topup yugurtirilgach OLIB TASHLANADI (template-topup
   * qoidasi: eski entity ro'yxatda qolsa «tiriltirish» xavfi qaytadi).
   */
  it('TOPUP_ENTITIES ro‘yxatida (hozircha)', () => {
    expect(TOPUP_ENTITIES).toContain('returnacceptance');
  });
});
