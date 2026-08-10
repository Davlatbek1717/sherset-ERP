import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import type { PermissionsService } from '../../permissions/permissions.service.js';
import type { PermissionScope } from '../../permissions/permissions.types.js';
import { HrPermissionGuard } from './hr-permission.guard.js';

/**
 * HrPermissionGuard lock.
 *
 * MASTER-TODO #20: this suite was written against the OLD synchronous guard
 * (`canActivate(ctx): boolean`, Reflector-only constructor). The guard has
 * since become async and gained a second dependency, because of the 2026-07-16
 * settings-«Сотрудники» rule: the employee catalog is also the access-admin
 * surface, so a CORE-RBAC administrator must reach `/hr/employees` even with
 * zero HR page-keys — and that check (`permissions.resolveScope`) is async.
 *
 * The stale suite failed 11/11 (`expected Promise{…} to be true`), which meant
 * the HR authorization guard was effectively UNTESTED. Updated here to await
 * the guard and to inject a PermissionsService stub — plus new coverage for
 * the employees-fallback branch itself, which had none.
 */

function makeCtx(user: AuthenticatedUser | null) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as Parameters<HrPermissionGuard['canActivate']>[0];
}

function makeReflector(meta: unknown): Reflector {
  return { get: () => meta } as unknown as Reflector;
}

/** `resolveScope` stub — defaults to NO (no core-RBAC rights). */
function makePermissions(scope: PermissionScope = 'NO'): PermissionsService {
  return {
    resolveScope: async () => scope,
  } as unknown as PermissionsService;
}

function makeGuard(meta: unknown, scope: PermissionScope = 'NO') {
  return new HrPermissionGuard(makeReflector(meta), makePermissions(scope));
}

const baseUser: AuthenticatedUser = {
  sub: 'e1',
  accountId: 'a1',
  email: 'x@y.uz',
  name: 'X',
  username: null,
  hrRoles: [],
  isChecker: false,
  hrPermissions: [],
};

describe('HrPermissionGuard', () => {
  it('returns true when no metadata (non-HR endpoint)', async () => {
    const guard = makeGuard(undefined);
    await expect(guard.canActivate(makeCtx(baseUser))).resolves.toBe(true);
  });

  it('throws when user is missing', async () => {
    const guard = makeGuard({ page: 'messages', access: 'read' });
    await expect(guard.canActivate(makeCtx(null))).rejects.toThrow(ForbiddenException);
  });

  it('admin bypasses any requirement', async () => {
    const guard = makeGuard({ page: 'messages', access: 'full' });
    await expect(guard.canActivate(makeCtx({ ...baseUser, hrRoles: ['admin'] }))).resolves.toBe(
      true,
    );
  });

  it('non-admin with matching full permission passes', async () => {
    const guard = makeGuard({ page: 'messages', access: 'full' });
    await expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'full' }],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('non-admin with only read fails when full required', async () => {
    const guard = makeGuard({ page: 'messages', access: 'full' });
    await expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }],
        }),
      ),
    ).rejects.toThrow(/insufficient/);
  });

  it('non-admin with read passes when read required', async () => {
    const guard = makeGuard({ page: 'messages', access: 'read' });
    await expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('own_only passes when own_only required', async () => {
    const guard = makeGuard({ page: 'messages', access: 'own_only' });
    await expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'own_only' }],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('full grants own_only-required endpoint', async () => {
    const guard = makeGuard({ page: 'messages', access: 'own_only' });
    await expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'full' }],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('section-specific permission required when metadata has section', async () => {
    const guard = makeGuard({ page: 'messages', access: 'read', section: 'messages:demand' });
    await expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }],
        }),
      ),
    ).rejects.toThrow(/required/);
  });

  it('section match passes', async () => {
    const guard = makeGuard({ page: 'messages', access: 'read', section: 'messages:demand' });
    await expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: 'messages:demand', accessLevel: 'read' }],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('different page permission does not satisfy', async () => {
    const guard = makeGuard({ page: 'oylik', access: 'read' });
    await expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'full' }],
        }),
      ),
    ).rejects.toThrow(/required/);
  });
});

describe('HrPermissionGuard — core-RBAC fallback on «employees» (2026-07-16)', () => {
  it('core-RBAC rights on the `employee` entity open /hr/employees without HR keys', async () => {
    const guard = makeGuard({ page: 'employees', access: 'read' }, 'ALL');
    await expect(guard.canActivate(makeCtx(baseUser))).resolves.toBe(true);
  });

  it('…but scope NO still rejects', async () => {
    const guard = makeGuard({ page: 'employees', access: 'read' }, 'NO');
    await expect(guard.canActivate(makeCtx(baseUser))).rejects.toThrow(/required/);
  });

  it('the fallback is scoped to «employees» ONLY — other pages stay HR-gated', async () => {
    // Same all-powerful core-RBAC scope, different page → must still throw.
    const guard = makeGuard({ page: 'oylik', access: 'read' }, 'ALL');
    await expect(guard.canActivate(makeCtx(baseUser))).rejects.toThrow(/required/);
  });

  /**
   * KPI-06 brauzer-QA (2026-08-10) — o'lchangan teshik.
   *
   * Fallback `scope !== 'NO'` deb yozilgan edi, lekin uning HUJJATLANGAN
   * maqsadi «core-RBAC **administrator/egasi**» — ya'ni `ALL`. Oraliq
   * qamrovlar (`OWN`, `OWN_GROUP`, `OWN_AND_GROUP`) — bu «faqat o'zimning /
   * guruhimning yozuvim» degani, «hamma xodim» EMAS.
   *
   * Jonli o'lchov: `qa.sotuvchi@qa.local` (hrPermissions `[]`, core-RBAC
   * `employee.update = OWN_GROUP`) yangi KPI marshrutlarida **200/201** oldi va
   * o'z guruhidan TASHQARIDAGI xodimga (Admin User) KPI yaratdi. KPI-02
   * controlleri o'qishni ataylab `employees:full` ortiga yopgan — chunki
   * ro'yxat boshqa xodimning FAKTINI ham beradi; fallback o'sha qulfni
   * aylanib o'tardi.
   *
   * Eski testlar faqat `ALL` va `NO` ni qoplagan — oraliq qamrovlar hech
   * qachon o'lchanmagan (aynan shu bo'shliqda bug yashagan).
   */
  it.each(['OWN', 'OWN_GROUP', 'OWN_AND_GROUP'] as const)(
    'qamrov %s — fallback OCHMAYDI (u «administrator» emas)',
    async (scope) => {
      const guard = makeGuard({ page: 'employees', access: 'full' }, scope);
      await expect(guard.canActivate(makeCtx(baseUser))).rejects.toThrow(/required/);
    },
  );

  it('«read» uchun ham oraliq qamrov yetarli emas', async () => {
    const guard = makeGuard({ page: 'employees', access: 'read' }, 'OWN_GROUP');
    await expect(guard.canActivate(makeCtx(baseUser))).rejects.toThrow(/required/);
  });
});
