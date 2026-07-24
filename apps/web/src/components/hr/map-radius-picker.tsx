'use client';

import 'leaflet/dist/leaflet.css';
import { Icons } from '@moysklad/ui';
import type { Circle as LCircle, Map as LMap, Marker as LMarker } from 'leaflet';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

export interface MapValue {
  lat: number;
  lng: number;
  radius: number;
}

const BRAND = '#0652ff';
const PIN_HTML = `<div style="width:18px;height:18px;border-radius:50%;background:${BRAND};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`;

/**
 * Leaflet + OSM geofence picker. Draggable center + live radius circle, two-way
 * bound to `value` (also editable via the numeric inputs in the parent form).
 * Client-only (touches window) — consumers import it via next/dynamic ssr:false.
 */
export function MapRadiusPicker({
  value,
  onChange,
}: {
  value: MapValue;
  onChange: (v: MapValue) => void;
}) {
  const t = useTranslations('pages.workLocations');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<LMarker | null>(null);
  const circleRef = useRef<LCircle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mod = await import('leaflet');
      const L = (mod.default ?? mod) as typeof import('leaflet');
      if (cancelled || !containerRef.current || mapRef.current) return;
      const { lat, lng, radius } = valueRef.current;
      const map = L.map(containerRef.current).setView([lat, lng], 16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      const icon = L.divIcon({
        html: PIN_HTML,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const marker = L.marker([lat, lng], { draggable: true, icon }).addTo(map);
      const circle = L.circle([lat, lng], {
        radius,
        color: BRAND,
        fillColor: BRAND,
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);

      marker.on('drag', () => circle.setLatLng(marker.getLatLng()));
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onChangeRef.current({ ...valueRef.current, lat: p.lat, lng: p.lng });
      });
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        onChangeRef.current({ ...valueRef.current, lat: e.latlng.lat, lng: e.latlng.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
      setTimeout(() => map.invalidateSize(), 0);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync radius from the numeric input.
  useEffect(() => {
    circleRef.current?.setRadius(value.radius);
  }, [value.radius]);

  // Sync lat/lng from the numeric inputs (guard against the marker's own drag).
  useEffect(() => {
    const m = markerRef.current;
    const c = circleRef.current;
    const map = mapRef.current;
    if (!m || !c || !map) return;
    const cur = m.getLatLng();
    if (Math.abs(cur.lat - value.lat) > 1e-7 || Math.abs(cur.lng - value.lng) > 1e-7) {
      m.setLatLng([value.lat, value.lng]);
      c.setLatLng([value.lat, value.lng]);
      map.setView([value.lat, value.lng]);
    }
  }, [value.lat, value.lng]);

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      onChangeRef.current({
        ...valueRef.current,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    });
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[260px] w-full overflow-hidden rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)]"
        data-test-id="map-radius-picker"
      />
      <button
        type="button"
        onClick={useMyLocation}
        className="absolute top-2 right-2 z-[1000] flex items-center gap-1 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-1 font-medium text-[var(--ms-text-primary)] text-xs shadow-[var(--ms-shadow-sm)] hover:bg-[var(--ms-bg-hover)]"
      >
        <Icons.regions className="h-3.5 w-3.5" />
        {t('use_my_location')}
      </button>
    </div>
  );
}
