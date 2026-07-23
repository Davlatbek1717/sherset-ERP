'use client';

/**
 * HR → Sozlamalar → Telegram. MTProto akkauntlarini boshqarish (2-slot
 * failover) + OTP login sehrgari (P4f web).
 *
 *   • Akkaunt qo'shish — slot/telefon/apiId/apiHash (my.telegram.org'dan).
 *   • OTP login — start → kod → (kerak bo'lsa) 2FA parol → sessiya saqlanadi
 *     va akkaunt avtomat faollashadi.
 *   • Faollashtirish faqat sessiya bo'lsa; o'chirish (sessiya + slot tozalanadi).
 */

import { activeTone } from '@/lib/domain-status-tone';
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
  PasswordInput,
  Skeleton,
  useConfirm,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setAdding(true)} data-test-id="hr-tg-add">
          {t('add_account')}
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : query.data && query.data.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-test-id="hr-tg-table">
          <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('col_slot')}</th>
              <th className="px-3 py-2 text-left">{t('col_phone')}</th>
              <th className="px-3 py-2 text-left">{t('col_status')}</th>
              <th className="px-3 py-2 text-left">{t('col_last_connected')}</th>
              <th className="px-3 py-2 text-right">{tCommon('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((acc) => {
              const flooded = acc.floodWaitUntil && new Date(acc.floodWaitUntil) > new Date();
              return (
                <tr
                  key={acc.id}
                  className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                  data-test-id={`hr-tg-row-${acc.id}`}
                >
                  <td className="px-3 py-2 font-medium">#{acc.slot}</td>
                  <td className="px-3 py-2 font-mono">{acc.phoneNumber}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={activeTone(acc.isActive)}>
                        {acc.isActive ? t('status_active') : t('status_inactive')}
                      </Badge>
                      {!acc.hasSession && <Badge tone="warning">{t('status_no_session')}</Badge>}
                      {flooded && <Badge tone="destructive">{t('status_flood')}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {acc.lastConnectedAt
                      ? formatInTimeZone(new Date(acc.lastConnectedAt), TZ, 'yyyy-MM-dd HH:mm')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => setLoginFor(acc)}
                        data-test-id={`hr-tg-login-${acc.id}`}
                      >
                        {acc.hasSession ? t('relogin') : t('login')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={(!acc.hasSession && !acc.isActive) || setActiveMut.isPending}
                        onClick={() => setActiveMut.mutate({ id: acc.id, isActive: !acc.isActive })}
                        data-test-id={`hr-tg-toggle-${acc.id}`}
                      >
                        {acc.isActive ? t('deactivate') : t('activate')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={removeMut.isPending}
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
                        {tCommon('delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('empty')} description={t('empty_hint')} />
      )}

      {adding && (
        <AddAccountModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            toast.success(tCommon('saved'));
            qc.invalidateQueries({ queryKey: QKEY });
            setAdding(false);
          }}
        />
      )}
      {loginFor && (
        <OtpWizardModal
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

function AddAccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
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
            <option value={1}>#1</option>
            <option value={2}>#2</option>
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
      <div className="mt-4 flex justify-end gap-2">
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

function OtpWizardModal({
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startMut = useMutation({
    mutationFn: () => hrTelegramAccountApi.loginStart(account.id),
    onSuccess: (r) => {
      setSessionId(r.loginSessionId);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const codeMut = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error(t('err_start_first'));
      if (!code.trim()) throw new Error(t('err_code'));
      if (needPassword && !password.trim()) throw new Error(t('err_password'));
      return hrTelegramAccountApi.loginCode(
        sessionId,
        code.trim(),
        needPassword ? password.trim() : undefined,
      );
    },
    onSuccess: (r) => {
      if (r.ok) {
        onDone();
      } else if (r.awaitingPassword) {
        setNeedPassword(true);
        setError(null);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const close = () => {
    if (sessionId) hrTelegramAccountApi.loginCancel(sessionId).catch(() => {});
    onClose();
  };

  return (
    <ModalShell
      title={`${t('otp_title')} — ${account.phoneNumber}`}
      onClose={close}
      testId="hr-tg-otp-modal"
    >
      {!sessionId ? (
        <div className="space-y-3">
          <p className="text-[var(--ms-text-muted)] text-sm">{t('otp_start_hint')}</p>
          <Button
            onClick={() => startMut.mutate()}
            disabled={startMut.isPending}
            data-test-id="hr-tg-otp-start"
          >
            {t('otp_send_code')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <FieldRow label={t('otp_code')} hint={t('otp_code_hint')}>
            <Input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-test-id="hr-tg-otp-code"
            />
          </FieldRow>
          {needPassword && (
            <FieldRow label={t('otp_password')} hint={t('otp_password_hint')}>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-test-id="hr-tg-otp-password"
                showLabel={tCommon('show_password')}
                hideLabel={tCommon('hide_password')}
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
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          {tCommon('cancel')}
        </Button>
        {sessionId && (
          <Button
            onClick={() => codeMut.mutate()}
            disabled={codeMut.isPending}
            data-test-id="hr-tg-otp-submit"
          >
            {t('otp_submit')}
          </Button>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  testId,
  children,
}: {
  title: string;
  onClose: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
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
