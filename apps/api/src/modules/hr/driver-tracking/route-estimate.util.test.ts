import { describe, expect, it } from 'vitest';
import { AVG_CITY_SPEED_MPS, ROAD_FACTOR, estimateRoute } from './route-estimate.util.js';

const A = { lat: 41.311, lng: 69.24 }; // Toshkent markazi
const B = { lat: 41.351, lng: 69.29 }; // ~5-6 km shimoli-sharq

describe('estimateRoute', () => {
  it('bir xil nuqta → 0 masofa, 0 ETA', () => {
    const r = estimateRoute(A, A);
    expect(r.distanceMeters).toBe(0);
    expect(r.etaSeconds).toBe(0);
    expect(r.source).toBe('estimate');
  });

  it("masofa = to'g'ri-chiziq × yo'l-faktori", () => {
    const r = estimateRoute(A, B);
    expect(r.distanceMeters).toBeGreaterThan(5000 * ROAD_FACTOR * 0.8);
    expect(r.distanceMeters).toBeLessThan(8000 * ROAD_FACTOR);
    // ETA = masofa / o'rtacha tezlik.
    expect(r.etaSeconds).toBe(Math.round(r.distanceMeters / AVG_CITY_SPEED_MPS));
  });

  it('uzoqroq masofa → kattaroq ETA (monoton)', () => {
    const near = estimateRoute(A, { lat: 41.32, lng: 69.25 });
    const far = estimateRoute(A, { lat: 41.45, lng: 69.4 });
    expect(far.distanceMeters).toBeGreaterThan(near.distanceMeters);
    expect(far.etaSeconds).toBeGreaterThan(near.etaSeconds);
  });
});
