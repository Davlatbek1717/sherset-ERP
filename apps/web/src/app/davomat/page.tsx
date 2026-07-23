'use client';

import { useDavomatStatus } from '@/hooks/use-davomat-status';
import { useGeolocationAttendance } from '@/hooks/use-geolocation-attendance';
import { useAuth } from '@/lib/auth-store';
import { type DavomatMyToday, type DavomatPingResult, hrDavomatApi } from '@/lib/hr-api';
import { Alert, Avatar, Button, Checkbox, Icons, ShersetLogo, Spinner } from '@moysklad/ui';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { type HeroState, StatusHero } from './_components/status-hero';

const TZ = 'Asia/Tashkent';
type Permission = 'unknown' | 'granted' | 'prompt' | 'denied';

// biome-ignore lint/suspicious/noExplicitAny: BeforeInstallPromptEvent is not in the TS lib
type InstallPrompt = any;

function fmtTime(iso: string | null | undefined): string {
  return iso ? formatInTimeZone(iso, TZ, 'HH:mm') : '—';
}

function deriveHeroState(
  myToday: DavomatMyToday | undefined,
  result: DavomatPingResult | null,
  geoError: string | null,
  online: boolean,
): HeroState {
  if (!myToday) return 'connecting';
  if (!myToday.workLocation) return 'no_branch';
  if (myToday.schedule?.isDayOff) return 'day_off';
  if (!online) return 'offline';
  if (geoError) return 'gps_lost';
  const status = result?.status ?? myToday.status;
  if (status === 'at_work') return 'at_work';
  if (status === 'left') return 'outside';
  if (result?.inside) return 'connecting';
  if (!result && !myToday.today) return 'connecting';
  return 'not_arrived';
}

