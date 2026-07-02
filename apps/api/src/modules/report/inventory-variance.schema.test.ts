import { describe, expect, it } from 'vitest';
import { InventoryVarianceFilterSchema } from './inventory-variance.service.js';

describe('InventoryVarianceFilterSchema', () => {
  it('uses default limit 200', () => {
    const r = InventoryVarianceFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(200);
  });

  it('coerces limit string', () => {
    const r = InventoryVarianceFilterSchema.safeParse({ limit: '50' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it('rejects invalid storeId uuid', () => {
    expect(InventoryVarianceFilterSchema.safeParse({ storeId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts valid storeId uuid', () => {
    const r = InventoryVarianceFilterSchema.safeParse({
      storeId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
  });
});
