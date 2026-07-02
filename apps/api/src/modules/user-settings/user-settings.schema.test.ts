import { describe, expect, it } from 'vitest';
import { UpdateUserSettingsSchema } from './user-settings.schema.js';

describe('UpdateUserSettingsSchema', () => {
  it('accepts a partial default-values update', () => {
    const r = UpdateUserSettingsSchema.safeParse({
      defaultCompanyId: '11111111-1111-1111-1111-111111111111',
      defaultCustomerId: '22222222-2222-2222-2222-222222222222',
    });
    expect(r.success).toBe(true);
  });

  it('allows clearing a default with null (distinct from omit)', () => {
    const r = UpdateUserSettingsSchema.safeParse({ defaultStoreId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.defaultStoreId).toBeNull();
  });

  it('rejects a non-uuid default reference', () => {
    const r = UpdateUserSettingsSchema.safeParse({ defaultCompanyId: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('bounds fieldsPerRow to 1..10', () => {
    expect(UpdateUserSettingsSchema.safeParse({ fieldsPerRow: 0 }).success).toBe(false);
    expect(UpdateUserSettingsSchema.safeParse({ fieldsPerRow: 11 }).success).toBe(false);
    expect(UpdateUserSettingsSchema.safeParse({ fieldsPerRow: 3 }).success).toBe(true);
  });

  it('coerces a numeric string for fieldsPerRow (form input)', () => {
    const r = UpdateUserSettingsSchema.safeParse({ fieldsPerRow: '3' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fieldsPerRow).toBe(3);
  });
});
