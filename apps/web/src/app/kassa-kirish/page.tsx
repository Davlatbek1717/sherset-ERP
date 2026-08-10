'use client';

import { PinKeypad } from '@/components/pos/pin-keypad';
import { posLogin } from '@/lib/auth-store';
import { type PosDeviceCreds, readPosDevice } from '@/lib/pos-device';
import { Alert, Container } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Server sxemasi 4–6 raqam kutadi (`PosLoginSchema`). */
const MAX_PIN = 6;

export default function KassaKirishPage() {
  const t = useTranslations('kassaLogin');
  const router = useRouter();
  const [device, setDevice] = useState<PosDeviceCreds | null>(null);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Qurilma ma'lumoti FAQAT brauzerda mavjud (Electron ko'prigi yoki
  // localStorage) — shuning uchun effektda, render paytida emas.
  useEffect(() => {
    setDevice(readPosDevice());
    setReady(true);
  }, []);

  const submit = async () => {
    if (!device || pending) return;
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

  // «Juftlanmagan» shoxi «yuklanmoqda» dan KEYIN kelishi shart: aks holda
  // birinchi kadrda qurilma hali o'qilmagan bo'lgani uchun juftlangan
  // kassada ham bir lahza «juftlanmagan» ekrani chaqnaydi.
  if (!ready) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ms-bg-navbar)]">
      <Container size="sm" className="py-10">
        <div className="rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] p-8 shadow-[var(--ms-shadow-lg)]">
          <h1 className="text-center font-semibold text-xl">{t('title')}</h1>

          {device ? (
            <>
              <p className="mt-1 text-center text-[var(--ms-text-muted)] text-sm">
                {t('subtitle')}
              </p>
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
              <p className="mt-6 text-center text-[var(--ms-text-muted)] text-xs">
                {t('device_label')}: {device.name}
              </p>
            </>
          ) : (
            <div className="mt-6 text-center">
              <p className="font-medium">{t('not_paired_title')}</p>
              <p className="mt-2 text-[var(--ms-text-muted)] text-sm">{t('not_paired_body')}</p>
              <Link
                href="/kassa-kirish/juftlash"
                className="mt-4 inline-block text-[var(--ms-brand-500)] text-sm underline"
              >
                {t('pair_link')}
              </Link>
            </div>
          )}

          <p className="mt-6 text-center">
            <Link href="/login" className="text-[var(--ms-text-muted)] text-xs underline">
              {t('admin_login')}
            </Link>
          </p>
        </div>
      </Container>
    </main>
  );
}
