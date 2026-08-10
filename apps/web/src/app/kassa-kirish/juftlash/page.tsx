'use client';

import { api } from '@/lib/api-client';
import { login } from '@/lib/auth-store';
import { writePosDevice } from '@/lib/pos-device';
import {
  Alert,
  Button,
  Container,
  FormField,
  Input,
  NativeSelect,
  PasswordInput,
} from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

interface NamedRow {
  id: string;
  name: string;
}

/**
 * Qurilmani juftlash — BIR MARTALIK admin amali.
 *
 * NEGA WEB'DA, Electron'da emas: bitta implementatsiya ikkala muhitda ishlaydi
 * va brauzerda QA qilinadi. Electron faqat XAVFSIZ SAQLASH beradi
 * (`writePosDevice` uni o'zi tanlaydi).
 *
 * O'lchangan shartnomalar: `api.get<T>(path)` / `api.post<T>(path, body)` —
 * `api-client.ts:159-163`. Ro'yxat javobi `{ items, total }` —
 * `apps/api/src/modules/reference/reference.controller.ts:62,85,113`
 * (`@Controller()` — ya'ni `/api/v1/stores`, prefikssiz).
 */
export default function JuftlashPage() {
  const t = useTranslations('kassaLogin');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [step, setStep] = useState<'login' | 'select'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [stores, setStores] = useState<NamedRow[]>([]);
  const [desks, setDesks] = useState<NamedRow[]>([]);
  const [orgs, setOrgs] = useState<NamedRow[]>([]);
  const [storeId, setStoreId] = useState('');
  const [cashDeskId, setCashDeskId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const doLogin = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(identifier, password);
      const [s, d, o] = await Promise.all([
        api.get<{ items: NamedRow[] }>('/stores'),
        api.get<{ items: NamedRow[] }>('/cash-desks'),
        api.get<{ items: NamedRow[] }>('/organizations'),
      ]);
      setStores(s.items);
      setDesks(d.items);
      setOrgs(o.items);
      setStep('select');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_unknown'));
    } finally {
      setPending(false);
    }
  };

  const doPair = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ deviceId: string; deviceSecret: string; name: string }>(
        '/auth/pos-device/pair',
        { name, storeId, cashDeskId, organizationId },
      );
      // Kalit FAQAT shu javobda keladi — darhol saqlaymiz, aks holda
      // qurilmani qayta juftlash kerak bo'ladi.
      writePosDevice(res);
      router.replace('/kassa-kirish');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_unknown'));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ms-bg-navbar)]">
      <Container size="sm" className="py-10">
        <div className="rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] p-8 shadow-[var(--ms-shadow-lg)]">
          <h1 className="font-semibold text-xl">{t('pair_link')}</h1>
          {error && (
            <div className="mt-4">
              <Alert tone="destructive">{error}</Alert>
            </div>
          )}

          {step === 'login' ? (
            <form onSubmit={doLogin} className="mt-6 space-y-4">
              <FormField id="pair-id" label={t('admin_login')} required>
                <Input
                  id="pair-id"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </FormField>
              <FormField id="pair-pw" label={t('admin_password')} required>
                <PasswordInput
                  id="pair-pw"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  showLabel={tCommon('show_password')}
                  hideLabel={tCommon('hide_password')}
                />
              </FormField>
              <Button type="submit" className="w-full" loading={pending} disabled={pending}>
                {pending ? t('submitting') : t('submit')}
              </Button>
            </form>
          ) : (
            <form onSubmit={doPair} className="mt-6 space-y-4">
              <FormField id="pair-name" label={t('pair_device_name')} required>
                <Input
                  id="pair-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </FormField>
              <FormField id="pair-store" label={t('pair_store')} required>
                <Selector id="pair-store" rows={stores} value={storeId} onChange={setStoreId} />
              </FormField>
              <FormField id="pair-desk" label={t('pair_cash_desk')} required>
                <Selector id="pair-desk" rows={desks} value={cashDeskId} onChange={setCashDeskId} />
              </FormField>
              <FormField id="pair-org" label={t('pair_organization')} required>
                <Selector
                  id="pair-org"
                  rows={orgs}
                  value={organizationId}
                  onChange={setOrganizationId}
                />
              </FormField>
              <Button
                type="submit"
                className="w-full"
                loading={pending}
                disabled={pending || !name || !storeId || !cashDeskId || !organizationId}
              >
                {pending ? t('submitting') : t('submit')}
              </Button>
            </form>
          )}
        </div>
      </Container>
    </main>
  );
}

function Selector({
  id,
  rows,
  value,
  onChange,
}: {
  id: string;
  rows: NamedRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  // Xom `<select>` TAQIQ (UI Convention 8, `raw-element-conventions.test.ts`) —
  // DS primitivi kanonik ko'rinishni konstruksiya bo'yicha beradi.
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">—</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </NativeSelect>
  );
}
