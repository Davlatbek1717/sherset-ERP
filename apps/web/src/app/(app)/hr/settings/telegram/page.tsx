'use client';

/**
 * Telegram profillari — shaxsiy raqamni MTProto orqali ulash (Wappi/MoySklad
 * uslubidagi «Profil» ekrani, 2026-07-17 talab).
 *
 * MoySklad/Wappi 1:1: «slot failover» jargoni o'rniga «Asosiy / Qo'shimcha
 * profil» tushunchasi (Wappi «primary/additional profiles» bilan bir xil).
 * Har profil kartochka ko'rinishida: telefon · turi · ulanish holati. Ulash
 * wizardi — my.telegram.org'dan apiId/apiHash → telefon → kod → (kerak bo'lsa)
 * 2FA parol → «Ulandi». Uzish (sessiya qoladi, faol emas) + O'chirish.
 *
 * Backend O'ZGARMAGAN — mavjud `hrTelegramAccountApi` (create / login/start /
 * login/code / setActive / remove) ustiga qurilgan.
 */

import {
  type CreateHrTelegramAccountInput,
  type HrTelegramAccountRow,
  hrTelegramAccountApi,
} from '@/lib/hr-api';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  NativeSelect,
  Skeleton,
  useConfirm,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { Check, Phone, Plus, Send, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const TZ = 'Asia/Tashkent';
const QKEY = ['hr-telegram-accounts'];

export default function HrTelegramSettingsPage() {
  const t = useTranslations('pages.hrTelegram');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [adding, setAdding] = useState(false);
  const [loginFor, setLoginFor] = useState<HrTelegramAccountRow | null>(null);

  const query = useQuery<HrTelegramAccountRow[]>({
    queryKey: QKEY,
    queryFn: () => hrTelegramAccountApi.list(),
  });

  const setActiveMut = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) =>
      hrTelegramAccountApi.setActive(v.id, v.isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY }),
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => hrTelegramAccountApi.remove(id),
    onSuccess: () => {
      toast.success(t('deleted'));
      qc.invalidateQueries({ queryKey: QKEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const profileType = (slot: number) =>
    slot === 1 ? t('profile_primary') : t('profile_additional');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="mt-0.5 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setAdding(true)} data-test-id="hr-tg-add">
          <Plus className="h-4 w-4" />
          {t('add_account')}
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : query.data && query.data.length > 0 ? (
        <div className="space-y-3" data-test-id="hr-tg-list">
          {query.data.map((acc) => {
            const flooded = !!acc.floodWaitUntil && new Date(acc.floodWaitUntil) > new Date();
            return (
              <div
                key={acc.id}
                className="flex flex-wrap items-center gap-4 rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
                data-test-id={`hr-tg-row-${acc.id}`}
              >
                {/* Telegram avatar-doira (Wappi uslubi) */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f3fc] text-[#2ca5e0]">
                  <Send className="h-5 w-5 -rotate-45" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-[var(--ms-text-primary)]">
                      {acc.phoneNumber}
                    </span>
                    {acc.isActive ? (
                      <Badge tone="success">
                        <Check className="mr-0.5 inline h-3 w-3" />
                        {t('status_active')}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t('status_inactive')}</Badge>
                    )}
                    {!acc.hasSession && <Badge tone="warning">{t('status_no_session')}</Badge>}
                    {flooded && <Badge tone="destructive">{t('status_flood')}</Badge>}
                  </div>
                  <div className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
                    {profileType(acc.slot)} · {t('col_slot')} #{acc.slot}
                    {acc.lastConnectedAt
                      ? ` · ${formatInTimeZone(new Date(acc.lastConnectedAt), TZ, 'yyyy-MM-dd HH:mm')}`
                      : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setLoginFor(acc)}
                    data-test-id={`hr-tg-login-${acc.id}`}
                  >
                    {acc.hasSession ? t('relogin') : t('login')}
                  </Button>
                  {acc.hasSession && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={setActiveMut.isPending}
                      onClick={() => setActiveMut.mutate({ id: acc.id, isActive: !acc.isActive })}
                      data-test-id={`hr-tg-toggle-${acc.id}`}
                    >
                      {acc.isActive ? t('deactivate') : t('activate')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removeMut.isPending}
                    aria-label={tCommon('delete')}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('delete_confirm'),
                        confirmLabel: tCommon('delete'),
                        tone: 'destructive',
                      });
                      if (ok) removeMut.mutate(acc.id);
                    }}
                    data-test-id={`hr-tg-delete-${acc.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-[var(--ms-text-destructive)]" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title={t('empty')} description={t('empty_hint')} />
      )}

      {adding && (
        <AddProfileModal
          onClose={() => setAdding(false)}
          onSaved={(created) => {
            toast.success(tCommon('saved'));
            qc.invalidateQueries({ queryKey: QKEY });
            setAdding(false);
            // Yaratilgach darhol ulash wizardini ochamiz (Wappi oqimi).
            setLoginFor(created);
          }}
        />
      )}
      {loginFor && (
        <ConnectWizardModal
          account={loginFor}
          onClose={() => setLoginFor(null)}
          onDone={() => {
            toast.success(t('login_success'));
            qc.invalidateQueries({ queryKey: QKEY });
            setLoginFor(null);
          }}
        />
      )}
    </div>
  );
}

function AddProfileModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (created: HrTelegramAccountRow) => void;
}) {
  const t = useTranslations('pages.hrTelegram');
  const tCommon = useTranslations('common');
  const [slot, setSlot] = useState<1 | 2>(1);
  const [phoneNumber, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () => {
      const idNum = Number(apiId);
      if (!phoneNumber.trim()) throw new Error(t('err_phone'));
      if (!Number.isInteger(idNum) || idNum <= 0) throw new Error(t('err_api_id'));
      if (apiHash.trim().length < 20) throw new Error(t('err_api_hash'));
      const data: CreateHrTelegramAccountInput = {
        slot,
        phoneNumber: phoneNumber.trim(),
        apiId: idNum,
        apiHash: apiHash.trim(),
      };
      return hrTelegramAccountApi.create(data);
    },
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <ModalShell title={t('add_account')} onClose={onClose} testId="hr-tg-add-modal">
      <div className="space-y-3">
        <FieldRow label={t('slot')}>
          <NativeSelect value={slot} onChange={(e) => setSlot(Number(e.target.value) as 1 | 2)}>
            <option value={1}>{t('profile_primary')}</option>
            <option value={2}>{t('profile_additional')}</option>
          </NativeSelect>
        </FieldRow>
        <FieldRow label={t('col_phone')}>
          <Input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998901234567"
            data-test-id="hr-tg-phone"
          />
        </FieldRow>
        <FieldRow label={t('api_id')} hint={t('credentials_hint')}>
          <Input
            type="text"
            inputMode="numeric"
            value={apiId}
            onChange={(e) => setApiId(e.target.value)}
            data-test-id="hr-tg-apiid"
          />
        </FieldRow>
        <FieldRow label={t('api_hash')}>
          <Input
            type="text"
            value={apiHash}
            onChange={(e) => setApiHash(e.target.value)}
            data-test-id="hr-tg-apihash"
          />
        </FieldRow>
        {error && (
          <div className="text-[var(--ms-text-destructive)] text-sm" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {tCommon('cancel')}
        </Button>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          data-test-id="hr-tg-save"
        >
          {tCommon('save')}
        </Button>
      </div>
    </ModalShell>
  );
}

/**
 * Ulash wizardi — MoySklad/Wappi 1:1 bosqichli oqim:
 *   phone → «Kod yuborish» → code → (2FA parol, kerak bo'lsa) → «Ulandi ✓».
 */
function ConnectWizardModal({
  account,
  onClose,
  onDone,
}: {
  account: HrTelegramAccountRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('pages.hrTelegram');
  const tCommon = useTranslations('common');
  type Step = 'phone' | 'code' | 'password';
  const [step, setStep] = useState<Step>('phone');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startMut = useMutation({
    mutationFn: () => hrTelegramAccountApi.loginStart(account.id),
    onSuccess: (r) => {
      setSessionId(r.loginSessionId);
      setStep('code');
      setError(null);
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
        onDone();
      } else if (r.awaitingPassword) {
        setStep('password');
        setError(null);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const close = () => {
    if (sessionId) hrTelegramAccountApi.loginCancel(sessionId).catch(() => {});
    onClose();
  };

  // Bosqich indikatori (Wappi uslubi — sarlavha ostidagi qadam nomi).
  const stepTitle =
    step === 'phone'
      ? t('otp_step_phone')
      : step === 'code'
        ? t('otp_step_code')
        : t('otp_step_password');

  return (
    <ModalShell
      title={`${t('otp_title')} — ${account.phoneNumber}`}
      subtitle={stepTitle}
      onClose={close}
      testId="hr-tg-otp-modal"
    >
      {step === 'phone' ? (
        <div className="space-y-3">
          <p className="text-[var(--ms-text-muted)] text-sm">{t('otp_start_hint')}</p>
          <Button
            onClick={() => startMut.mutate()}
            disabled={startMut.isPending}
            data-test-id="hr-tg-otp-start"
          >
            <Phone className="h-4 w-4" />
            {t('otp_send_code')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <FieldRow label={t('otp_code')} hint={t('otp_code_hint')}>
            <Input
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-test-id="hr-tg-otp-code"
            />
          </FieldRow>
          {step === 'password' && (
            <FieldRow label={t('otp_password')} hint={t('otp_password_hint')}>
              <Input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-test-id="hr-tg-otp-password"
              />
            </FieldRow>
          )}
        </div>
      )}
      {error && (
        <div className="mt-3 text-[var(--ms-text-destructive)] text-sm" role="alert">
          {error}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {tCommon('cancel')}
        </Button>
        {step !== 'phone' && (
          <Button
            onClick={() => codeMut.mutate()}
            disabled={codeMut.isPending}
            data-test-id="hr-tg-otp-submit"
          >
            <Check className="h-4 w-4" />
            {t('otp_submit')}
          </Button>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  testId,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      // biome-ignore lint/a11y/useSemanticElements: role=dialog + ESC matches other HR modals; native <dialog> breaks tanstack-query flow
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      data-test-id={testId}
    >
      <div className="w-full max-w-md rounded-[var(--ms-radius-lg)] bg-[var(--ms-bg-surface)] p-6 shadow-xl">
        <h2 className="font-semibold text-[var(--ms-text-strong)] text-lg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[var(--ms-text-muted)] text-sm">{subtitle}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-[var(--ms-text-primary)] text-sm">{label}</span>
      {children}
      {hint && <span className="text-[var(--ms-text-muted)] text-xs">{hint}</span>}
    </div>
  );
}
