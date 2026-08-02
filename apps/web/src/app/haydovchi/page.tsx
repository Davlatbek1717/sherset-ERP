'use client';

/**
 * `/haydovchi` — haydovchining telefon ekrani (smena + jonli GPS).
 *
 * NEGA BU SAHIFA BOR: `/driver-tracking/*` backend'i 2026-07-28 (`f0dd781`) da
 * qurilgan, lekin unga YOZADIGAN mijoz hech qachon bo'lmagan — native Android
 * skeleti build qilinmagan (o'sha commit'ning o'zi «BUILD-VERIFIED EMAS» deb
 * yozgan). 2026-08-02 da prod tekshirildi: `driver_shifts`=0, `driver_trips`=0,
 * `hr_location_pings`=0 — ya'ni dispecher xaritasi (`/hr/drivers/live`) hech
 * qachon bo'sh bo'lmasdan boshqa holatda bo'lolmasdi. Bu sahifa halqani yopadi.
 * TZ 2026-07-28 §11 Faza 0 buni ko'zda tutgan: «vaqtincha mavjud PWA bilan sinash».
 *
 * ⚠️ NATIVE ILOVA O'RNINI BOSMAYDI. Brauzer fon rejimida (ekran o'chganda yoki
 * boshqa ilovaga o'tilganda) `watchPosition`ни to'xtatadi — Wake Lock faqat
 * sahifa KO'RINIB turganда yordam beradi. Ya'ni bu ishonchli fon-uzatish EMAS;
 * u TZ Faza 1 (Android foreground-service) ishi. Bu sahifa — birinchi
 * ishlaydigan manba: haydovchi telefonini ko'rinadigan holda ushlab tursa
 * (mashina tutqichida) oqim to'liq ishlaydi.
 *
 * Maxfiylik: oqim FAQAT ochiq smena davomida ketadi (server ham smenasiz
 * ping'ni `no_shift` bilan rad etadi) — 24/7 kuzatuv emas.
 */

