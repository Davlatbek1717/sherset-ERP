import { describe, expect, it } from 'vitest';
import { AverageBasketFilterSchema } from './average-basket.service.js';

describe('AverageBasketFilterSchema', () => {
  it('defaults granularity to day', () => {
    const r = AverageBasketFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.granularity).toBe('day');
  });

  it.each(['day', 'week', 'month'])('accepts granularity=%s', (g) => {
    const r = AverageBasketFilterSchema.safeParse({ granularity: g });
    expect(r.success).toBe(true);
  });

  it('rejects unknown granularity', () => {
    expect(AverageBasketFilterSchema.safeParse({ granularity: 'hour' }).success).toBe(false);
  });
});
