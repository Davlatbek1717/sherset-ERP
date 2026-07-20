'use client';

/**
 * Telegram raqamlarini ulash — SODDALASHTIRILGAN oqim (2026-07-17 talab:
 * «profil qo'shish shart bo'lmasin, faqat telefon raqam ulanadi»), 2026-07-20
 * ikkinchi (zaxira) raqam qo'llab-quvvatlashi bilan kengaytirildi.
 *
 * SABAB (2026-07-20): bitta raqam Telegram flood-wait'ga uchraganda
 * (contacts.GetContacts — qisqa vaqtda ko'p YANGI mijoz raqamiga yozilganda
 * ishga tushadi, 1-2+ soatga bloklaydi) hamma xabar to'xtab qolardi — worker
 * (mtproto-worker.service.ts) ikkinchi slotga avtomatik o'tishga tayyor edi,
 * lekin bu sahifa faqat slot-1'ni ulash imkonini berardi. Endi ikkala slot
 * ham shu yerda, mustaqil ravishda ulanadi: 1-raqam bloklansa, worker
 * avtomatik 2-raqamga o'tadi.
 *
 * Foydalanuvchi har bir slot uchun FAQAT telefonini kiritadi (apiId/apiHash
 * serverning env'ida — ilova kaliti, ikkala slot ham bir xilini ishlatadi).
 * Oqim: telefon → «Kod yuborish» → Telegram'ga kelgan kod → (kerak bo'lsa)
 * 2FA parol → «Ulandi».
 */

