import { describe, expect, it } from 'vitest';
import { jumpFilter } from './jump-filter.util.js';

const at = (ms: number) => new Date(1_700_000_000_000 + ms);

describe('jumpFilter', () => {
  it('accepts first ping (prev null)', () => {
    expect(jumpFilter(null, { lat: 41.31, lng: 69.24, at: at(0) })).toBe(true);
  });
  it('rejects ~2500m in 2s (1250 m/s)', () => {
    const prev = { lat: 41.31, lng: 69.24, at: at(0) };
    const next = { lat: 41.3325, lng: 69.24, at: at(2000) };
    expect(jumpFilter(prev, next)).toBe(false);
  });
  it('accepts walking 100m in 45s', () => {
    const prev = { lat: 41.31, lng: 69.24, at: at(0) };
    const next = { lat: 41.3109, lng: 69.24, at: at(45_000) };
    expect(jumpFilter(prev, next)).toBe(true);
  });
});