export default function DavomatPage() {
  const t = useTranslations('pages.davomat');
  const auth = useAuth();
  const { data: myToday, refetch, isLoading } = useDavomatStatus();

  const [permission, setPermission] = useState<Permission>('unknown');
  const [consentStep, setConsentStep] = useState<1 | 2>(1);
  const [agreed, setAgreed] = useState(false);
  const [optInPending, setOptInPending] = useState(false);
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] = useState<InstallPrompt>(null);

  // Live geolocation permission state.
  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    let perm: PermissionStatus | null = null;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((p) => {
          perm = p;
          setPermission(p.state as Permission);
          p.onchange = () => setPermission(p.state as Permission);
        })
        .catch(() => setPermission('prompt'));
    } else {
      setPermission('prompt');
    }
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      if (perm) perm.onchange = null;
    };
  }, []);

  // PWA install prompt capture.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const optedIn = myToday?.optIn ?? false;
  const active = optedIn && permission === 'granted';
  const geo = useGeolocationAttendance(active);

  const requestPermission = useCallback(() => {
    if (!navigator.geolocation) {
      setPermission('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setPermission('granted'),
      () => setPermission('denied'),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }, []);

  const acceptConsent = useCallback(async () => {
    setOptInPending(true);
    try {
      await hrDavomatApi.optIn(true);
      await refetch();
    } finally {
      setOptInPending(false);
    }
  }, [refetch]);

  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
  }, [installEvent]);

  const firstName = auth.user?.name?.split(' ')[0] ?? '';

  // ── Header (shared) ──────────────────────────────────────────────────
  const header = (
    <div className="flex h-14 items-center justify-between">
      <ShersetLogo variant="mark" height={28} />
      <div className="flex items-center gap-2">
        <span className="font-medium text-[var(--ms-text-primary)] text-sm">{firstName}</span>
        <Avatar name={auth.user?.name ?? '?'} size="sm" />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // ── Consent flow (not opted in) ──────────────────────────────────────
  if (!optedIn) {
    return (
      <div className="flex flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col justify-center gap-5 py-6">
          {consentStep === 1 ? (
            <div className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-6">
              <ShersetLogo variant="mark" height={44} className="mx-auto" />
              <h1 className="mt-4 text-center font-bold text-2xl text-[var(--ms-text-primary)]">
                {t('welcome_title')}
              </h1>
              <p className="mt-2 text-center text-[var(--ms-text-muted)] text-base">
                {t('welcome_body')}
              </p>
              <ul className="mt-5 space-y-3">
                {[Icons.shield, Icons.clock, Icons.visible].map((Ic, i) => (
                  <li key={t(`welcome_point${i + 1}`)} className="flex items-start gap-3">
                    <Ic className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ms-text-brand)]" />
                    <span className="text-[var(--ms-text-primary)] text-sm">
                      {t(`welcome_point${i + 1}`)}
                    </span>
                  </li>
                ))}
              </ul>
              <Button size="lg" className="mt-6 w-full" onClick={() => setConsentStep(2)}>
                {t('continue')}
              </Button>
            </div>
          ) : (
            <div className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-6">
              <Icons.shield className="mx-auto h-10 w-10 text-[var(--ms-text-brand)]" />
              <h2 className="mt-3 text-center font-bold text-xl text-[var(--ms-text-primary)]">
                {t('consent_title')}
              </h2>
              <p className="mt-2 text-center text-[var(--ms-text-muted)] text-sm">
                {t('consent_body')}
              </p>
              <label className="mt-5 flex min-h-[44px] items-center gap-3">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
                <span className="text-[var(--ms-text-primary)] text-base">
                  {t('consent_agree')}
                </span>
              </label>
              <Button
                size="lg"
                variant="success"
                className="mt-4 w-full"
                disabled={!agreed || optInPending}
                loading={optInPending}
                onClick={acceptConsent}
              >
                {t('consent_button')}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Permission request / denied (opted in, not granted) ──────────────
  if (permission !== 'granted') {
    const denied = permission === 'denied';
    return (
      <div className="flex flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col justify-center gap-4 py-6">
          <StatusHero state={denied ? 'permission_denied' : 'connecting'} />
          {denied ? (
            <Alert tone="destructive" title={t('permission_denied_title')}>
              {t('permission_denied_help')}
            </Alert>
          ) : (
            <p className="text-center text-[var(--ms-text-muted)] text-sm">
              {t('permission_body')}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={requestPermission}>
            {denied ? t('retry') : t('permission_button')}
          </Button>
        </div>
      </div>
    );
  }

  // ── Active status screen ─────────────────────────────────────────────
  const state = deriveHeroState(myToday, geo.result, geo.geoError, online);
  const today = myToday?.today ?? null;
  const late = today?.lateMinutes ?? geo.result?.attendance?.lateMinutes ?? 0;
  const checkIn = today?.checkInTime ?? geo.result?.attendance?.checkInTime ?? null;
  const checkOut = today?.checkOutTime ?? geo.result?.attendance?.checkOutTime ?? null;
  const fresh = geo.lastPingAt != null && Date.now() - geo.lastPingAt < 90_000;

  return (
    <div className="flex flex-1 flex-col gap-4">
      {header}
      <StatusHero state={state} />

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-center">
          <div className="text-[var(--ms-text-muted)] text-sm uppercase tracking-wide">
            {t('keldi')}
          </div>
          <div
            className={`mt-1 font-bold text-5xl tabular-nums ${
              late > 0 ? 'text-[var(--ms-text-destructive)]' : 'text-[var(--ms-text-primary)]'
            }`}
          >
            {fmtTime(checkIn)}
          </div>
          {late > 0 && (
            <div className="mt-1 inline-block rounded-[var(--ms-radius-sm)] bg-[var(--ms-destructive-50)] px-2 py-0.5 font-medium text-[var(--ms-text-destructive)] text-xs">
              +{late} {t('minutes')}
            </div>
          )}
        </div>
        <div className="rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-center">
          <div className="text-[var(--ms-text-muted)] text-sm uppercase tracking-wide">
            {t('ketdi')}
          </div>
          <div className="mt-1 font-bold text-5xl text-[var(--ms-text-primary)] tabular-nums">
            {fmtTime(checkOut)}
          </div>
        </div>
      </div>

      {installEvent && (
        <Alert tone="info" title={t('install_title')}>
          <Button size="sm" className="mt-2" onClick={install}>
            {t('install_button')}
          </Button>
        </Alert>
      )}

      <Alert tone="info" title={t('keep_open_title')}>
        {t('keep_open_body')}
      </Alert>

      <div className="mt-auto flex items-center justify-center gap-2 pt-2 text-[var(--ms-text-muted)] text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            fresh ? 'bg-[var(--ms-success-500)]' : 'bg-[var(--ms-border-strong)]'
          }`}
        />
        {geo.lastPingAt
          ? t('last_update', { time: formatInTimeZone(geo.lastPingAt, TZ, 'HH:mm') })
          : t('waiting_signal')}
      </div>
    </div>
  );
}
