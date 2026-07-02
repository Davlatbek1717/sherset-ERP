import { describe, expect, it } from 'vitest';
import {
  CreateHrEmployeeSchema,
  HrEmployeeFilterSchema,
  SetPasswordSchema,
  UpdateHrEmployeeSchema,
} from './hr-employee.schema.js';

describe('HR Employee Zod schemas', () => {
  it('CreateHrEmployee requires name', () => {
    expect(() => CreateHrEmployeeSchema.parse({ name: '' })).toThrow();
  });

  it('telegramPhone accepts +998 format', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: '+998901234567' });
    expect(parsed.telegramPhone).toBe('+998901234567');
  });

  it('telegramPhone rejects invalid format', () => {
    expect(() => CreateHrEmployeeSchema.parse({ name: 'X', telegramPhone: 'abc' })).toThrow();
  });

  it('hrRoles defaults to empty array', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X' });
    expect(parsed.hrRoles).toEqual([]);
  });

  it('isChecker defaults to false', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X' });
    expect(parsed.isChecker).toBe(false);
  });

  it('SetPassword rejects too-short password', () => {
    expect(() => SetPasswordSchema.parse({ username: 'ozod', password: '123' })).toThrow(/4 belgi/);
  });

  it('SetPassword rejects special chars in username', () => {
    expect(() => SetPasswordSchema.parse({ username: 'ozod@', password: 'abcd' })).toThrow(/lotin/);
  });

  it('Filter coerces page/limit to numbers', () => {
    const parsed = HrEmployeeFilterSchema.parse({ page: '2', limit: '20' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(20);
  });
});

describe('UpdateHrEmployeeSchema — optimistic-lock contract (2026-06-08i)', () => {
  // The Employee row is editable from THREE forms (/hr/employees, /analitika/staff,
  // /auth/me); the PUT must round-trip the loaded version or the lost-update guard
  // is silently bypassable. version is REQUIRED on update, absent on create.
  it('REQUIRES version — a field edit cannot bypass the lock', () => {
    expect(UpdateHrEmployeeSchema.safeParse({ name: 'X' }).success).toBe(false);
    expect(UpdateHrEmployeeSchema.safeParse({ department: 'Sales' }).success).toBe(false);
  });

  it('accepts a version + partial fields', () => {
    const r = UpdateHrEmployeeSchema.safeParse({ version: 4, name: 'X' });
    if (!r.success) throw r.error;
    expect(r.data.version).toBe(4);
    expect(r.data.name).toBe('X');
  });

  it('rejects a negative version', () => {
    expect(UpdateHrEmployeeSchema.safeParse({ version: -1, name: 'X' }).success).toBe(false);
  });

  it('Create has NO version field (version starts at 1 server-side)', () => {
    const parsed = CreateHrEmployeeSchema.parse({ name: 'X' });
    expect('version' in parsed).toBe(false);
  });
});
