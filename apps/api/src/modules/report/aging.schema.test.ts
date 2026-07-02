import { describe, expect, it } from 'vitest';
import { AgingFilterSchema } from './aging.service.js';

describe('AgingFilterSchema', () => {
  it('defaults side to receivables', () => {
    const r = AgingFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.side).toBe('receivables');
  });

  it('accepts payables side', () => {
    const r = AgingFilterSchema.safeParse({ side: 'payables' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.side).toBe('payables');
  });

  it('rejects unknown side', () => {
    expect(AgingFilterSchema.safeParse({ side: 'mixed' }).success).toBe(false);
  });
});
