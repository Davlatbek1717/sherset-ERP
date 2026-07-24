'use client';

/**
 * HR → Sozlamalar → Davomat bildirishnoma.
 *
 * Xodim «Keldi»/«Ketdi» bosganda direktorning Telegram «Saqlangan xabarlar»iga
 * bildirishnoma yuborishni sozlaydi: umumiy yoqish, avto-jarima (kechikish →
 * ledger) va direktor profili (slot) tanlash + test xabar.
 *
 * Direktor login OTP sehrgari mavjud `/hr/settings/telegram` sahifasida — bu yerda
 * uni takrorlamay, mavjud slotlardan tanlash + o'sha sahifaga havola beriladi.
 *
 * Status: Phase-1 (strukturaviy) — real Telegram yetkazish tasdiqlanmagan.
 */

import {
  type HrDavomatNotifyConfig,
  type HrTelegramAccountRow,
  type UpdateHrDavomatNotifyConfigInput,
  getDavomatNotifyConfig,
  hrTelegramAccountApi,
  sendDavomatNotifyTest,
  updateDavomatNotifyConfig,
} from '@/lib/hr-api';
import { Badge, Button, Input, NativeSelect, Skeleton, Switch, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const CFG_KEY = ['hr-attendance-notify-config'];
const ACC_KEY = ['hr-telegram-accounts'];

/** UI form shape — money kept as so'm string for the input, converted on save. */
interface FormState {
  enabled: boolean;
  notifyCheckIn: boolean;
  notifyCheckOut: boolean;
  directorSlot: number | null;
  lateFineEnabled: boolean;
  lateThresholdMin: number;
  lateFineSom: string;
  lateFinePerMinute: boolean;
}

/** tiyin (string) → so'm (string, human input). */
function minorToSom(minor: string): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n) / 100);
}

/** so'm (input) → tiyin (string, BigInt on the wire). */
function somToMinor(som: string): string {
  const n = Number(som);
  if (!Number.isFinite(n) || n < 0) return '0';
  return String(Math.round(n * 100));
}

function toForm(cfg: HrDavomatNotifyConfig): FormState {
  return {
    enabled: cfg.enabled,
    notifyCheckIn: cfg.notifyCheckIn,
    notifyCheckOut: cfg.notifyCheckOut,
    directorSlot: cfg.directorSlot,
    lateFineEnabled: cfg.lateFineEnabled,
    lateThresholdMin: cfg.lateThresholdMin,
    lateFineSom: minorToSom(cfg.lateFineAmountMinor),
    lateFinePerMinute: cfg.lateFinePerMinute,
  };
}

