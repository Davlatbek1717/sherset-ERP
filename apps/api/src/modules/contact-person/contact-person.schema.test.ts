import { describe, expect, it } from 'vitest';
import {
  ContactPersonFilterSchema,
  CreateContactPersonSchema,
  UpdateContactPersonSchema,
} from './contact-person.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreateContactPersonSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = CreateContactPersonSchema.safeParse({
      counterpartyId: uuid(),
      name: 'Aliya Karimova',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(
      CreateContactPersonSchema.safeParse({
        counterpartyId: uuid(),
        name: '',
      }).success,
    ).toBe(false);
  });

  it('rejects 256-char name', () => {
    expect(
      CreateContactPersonSchema.safeParse({
        counterpartyId: uuid(),
        name: 'a'.repeat(256),
      }).success,
    ).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(
      CreateContactPersonSchema.safeParse({
        counterpartyId: uuid(),
        name: 'X',
        email: 'not-an-email',
      }).success,
    ).toBe(false);
  });

  it('treats empty-string email as null (form-friendly)', () => {
    const r = CreateContactPersonSchema.safeParse({
      counterpartyId: uuid(),
      name: 'X',
      email: '',
    });
    if (!r.success) throw r.error;
    expect(r.data.email).toBeNull();
  });

  it('accepts position + phone + description', () => {
    const r = CreateContactPersonSchema.safeParse({
      counterpartyId: uuid(),
      name: 'X',
      position: 'CFO',
      phone: '+998 90 123 45 67',
      description: 'Main accountant',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid counterpartyId UUID', () => {
    expect(
      CreateContactPersonSchema.safeParse({
        counterpartyId: 'not-a-uuid',
        name: 'X',
      }).success,
    ).toBe(false);
  });
});

describe('UpdateContactPersonSchema', () => {
  it('all fields optional', () => {
    expect(UpdateContactPersonSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('preserves email-empty-as-null behavior', () => {
    const r = UpdateContactPersonSchema.safeParse({ email: '', version: 1 });
    if (!r.success) throw r.error;
    expect(r.data.email).toBeNull();
  });
});

describe('ContactPersonFilterSchema', () => {
  it('defaults limit to 50', () => {
    const r = ContactPersonFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('coerces archived from string', () => {
    const r = ContactPersonFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });

  it('rejects limit above max (500)', () => {
    expect(ContactPersonFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts counterpartyId + ownerId filters', () => {
    const r = ContactPersonFilterSchema.safeParse({
      counterpartyId: uuid(),
      ownerId: uuid(),
    });
    expect(r.success).toBe(true);
  });

  it('accepts agent sort key (relational orderBy)', () => {
    const r = ContactPersonFilterSchema.safeParse({ sortBy: 'agent', sortDir: 'asc' });
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('agent');
  });

  it('accepts updatedAt sort key', () => {
    const r = ContactPersonFilterSchema.safeParse({ sortBy: 'updatedAt' });
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('updatedAt');
  });

  it('rejects unknown sort key', () => {
    expect(ContactPersonFilterSchema.safeParse({ sortBy: 'random' }).success).toBe(false);
  });
});

/**
 * Optimistic-lock contract (moysklad parity, lost-update guard).
 *
 * Every contact-person field-edit save must carry the `version` the form
 * loaded so the repository can reject a stale write with 409. The token is
 * REQUIRED on Update (so a forgetful caller can't silently bypass the lock)
 * and ABSENT from Create (a brand-new row has no prior version to conflict
 * with).
 */
describe('UpdateContactPersonSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateContactPersonSchema.safeParse({ name: 'Aliya' }).success).toBe(false);
    expect(UpdateContactPersonSchema.safeParse({ name: 'Aliya', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateContactPersonSchema.safeParse({ name: 'Aliya', version: 1.5 }).success).toBe(
      false,
    );
    expect(UpdateContactPersonSchema.safeParse({ name: 'Aliya', version: -1 }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(
      CreateContactPersonSchema.safeParse({
        counterpartyId: crypto.randomUUID(),
        name: 'Aliya',
      }).success,
    ).toBe(true);
  });
});
