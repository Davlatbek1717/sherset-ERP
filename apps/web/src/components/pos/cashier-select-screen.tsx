'use client';

import { PinKeypad } from '@/components/pos/pin-keypad';
import { api } from '@/lib/api-client';
import { type User, acceptAuthResponse, logout } from '@/lib/auth-store';
import { isPosWorkstation, isShersetShell, readPosDevice } from '@/lib/pos-device';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * F8 (POS redizayn, spec §8) — kassir-tanlash ekrani: bir qurilmada bir necha
 * kassir. Kandidat-kartalar (`GET /auth/pos-pin/candidates` — faol smenaga
 * biriktirilgan, PIN o'rnatgan xodimlar) → karta bosilgach MAVJUD `PinKeypad`
 * bilan PIN → `POST /auth/pos-pin/switch` → javob (aynan pos-login shakli)
 * `acceptAuthResponse` bilan auth-store'ga → BUTUN react-query kesh
 * invalidatsiyasi (yangi shaxs: `smena-mine`, `cashier-session-current` va
 * qolgan hamma so'rov eskirdi) → `onSwitched`.
 *
 * XAVFSIZLIK CHEGARASI serverda: switch o'zi kiosk-juftlikni, joriy kassirning
 * ochiq sessiyasi yo'qligini (409), smena-a'zolikni (403) va PIN'ni (mavjud
 * 5-xato lockout) tekshiradi. Bu ekran faqat QULAYLIK qatlami — shuning uchun
 * `isPosWorkstation()` bo'lmagan muhitda (oddiy admin brauzeri) umuman
 * chizilmaydi, u yerda to'liq login bor.
 *
 * BITTA-NUMPAD invarianti (P6, `pin-entry-single-numpad.test.tsx`): PIN
 * bosqichi FAQAT sahifa tugmalari (`PinKeypad`) — bu daraxtda <input> yo'q,
 * aks holda monoblokda qobiq klaviaturasi bilan ikki panel chiqardi.
 */

/** PIN uzunligi — zanjir bo'ylab AYNAN 4 (`POS_PIN_RE`, kassa-kirish bilan bir xil). */
const PIN_LENGTH = 4;

interface Candidate {
  employeeId: string;
  name: string;
}

/** Lockout — to'liq chiqish + PIN ekrani (ilgari PIN-qulf ham shunday qilardi;
 * qulf 2026-08-16 da olib tashlandi, bu yo'l qoldi). */
async function lockoutExit(): Promise<void> {
  const dest = readPosDevice() || isShersetShell() ? '/kassa-kirish' : '/login';
  await logout();
  window.location.href = dest;
}

export function CashierSelectScreen({
  onSwitched,
  onCancel,
}: {
  /** Muvaffaqiyatli almashinuvdan keyin (kesh allaqachon invalidatsiyalangan). */
  onSwitched: () => void;
  /** Berilsa «Bekor» yo'li chiziladi (tugma-trigger holati); qulf-holatda berilmaydi. */
  onCancel?: () => void;
}) {
  const t = useTranslations('pages.pos');
  const tLock = useTranslations('pages.posLock');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  // SSR/hydration xavfsiz muhit-tekshiruv (kassa-kirish `readPosDevice` naqshi).
  const [workstation, setWorkstation] = useState(false);
  useEffect(() => {
    setWorkstation(isPosWorkstation());
  }, []);

  const [selected, setSelected] = useState<Candidate | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pos-pin-candidates'],
    queryFn: () => api.get<{ cashiers: Candidate[] }>('/auth/pos-pin/candidates'),
    enabled: workstation,
  });

  if (!workstation) return null;

  const submit = async () => {
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      const creds = readPosDevice();
      const auth = await api.post<{ accessToken: string; user: User }>('/auth/pos-pin/switch', {
        employeeId: selected.employeeId,
        pin,
        ...(creds ? { deviceId: creds.deviceId, deviceSecret: creds.deviceSecret } : {}),
      });
      // Tartib muhim: avval token (keyingi so'rovlar yangi kassir nomidan
      // ketsin), keyin kesh — invalidatsiya qo'zg'atgan refetch'lar allaqachon
      // yangi Authorization bilan boradi.
      acceptAuthResponse(auth);
      await qc.invalidateQueries();
      onSwitched();
    } catch (e) {
      const err = e as Error & { body?: { lockout?: boolean; remaining?: number } };
      if (err.body?.lockout) {
        // 5 xato — hisob himoyasi uchun to'liq chiqish (himoya qoidasi qulf
        // olib tashlangandan keyin ham o'zgarmaydi).
        await lockoutExit();
        return;
      }
      const left = err.body?.remaining;
      setError(
        left != null ? tLock('wrong_remaining', { n: left }) : (err.message ?? tLock('wrong')),
      );
      setPin('');
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      data-test-id="cashier-select-screen"
      className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6"
    >
      {selected === null ? (
        <>
          <h2 className="text-center font-bold text-[24px] text-[var(--ms-text-strong)]">
            {t('switch_title')}
          </h2>
          {isLoading ? (
            <p className="text-[16px] text-[var(--ms-text-muted)]">{tCommon('loading')}</p>
          ) : (data?.cashiers.length ?? 0) === 0 ? (
            <p
              data-test-id="cashier-select-empty"
              className="text-[16px] text-[var(--ms-text-muted)]"
            >
              {t('switch_empty')}
            </p>
          ) : (
            <div className="flex w-full max-w-[560px] flex-col gap-3">
              {data?.cashiers.map((c) => (
                <button
                  key={c.employeeId}
                  type="button"
                  data-test-id="cashier-card"
                  onClick={() => {
                    setSelected(c);
                    setPin('');
                    setError(null);
                  }}
                  className="flex h-[96px] items-center gap-4 rounded-2xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-6 text-left shadow-[var(--ms-shadow-sm)] transition-all hover:bg-[var(--ms-bg-hover)] active:scale-[0.98]"
                >
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--pos-brand,#1e5aa8)] font-bold text-[22px] text-white">
                    {(c.name.trim()[0] ?? '?').toUpperCase()}
                  </span>
                  <span className="truncate font-semibold text-[20px] text-[var(--ms-text-primary)]">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          )}
          {onCancel && (
            <button
              type="button"
              data-test-id="cashier-select-cancel"
              onClick={onCancel}
              className="h-[56px] rounded-xl border border-[var(--ms-border)] px-8 text-[16px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
            >
              {tCommon('cancel')}
            </button>
          )}
        </>
      ) : (
        <>
          <h2 className="text-center font-bold text-[22px] text-[var(--ms-text-strong)]">
            {t('switch_pin_for', { name: selected.name })}
          </h2>
          {error && (
            <p className="text-center font-medium text-[16px] text-[var(--ms-destructive-600)]">
              {error}
            </p>
          )}
          <PinKeypad
            value={pin}
            onChange={setPin}
            onSubmit={() => void submit()}
            disabled={pending}
            maxLength={PIN_LENGTH}
          />
          <button
            type="button"
            data-test-id="cashier-select-back"
            onClick={() => {
              setSelected(null);
              setPin('');
              setError(null);
            }}
            className="h-[56px] rounded-xl border border-[var(--ms-border)] px-8 text-[16px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
          >
            {t('switch_back')}
          </button>
        </>
      )}
    </div>
  );
}
