import { describe, expect, it } from 'vitest';
import { computeVarianceStatus } from './variance-status.util.js';

// Thresholds used across the suite: green ≤ 5%, yellow ≤ 15%, else red.
const TH = { greenMaxPct: 5, yellowMaxPct: 15 };

describe('computeVarianceStatus', () => {
  it('returns green when there is no variance', () => {
    expect(computeVarianceStatus({ expectedQty: 100, netQty: 0, ...TH })).toBe('green');
  });

  it('returns green at the green boundary (exactly 5%)', () => {
    expect(computeVarianceStatus({ expectedQty: 100, netQty: -5, ...TH })).toBe('green');
  });

  it('returns yellow just past the green boundary', () => {
    expect(computeVarianceStatus({ expectedQty: 100, netQty: -6, ...TH })).toBe('yellow');
  });

  it('returns yellow at the yellow boundary (exactly 15%)', () => {
    expect(computeVarianceStatus({ expectedQty: 100, netQty: 15, ...TH })).toBe('yellow');
  });

  it('returns red past the yellow boundary', () => {
    expect(computeVarianceStatus({ expectedQty: 100, netQty: -16, ...TH })).toBe('red');
  });

  it('uses absolute value — surplus and shortage are symmetric', () => {
    expect(computeVarianceStatus({ expectedQty: 100, netQty: 20, ...TH })).toBe('red');
    expect(computeVarianceStatus({ expectedQty: 100, netQty: -20, ...TH })).toBe('red');
  });

  it('returns red when expected is 0 but a count exists (cannot be a small %)', () => {
    expect(computeVarianceStatus({ expectedQty: 0, netQty: 3, ...TH })).toBe('red');
  });

  it('returns green when expected is 0 and net is 0', () => {
    expect(computeVarianceStatus({ expectedQty: 0, netQty: 0, ...TH })).toBe('green');
  });

  it('handles fractional quantities', () => {
    // 0.5 / 100 = 0.5% → green
    expect(computeVarianceStatus({ expectedQty: 100, netQty: 0.5, ...TH })).toBe('green');
  });
});
