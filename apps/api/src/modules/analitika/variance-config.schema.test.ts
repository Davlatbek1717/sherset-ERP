import { describe, expect, it } from 'vitest';
import { UpdateVarianceConfigSchema } from './variance-config.schema.js';

describe('UpdateVarianceConfigSchema', () => {
  it('accepts valid thresholds', () => {
    const r = UpdateVarianceConfigSchema.safeParse({ greenMaxPct: 5, yellowMaxPct: 15 });
    expect(r.success).toBe(true);
  });

  it('rejects negative percentages', () => {
    expect(
      UpdateVarianceConfigSchema.safeParse({ greenMaxPct: -1, yellowMaxPct: 15 }).success,
    ).toBe(false);
  });

  it('rejects yellowMaxPct <= greenMaxPct', () => {
    expect(
      UpdateVarianceConfigSchema.safeParse({ greenMaxPct: 20, yellowMaxPct: 10 }).success,
    ).toBe(false);
  });

  it('rejects percentages over 100', () => {
    expect(
      UpdateVarianceConfigSchema.safeParse({ greenMaxPct: 5, yellowMaxPct: 150 }).success,
    ).toBe(false);
  });
});