import { type HrTelegramAccountRow, hrTelegramAccountApi } from '@/lib/hr-api';
import { Badge, Button, Input, Skeleton, useConfirm, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { Check, Phone, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const TZ = 'Asia/Tashkent';
const QKEY = ['hr-telegram-accounts'];
const SLOTS = [1, 2] as const;

export default function HrTelegramSettingsPage() {
  const t = useTranslations('pages.hrTelegram');

  const query = useQuery<HrTelegramAccountRow[]>({
    queryKey: QKEY,
    queryFn: () => hrTelegramAccountApi.list(),
  });

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
        <p className="mt-0.5 text-[var(--ms-text-muted)] text-sm">{t('subtitle_dual')}</p>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-6">
          {SLOTS.map((slot) => (
            <SlotSection
              key={slot}
              slot={slot}
              account={(query.data ?? []).find((a) => a.slot === slot) ?? null}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SlotSection({
  slot,
  account: acc,
  t,
}: {
  slot: 1 | 2;
  account: HrTelegramAccountRow | null;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const connected = !!acc?.hasSession;

  type Step = 'phone' | 'code' | 'password';
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetFlow = () => {
    setStep('phone');
    setPhone('');
    setSessionId(null);
    setCode('');
    setPassword('');
    setError(null);
  };

  const startMut = useMutation({
    mutationFn: async () => {
      if (!phone.trim()) throw new Error(t('err_phone'));
      const created = await hrTelegramAccountApi.connect(phone.trim(), slot);
      return hrTelegramAccountApi.loginStart(created.id);
    },
    onSuccess: (r) => {
      setSessionId(r.loginSessionId);
      setStep('code');
      setError(null);
      qc.invalidateQueries({ queryKey: QKEY });
    },
    onError: (e: Error) => setError(e.message),
  });

  const codeMut = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error(t('err_start_first'));
      if (!code.trim()) throw new Error(t('err_code'));
      if (step === 'password' && !password.trim()) throw new Error(t('err_password'));
      return hrTelegramAccountApi.loginCode(
        sessionId,
        code.trim(),
        step === 'password' ? password.trim() : undefined,
      );
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(t('login_success'));
        resetFlow();
        qc.invalidateQueries({ queryKey: QKEY });
      } else if (r.awaitingPassword) {
        setStep('password');
        setError(null);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const resendMut = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error(t('err_start_first'));
      return hrTelegramAccountApi.loginResend(sessionId);
    },
    onSuccess: () => {
      setError(null);
      toast.success(t('otp_resent'));
    },
    onError: (e: Error) => setError(e.message),
  });

  const setActiveMut = useMutation({
    mutationFn: (isActive: boolean) => hrTelegramAccountApi.setActive(acc?.id ?? '', isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY }),
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: () => hrTelegramAccountApi.remove(acc?.id ?? ''),
    onSuccess: () => {
      toast.success(t('deleted'));
      resetFlow();
      qc.invalidateQueries({ queryKey: QKEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flooded = !!acc?.floodWaitUntil && new Date(acc.floodWaitUntil) > new Date();
  const stepTitle =
    step === 'phone'
      ? t('otp_step_phone')
      : step === 'code'
        ? t('otp_step_code')
        : t('otp_step_password');
  const slotLabel = slot === 1 ? t('profile_primary') : t('profile_additional');
  const slotHint = slot === 1 ? t('slot1_hint') : t('slot2_hint');

  return (
    <div data-test-id={`hr-tg-slot-${slot}`}>
      <div className="mb-2">
        <span className="font-medium text-[var(--ms-text-primary)] text-sm">{slotLabel}</span>
        <p className="text-[var(--ms-text-muted)] text-xs">{slotHint}</p>
      </div>

      {connected ? (
        <div
          className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5"
          data-test-id="hr-tg-connected"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e8f3fc] text-[#2ca5e0]">
              <Send className="-rotate-45 h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-[var(--ms-text-primary)] text-lg">
                  {acc?.phoneNumber}
                </span>
                {acc?.isActive ? (
                  <Badge tone="success">
                    <Check className="mr-0.5 inline h-3 w-3" />
                    {t('status_active')}
                  </Badge>
                ) : (
                  <Badge tone="neutral">{t('status_inactive')}</Badge>
                )}
                {flooded && <Badge tone="destructive">{t('status_flood')}</Badge>}
              </div>
              {acc?.lastConnectedAt && (
                <div className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
                  {t('col_last_connected')}:{' '}
                  {formatInTimeZone(new Date(acc.lastConnectedAt), TZ, 'yyyy-MM-dd HH:mm')}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={setActiveMut.isPending}
              onClick={() => setActiveMut.mutate(!acc?.isActive)}
              data-test-id="hr-tg-toggle"
            >
              {acc?.isActive ? t('deactivate') : t('activate')}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => {
                setPhone(acc?.phoneNumber ?? '');
                startMut.mutate();
              }}
              disabled={startMut.isPending}
              data-test-id="hr-tg-relogin"
            >
              {t('relogin')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={removeMut.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: t('delete_confirm'),
                  confirmLabel: tCommon('delete'),
                  tone: 'destructive',
                });
                if (ok) removeMut.mutate();
              }}
              data-test-id="hr-tg-delete"
            >
              {tCommon('delete')}
            </Button>
          </div>

          {step !== 'phone' && (
            <div className="mt-4 space-y-3 border-[var(--ms-border-default)] border-t pt-4">
              <CodeFields
                step={step}
                code={code}
                setCode={setCode}
                password={password}
                setPassword={setPassword}
                t={t}
              />
              {error && (
                <div className="text-[var(--ms-text-destructive)] text-sm" role="alert">
                  {error}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => codeMut.mutate()}
                  disabled={codeMut.isPending}
                  data-test-id="hr-tg-otp-submit"
                >
                  <Check className="h-4 w-4" />
                  {t('otp_submit')}
                </Button>
                {step === 'code' && (
                  <button
                    type="button"
                    onClick={() => resendMut.mutate()}
                    disabled={resendMut.isPending}
                    className="text-[var(--ms-text-brand)] text-sm hover:underline disabled:opacity-50"
                    data-test-id="hr-tg-otp-resend"
                  >
                    {t('otp_resend')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="space-y-4 rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5"
          data-test-id="hr-tg-connect"
        >
          <div className="text-[var(--ms-text-muted)] text-sm">{stepTitle}</div>

          {step === 'phone' ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                  {t('col_phone')}
                </span>
                <Input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998901234567"
                  data-test-id="hr-tg-phone"
                />
                <span className="text-[var(--ms-text-muted)] text-xs">{t('otp_start_hint')}</span>
              </div>
              <Button
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending || !phone.trim()}
                data-test-id="hr-tg-otp-start"
              >
                <Phone className="h-4 w-4" />
                {t('otp_send_code')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <CodeFields
                step={step}
                code={code}
                setCode={setCode}
                password={password}
                setPassword={setPassword}
                t={t}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => codeMut.mutate()}
                  disabled={codeMut.isPending}
                  data-test-id="hr-tg-otp-submit"
                >
                  <Check className="h-4 w-4" />
                  {t('otp_submit')}
                </Button>
                <Button variant="secondary" onClick={resetFlow}>
                  {tCommon('cancel')}
                </Button>
                {step === 'code' && (
                  <button
                    type="button"
                    onClick={() => resendMut.mutate()}
                    disabled={resendMut.isPending}
                    className="text-[var(--ms-text-brand)] text-sm hover:underline disabled:opacity-50"
                    data-test-id="hr-tg-otp-resend"
                  >
                    {t('otp_resend')}
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="text-[var(--ms-text-destructive)] text-sm" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CodeFields({
  step,
  code,
  setCode,
  password,
  setPassword,
  t,
}: {
  step: 'code' | 'password';
  code: string;
  setCode: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  t: (k: string) => string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-[var(--ms-text-primary)] text-sm">{t('otp_code')}</span>
        <Input
          type="text"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          data-test-id="hr-tg-otp-code"
        />
        <span className="text-[var(--ms-text-muted)] text-xs">{t('otp_code_hint')}</span>
      </div>
      {step === 'password' && (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[var(--ms-text-primary)] text-sm">
            {t('otp_password')}
          </span>
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-test-id="hr-tg-otp-password"
          />
          <span className="text-[var(--ms-text-muted)] text-xs">{t('otp_password_hint')}</span>
        </div>
      )}
    </>
  );
}
