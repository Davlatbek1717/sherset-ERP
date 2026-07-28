import { type LatLng, haversineMeters } from '../attendance-geo/haversine.util.js';

/**
 * ETA/masofa BAHOSI — sof funksiya, tashqi API'siz (TZ 2026-07-28 §8).
 *
 * Yandex Router REST-kontrakti (kalit+billing) hali ulanmagunча ISHLAYDIGAN
 * fallback: to'g'ri-chiziq masofa × yo'l-faktori / o'rtacha shahar tezligi.
 * Yandex ulanganда `eta-worker` shu util o'rniga real API natijasini yozadi
 * (interfeys bir xil — {distanceMeters, etaSeconds}). Taxminiy, lekin darhol
 * foydali va hech qачон noto'g'ri «aniq» da'vo qilmaydi.
 */

export interface RouteEstimate {
  distanceMeters: number;
  etaSeconds: number;
  /** 'estimate' = haversine-baho; 'yandex' = real API (keyin). */
  source: 'estimate' | 'yandex';
}

// To'g'ri-chiziqni haqiqiy yo'lga yaqinlashtiruvchi o'rtacha koeffitsiyent
// (shahar ko'chalari egri) + o'rtacha harakat tezligi (tirbandlik o'rtachasi).
export const ROAD_FACTOR = 1.3;
export const AVG_CITY_SPEED_MPS = 25_000 / 3600; // 25 km/h ≈ 6.94 m/s

export function estimateRoute(from: LatLng, to: LatLng): RouteEstimate {
  const straight = haversineMeters(from, to);
  const distanceMeters = Math.round(straight * ROAD_FACTOR);
  const etaSeconds = Math.round(distanceMeters / AVG_CITY_SPEED_MPS);
  return { distanceMeters, etaSeconds, source: 'estimate' };
}
