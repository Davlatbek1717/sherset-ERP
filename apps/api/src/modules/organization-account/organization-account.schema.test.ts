import { describe, expect, it } from 'vitest';
import {
  CreateOrganizationAccountSchema,
  UpdateOrganizationAccountSchema,
} from './organization-account.schema.js';

describe('CreateOrganizationAccountSchema', () => {
  it('accepts a minimal account (org + name) with UZS/non-default defaults', () => {
    const r = CreateOrganizationAccountSchema.safeParse({
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: 'Main UZS account',
    });
    if (!r.success) throw r.error;
    expect(r.data.currency).toBe('UZS');
    expect(r.data.isDefault).toBe(false);
  });

  it('uppercases the currency code', () => {
    const r = CreateOrganizationAccountSchema.safeParse({
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: 'USD account',
      currency: 'usd',
    });
    if (!r.success) throw r.error;
    expect(r.data.currency).toBe('USD');
  });
});

describe('UpdateOrganizationAccountSchema — optimistic-lock contract', () => {
  it('REQUIRES version — a bank-account edit cannot silently bypass the lost-update guard', () => {
    expect(UpdateOrganizationAccountSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(UpdateOrganizationAccountSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a version-only payload (every field except version is optional)', () => {
    expect(UpdateOrganizationAccountSchema.safeParse({ version: 2 }).success).toBe(true);
  });
});
