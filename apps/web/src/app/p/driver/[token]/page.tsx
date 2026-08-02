'use client';

/**
 * /p/driver/[token] — Haydovchi PAROLSIZ GPS-sahifasi (public, login YO'Q).
 * Auth = token o'zi (HMAC capability; accountId+employeeId token ichida).
 * Haydovchi telefonда linkni ochib «Smenani boshlash» bosadi — brauzer
 * geolokatsiyasi (watchPosition) fon rejimida serverga oqadi (ingestField),
 * dispecher jonli-boardда ko'radi. «Smenani tugatish» oqimni to'xtatadi.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface DriverView {
  employeeId: string;
  name: string;
  shift: { id: string; startedAt: string } | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.message === 'string') msg = parsed.message;
    } catch {
      msg = text || msg;
    }
    throw new Error(msg);
  }
  return res.json();
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export default function DriverGpsPage() {
  const token =
    typeof window !== 'undefined' ? (window.location.pathname.split('/').pop() ?? '') : '';

  const [view, setView] = useState<DriverView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastPing, setLastPing] = useState<{ at: Date; accuracy: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const watchId = useRef<number | null>(null);
  const shiftOpen = !!view?.shift;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const v = await fetchJson<DriverView>(`/api/v1/p/driver/${token}`);
      setView(v);
    } catch (e) {
      setErr((e as Error).message || 'Havola yaroqsiz');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // GPS oqimi — smena OCHIQ bo'lgandagina watchPosition ishlaydi.
  const stopWatch = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  useEffect(() => {
    if (!shiftOpen || !token) {
      stopWatch();
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoErr('Brauzer joylashuvni qo‘llab-quvvatlamaydi');
      return;
    }
    setGeoErr(null);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        fetchJson(`/api/v1/p/driver/${token}/ping`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            lat: latitude,
            lng: longitude,
            accuracy: Math.min(accuracy ?? 0, 100_000),
            speed: speed != null && speed >= 0 ? Math.min(speed, 200) : null,
            heading: heading != null && heading >= 0 ? Math.min(heading, 360) : null,
          }),
        })
          .then(() => {
            setLastPing({ at: new Date(), accuracy: Math.round(accuracy ?? 0) });
            setGeoErr(null);
          })
          .catch((e: Error) => setGeoErr(e.message));
      },
      (e) => setGeoErr(e.message || 'Joylashuvga ruxsat berilmadi'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return stopWatch;
  }, [shiftOpen, token, stopWatch]);

  async function startShift() {
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/v1/p/driver/${token}/shift/start`, { method: 'POST' });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function endShift() {
    setBusy(true);
    setErr(null);
    try {
      stopWatch();
      await fetchJson(`/api/v1/p/driver/${token}/shift/end`, { method: 'POST' });
      setLastPing(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 p-4">
      <div className="mt-6 w-full max-w-md rounded-2xl bg-white p-5 shadow-md">
        <div className="mb-1 font-semibold text-lg text-slate-800">Haydovchi — jonli kuzatuv</div>

        {loading && <div className="py-8 text-center text-slate-400">Yuklanmoqda…</div>}

        {!loading && err && !view && (
          <div className="rounded-lg bg-red-50 p-4 text-center text-red-700 text-sm">{err}</div>
        )}

        {view && (
          <div className="flex flex-col gap-4">
            <div className="text-slate-600 text-sm">
              Xodim: <b className="text-slate-800">{view.name}</b>
            </div>

            <div
              className={`rounded-lg p-4 text-center font-medium text-sm ${
                shiftOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
              }`}
            >
              {shiftOpen ? (
                <>
                  🟢 Smena ochiq — {view.shift ? fmtTime(view.shift.startedAt) : ''} dan
                  <div className="mt-1 font-normal text-emerald-600 text-xs">
                    {lastPing
                      ? `Joylashuv yuborilmoqda · ${fmtTime(lastPing.at.toISOString())} (±${lastPing.accuracy} m)`
                      : 'Joylashuv olinmoqda…'}
                  </div>
                </>
              ) : (
                '⚪ Smena yopiq'
              )}
            </div>

            {geoErr && shiftOpen && (
              <div className="rounded-lg bg-amber-50 p-3 text-amber-700 text-xs">⚠️ {geoErr}</div>
            )}
            {err && <div className="text-red-600 text-xs">{err}</div>}

            {shiftOpen ? (
              <button
                type="button"
                onClick={endShift}
                disabled={busy}
                className="w-full rounded-lg border border-red-300 py-3 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                ⏹ Smenani tugatish
              </button>
            ) : (
              <button
                type="button"
                onClick={startShift}
                disabled={busy}
                className="w-full rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                ▶️ Smenani boshlash
              </button>
            )}

            <p className="text-center text-slate-400 text-xs leading-relaxed">
              Smena davomida bu sahifa ochiq turishi kerak. Brauzer joylashuvga ruxsat so‘raganda
              «Ruxsat berish»ni tanlang.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
