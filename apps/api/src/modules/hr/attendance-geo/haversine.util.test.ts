import { describe, expect, it } from 'vitest';
import { haversineMeters } from './haversine.util.js';

describe('haversineMeters', () => {
  it('is 0 for identical points', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });
  it('~111195 m for 1 degree longitude at equator', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111195, -2);
  });
  it('~84 m for a small Tashkent delta', () => {
    const d = haversineMeters({ lat: 41.311, lng: 69.24 }, { lat: 41.311, lng: 69.241 });
    expect(d).toBeGreaterThan(79);
    expect(d).toBeLessThan(89);
  });
});
