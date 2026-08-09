import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  HR_ADMIN_ROLE,
  assertAdminRoleGrantAllowed,
  assertNoSelfPrivilegeChange,
  grantsAdminRole,
} from './privilege-escalation.js';

describe('assertNoSelfPrivilegeChange (HR-10)', () => {
  it('o`z ruxsatlarini o`zgartirishga urinish → 403', () => {
    expect(() => assertNoSelfPrivilegeChange('e1', 'e1', 'ruxsatlar')).toThrow(ForbiddenException);
  });

  it('boshqa xodimning ruxsatlariga tegish → o`tadi', () => {
    expect(() => assertNoSelfPrivilegeChange('e1', 'e2', 'ruxsatlar')).not.toThrow();
  });

  it('aktor noma`lum (tizim/seed chaqiruvi) → o`tadi', () => {
    expect(() => assertNoSelfPrivilegeChange(undefined, 'e2', 'ruxsatlar')).not.toThrow();
  });
});

describe('grantsAdminRole (HR-10)', () => {
  it('admin YO`Q → admin BOR = berish', () => {
    expect(grantsAdminRole([], [HR_ADMIN_ROLE])).toBe(true);
  });

  it('admin allaqachon bor → berish emas (boshqa rol qo`shildi)', () => {
    expect(grantsAdminRole([HR_ADMIN_ROLE], [HR_ADMIN_ROLE, 'kassir'])).toBe(false);
  });

  it('admin olib tashlandi → berish emas', () => {
    expect(grantsAdminRole([HR_ADMIN_ROLE], [])).toBe(false);
  });
});

describe('assertAdminRoleGrantAllowed (HR-10)', () => {
  it('admin bo`lmagan aktor admin rolini beryapti → 403', () => {
    expect(() =>
      assertAdminRoleGrantAllowed({
        actorHrRoles: ['hr'],
        currentHrRoles: [],
        nextHrRoles: [HR_ADMIN_ROLE],
      }),
    ).toThrow(ForbiddenException);
  });

  it('admin aktor admin rolini beryapti → o`tadi', () => {
    expect(() =>
      assertAdminRoleGrantAllowed({
        actorHrRoles: [HR_ADMIN_ROLE],
        currentHrRoles: [],
        nextHrRoles: [HR_ADMIN_ROLE],
      }),
    ).not.toThrow();
  });

  it('admin bo`lmagan aktor admin bo`lmagan rol beryapti → o`tadi', () => {
    expect(() =>
      assertAdminRoleGrantAllowed({
        actorHrRoles: ['hr'],
        currentHrRoles: [],
        nextHrRoles: ['kassir'],
      }),
    ).not.toThrow();
  });
});
