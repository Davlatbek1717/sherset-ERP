import { describe, expect, it } from 'vitest';
import { SalesByChannelFilterSchema } from './sales-by-channel.service.js';

describe('SalesByChannelFilterSchema', () => {
  it('accepts empty filter', () => {
    expect(SalesByChannelFilterSchema.safeParse({}).success).toBe(true);
  });

  it('accepts ISO date strings', () => {
    const r = SalesByChannelFilterSchema.safeParse({
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });
    expect(r.success).toBe(true);
  });
});
