import { describe, expect, it } from 'vitest';
import { CreateStaffSchema, UpdateStaffSchema } from './staff.schema.js';

const VALID_CREATE = {
  email: 'a@b.com',
  name: 'Ozod',
  password: 'longenough8',
};

describe('CreateStaffSchema', () => {
  it('accepts a minimal valid payload (roleIds defaults to [])', () => {
    const r = CreateStaffSchema.safeParse(VALID_CREATE);
    if (!r.success) throw r.error;
    expect(r.data.roleIds).toEqual([]);
  });

  it('rejects a too-short password', () => {
    expect(CreateStaffSchema.safeParse({ ...VALID_CREATE, password: 'short' }).success).toBe(false);
  });

  it('has NO version field (version starts at 1 server-side)', () => {
    const r = CreateStaffSchema.parse(VALID_CREATE);
    expect('version' in r).toBe(false);
  });
});

describe('UpdateStaffSchema — optimistic-lock contract (2026-06-08i)', () => {
  // Same shared Employee row as /hr/employees + /auth/me. version is REQUIRED on
  // update so a roleIds-only OR field edit cannot bypass the lost-update guard;
  // it guards the FULL update including the EmployeeRole rewrite in the tx.
  it('REQUIRES version — a field or role edit cannot bypass the lock', () => {
    expect(UpdateStaffSchema.safeParse({ name: 'X' }).success).toBe(false);
    expect(
      UpdateStaffSchema.safeParse({
        roleIds: ['11111111-1111-1111-1111-111111111111'],
      }).success,
    ).toBe(false);
    // empty body (the roleIds-only-clears case) also rejected without version
    expect(UpdateStaffSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a version-only payload', () => {
    const r = UpdateStaffSchema.safeParse({ version: 0 });
    if (!r.success) throw r.error;
    expect(r.data.version).toBe(0);
  });

  it('accepts version + partial fields', () => {
    const r = UpdateStaffSchema.safeParse({ version: 5, name: 'X', archived: true });
    if (!r.success) throw r.error;
    expect(r.data.version).toBe(5);
    expect(r.data.archived).toBe(true);
  });

  it('rejects a negative version', () => {
    expect(UpdateStaffSchema.safeParse({ version: -1, name: 'X' }).success).toBe(false);
  });
});
