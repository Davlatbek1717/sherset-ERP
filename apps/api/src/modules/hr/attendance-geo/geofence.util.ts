import { type LatLng, haversineMeters } from './haversine.util.js';

export interface GeoPing extends LatLng {
  accuracy: number;
}
export interface GeoLocation extends LatLng {
  radiusMeters: number;
}

/** inside = distance <= radiusMeters + min(accuracy, 50) (GPS error margin, capped). */
export function isInsideGeofence(ping: GeoPing, loc: GeoLocation): boolean {
  const threshold = loc.radiusMeters + Math.min(ping.accuracy, 50);
  return haversineMeters(ping, loc) <= threshold;
}
