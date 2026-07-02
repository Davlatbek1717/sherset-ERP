import { describe, expect, it } from 'vitest';
import { SalesByHourFilterSchema } from './sales-by-hour.service.js';

describe('SalesByHourFilterSchema', () => {
  it('defaults timezone to Asia/Tashkent', () => {
    const r = SalesByHourFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.timezone).toBe('Asia/Tashkent');
  });

  it('accepts UTC timezone', () => {
    const r = SalesByHourFilterSchema.safeParse({ timezone: 'UTC' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.timezone).toBe('UTC');
  });
});
