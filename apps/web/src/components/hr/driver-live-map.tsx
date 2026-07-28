'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LMap, Marker as LMarker } from 'leaflet';
import { useEffect, useRef } from 'react';

export type DriverStatus = 'moving' | 'stopped' | 'unknown' | 'offline';

export interface DriverLiveRow {
  driverId: string;
  name: string;
  online: boolean;
  status: DriverStatus;
  lastPing: { lat: number; lng: number; heading: number | null; at: string; ageSec: number } | null;
  currentStopSec: number;
  shift: { id: string; startedAt: string; distanceMeters: number } | null;
  activeTrip: {
    id: string;
    destLat: number;
    destLng: number;
    destAddress: string | null;
    status: string;
    distanceMeters: number | null;
    etaSeconds: number | null;
  } | null;
}

const STATUS_COLOR: Record<DriverStatus, string> = {
  moving: '#16a34a', // yashil
  stopped: '#f59e0b', // sariq
  unknown: '#64748b', // kulrang-ko'k
  offline: '#9ca3af', // kulrang
};

// Toshkent — markerlar bo'lmaganда boshlang'ich ko'rinish.
const FALLBACK_CENTER: [number, number] = [41.311, 69.24];

const pinHtml = (color: string): string =>
  `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`;

/**
 * Leaflet + OSM jonli haydovchi xaritasi (TZ 2026-07-28 §9). Markerlar status
 * rangi bilan; `drivers` yangilanganда upsert qilinadi. Client-only (window'ga
 * tegadi) — iste'molchi next/dynamic ssr:false bilan import qiladi.
 */
export function DriverLiveMap({
  drivers,
  popupText,
}: {
  drivers: DriverLiveRow[];
  popupText: (d: DriverLiveRow) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Map<string, LMarker>>(new Map());
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const driversRef = useRef(drivers);
  driversRef.current = drivers;
  const popupRef = useRef(popupText);
  popupRef.current = popupText;
  const didFitRef = useRef(false);

  // Init once. syncMarkers ref'lar orqali o'qiydi → deps kerak emas (intentional).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mod = await import('leaflet');
      const L = (mod.default ?? mod) as typeof import('leaflet');
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current).setView(FALLBACK_CENTER, 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 0);
      syncMarkers();
    })();
    return () => {
      cancelled = true;
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-sync markers when the driver snapshot changes (syncMarkers reads refs).
  // biome-ignore lint/correctness/useExhaustiveDependencies: drivers-driven re-sync
  useEffect(() => syncMarkers(), [drivers]);

  function syncMarkers() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const seen = new Set<string>();
    const bounds: [number, number][] = [];

    for (const d of driversRef.current) {
      if (!d.lastPing) continue;
      seen.add(d.driverId);
      const pos: [number, number] = [d.lastPing.lat, d.lastPing.lng];
      bounds.push(pos);
      const icon = L.divIcon({
        html: pinHtml(STATUS_COLOR[d.status]),
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const existing = markersRef.current.get(d.driverId);
      if (existing) {
        existing.setLatLng(pos);
        existing.setIcon(icon);
        existing.setPopupContent(popupRef.current(d));
      } else {
        const m = L.marker(pos, { icon }).addTo(map);
        m.bindPopup(popupRef.current(d));
        markersRef.current.set(d.driverId, m);
      }
    }

    // O'chib ketgan (endi ping'siz) markerlarni olib tashla.
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }

    // Birinchi marta markerlar bo'lsa — ularga moslab kadrla.
    if (!didFitRef.current && bounds.length > 0) {
      didFitRef.current = true;
      if (bounds.length === 1 && bounds[0]) map.setView(bounds[0], 15);
      else map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  return (
    <div
      ref={containerRef}
      className="h-[520px] w-full overflow-hidden rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)]"
      data-test-id="driver-live-map"
    />
  );
}