export default function HrNotifySettingsPage() {
  const t = useTranslations('pages.hrNotify');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState | null>(null);

  const cfgQuery = useQuery<HrDavomatNotifyConfig>({
    queryKey: CFG_KEY,
    queryFn: () => getDavomatNotifyConfig(),
  });
  const accQuery = useQuery<HrTelegramAccountRow[]>({
    queryKey: ACC_KEY,
    queryFn: () => hrTelegramAccountApi.list(),
  });

  useEffect(() => {
    if (cfgQuery.data && form === null) setForm(toForm(cfgQuery.data));
  }, [cfgQuery.data, form]);

  const saveMut = useMutation({
    mutationFn: (dto: UpdateHrDavomatNotifyConfigInput) => updateDavomatNotifyConfig(dto),
    onSuccess: (saved) => {
      qc.setQueryData(CFG_KEY, saved);
      setForm(toForm(saved));
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const testMut = useMutation({
    mutationFn: () => sendDavomatNotifyTest(),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(t('test_sent_ok'));
      } else {
        const reasonKey =
          res.reason === 'no_director_slot'
            ? t('reason_no_director_slot')
            : res.reason === 'not_wired'
              ? t('reason_not_wired')
              : (res.reason ?? '');
        toast.error(t('test_failed'), { description: reasonKey });
      }
    },
    onError: (e: Error) => toast.error(t('test_failed'), { description: e.message }),
  });

  if (cfgQuery.isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const accounts = accQuery.data ?? [];
  const selectedAcc = accounts.find((a) => a.slot === form.directorSlot) ?? null;

  const save = () => {
    saveMut.mutate({
      enabled: form.enabled,
      notifyCheckIn: form.notifyCheckIn,
      notifyCheckOut: form.notifyCheckOut,
      directorSlot: form.directorSlot,
      lateFineEnabled: form.lateFineEnabled,
      lateThresholdMin: form.lateThresholdMin,
      lateFineAmountMinor: somToMinor(form.lateFineSom),
      lateFinePerMinute: form.lateFinePerMinute,
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
        <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        <p className="mt-1 text-[var(--ms-text-muted)] text-xs italic">{t('phase1_note')}</p>
      </div>

      {/* ── Umumiy ──────────────────────────────────────────────── */}
      <Section title={t('section_general')}>
        <SwitchRow
          id="notify-enabled"
          label={t('enable')}
          hint={t('enable_hint')}
          checked={form.enabled}
          onChange={(v) => setForm({ ...form, enabled: v })}
          testId="notify-enabled"
        />
        <SwitchRow
          id="notify-check-in"
          label={t('notify_check_in')}
          checked={form.notifyCheckIn}
          onChange={(v) => setForm({ ...form, notifyCheckIn: v })}
          testId="notify-check-in"
        />
        <SwitchRow
          id="notify-check-out"
          label={t('notify_check_out')}
          checked={form.notifyCheckOut}
          onChange={(v) => setForm({ ...form, notifyCheckOut: v })}
          testId="notify-check-out"
        />
      </Section>

      {/* ── Avto-jarima ─────────────────────────────────────────── */}
      <Section title={t('section_late_fine')}>
        <SwitchRow
          id="late-fine-enabled"
          label={t('late_fine_enable')}
          hint={t('late_fine_enable_hint')}
          checked={form.lateFineEnabled}
          onChange={(v) => setForm({ ...form, lateFineEnabled: v })}
          testId="late-fine-enabled"
        />
        <FieldRow label={t('late_threshold')} hint={t('late_threshold_hint')}>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={String(form.lateThresholdMin)}
            disabled={!form.lateFineEnabled}
            onChange={(e) =>
              setForm({ ...form, lateThresholdMin: Math.max(0, Number(e.target.value) || 0) })
            }
            data-test-id="notify-late-threshold"
          />
        </FieldRow>
        <FieldRow label={t('late_fine_amount')}>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={form.lateFineSom}
            disabled={!form.lateFineEnabled}
            onChange={(e) => setForm({ ...form, lateFineSom: e.target.value })}
            data-test-id="notify-late-amount"
          />
        </FieldRow>
        <FieldRow label={t('late_fine_mode')}>
          <NativeSelect
            value={form.lateFinePerMinute ? 'per_minute' : 'flat'}
            disabled={!form.lateFineEnabled}
            onChange={(e) =>
              setForm({ ...form, lateFinePerMinute: e.target.value === 'per_minute' })
            }
            data-test-id="notify-late-mode"
          >
            <option value="flat">{t('late_fine_flat')}</option>
            <option value="per_minute">{t('late_fine_per_minute')}</option>
          </NativeSelect>
        </FieldRow>
      </Section>

      {/* ── Direktor Telegram ───────────────────────────────────── */}
      <Section title={t('section_director')}>
        {accounts.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm">{t('director_no_accounts')}</p>
        ) : (
          <FieldRow label={t('director_slot')} hint={t('director_slot_hint')}>
            <NativeSelect
              value={form.directorSlot === null ? '' : String(form.directorSlot)}
              onChange={(e) =>
                setForm({
                  ...form,
                  directorSlot: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              data-test-id="notify-director-slot"
            >
              <option value="">{t('director_slot_none')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.slot}>
                  #{a.slot} — {a.phoneNumber}
                </option>
              ))}
            </NativeSelect>
          </FieldRow>
        )}

        <div className="flex items-center gap-2">
          {form.directorSlot === null ? (
            <Badge tone="neutral">{t('director_status_not_selected')}</Badge>
          ) : selectedAcc?.hasSession ? (
            <Badge tone="success">{t('director_status_connected')}</Badge>
          ) : (
            <Badge tone="warning">{t('director_status_no_session')}</Badge>
          )}
          <Link
            href="/hr/settings/telegram"
            className="text-[var(--ms-action-primary)] text-sm hover:underline"
            data-test-id="notify-director-link"
          >
            {t('director_link')} →
          </Link>
        </div>
      </Section>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saveMut.isPending} data-test-id="notify-save">
          {saveMut.isPending ? tCommon('saving') : tCommon('save')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending || form.directorSlot === null}
          data-test-id="notify-test"
        >
          {t('test_send')}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
      <h2 className="font-medium text-[var(--ms-text-strong)] text-sm uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex items-start gap-3" htmlFor={id}>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(Boolean(v))}
        data-test-id={testId}
      />
      <span className="flex flex-col">
        <span className="text-[var(--ms-text-primary)] text-sm">{label}</span>
        {hint && <span className="text-[var(--ms-text-muted)] text-xs">{hint}</span>}
      </span>
    </label>
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
