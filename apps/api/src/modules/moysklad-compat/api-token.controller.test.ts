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
import { ApiTokenController } from './api-token.controller.js';
import { COMPAT_SLUGS } from './compat-slugs.js';

/**
 * Faza Q14 — `/settings/api-tokens` sahifasining SERVER tomoni.
 *
 * FE'da tugmani yashirish qulf EMAS (`use-permissions.ts` o'zi ham
 * «fail-open by design» deb yozadi) — token berish/bekor qilish akkauntga
 * to'liq kirish beradigan amal, shuning uchun har handler'da haqiqiy
 * `PermissionsGuard` tekshiruvi bo'lishi shart. Bu fayl Faza Q10 naqshini
 * takrorlaydi: HAQIQIY guard + HAQIQIY Reflector + controller prototipidagi
 * HAQIQIY handler orqali («metadata yozilgan-u o'qilmaydi» holati ham
 * tutiladi).
 */

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
    url: '/api/v1/admin/api-tokens',
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

const ADMIN: Record<string, PermissionScope> = {
  'settings.view': 'ALL',
  'settings.create': 'ALL',
  'settings.delete': 'ALL',
};

/** [nom, handler, entity, action] */
const CLOSED: Array<[string, unknown, string, string]> = [
  ['GET /admin/api-tokens', ApiTokenController.prototype.list, 'settings', 'view'],
  ['GET /admin/api-tokens/scopes', ApiTokenController.prototype.scopes, 'settings', 'view'],
  ['POST /admin/api-tokens', ApiTokenController.prototype.create, 'settings', 'create'],
  ['DELETE /admin/api-tokens/:id', ApiTokenController.prototype.revoke, 'settings', 'delete'],
];

describe('ApiTokenController — ruxsat qulfi (Faza Q14)', () => {
  for (const [name, handler, entity, action] of CLOSED) {
    it(`${name} — @RequirePermission(${entity}.${action}) metadatasi bor`, () => {
      expect(permissionOf(handler)).toMatchObject({ entity, action });
    });

    it(`${name} — ruxsatsiz xodim uchun 403`, async () => {
      await expect(guardFor({}).canActivate(ctxFor(handler))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it(`${name} — sozlamalar ruxsati bor admin uchun o'tadi`, async () => {
      await expect(guardFor(ADMIN).canActivate(ctxFor(handler))).resolves.toBe(true);
    });
  }
});

describe('ApiTokenController.scopes — scope-UI uchun reyestr', () => {
  it('compat slug ro`yxatini qaytaradi (UI checkbox-matritsasi shu ro`yxatdan)', () => {
    const ctrl = new ApiTokenController({} as never);
    const res = ctrl.scopes();
    expect(res.slugs).toEqual([...COMPAT_SLUGS]);
    expect(res.actions).toEqual(['read', 'write']);
  });
});
