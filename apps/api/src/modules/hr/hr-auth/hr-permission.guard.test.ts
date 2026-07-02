import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { HrPermissionGuard } from './hr-permission.guard.js';

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
  it('returns true when no metadata (non-HR endpoint)', () => {
    const guard = new HrPermissionGuard(makeReflector(undefined));
    expect(guard.canActivate(makeCtx(baseUser))).toBe(true);
  });

  it('throws when user is missing', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'read' }));
    expect(() => guard.canActivate(makeCtx(null))).toThrow(ForbiddenException);
  });

  it('admin bypasses any requirement', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'full' }));
    expect(guard.canActivate(makeCtx({ ...baseUser, hrRoles: ['admin'] }))).toBe(true);
  });

  it('non-admin with matching full permission passes', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'full' }));
    expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'full' }],
        }),
      ),
    ).toBe(true);
  });

  it('non-admin with only read fails when full required', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'full' }));
    expect(() =>
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }],
        }),
      ),
    ).toThrow(/insufficient/);
  });

  it('non-admin with read passes when read required', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'read' }));
    expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }],
        }),
      ),
    ).toBe(true);
  });

  it('own_only passes when own_only required', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'own_only' }));
    expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'own_only' }],
        }),
      ),
    ).toBe(true);
  });

  it('full grants own_only-required endpoint', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'messages', access: 'own_only' }));
    expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'full' }],
        }),
      ),
    ).toBe(true);
  });

  it('section-specific permission required when metadata has section', () => {
    const guard = new HrPermissionGuard(
      makeReflector({ page: 'messages', access: 'read', section: 'messages:demand' }),
    );
    expect(() =>
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'read' }],
        }),
      ),
    ).toThrow(/required/);
  });

  it('section match passes', () => {
    const guard = new HrPermissionGuard(
      makeReflector({ page: 'messages', access: 'read', section: 'messages:demand' }),
    );
    expect(
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: 'messages:demand', accessLevel: 'read' }],
        }),
      ),
    ).toBe(true);
  });

  it('different page permission does not satisfy', () => {
    const guard = new HrPermissionGuard(makeReflector({ page: 'oylik', access: 'read' }));
    expect(() =>
      guard.canActivate(
        makeCtx({
          ...baseUser,
          hrPermissions: [{ pageKey: 'messages', section: null, accessLevel: 'full' }],
        }),
      ),
    ).toThrow(/required/);
  });
});
