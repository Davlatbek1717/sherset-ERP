import { describe, expect, it } from 'vitest';
import { ChangePasswordSchema, LoginSchema } from './auth.schema.js';

describe('ChangePasswordSchema', () => {
  it('accepts valid old + new password (>=8)', () => {
    expect(
      ChangePasswordSchema.safeParse({ oldPassword: 'old', newPassword: 'longenough' }).success,
    ).toBe(true);
  });

  it('rejects empty old password', () => {
    expect(
      ChangePasswordSchema.safeParse({ oldPassword: '', newPassword: 'longenough' }).success,
    ).toBe(false);
  });

  it('rejects new password shorter than 8', () => {
    expect(
      ChangePasswordSchema.safeParse({ oldPassword: 'old', newPassword: 'short' }).success,
    ).toBe(false);
  });
});

describe('LoginSchema', () => {
  it('accepts email + password', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.c', password: 'x' }).success).toBe(true);
  });

  it('rejects empty identifier', () => {
    expect(LoginSchema.safeParse({ email: '', password: 'x' }).success).toBe(false);
  });
});
