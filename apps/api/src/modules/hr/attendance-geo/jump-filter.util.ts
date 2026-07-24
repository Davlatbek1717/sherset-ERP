import { type LatLng, haversineMeters } from './haversine.util.js';

export interface TimedPoint extends LatLng {
  at: Date;
}

/**
 * true = accept the ping; false = reject an impossible teleport.
 * Default 1000 m/s ~= TZ's ">2km in 2s". First ping (prev null) is always accepted.
 */
export function jumpFilter(prev: TimedPoint | null, next: TimedPoint, maxSpeedMps = 1000): boolean {
  if (!prev) return true;
  const dtSec = (next.at.getTime() - prev.at.getTime()) / 1000;
  if (dtSec <= 0) return true; // cannot compute speed reliably -> accept
  const speed = haversineMeters(prev, next) / dtSec;
  return speed <= maxSpeedMps;
}
