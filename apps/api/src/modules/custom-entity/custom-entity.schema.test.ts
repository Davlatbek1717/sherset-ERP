import { describe, expect, it } from 'vitest';
import {
  CreateCustomEntitySchema,
  CreateCustomEntityValueSchema,
  CustomEntityFilterSchema,
  UpdateCustomEntitySchema,
  UpdateCustomEntityValueSchema,
} from './custom-entity.schema.js';

describe('CreateCustomEntitySchema', () => {
  it('accepts valid name', () => {
    const r = CreateCustomEntitySchema.safeParse({ name: 'Отделы' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateCustomEntitySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name > 255 chars', () => {
    expect(CreateCustomEntitySchema.safeParse({ name: 'a'.repeat(256) }).success).toBe(false);
  });
});

describe('UpdateCustomEntitySchema', () => {
  it('accepts empty object (with required version)', () => {
    expect(UpdateCustomEntitySchema.safeParse({ version: 1 }).success).toBe(true);
  });
});

describe('CustomEntityFilterSchema', () => {
  it('defaults to sortBy=name asc', () => {
    const r = CustomEntityFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('name');
      expect(r.data.sortDir).toBe('asc');
    }
  });
});

describe('CreateCustomEntityValueSchema', () => {
  it('accepts name with default position', () => {
    const r = CreateCustomEntityValueSchema.safeParse({ name: 'Продажи' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.position).toBe(0);
    }
  });

  it('coerces position from string', () => {
    const r = CreateCustomEntityValueSchema.safeParse({ name: 'HR', position: '3' });
    if (!r.success) throw r.error;
    expect(r.data.position).toBe(3);
  });

  it('rejects empty name', () => {
    expect(CreateCustomEntityValueSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('UpdateCustomEntityValueSchema', () => {
  it('accepts empty object', () => {
    expect(UpdateCustomEntityValueSchema.safeParse({}).success).toBe(true);
  });
});

/**
 * Optimistic-lock contract for CustomEntity updates.
 *
 * Every field-edit save must carry the `version` the form loaded so the
 * repository can reject a stale write with 409. The token is REQUIRED on
 * Update (so a forgetful caller can't silently bypass the lock) and ABSENT
 * from Create (a brand-new row has no prior version to conflict with).
 */
describe('UpdateCustomEntitySchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateCustomEntitySchema.safeParse({}).success).toBe(false);
    expect(UpdateCustomEntitySchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateCustomEntitySchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateCustomEntitySchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateCustomEntitySchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateCustomEntitySchema.safeParse({ name: 'Отделы' }).success).toBe(true);
  });
});
