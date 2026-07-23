import { describe, expect, it } from 'vitest';
import { shouldSendPing } from './use-geolocation-attendance';

const T0 = 1_700_000_000_000;

describe('shouldSendPing', () => {
  it('always sends the first fix (prev null)', () => {
    expect(shouldSendPing(null, { lat: 41.31, lng: 69.24 }, 0, T0)).toBe(true);
  });
  it('does not send when <45s and <20m moved', () => {
    const prev = { lat: 41.31, lng: 69.24 };
    // ~5m north, 10s later
    expect(shouldSendPing(prev, { lat: 41.310045, lng: 69.24 }, T0, T0 + 10_000)).toBe(false);
  });
  it('sends when >=45s elapsed even if stationary', () => {
    const prev = { lat: 41.31, lng: 69.24 };
    expect(shouldSendPing(prev, { lat: 41.31, lng: 69.24 }, T0, T0 + 45_000)).toBe(true);
  });
  it('sends when moved >20m within the interval', () => {
    const prev = { lat: 41.31, lng: 69.24 };
    // ~50m north, only 5s later
    expect(shouldSendPing(prev, { lat: 41.31045, lng: 69.24 }, T0, T0 + 5_000)).toBe(true);
  });
});
