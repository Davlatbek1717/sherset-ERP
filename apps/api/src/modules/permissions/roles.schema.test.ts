import { describe, expect, it } from 'vitest';
import { SetEmployeeRolesSchema, UpdateRoleSchema } from './roles.schema.js';

/**
 * Settings → Users assigns RBAC roles to an employee via a replace-set. The
 * schema is the first guard: only well-formed uuid arrays reach the service
 * (which then tenant-scopes every id). These pin the accepted/rejected shapes.
 */
describe('SetEmployeeRolesSchema', () => {
  it('accepts an array of role uuids', () => {
    const r = SetEmployeeRolesSchema.safeParse({
      roleIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts an empty array (clears all roles)', () => {
    const r = SetEmployeeRolesSchema.safeParse({ roleIds: [] });
    expect(r.success).toBe(true);
  });

  it('rejects non-uuid role ids', () => {
    const r = SetEmployeeRolesSchema.safeParse({ roleIds: ['not-a-uuid'] });
    expect(r.success).toBe(false);
  });

  it('rejects a missing roleIds field', () => {
    const r = SetEmployeeRolesSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects more than 50 roles (bound)', () => {
    const many = Array.from({ length: 51 }, () => '11111111-1111-1111-1111-111111111111');
    const r = SetEmployeeRolesSchema.safeParse({ roleIds: many });
    expect(r.success).toBe(false);
  });
});

describe('UpdateRoleSchema — optimistic-lock contract', () => {
  it('REQUIRES version — a role edit (full permission-matrix rewrite) cannot bypass the lock', () => {
    expect(UpdateRoleSchema.safeParse({ name: 'Manager' }).success).toBe(false);
    expect(UpdateRoleSchema.safeParse({ permissions: [] }).success).toBe(false);
  });

  it('accepts a version-only payload + threads the matrix', () => {
    const r = UpdateRoleSchema.safeParse({
      version: 3,
      permissions: [{ entity: 'product', action: 'view', scope: 'ALL' }],
    });
    if (!r.success) throw r.error;
    expect(r.data.version).toBe(3);
  });
});
