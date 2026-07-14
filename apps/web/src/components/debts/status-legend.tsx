'use client';

/**
 * RANGLAR IZOHI (2026-07-13).
 *
 * Jadval qatorlari holatga qarab ranglanadi. Rang o'zi hech narsa demaydi —
 * foydalanuvchi «nega bu qator sariq?» deb o'ylab qolmasligi uchun ro'yxat
 * tepasida qisqa izoh turadi. Bu — rangli kodlashning majburiy sherigi:
 * izohsiz rang jumboqqa aylanadi.
 */

import { useTranslations } from 'next-intl';

type LegendKey = 'paid' | 'partial' | 'not_paid' | 'callback' | 'no_call';

const TONE: Record<LegendKey, string> = {
  paid: 'bg-[var(--ms-row-paid-bg)] border-[var(--ms-row-paid-accent)]',
  partial: 'bg-[var(--ms-row-partial-bg)] border-[var(--ms-row-partial-accent)]',
  not_paid: 'bg-[var(--ms-row-unpaid-bg)] border-[var(--ms-row-unpaid-accent)]',
  callback: 'bg-[var(--ms-row-callback-bg)] border-[var(--ms-row-callback-accent)]',
  no_call: 'bg-[var(--ms-bg-surface)] border-[var(--ms-border-strong)]',
};

const LABEL: Record<LegendKey, string> = {
  paid: 'legend_paid',
  partial: 'legend_partial',
  not_paid: 'legend_not_paid',
  callback: 'legend_callback',
  no_call: 'legend_no_call',
};

export function StatusLegend({ items }: { items: LegendKey[] }) {
  const t = useTranslations('pages.debts');
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[var(--ms-text-secondary)] text-xs"
      data-test-id="status-legend"
    >
      <span className="font-medium text-[var(--ms-text-muted)]">{t('legend_title')}:</span>
      {items.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-5 rounded-sm border-l-[3px] ${TONE[k]}`} />
          {t(LABEL[k] as 'legend_paid')}
        </span>
      ))}
    </div>
  );
}
