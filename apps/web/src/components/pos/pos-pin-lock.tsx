'use client';

/**
 * POS PIN-qulf (kassa TZ §3.2).
 *
 * NEGA QAYTA LOGIN EMAS: 5 daqiqa harakatsizlikdan keyin ekran qulflanadi va
 * PIN bilan qaytiladi. To'liq chiqish **savatni yo'qotardi** — kassir mijoz
 * oldida hamma narsani qaytadan terishga majbur bo'lardi va birinchi imkoniyatda
 * qulfni o'chirishga urinardi. Qulf ustki qatlam (overlay) sifatida turadi,
 * POS holati ostida saqlanib qoladi.
 *
 * NEGA UMUMAN KERAK: «erkin kassir» modelida (narx, qarz, xarajat, qaytarish
 * erkin) asosiy xavf — kassir hisobidan **boshqa odamning** sotuvi. Audit
 * jurnali kim qilganini yozadi, lekin hisob ochiq qolgan bo'lsa jurnal
 * noto'g'ri odamni ko'rsatadi.
 */

import { CashierSelectScreen } from '@/components/pos/cashier-select-screen';
import { api } from '@/lib/api-client';
import { logout } from '@/lib/auth-store';
import { isPosWorkstation, isShersetShell, readPosDevice } from '@/lib/pos-device';
import { Button, Input } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Harakatsizlik chegarasi — serverdagi `POS_LOCK_IDLE_MINUTES` bilan bir xil. */
const IDLE_MS = 5 * 60 * 1000;

/** Foydalanuvchi «tirik» ekanini bildiruvchi hodisalar. */
const ACTIVITY = ['mousedown', 'keydown', 'touchstart', 'wheel'] as const;

export function PosPinLock() {
  const t = useTranslations('pages.posLock');
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // F8 (spec §8.4): qulf tushganda kassirning OCHIQ sessiyasi bo'lmasa —
  // PIN-maydon o'rniga kassir-tanlash ekrani (smena yopiq, ekran «egasiz»:
  // istalgan kassir o'z PIN'i bilan ishga tushadi). Sessiya BOR bo'lsa
  // xulq o'zgarmaydi: faqat egasining PIN'i ochadi, lockout ham o'sha.
  const [noSession, setNoSession] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PIN o'rnatilmagan bo'lsa qulf umuman ishlamaydi — kassirni o'z ekranidan
  // qulflab qo'yish (chiqa olmaydigan holat) eng yomon variant bo'lardi.
  useEffect(() => {
    let alive = true;
    api
      .get<{ hasPin: boolean }>('/auth/pos-pin')
      .then((r) => alive && setHasPin(r.hasPin))
      .catch(() => alive && setHasPin(false));
    return () => {
      alive = false;
    };
  }, []);

  // Sessiya holati qulf TUSHGAN paytda bir marta so'raladi (polling emas).
  // So'rov yiqilsa — fail-safe: oddiy PIN-qulf qoladi (lockout xulqi buziladigan
  // yo'l yo'q). `noSession` qulf ochilganda tozalanadi.
  useEffect(() => {
    if (!locked) {
      setNoSession(false);
      return;
    }
    let alive = true;
    api
      .get<{ id: string } | null>('/cashier-sessions/current')
      .then((r) => alive && setNoSession(r === null))
      .catch(() => alive && setNoSession(false));
    return () => {
      alive = false;
    };
  }, [locked]);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLocked(true), IDLE_MS);
  }, []);

  useEffect(() => {
    if (!hasPin || locked) return;
    arm();
    for (const ev of ACTIVITY) window.addEventListener(ev, arm, { passive: true });
    return () => {
      for (const ev of ACTIVITY) window.removeEventListener(ev, arm);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [hasPin, locked, arm]);

  const unlock = async () => {
    setPending(true);
    setError(null);
    try {
      await api.post('/auth/pos-pin/verify', { pin });
      setPin('');
      setLocked(false);
      arm();
    } catch (e) {
      const err = e as { body?: { lockout?: boolean; remaining?: number }; message?: string };
      if (err.body?.lockout) {
        // 5 xato → hisob boshqa odamda bo'lishi mumkin: to'liq chiqamiz.
        // Kassa ish o'rnida (juftlangan qurilma YOKI .exe qobig'i) PIN
        // ekraniga qaytamiz — kassir PAROLNI bilmaydi, `/login` ga tashlansa
        // kassa jimgina o'lik qolardi. Oddiy brauzerda PIN ekrani foydasiz ⇒
        // `/login` qoladi. Qobiq sharti 2026-08-13 da qo'shildi: juftlash
        // olib tashlangach yangi o'rnatmalarda qurilma kaliti yo'q.
        const dest = readPosDevice() || isShersetShell() ? '/kassa-kirish' : '/login';
        await logout();
        window.location.href = dest;
        return;
      }
      const left = err.body?.remaining;
      setError(left != null ? t('wrong_remaining', { n: left }) : (err.message ?? t('wrong')));
      setPin('');
    } finally {
      setPending(false);
    }
  };

  if (!locked) return null;

  // F8 — smena yopiq: qulf o'rnida kassir-tanlash (faqat kassa ish o'rnida;
  // muvaffaqiyatli almashinuvdan keyin qulf ochiladi, taymer effekt orqali
  // qayta quriladi). Bekor-yo'li ATAYLAB yo'q — bu hamon qulf.
  if (noSession && isPosWorkstation()) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-[var(--ms-bg-navbar)]/95 backdrop-blur-sm"
        data-test-id="pos-pin-lock"
      >
        <CashierSelectScreen onSwitched={() => setLocked(false)} />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--ms-bg-navbar)]/95 backdrop-blur-sm"
      data-test-id="pos-pin-lock"
    >
      <div className="w-[320px] rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-surface)] p-6 shadow-lg">
        <h2 className="mb-1 text-center font-semibold text-[var(--ms-text-strong)] text-lg">
          {t('title')}
        </h2>
        {/* Savat saqlanib qolgani ochiq aytiladi — kassir vahima qilmasin. */}
        <p className="mb-4 text-center text-[var(--ms-text-muted)] text-sm">{t('hint')}</p>

        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          // AYNAN 4 (`POS_PIN_RE`). `maxLength` qobiq klaviaturasi yuborgan
          // kalitni ham to'sadi — u brauzer kiritish yo'lidan o'tadi.
          maxLength={4}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pin.length === 4) void unlock();
          }}
          className="text-center text-2xl tracking-[0.5em]"
          data-test-id="pos-pin-input"
        />

        {error && (
          <p className="mt-2 text-center text-[var(--ms-destructive-600)] text-sm">{error}</p>
        )}

        <Button
          className="mt-4 w-full"
          onClick={() => void unlock()}
          disabled={pending || pin.length !== 4}
          data-test-id="pos-pin-submit"
        >
          {t('unlock')}
        </Button>
      </div>
    </div>
  );
}