import { useDriverPing } from '@/hooks/use-driver-ping';
import { useAuth } from '@/lib/auth-store';
import {
  type DriverCashHandover,
  type DriverShift,
  type DriverTrip,
  driverCashApi,
  driverTrackingApi,
} from '@/lib/hr-api';
import { Alert, Button, Input, ShersetLogo, Spinner, formatMoney, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const TZ = 'Asia/Tashkent';
type Permission = 'unknown' | 'granted' | 'prompt' | 'denied';

function fmtTime(iso: string | null | undefined): string {
  return iso ? formatInTimeZone(iso, TZ, 'HH:mm') : '—';
}

/** Soniya → «2 s 15 daq» (0 bo'lsa «—»). */
function fmtDuration(sec: number, hLabel: string, mLabel: string): string {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} ${hLabel} ${m} ${mLabel}` : `${m} ${mLabel}`;
}

export default function HaydovchiPage() {
  const t = useTranslations('pages.haydovchi');
  const auth = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [permission, setPermission] = useState<Permission>('unknown');

  const { data: shift, isLoading } = useQuery<DriverShift | null>({
    queryKey: ['driver-shift-current'],
    queryFn: () => driverTrackingApi.currentShift(),
    refetchInterval: 60_000,
  });

  const { data: trips } = useQuery<DriverTrip[]>({
    queryKey: ['driver-my-trips'],
    queryFn: () => driverTrackingApi.myTrips(),
    enabled: !!shift,
    refetchInterval: 60_000,
  });

  const shiftOpen = !!shift && !shift.endedAt;
  // Oqim faqat ochiq smena + berilgan ruxsat bilan. Ikkalasidan biri yo'q
  // bo'lsa `watchPosition` umuman boshlanmaydi (batareya + maxfiylik).
  const streaming = shiftOpen && permission === 'granted';
  const ping = useDriverPing(streaming);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      setPermission('prompt');
      return;
    }
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        setPermission(s.state as Permission);
        s.onchange = () => setPermission(s.state as Permission);
      })
      .catch(() => setPermission('prompt'));
  }, []);

  const askPermission = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error(t('gps_unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setPermission('granted'),
      () => setPermission('denied'),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  };

  const startMut = useMutation({
    mutationFn: () => driverTrackingApi.startShift(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-shift-current'] });
      toast.success(t('shift_started'));
      if (permission !== 'granted') askPermission();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Naqd topshirig'i (TZ §7.2) ──
  // Haydovchi «oldim» deydi — pul UNING qo'lida qoladi, kassa qoldig'i
  // O'ZGARMAYDI. Kassir sanab qabul qilgandagina ПКО yaratiladi.
  const [cashAmount, setCashAmount] = useState('');
  const { data: myCash } = useQuery<DriverCashHandover[]>({
    queryKey: ['driver-cash-mine'],
    queryFn: () => driverCashApi.mine(),
    refetchInterval: 60_000,
  });
  const pendingCash = (myCash ?? []).filter((c) => c.status === 'pending');
  const pendingTotal = pendingCash.reduce((s, c) => s + BigInt(c.amountMinor), 0n);

  const collectMut = useMutation({
    mutationFn: () => {
      // So'mdan tiyinga — foydalanuvchi butun so'm kiritadi.
      const major = Number(cashAmount.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(major) || major <= 0) throw new Error(t('cash_amount_invalid'));
      return driverCashApi.collect({ amountMinor: String(Math.round(major * 100)) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-cash-mine'] });
      setCashAmount('');
      toast.success(t('cash_collected'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const endMut = useMutation({
    mutationFn: () => driverTrackingApi.endShift(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-shift-current'] });
      toast.success(t('shift_ended'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <ShersetLogo className="h-7" />
        <span className="text-[var(--ms-text-muted)] text-sm">{auth.user?.name ?? ''}</span>
      </div>

      <h1 className="font-semibold text-lg">{t('title')}</h1>

      {/* ── Holat ── */}
      <div
        className={`rounded-xl border p-4 ${
          streaming
            ? 'border-emerald-300 bg-emerald-50'
            : shiftOpen
              ? 'border-amber-300 bg-amber-50'
              : 'border-[var(--ms-border-default)]'
        }`}
        data-test-id="driver-status"
      >
        <div className="font-semibold text-base">
          {streaming ? t('state_streaming') : shiftOpen ? t('state_no_gps') : t('state_off')}
        </div>
        {shiftOpen && (
          <div className="mt-1 text-[var(--ms-text-secondary)] text-sm">
            {t('started_at', { time: fmtTime(shift?.startedAt) })}
          </div>
        )}
        {streaming && (
          <div className="mt-1 text-[var(--ms-text-secondary)] text-xs">
            {ping.lastPingAt
              ? t('last_ping', { time: fmtTime(new Date(ping.lastPingAt).toISOString()) })
              : t('waiting_fix')}
          </div>
        )}
      </div>

      {/* ── Ogohlantirishlar ── */}
      {shiftOpen && permission === 'denied' && (
        <Alert tone="destructive" data-test-id="driver-permission-denied">
          {t('permission_denied')}
        </Alert>
      )}
      {shiftOpen && permission !== 'granted' && permission !== 'denied' && (
        <Button onClick={askPermission} data-test-id="driver-permission-ask">
          {t('permission_ask')}
        </Button>
      )}
      {ping.geoError && streaming && <Alert tone="warning">{ping.geoError}</Alert>}
      {!ping.online && shiftOpen && (
        <Alert tone="warning" data-test-id="driver-offline">
          {t('offline', { count: ping.pendingCount })}
        </Alert>
      )}
      {/* Server ping'ni rad etsa sababini KO'RSATAMIZ — jim yo'qotish
          «ishlayapti shekilli» degan yolg'on taassurot berardi. */}
      {streaming && ping.lastResult && !ping.lastResult.accepted && ping.lastResult.reason && (
        <Alert tone="warning" data-test-id="driver-rejected">
          {t(`reject_${ping.lastResult.reason}` as 'reject_accuracy')}
        </Alert>
      )}
      {streaming && (
        <p className="text-[var(--ms-text-muted)] text-xs">{t('background_warning')}</p>
      )}

      {/* ── Smena tugmasi ── */}
      {shiftOpen ? (
        <Button
          variant="destructive"
          onClick={() => endMut.mutate()}
          disabled={endMut.isPending}
          data-test-id="driver-end-shift"
        >
          {t('end_shift')}
        </Button>
      ) : (
        <Button
          onClick={() => startMut.mutate()}
          disabled={startMut.isPending}
          data-test-id="driver-start-shift"
        >
          {t('start_shift')}
        </Button>
      )}

      {/* ── Yakunlangan smena yig'masi ── */}
      {shift?.endedAt && (
        <div className="rounded-xl border border-[var(--ms-border-default)] p-3 text-sm">
          <div className="mb-1 font-medium">{t('last_shift')}</div>
          <div className="flex justify-between">
            <span>{t('distance')}</span>
            <span>{(shift.distanceMeters / 1000).toFixed(1)} km</span>
          </div>
          <div className="flex justify-between">
            <span>{t('active')}</span>
            <span>{fmtDuration(shift.activeSeconds, t('hours'), t('minutes'))}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('stops')}</span>
            <span>{fmtDuration(shift.stopSeconds, t('hours'), t('minutes'))}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('deliveries')}</span>
            <span>{shift.deliveriesCount}</span>
          </div>
        </div>
      )}

      {/* ── Naqd topshirig'i (TZ §7.2) ── */}
      <div className="rounded-xl border border-[var(--ms-border-default)] p-3">
        <div className="mb-2 font-medium text-sm">{t('cash_title')}</div>
        {pendingTotal > 0n && (
          <div
            className="mb-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800 text-sm"
            data-test-id="driver-cash-pending"
          >
            {t('cash_pending', {
              amount: formatMoney(pendingTotal, 'UZS'),
              count: pendingCash.length,
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={cashAmount}
            onChange={(e) => setCashAmount(e.target.value)}
            placeholder={t('cash_placeholder')}
            inputMode="decimal"
            data-test-id="driver-cash-amount"
          />
          <Button
            onClick={() => collectMut.mutate()}
            disabled={!cashAmount.trim() || collectMut.isPending}
            data-test-id="driver-cash-submit"
          >
            {t('cash_add')}
          </Button>
        </div>
        <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('cash_hint')}</p>
      </div>

      {/* ── Yetkazmalar ── */}
      {shiftOpen && (
        <div>
          <div className="mb-1 font-medium text-sm">{t('my_trips')}</div>
          {!trips || trips.length === 0 ? (
            <p className="text-[var(--ms-text-muted)] text-sm">{t('no_trips')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {trips.map((tr) => (
                <div
                  key={tr.id}
                  className="rounded-lg border border-[var(--ms-border-default)] px-3 py-2 text-sm"
                >
                  <div className="font-medium">{tr.destAddress ?? t('no_address')}</div>
                  <div className="text-[var(--ms-text-muted)] text-xs">
                    {t(`trip_${tr.status}` as 'trip_assigned')}
                    {tr.etaSeconds != null &&
                      ` · ${Math.round(tr.etaSeconds / 60)} ${t('minutes')}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
