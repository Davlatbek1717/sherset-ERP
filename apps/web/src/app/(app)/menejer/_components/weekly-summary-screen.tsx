'use client';

/**
 * Egaga haftalik xulosa (menejer KPI TZ M-Q7, §7) — MK04.
 *
 * MODEL. Menejerga katta erkinlik berilgan: har kunni qo'lda ko'radi, raqamni
 * tuzatadi, kunni majburan yopadi. Erkinlikning juftligi — **o'lchov**: egasi
 * haftada bir marta xulosani oladi.
 *
 * ⚠️ Bu ekran hech narsani BLOKLAMAYDI (§7) — faqat ko'rinadi. Shu sababdan
 * bu yerda hech qanday amal tugmasi yo'q (hafta tanlashdan boshqa).
 *
 * ⚠️ «Yo'qdan kiritilgan» (`noBaseline`) ALOHIDA ustun: «500 000 ni 440 000
 * ga tuzatdi» bilan «hech narsa yo'q edi, 500 000 yozdi» — nazorat nuqtai
 * nazaridan boshqa-boshqa ish.
 */

import { type OwnerWeeklySummary, managerKpiApi } from '@/lib/manager-api';
import { Badge, EmptyState, Skeleton, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';

export function WeeklySummaryScreen() {
  const t = useTranslations('pages.menejer');

  /** Necha hafta orqaga: 0 = server bergan standart (TUGAGAN hafta). */
  const [weeksBack, setWeeksBack] = useState(0);
  const week = weeksBack === 0 ? undefined : isoWeeksBack(weeksBack);

  const { data, isLoading } = useQuery<OwnerWeeklySummary>({
    queryKey: ['manager-kpi', 'weekly-summary', weeksBack],
    queryFn: () => managerKpiApi.weeklySummary(week),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">
            {t('weekly_title')}
          </h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('weekly_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            data-test-id="weekly-week-prev"
            onClick={() => setWeeksBack((w) => w + 1)}
            className="text-[var(--ms-text-muted)] underline hover:text-[var(--ms-text-brand)]"
          >
            ← {t('weekly_prev_week')}
          </button>
          {weeksBack > 0 && (
            <button
              type="button"
              data-test-id="weekly-week-next"
              onClick={() => setWeeksBack((w) => Math.max(0, w - 1))}
              className="text-[var(--ms-text-muted)] underline hover:text-[var(--ms-text-brand)]"
            >
              {t('weekly_next_week')} →
            </button>
          )}
        </div>
      </header>

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="weekly-range">
            {formatDay(data.weekStart)} — {formatDay(shiftDays(data.weekEndExclusive, -1))}
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label={t('weekly_accepted')}
              value={data.totalAccepted}
              testId="weekly-accepted"
            />
            <Tile
              label={t('weekly_pending')}
              value={data.pendingDays}
              testId="weekly-pending"
              tone={data.pendingDays > 0 ? 'warning' : 'neutral'}
            />
            <Tile
              label={t('weekly_stale')}
              value={data.staleDays}
              testId="weekly-stale"
              tone={data.staleDays > 0 ? 'warning' : 'neutral'}
            />
            <Tile
              label={t('weekly_adjust_total')}
              value={data.totalAdjust}
              testId="weekly-adjust-total"
            />
            <Tile
              label={t('weekly_adjust_sum')}
              value={formatMoney(BigInt(data.totalAdjustedAbsMinor))}
              testId="weekly-adjust-sum"
            />
            {/* «Tuzatildi» EMAS — «yo'qdan kiritildi». Alohida katak. */}
            <Tile
              label={t('weekly_no_baseline')}
              value={data.totalNoBaseline}
              testId="weekly-no-baseline"
              tone={data.totalNoBaseline > 0 ? 'warning' : 'neutral'}
              hint={t('weekly_no_baseline_hint')}
            />
            <Tile
              label={t('weekly_force_accepted')}
              value={data.totalForceAccepted}
              testId="weekly-force-accepted"
              tone={data.totalForceAccepted > 0 ? 'warning' : 'neutral'}
            />
            {data.topAdjuster && (
              <Tile
                label={t('weekly_top_adjuster')}
                value={`${data.topAdjuster.managerName ?? '—'} · ${data.topAdjuster.adjustCount}`}
                testId="weekly-top-adjuster"
              />
            )}
          </div>

          {/* Tuzatma bo'lmagan hafta ham javob oladi: sukunatni «hammasi
              joyida» deb o'qish xato bo'lardi. */}
          {data.totalAdjust === 0 && (
            <Badge tone="success" data-test-id="weekly-no-adjust">
              {t('weekly_no_adjust')}
            </Badge>
          )}

          {data.activity.length === 0 ? (
            <EmptyState title={t('weekly_empty')} data-test-id="weekly-empty" />
          ) : (
            <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t('weekly_col_manager')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('weekly_col_accepted')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('weekly_col_rejected')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('weekly_col_adjust')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('weekly_col_sum')}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('weekly_col_no_baseline')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">{t('weekly_col_force')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activity.map((a) => {
                    const key = a.managerId ?? 'system';
                    return (
                      <tr
                        key={key}
                        data-test-id={`weekly-row-${key}`}
                        className="border-[var(--ms-border-default)] border-t"
                      >
                        <td className="px-3 py-2 text-[var(--ms-text-primary)]">
                          {a.managerName ?? t('weekly_actor_system')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.acceptedCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.rejectedCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.adjustCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(BigInt(a.adjustedAbsMinor))}
                        </td>
                        <td
                          className="px-3 py-2 text-right tabular-nums"
                          data-test-id={`weekly-row-no-baseline-${key}`}
                        >
                          {a.noBaselineCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {a.forceAcceptedCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  testId,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  testId: string;
  tone?: 'neutral' | 'warning';
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3">
      <div className="text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div
        data-test-id={testId}
        className={
          tone === 'warning'
            ? 'font-semibold text-[var(--ms-text-warning)] text-lg tabular-nums'
            : 'font-semibold text-[var(--ms-text-strong)] text-lg tabular-nums'
        }
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-[var(--ms-text-muted)] text-xs">{hint}</div>}
    </div>
  );
}

/** N hafta oldingi kun (ISO) — server o'sha kun tushgan haftani oladi. */
function isoWeeksBack(weeks: number): string {
  const d = new Date(Date.now() - (weeks + 1) * 7 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
