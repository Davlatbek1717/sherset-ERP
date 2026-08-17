'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { Button, Container, Input, PageHeader } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface RateRow {
  date: string;
  currency: string;
  rate: string;
  nominal: number;
  source: string;
}

interface SyncResult {
  date: string;
  inserted: number;
  updated: number;
  total: number;
}

interface RateChange {
  at: string;
  before: string;
  after: string;
  userName: string | null;
  currency: string;
}

/** Qo'lda boshqariladigan valyuta. Egasi uchun amalda faqat dollar. */
const MANAGED = 'USD';

/**
 * `Currency.rateValue` (×10^8) → odam o'qiydigan son.
 * BigInt bilan bo'linadi: `Number` ga o'tkazib bo'lish pul-kritik joyda
 * aniqlikni yeydi (12 000,123456 → 12000.12299...).
 */
function rateValueToText(raw: string): string {
  if (!raw) return '—';
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return raw;
  }
  const scale = 100_000_000n;
  const whole = v / scale;
  const frac = v % scale;
  if (frac === 0n) return whole.toLocaleString('ru-RU');
  const fracText = frac.toString().padStart(8, '0').replace(/0+$/, '');
  return `${whole.toLocaleString('ru-RU')},${fracText}`;
}

export default function ExchangeRatesPage() {
  const t = useTranslations('pages.exchange_rates');
  const qc = useQueryClient();
  const { can } = usePermissions();
  const mayEdit = can('exchangerate', 'update');

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<'success' | 'error' | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const { data: rates, isLoading } = useQuery<RateRow[]>({
    queryKey: ['exchange-rates-latest'],
    queryFn: () => api.get<RateRow[]>('/exchange-rates/latest'),
  });

  /** Amaldagi kurs — kassa AYNAN shu qiymatni ishlatadi (MANUAL > CBRU). */
  const { data: effective } = useQuery<RateRow>({
    queryKey: ['exchange-rate-effective', MANAGED],
    queryFn: () => api.get<RateRow>(`/exchange-rates/rate?currency=${MANAGED}`),
    retry: false,
  });

  const { data: changes } = useQuery<RateChange[]>({
    queryKey: ['exchange-rate-changes', MANAGED],
    queryFn: () => api.get<RateChange[]>(`/exchange-rates/manual/changes?currency=${MANAGED}`),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['exchange-rates-latest'] });
    qc.invalidateQueries({ queryKey: ['exchange-rate-effective', MANAGED] });
    qc.invalidateQueries({ queryKey: ['exchange-rate-changes', MANAGED] });
    // Kassa va hujjat ekranlari kursni o'z kalitlari bilan keshlaydi —
    // ular ham yangilansin, aks holda ekranda eski kurs qolib ketadi.
    qc.invalidateQueries({ queryKey: ['usd-rate'] });
  };

  const saveMut = useMutation<RateRow, Error, string>({
    mutationFn: (rate) => api.put<RateRow>('/exchange-rates/manual', { currency: MANAGED, rate }),
    onSuccess: (row) => {
      invalidateAll();
      setEditing(false);
      setStatusKind('success');
      setStatusMessage(t('manual_saved', { rate: row.rate, currency: row.currency }));
    },
    onError: (e) => {
      setStatusKind('error');
      setStatusMessage(t('manual_error', { error: e.message }));
    },
  });

  const syncMut = useMutation<SyncResult>({
    mutationFn: () => api.post<SyncResult>('/exchange-rates/sync', {}),
    onSuccess: (result) => {
      invalidateAll();
      setStatusKind('success');
      setStatusMessage(t('sync_success', { count: String(result.total), date: result.date }));
    },
    onError: (e: Error) => {
      setStatusKind('error');
      setStatusMessage(t('sync_error', { error: e.message }));
    },
  });

  const openEditor = () => {
    setStatusMessage(null);
    setDraft(effective?.rate ?? '');
    setEditing(true);
  };

  const lastChange = changes?.[0];
  const isManual = effective?.source === 'MANUAL';
  const trimmedDraft = draft.trim();
  const draftValid = /^\d+(\.\d{1,6})?$/.test(trimmedDraft) && Number(trimmedDraft) >= 100;
  const changed = trimmedDraft !== (effective?.rate ?? '');

  return (
    <Container size="md" className="py-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* ── Amaldagi kurs — sahifaning asosiy javobi ──────────────────────── */}
      <div
        className="mb-4 rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
        data-test-id="effective-rate-card"
      >
        <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
          {t('effective_label')}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="font-semibold text-[22px] tabular-nums" data-test-id="effective-rate">
            {effective ? `1 ${effective.currency} = ${effective.rate} ${t('sum')}` : '—'}
          </span>
          {effective && (
            <span
              className="rounded-full bg-[var(--ms-bg-muted)] px-2 py-0.5 text-[11px] text-[var(--ms-text-muted)]"
              data-test-id="effective-source"
            >
              {isManual ? t('source_manual') : t('source_cbru')}
            </span>
          )}
        </div>
        {lastChange && (
          <div className="mt-1 text-[var(--ms-text-muted)] text-xs" data-test-id="effective-author">
            {t('changed_by', {
              date: new Date(lastChange.at).toLocaleString('ru-RU'),
              user: lastChange.userName ?? '—',
            })}
          </div>
        )}

        {mayEdit && !editing && (
          <div className="mt-3">
            <Button onClick={openEditor} data-test-id="manual-rate-open">
              {t('manual_change_button')}
            </Button>
          </div>
        )}

        {/* Dialog EMAS — inline blok: sozlamalar sahifasi kiosk qobig'ida
            ham ochilishi mumkin, Radix modali esa ekran klaviaturasini
            o'ldiradi (loyihada o'lchangan). */}
        {mayEdit && editing && (
          <div className="mt-3 border-[var(--ms-border-default)] border-t pt-3">
            <label className="block text-[13px]" htmlFor="manual-rate-input">
              {t('manual_input_label', { currency: MANAGED })}
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Input
                id="manual-rate-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                inputMode="decimal"
                placeholder="12000"
                className="w-[160px]"
                data-test-id="manual-rate-input"
              />
              <Button
                onClick={() => saveMut.mutate(trimmedDraft)}
                disabled={!draftValid || !changed || saveMut.isPending}
                data-test-id="manual-rate-save"
              >
                {saveMut.isPending ? t('manual_saving') : t('manual_save')}
              </Button>
              <Button
                variant="tertiary"
                onClick={() => setEditing(false)}
                data-test-id="manual-rate-cancel"
              >
                {t('manual_cancel')}
              </Button>
            </div>

            {trimmedDraft && draftValid && changed && (
              <div className="mt-2 text-[13px] tabular-nums" data-test-id="manual-rate-diff">
                {effective?.rate ?? '—'} → <strong>{trimmedDraft}</strong>
              </div>
            )}
            {trimmedDraft && !draftValid && (
              <div className="mt-2 text-[13px] text-[var(--ms-text-destructive)]">
                {t('manual_invalid')}
              </div>
            )}

            <p className="mt-2 text-[12px] text-[var(--ms-text-muted)]">{t('manual_warning')}</p>
          </div>
        )}
      </div>

      {statusMessage && (
        <div
          className={`mb-4 text-sm ${
            statusKind === 'success'
              ? 'text-[var(--ms-text-success,#15803d)]'
              : 'text-[var(--ms-text-destructive)]'
          }`}
          data-test-id="exchange-rates-status"
        >
          {statusMessage}
        </div>
      )}

      {/* ── O'zgarishlar tarixi ───────────────────────────────────────────── */}
      {changes && changes.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 font-medium text-[13px]">{t('history_title')}</h2>
          <div className="overflow-hidden rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                <tr>
                  <th className="h-9 px-3 text-left font-medium">{t('col_when')}</th>
                  <th className="h-9 px-3 text-right font-medium">{t('col_change')}</th>
                  <th className="h-9 px-3 text-left font-medium">{t('col_who')}</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr
                    key={`${c.at}-${c.after}`}
                    className="border-[var(--ms-border-default)] border-t"
                    data-test-id="rate-change-row"
                  >
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] tabular-nums">
                      {new Date(c.at).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {rateValueToText(c.before)} → <strong>{rateValueToText(c.after)}</strong>
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)]">{c.userName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Markaziy bank jadvali (ma'lumot uchun) ────────────────────────── */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="font-medium text-[13px]">{t('cbru_title')}</h2>
        <Button
          variant="tertiary"
          onClick={() => {
            setStatusMessage(null);
            syncMut.mutate();
          }}
          disabled={syncMut.isPending}
          data-test-id="exchange-rates-sync"
        >
          {syncMut.isPending ? t('syncing') : t('sync_button')}
        </Button>
      </div>
      {isManual && (
        <p className="mb-2 text-[12px] text-[var(--ms-text-muted)]" data-test-id="cbru-note">
          {t('cbru_note')}
        </p>
      )}

      {isLoading ? (
        <div className="text-[var(--ms-text-muted)] text-sm">…</div>
      ) : !rates || rates.length === 0 ? (
        <div className="rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-8 text-center text-[var(--ms-text-muted)] text-sm">
          {t('empty_title')}
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <tr>
                <th className="h-9 px-3 text-left font-medium">{t('col_currency')}</th>
                <th className="h-9 px-3 text-right font-medium">{t('col_nominal')}</th>
                <th className="h-9 px-3 text-right font-medium">{t('col_rate')}</th>
                <th className="h-9 px-3 text-left font-medium">{t('col_date')}</th>
                <th className="h-9 px-3 text-left font-medium">{t('col_source')}</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr
                  key={`${r.currency}-${r.source}`}
                  className="border-[var(--ms-border-default)] border-t"
                  data-test-id={`exchange-rate-row-${r.currency}`}
                >
                  <td className="px-3 py-2 font-semibold tabular-nums">{r.currency}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.nominal}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.rate}</td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] tabular-nums">{r.date}</td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
