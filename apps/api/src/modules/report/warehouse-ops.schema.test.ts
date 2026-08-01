import { describe, expect, it } from 'vitest';
import { WarehouseOpsFilterSchema } from './warehouse-ops.service.js';

describe('WarehouseOpsFilterSchema', () => {
  it('accepts a date-only range', () => {
    const r = WarehouseOpsFilterSchema.safeParse({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-04',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dateFrom.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(r.data.dateTo.toISOString()).toBe('2026-07-04T00:00:00.000Z');
    }
  });

  it('rejects a missing range', () => {
    expect(WarehouseOpsFilterSchema.safeParse({}).success).toBe(false);
    expect(WarehouseOpsFilterSchema.safeParse({ dateFrom: '2026-07-01' }).success).toBe(false);
  });

  it('rejects garbage dates', () => {
    expect(
      WarehouseOpsFilterSchema.safeParse({ dateFrom: 'abc', dateTo: '2026-07-04' }).success,
    ).toBe(false);
  });
});
