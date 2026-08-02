'use client';

import { type DriverFieldPingResult, driverTrackingApi } from '@/lib/hr-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type BufferedPing,
  appendToBuffer,
  flushBuffer,
  loadBuffer,
  saveBuffer,
} from './driver-ping-buffer';
import { shouldSendPing } from './use-geolocation-attendance';

/**
 * Haydovchi GPS oqimi → `POST /driver-tracking/ping`.
 *
 * Geofence davomat oqimidan (`use-geolocation-attendance`) ATAYLAB ajratilgan —
 * server tomonda ham shunday (`/hr/attendance/ping` ≠ `/driver-tracking/ping`,
 * `driver-field-ingest.service.ts` izohi: «geofence PWA'ga tegmaydi, 0
 * regressiya»). Farqlar: `speed`/`heading` yuboriladi, oflayn bufer bor va
 * oqim FAQAT ochiq smena davomida ishlaydi (maxfiylik — 24/7 kuzatuv emas;
 * server ham smenasiz ping'ni `no_shift` bilan rad etadi).
 *
 * Tezlik chegarasi (throttle) davomat bilan BIR XIL qoidadan olinadi
 * (`shouldSendPing`: 45s yoki 20m) — ikki joyda ikki xil bo'lsa, bir xil
 * telefonda ikki oqim turlicha tez-tez yozib, masofa taqqoslanmas bo'lardi.
 */
export interface DriverPingState {
  lastResult: DriverFieldPingResult | null;
  geoError: string | null;
  lastPingAt: number | null;
  /** Yuborilmay turgan (oflayn) ping'lar soni — ekranda ko'rsatiladi. */
  pendingCount: number;
  online: boolean;
}

export function useDriverPing(enabled: boolean): DriverPingState {
  const [lastResult, setLastResult] = useState<DriverFieldPingResult | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);

  const prevRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastSentRef = useRef(0);
  const bufferRef = useRef<BufferedPing[]>([]);
  // Flush qayta-kirmasin: ketma-ketlik shartini (servis izohi #7) buzardi.
  const flushingRef = useRef(false);

  // Bufer'ni sahifa yangilanganda tiklash — smena o'rtasida sahifa yopilsa
  // yuborilmagan ping'lar yo'qolmasin.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    bufferRef.current = loadBuffer(window.localStorage);
    setPendingCount(bufferRef.current.length);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const persist = useCallback(() => {
    if (typeof window !== 'undefined') saveBuffer(window.localStorage, bufferRef.current);
    setPendingCount(bufferRef.current.length);
  }, []);

  const drain = useCallback(async () => {
    if (flushingRef.current || bufferRef.current.length === 0) return;
    flushingRef.current = true;
    try {
      const { remaining } = await flushBuffer(bufferRef.current, async (p) => {
        const r = await driverTrackingApi.ping({
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy,
          speed: p.speed,
          heading: p.heading,
          ts: p.ts,
        });
        setLastResult(r);
        return r;
      });
      bufferRef.current = remaining;
      persist();
      if (remaining.length === 0) setLastPingAt(Date.now());
    } finally {
      flushingRef.current = false;
    }
  }, [persist]);

  // Tarmoq qaytganda darhol bo'shatish.
  useEffect(() => {
    if (enabled && online) void drain();
  }, [enabled, online, drain]);

  // Ekran o'chsa brauzer `watchPosition`ни to'xtatadi — shuning uchun ekran
  // qulfini (Wake Lock) so'raymiz. Bu NATIVE ilova o'rnini BOSMAYDI: fon
  // rejimida brauzer baribir to'xtaydi (sahifada ochiq yozilgan).
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return;
    // biome-ignore lint/suspicious/noExplicitAny: WakeLock TS lib target'да yo'q
    let lock: any = null;
    const request = async () => {
      try {
        // biome-ignore lint/suspicious/noExplicitAny: eksperimental API
        const nav = navigator as any;
        if (nav.wakeLock && document.visibilityState === 'visible') {
          lock = await nav.wakeLock.request('screen');
        }
      } catch {
        /* ixtiyoriy */
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void request();
        void drain();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch(() => {});
    };
  }, [enabled, drain]);

  // GPS kuzatuvi → throttled ping (oflayn bo'lsa bufer'ga).
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords;
        const now = Date.now();
        if (!shouldSendPing(prevRef.current, { lat, lng }, lastSentRef.current, now)) return;
        prevRef.current = { lat, lng };
        lastSentRef.current = now;

        bufferRef.current = appendToBuffer(bufferRef.current, {
          lat,
          lng,
          accuracy,
          // Brauzer bermasa `null` — server `nullish` qabul qiladi. `speed`
          // manfiy bo'lishi mumkin emas, lekin ba'zi qurilmalar -1 beradi.
          speed: typeof speed === 'number' && speed >= 0 ? speed : null,
          heading: typeof heading === 'number' && !Number.isNaN(heading) ? heading : null,
          ts: new Date(now).toISOString(),
        });
        persist();
        void drain();
      },
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, drain, persist]);

  return { lastResult, geoError, lastPingAt, pendingCount, online };
}
