import { describe, expect, it } from 'vitest';
import { ReturnsRatioFilterSchema } from './returns-ratio.service.js';

describe('ReturnsRatioFilterSchema', () => {
  it('defaults groupBy to product', () => {
    const r = ReturnsRatioFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.groupBy).toBe('product');
  });

  it('accepts groupBy=counterparty', () => {
    const r = ReturnsRatioFilterSchema.safeParse({ groupBy: 'counterparty' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.groupBy).toBe('counterparty');
  });

  it('rejects unknown groupBy', () => {
    expect(ReturnsRatioFilterSchema.safeParse({ groupBy: 'channel' }).success).toBe(false);
  });

  it('coerces onlyWithReturns string to boolean', () => {
    const r = ReturnsRatioFilterSchema.safeParse({ onlyWithReturns: 'false' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.onlyWithReturns).toBe(false);
  });

  it('rejects limit over 2000', () => {
    expect(ReturnsRatioFilterSchema.safeParse({ limit: 5000 }).success).toBe(false);
  });
});
