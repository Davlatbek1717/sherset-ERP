import { describe, expect, it } from 'vitest';
import { DashboardFilterSchema } from './dashboard.schema.js';

describe('DashboardFilterSchema', () => {
  it('defaults period to "month" when omitted', () => {
    const r = DashboardFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.period).toBe('month');
  });

  it('accepts all valid period values', () => {
    const periods = ['today', 'week', 'month', 'quarter', 'year'] as const;
    for (const period of periods) {
      const r = DashboardFilterSchema.safeParse({ period });
      expect(r.success, `period=${period}`).toBe(true);
      if (r.success) expect(r.data.period).toBe(period);
    }
  });

  it('rejects an unknown period value', () => {
    expect(DashboardFilterSchema.safeParse({ period: 'forever' }).success).toBe(false);
  });

  it('rejects a numeric period value', () => {
    expect(DashboardFilterSchema.safeParse({ period: 7 }).success).toBe(false);
  });

  it('accepts explicit "month" matching the default', () => {
    const r = DashboardFilterSchema.safeParse({ period: 'month' });
    if (!r.success) throw r.error;
    expect(r.data.period).toBe('month');
  });

  it('rejects null period (must be string)', () => {
    expect(DashboardFilterSchema.safeParse({ period: null }).success).toBe(false);
  });
});
