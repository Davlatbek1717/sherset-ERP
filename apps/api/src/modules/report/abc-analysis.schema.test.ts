import { describe, expect, it } from 'vitest';
import { AbcAnalysisFilterSchema } from './abc-analysis.service.js';

describe('AbcAnalysisFilterSchema', () => {
  it('uses default limit 200 when omitted', () => {
    const r = AbcAnalysisFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(200);
  });

  it('coerces limit string to number', () => {
    const r = AbcAnalysisFilterSchema.safeParse({ limit: '50' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it('rejects limit over 2000', () => {
    expect(AbcAnalysisFilterSchema.safeParse({ limit: 2001 }).success).toBe(false);
  });

  it('accepts ISO date strings for from/to', () => {
    const r = AbcAnalysisFilterSchema.safeParse({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(r.success).toBe(true);
  });
});
