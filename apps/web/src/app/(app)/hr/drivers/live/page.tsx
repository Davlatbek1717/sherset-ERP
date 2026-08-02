'use client';

/**
 * HR → «Haydovchilar (jonli)» — dispecher jonli-board (TZ 2026-07-28 §9, Faza 0).
 *
 * Mavjud ping-oqimidan (`/driver-tracking/live`) FIELD-haydovchilarni xaritada
 * jonli ko'rsatadi: status rangi, hozir necha daqiqa to'xtagan, smena masofasi,
 * faol yetkazma (+ ETA Faza 2'да Yandex bilan to'ladi).
 *
 * i18n: bu sahifa hozircha LOKAL uz/ru obyekti bilan (messages/ru.json+uz.json
 * parallel sessiya tomonidan tahrirlanmoqda — collision'дан qochish uchun; keyin
 * next-intl namespace'ga ko'chiriladi).
 */

import type { DriverLiveRow } from '@/components/hr/driver-live-map';
import { DriverTripAssign } from '@/components/hr/driver-trip-assign';
import { api } from '@/lib/api-client';
// MASTER-TODO #10: tone maps live in one module so the vocabulary can't drift
// (the drift-lock in __tests__/domain-status-tone.test.ts enforces it).
import { driverStatusTone } from '@/lib/domain-status-tone';
import { Badge, Button, EmptyState, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const DriverLiveMap = dynamic(
  () => import('@/components/hr/driver-live-map').then((m) => m.DriverLiveMap),
  { ssr: false, loading: () => <Skeleton className="h-[520px] w-full" /> },
);

const L10N = {
  uz: {
    title: 'Haydovchilar (jonli)',
    subtitle: 'Field-rejimdagi haydovchilar real-time',
    refresh: 'Yangilash',
    driver: 'Haydovchi',
    status: 'Holat',
    stopFor: "to'xtagan",
    shiftDist: 'Smena masofasi',
    trip: 'Faol yetkazma',
    noTrip: '—',
    lastSeen: 'oxirgi',
    ago: 'oldin',
    empty:
      "Field-rejimdagi haydovchi yo'q. Xodimni «haydovchi» (field) rejimiga o'tkazing va u smenani boshlasin.",
    moving: 'Harakatda',
    stopped: "To'xtagan",
    unknown: "Noma'lum",
    offline: 'Oflayn',
    eta: 'ETA',
  },
  ru: {
    title: 'Водители (онлайн)',
    subtitle: 'Водители в field-режиме в реальном времени',
    refresh: 'Обновить',
    driver: 'Водитель',
    status: 'Статус',
    stopFor: 'стоит',
    shiftDist: 'Пробег за смену',
    trip: 'Активная доставка',
    noTrip: '—',
    lastSeen: 'обновлено',
    ago: 'назад',
    empty:
      'Нет водителей в field-режиме. Переведите сотрудника в режим «водитель» (field) и начните смену.',
    moving: 'В движении',
    stopped: 'Стоит',
    unknown: 'Неизвестно',
    offline: 'Оффлайн',
    eta: 'ETA',
  },
} as const;

function fmtDur(sec: number, isRu: boolean): string {
  const min = Math.floor(sec / 60);
  if (min < 1) return `${Math.max(0, Math.round(sec))}s`;
  if (min < 60) return `${min} ${isRu ? 'мин' : 'daq'}`;
  const h = Math.floor(min / 60);
  return `${h}${isRu ? 'ч' : 's'} ${min % 60}${isRu ? 'м' : 'd'}`;
}

function fmtKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function DriversLivePage() {
  const locale = useLocale();
  const isRu = locale === 'ru';
  const t = isRu ? L10N.ru : L10N.uz;

  const { data, isLoading, refetch, isFetching } = useQuery<DriverLiveRow[]>({
    queryKey: ['driver-live'],
    queryFn: () => api.get('/driver-tracking/live'),
    refetchInterval: 10_000, // real-time (Faza 2'да SSE bilan almashtiriladi)
  });

  const drivers = useMemo(() => data ?? [], [data]);

  const popupText = (d: DriverLiveRow): string => {
    const parts = [`<b>${d.name}</b>`, t[d.status]];
    if (d.status === 'stopped' && d.currentStopSec > 0) {
      parts.push(`${t.stopFor}: ${fmtDur(d.currentStopSec, isRu)}`);
    }
    if (d.shift) parts.push(`${t.shiftDist}: ${fmtKm(d.shift.distanceMeters)}`);
    if (d.activeTrip) {
      const eta =
        d.activeTrip.etaSeconds != null
          ? ` · ${t.eta} ${fmtDur(d.activeTrip.etaSeconds, isRu)}`
          : '';
      parts.push(`${t.trip}: ${d.activeTrip.destAddress ?? '—'}${eta}`);
    }
    return parts.join('<br/>');
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t.title}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t.subtitle}</p>
        </div>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          {t.refresh}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : drivers.length === 0 ? (
        <>
          <EmptyState title={t.empty} />
          {/* Haydovchi yo'q bo'lsa ham panel ko'rinadi — dispecher NEGA
              biriktira olmayotganini o'sha yerda o'qiydi (jim bo'sh ekran emas). */}
          <DriverTripAssign drivers={[]} />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <DriverLiveMap drivers={drivers} popupText={popupText} />
          <div className="overflow-hidden rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t.driver}</th>
                  <th className="px-3 py-2 text-left font-medium">{t.status}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.shiftDist}</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.driverId} className="border-[var(--ms-border-default)] border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--ms-text-primary)]">{d.name}</div>
                      {d.activeTrip?.destAddress && (
                        <div className="text-[var(--ms-text-muted)] text-xs">
                          {t.trip}: {d.activeTrip.destAddress}
                          {d.activeTrip.etaSeconds != null &&
                            ` · ${t.eta} ${fmtDur(d.activeTrip.etaSeconds, isRu)}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={driverStatusTone(d.status)}>{t[d.status]}</Badge>
                      {d.status === 'stopped' && d.currentStopSec > 0 && (
                        <span className="ml-2 text-[var(--ms-text-muted)] text-xs">
                          {fmtDur(d.currentStopSec, isRu)} {t.stopFor}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {d.shift ? fmtKm(d.shift.distanceMeters) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3">
              <DriverTripAssign
                drivers={drivers.map((d) => ({ driverId: d.driverId, name: d.name }))}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
