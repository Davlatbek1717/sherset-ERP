import { describe, expect, it } from 'vitest';
import { SlowMoversFilterSchema } from './slow-movers.service.js';

describe('SlowMoversFilterSchema', () => {
  it('uses default thresholdDays 90', () => {
    const r = SlowMoversFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.thresholdDays).toBe(90);
  });

  it('coerces thresholdDays string', () => {
    const r = SlowMoversFilterSchema.safeParse({ thresholdDays: '180' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.thresholdDays).toBe(180);
  });

  it('rejects negative thresholdDays', () => {
    expect(SlowMoversFilterSchema.safeParse({ thresholdDays: 0 }).success).toBe(false);
  });

  it('rejects invalid storeId uuid', () => {
    expect(SlowMoversFilterSchema.safeParse({ storeId: 'not-a-uuid' }).success).toBe(false);
  });
});
