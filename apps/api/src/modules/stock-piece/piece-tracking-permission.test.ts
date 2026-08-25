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
import { StockPieceController } from './stock-piece.controller.js';

/**
 * K2 — BO'LAK REYESTRI RUXSAT SHARTNOMASI (2026-08-25).
 *
 * `return-acceptance-permission.test.ts` naqshi: HAQIQIY guard + HAQIQIY
 * matritsa (mock matritsa hech nimani isbotlamasdi).
 *
 * Uch qoidani qulflaydi:
 *
 *  1. **Reyestrni faqat KATTA omborchi yozadi** (K-Q9). Reyestr ombordagi
 *     jismoniy holatning ta'rifi: kim qo'shdi, kim yopdi — aniq bo'lishi
 *     kerak. Oddiy omborchi (`storekeeper`) uni O'ZGARTIRA olmaydi. Kesim
 *     OQIMI (K4) unga picking topshirig'i ichida ochiladi — o'sha faza bu
 *     qatorni qayta ko'rib chiqadi.
 *  2. **Sverka hisoboti — boshqa entity** (`report.view`, K1). U mavjud
 *     hisobotlar bilan bir sirtda va faqat O'QIYDI; reyestr yozuvchilariga
 *     bog'lab qo'yilsa buxgalter hisobotni ko'ra olmasdi.
 *  3. **Yangi entity jonli rollarga topup bilan yetadi** — aks holda ekran
 *     hech kimda ochilmasdi (G2/G3 sabog'i).
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
    url: '/api/v1/stock-pieces',
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

const C = StockPieceController.prototype;

const WRITES: Array<[step: string, handler: unknown]> = [
  ["qo'shish (bo'lak / butun rulon)", C.create],
  ['uzunlikni tuzatish / ko`chirish', C.update],
  ['«tugadi» — yopish', C.close],
  ['bayroq (pieceTracked)', C.setFlag],
];

const READS: Array<[step: string, handler: unknown]> = [
  ['reyestr ro`yxati', C.list],
  ['yorliq skaneri (lookup)', C.lookup],
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Entity va amallar
// ─────────────────────────────────────────────────────────────────────────────

describe('K2 — reyestr yo`llari `piecetracking` entity ostida', () => {
  it("o'qish `view`, qo'shish `create`, tuzatish/yopish/bayroq `update`", () => {
    expect(permissionOf(C.list)).toEqual({ entity: 'piecetracking', action: 'view' });
    expect(permissionOf(C.lookup)).toEqual({ entity: 'piecetracking', action: 'view' });
    expect(permissionOf(C.create)).toEqual({ entity: 'piecetracking', action: 'create' });
    expect(permissionOf(C.update)).toEqual({ entity: 'piecetracking', action: 'update' });
    expect(permissionOf(C.close)).toEqual({ entity: 'piecetracking', action: 'update' });
    expect(permissionOf(C.setFlag)).toEqual({ entity: 'piecetracking', action: 'update' });
  });

  it('🔴 sverka hisoboti ATAYLAB boshqa entity — `report.view` (K1)', () => {
    expect(permissionOf(C.reconciliation)).toEqual({ entity: 'report', action: 'view' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Rollar
// ─────────────────────────────────────────────────────────────────────────────

describe('K2 — reyestrni faqat KATTA omborchi yozadi (K-Q9)', () => {
  it.each([...READS, ...WRITES])(
    'katta omborchi (warehouse_manager): %s — ruxsat bor',
    async (_s, h) => {
      expect(await allows('warehouse_manager', h)).toBe(true);
    },
  );

  it.each(WRITES)('🔴 oddiy omborchi (storekeeper): %s — YO‘Q', async (_s, h) => {
    expect(await allows('storekeeper', h)).toBe(false);
  });

  it.each(WRITES)('kassir: %s — YO‘Q (bo‘lak reyestri kiosk ishi emas)', async (_s, h) => {
    expect(await allows('cashier', h)).toBe(false);
  });

  it('admin/egasi to‘liq matritsa bilan yozadi', async () => {
    expect(await allows('admin', C.create)).toBe(true);
    expect(await allows('owner', C.setFlag)).toBe(true);
  });

  it('zanjirda uzilish yo‘q — katta omborchi qo‘shishdan yorliq skaneriga o‘tadi', async () => {
    const blocked: string[] = [];
    for (const [step, handler] of [...READS, ...WRITES]) {
      if (!(await allows('warehouse_manager', handler))) blocked.push(step);
    }
    expect(blocked, "katta omborchi uchun yopiq bo'g'in").toEqual([]);
  });
});

/**
 * Tor entity'ning MA'NOSI: reyestr ochilgani bilan qoldiq/yacheyka sirti
 * ochilmaydi. Kimdir `piecetracking` o'rniga `stock`/`storecell` ruxsatiga
 * osib qo'ysa, bo'lak kiritish huquqi butun ombor tuzilmasini tahrirlash
 * huquqiga aylanib ketardi.
 */
describe('K2 — reyestr qoldiq/yacheyka sirtini OCHMAYDI', () => {
  it('yo‘llarning birortasi ham `stock`/`storecell` entity`siga bog‘lanmagan', () => {
    for (const [, handler] of [...READS, ...WRITES]) {
      const p = permissionOf(handler);
      expect(p?.entity).toBe('piecetracking');
    }
  });

  it('oddiy omborchi o‘z ishini yo‘qotmadi (yacheyka, inventarizatsiya)', () => {
    const scopes = scopesOfTemplate('storekeeper');
    expect(scopes['storecell.update']).toBe('ALL');
    expect(scopes['inventory.create']).toBe('ALL');
  });

  it('katta omborchida `piecetracking` uchtala yozish amali ham ALL', () => {
    const scopes = scopesOfTemplate('warehouse_manager');
    expect(scopes['piecetracking.view']).toBe('ALL');
    expect(scopes['piecetracking.create']).toBe('ALL');
    expect(scopes['piecetracking.update']).toBe('ALL');
  });

  it('🔴 katta omborchida ham `piecetracking.delete` YO‘Q — bo‘lak o‘chirilmaydi, YOPILADI', () => {
    // Tarix zanjiri (`sourcePieceId`) uzilib qolmasligi uchun: «tugadi» =
    // `status='consumed'`, DELETE emas. Shuning uchun controller`da ham
    // `@Delete` yo'q.
    expect(scopesOfTemplate('warehouse_manager')['piecetracking.delete'] ?? 'NO').toBe('NO');
    expect(Object.getOwnPropertyNames(StockPieceController.prototype)).not.toContain('remove');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Topup — jonli rollarga yetib borishi
// ─────────────────────────────────────────────────────────────────────────────

describe('K2 — `piecetracking` jonli rollarga topup bilan yetadi', () => {
  /**
   * ⚠️ Bu assert PRODDA topup yugurtirilgach OLIB TASHLANADI (template-topup
   * qoidasi: eski entity ro'yxatda qolsa «tiriltirish» xavfi qaytadi).
   */
  it('TOPUP_ENTITIES ro‘yxatida (hozircha)', () => {
    expect(TOPUP_ENTITIES).toContain('piecetracking');
  });
});
