import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_META,
  type RequiredPermission,
} from '../permissions/require-permission.decorator.js';
import { GroupController } from './group.controller.js';

/**
 * AUTH-07 — «Отделы» (Group) mutatsiyalari faqat `JwtAuthGuard` bilan yopilgan edi:
 * PermissionsGuard `@RequirePermission` metadatasi bo'lmasa o'tkazib yuboradi
 * (`permissions.guard.ts` — opt-in), demak HAR autentifikatsiyalangan xodim
 * (oddiy sotuvchi ham) bo'lim yaratishi/o'chirishi mumkin edi. Group har hujjatning
 * «Доступ»/egalik-bo'limi ostida turadi ⇒ record-scope'ga bilvosita ta'sir.
 *
 * Bu test guard metadatasini tekshiradi — u yechilsa PermissionsGuard yana jim o'tkazadi.
 */
function permissionOf(handler: unknown): RequiredPermission | undefined {
  return Reflect.getMetadata(PERMISSION_META, handler as object) as RequiredPermission | undefined;
}

describe('GroupController — mutatsiyalar ruxsat bilan yopilgan (AUTH-07)', () => {
  it('POST /groups → settings.create talab qiladi', () => {
    expect(permissionOf(GroupController.prototype.create)).toEqual({
      entity: 'settings',
      action: 'create',
    });
  });

  it('PATCH /groups/:id → settings.update talab qiladi', () => {
    expect(permissionOf(GroupController.prototype.update)).toEqual({
      entity: 'settings',
      action: 'update',
    });
  });

  it('DELETE /groups/:id → settings.delete talab qiladi', () => {
    expect(permissionOf(GroupController.prototype.delete)).toEqual({
      entity: 'settings',
      action: 'delete',
    });
  });

  it('GET /groups ataylab ochiq qoladi — ko`plab picker`lar o`qiydi', () => {
    expect(permissionOf(GroupController.prototype.list)).toBeUndefined();
  });
});
