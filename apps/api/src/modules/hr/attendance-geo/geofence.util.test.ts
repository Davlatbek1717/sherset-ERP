import { describe, expect, it } from 'vitest';
import { isInsideGeofence } from './geofence.util.js';

const CENTER = { lat: 41.311, lng: 69.24 };

describe('isInsideGeofence', () => {
  it('true at center within radius', () => {
    expect(isInsideGeofence({ ...CENTER, accuracy: 10 }, { ...CENTER, radiusMeters: 150 })).toBe(
      true,
    );
  });
  it('false when ~200m out, radius 150, accuracy 10 (thr 160)', () => {
    expect(
      isInsideGeofence(
        { lat: 41.3128, lng: 69.24, accuracy: 10 },
        { ...CENTER, radiusMeters: 150 },
      ),
    ).toBe(false);
  });
  it('accuracy caps at 50m margin (inside)', () => {
    // ~190m out, radius 150, accuracy 100 -> capped 50 -> thr 200 -> inside
    expect(
      isInsideGeofence(
        { lat: 41.31271, lng: 69.24, accuracy: 100 },
        { ...CENTER, radiusMeters: 150 },
      ),
    ).toBe(true);
  });
});
