'use client';

import { PinKeypad } from '@/components/pos/pin-keypad';
import { posLogin } from '@/lib/auth-store';
import { readPosDevice } from '@/lib/pos-device';
import { Alert, Container } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Server sxemasi 4–6 raqam kutadi (`PosLoginSchema`). */
const MAX_PIN = 6;

/**
 * Kassa kirishi — FAQAT PIN.
 *
 * 🔴 2026-08-11: «juftlanmagan» ekrani, «Qurilmani juftlash» va «Administrator
 * kirishi» havolalari OLIB TASHLANDI (egasining aniq talabi: «faqat pinkod
 * chiqadi, tamom»). Kassir hech qachon do'kon/kassa tanlamaydi ham — server
 * ularni hisob sukutlaridan oladi (`pos-login.service.ts`).
 *
 * Qurilma kaliti bor bo'lsa (ESKI, juftlangan o'rnatmalar) u hamon yuboriladi
 * va server uni tekshiradi — shuning uchun mavjud kassalar buzilmaydi. Kalit
 * yo'q bo'lsa PIN o'zi yetarli.
 */
export default function KassaKirishPage() {
  const t = useTranslations('kassaLogin');
  const router = useRouter();
  const [device, setDevice] = useState<{ deviceId: string; deviceSecret: string } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Qurilma ma'lumoti FAQAT brauzerda mavjud (Electron ko'prigi yoki
  // localStorage) — shuning uchun effektda, render paytida emas. Topilmasa
  // ham ekran O'ZGARMAYDI: PIN baribir so'raladi.
  useEffect(() => {
    setDevice(readPosDevice());
  }, []);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await posLogin(device, pin);
      router.replace('/sotuv');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_generic'));
      // Xatodan keyin maydon tozalanadi — kassir noto'g'ri raqamni
      // qidirib o'tirmasin.
      setPin('');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ms-bg-navbar)]">
      <Container size="sm" className="py-10">
        <div className="rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] p-8 shadow-[var(--ms-shadow-lg)]">
          <h1 className="text-center font-semibold text-xl">{t('title')}</h1>
          <p className="mt-1 text-center text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
          <div className="mt-6">
            {error && <Alert tone="destructive">{error}</Alert>}
            <PinKeypad
              value={pin}
              onChange={setPin}
              onSubmit={submit}
              disabled={pending}
              maxLength={MAX_PIN}
            />
          </div>
        </div>
      </Container>
    </main>
  );
}
