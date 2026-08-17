'use client';

/**
 * Kassa headeridagi kurs-chipi (egasi, 2026-08-17: «dollar kursini qo'lda
 * o'zgartirib bo'lishi kerak»).
 *
 * NEGA KASSADA: egasi kunlik ishni PLANSHETdan qiladi va kiosk qobig'idan ERP
 * sozlamalar sahifasini ocha olmaydi. Shu sabab kurs shu yerda ko'rinadi va shu
 * yerdan o'zgaradi.
 *
 * IKKI QULF:
 *   · ruxsat — `exchangerate.update` bo'lmasa chip BOSILMAYDI (kassir faqat
 *     ko'radi). Haqiqiy qulf serverda (`PermissionsGuard`), bu UX qatlami;
 *   · marshrut — `PUT /exchange-rates/manual` kiosk ro'yxatida `exact` bo'lib
 *     ochilgan, aks holda tugma bosilganda sababsiz 403 kelardi.
 *
 * 🔴 Radix `Dialog` ATAYLAB ishlatilmaydi: qobiqda modal Radix oynasi ekran
 * klaviaturasini o'ldiradi (loyihada o'lchangan). O'rniga oddiy absolute blok.
 */

import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { Button, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface RateRow {
  date: string;
  currency: string;
  rate: string;
  nominal: number;
  source: string;
  rateMinor: string;
}

/** Kassada boshqariladigan yagona valyuta — dollar. */
const MANAGED = 'USD';

/** «12000» yoki «12000.5» → «12 000» / «12 000,5» (ko'z uchun; hisobga tegmaydi). */
function pretty(rate: string): string {
  const [whole, frac] = rate.split('.');
  const grouped = Number(whole).toLocaleString('ru-RU');
  const trimmed = frac?.replace(/0+$/, '');
  return trimmed ? `${grouped},${trimmed}` : grouped;
}

export function PosRateChip() {
  const t = useTranslations('pages.pos');
  const qc = useQueryClient();
  const { can } = usePermissions();
  const mayEdit = can('exchangerate', 'update');

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: rate } = useQuery<RateRow>({
    // Kalit POS'ning boshqa o'quvchilari bilan BIR XIL (`rasmilashtirish-modal`,
    // `debt-payment-dialog`) — saqlagandan keyin ular ham yangi kursni oladi.
    queryKey: ['pos-usd-rate'],
    queryFn: () => api.get<RateRow>(`/exchange-rates/rate?currency=${MANAGED}`),
    retry: false,
  });

  const saveMut = useMutation<RateRow, Error, string>({
    mutationFn: (value) =>
      api.put<RateRow>('/exchange-rates/manual', { currency: MANAGED, rate: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-usd-rate'] });
      qc.invalidateQueries({ queryKey: ['exchange-rates-latest'] });
      qc.invalidateQueries({ queryKey: ['exchange-rate-effective', MANAGED] });
      qc.invalidateQueries({ queryKey: ['exchange-rate-changes', MANAGED] });
      setOpen(false);
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!rate) return null;

  const trimmed = draft.trim();
  const valid = /^\d+(\.\d{1,6})?$/.test(trimmed) && Number(trimmed) >= 100;
  const changed = trimmed !== rate.rate;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!mayEdit}
        onClick={() => {
          setError(null);
          setDraft(rate.rate);
          setOpen((v) => !v);
        }}
        // Ruxsatsiz holatda ham ko'rinadi (kassirga kurs kerak), lekin
        // `disabled` — bosilmaydi va kursor o'zgarmaydi.
        className="flex h-[40px] items-center gap-2 rounded-lg bg-white/10 px-3 font-medium text-[15px] text-[var(--pos-on-brand)] enabled:hover:bg-white/20"
        data-test-id="pos-rate-chip"
        title={rate.source === 'MANUAL' ? t('rate_source_manual') : t('rate_source_cbru')}
      >
        <span className="tabular-nums">{`1$ = ${pretty(rate.rate)}`}</span>
        {rate.source === 'MANUAL' && (
          <span className="rounded bg-white/20 px-1 text-[10px]" data-test-id="pos-rate-manual">
            {t('rate_own')}
          </span>
        )}
      </button>

      {open && mayEdit && (
        <div
          className="absolute top-[46px] right-0 z-50 w-[300px] rounded-lg border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 text-[var(--ms-text-primary)] shadow-lg"
          data-test-id="pos-rate-editor"
        >
          <label className="block text-[13px]" htmlFor="pos-rate-input">
            {t('rate_input_label')}
          </label>
          <Input
            id="pos-rate-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="decimal"
            className="mt-1 h-[44px] text-[16px]"
            data-test-id="pos-rate-input"
          />
          {trimmed && valid && changed && (
            <div className="mt-1 text-[13px] tabular-nums" data-test-id="pos-rate-diff">
              {pretty(rate.rate)} → <strong>{pretty(trimmed)}</strong>
            </div>
          )}
          {trimmed && !valid && (
            <div className="mt-1 text-[12px] text-[var(--ms-text-destructive)]">
              {t('rate_invalid')}
            </div>
          )}
          {error && (
            <div
              className="mt-1 text-[12px] text-[var(--ms-text-destructive)]"
              data-test-id="pos-rate-error"
            >
              {error}
            </div>
          )}
          <p className="mt-2 text-[11px] text-[var(--ms-text-muted)]">{t('rate_warning')}</p>
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => saveMut.mutate(trimmed)}
              disabled={!valid || !changed || saveMut.isPending}
              data-test-id="pos-rate-save"
            >
              {saveMut.isPending ? t('rate_saving') : t('rate_save')}
            </Button>
            <Button
              variant="tertiary"
              onClick={() => setOpen(false)}
              data-test-id="pos-rate-cancel"
            >
              {t('rate_cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
