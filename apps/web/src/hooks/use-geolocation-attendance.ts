'use client';

import { type DavomatPingResult, hrDavomatApi } from '@/lib/hr-api';
import { useEffect, useRef, useState } from 'react';

export const PING_INTERVAL_MS = 45_000;
export const MOVE_THRESHOLD_M = 20;

interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Compact Haversine (client) — kept consistent with the server's geo util. */
function moveMeters(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Throttle rule: send a ping if it's been >= 45s since the last one OR the
 * device moved > 20m. First fix (prev null) always sends. Pure + unit-tested.
 */
export function shouldSendPing(
  prev: Point | null,
  next: Point,
  lastSentAt: number,
  now: number,
): boolean {
  if (!prev) return true;
  if (now - lastSentAt >= PING_INTERVAL_MS) return true;
  return moveMeters(prev, next) > MOVE_THRESHOLD_M;
}

export interface GeoAttendanceState {
  result: DavomatPingResult | null;
  geoError: string | null;
  lastPingAt: number | null;
}

/**
 * Streams browser GPS (watchPosition) → throttled POST /hr/attendance/ping,
 * exposing the authoritative status from each accepted ping. Requests a screen
 * Wake Lock while visible so the tab isn't suspended. Only active when `enabled`
 * (opt-in + geolocation permission granted).
 */
export function useGeolocationAttendance(enabled: boolean): GeoAttendanceState {
  const [result, setResult] = useState<DavomatPingResult | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const prevRef = useRef<Point | null>(null);
  const lastSentRef = useRef<number>(0);

  // Screen Wake Lock (best-effort) — re-acquire when the tab returns to view.
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return;
    // biome-ignore lint/suspicious/noExplicitAny: WakeLock typings are not in this TS lib target
    let lock: any = null;
    const request = async () => {
      try {
        // biome-ignore lint/suspicious/noExplicitAny: experimental API
        const nav = navigator as any;
        if (nav.wakeLock && document.visibilityState === 'visible') {
          lock = await nav.wakeLock.request('screen');
        }
      } catch {
        /* wake lock optional */
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch(() => {});
    };
  }, [enabled]);

  // GPS watch → throttled ping.
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const now = Date.now();
        if (!shouldSendPing(prevRef.current, { lat, lng }, lastSentRef.current, now)) return;
        prevRef.current = { lat, lng };
        lastSentRef.current = now;
        hrDavomatApi
          .ping({ lat, lng, accuracy })
          .then((r) => {
            setResult(r);
            setLastPingAt(now);
          })
          .catch((e: Error) => setGeoError(e.message));
      },
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { result, geoError, lastPingAt };
}
