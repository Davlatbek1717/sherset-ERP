'use client';

/**
 * Ma'lumot sifati paneli (menejer KPI TZ §2.4/§0.2) — MK09.
 *
 * SAVOL: «bu raqamga qanchalik ishonish mumkin». Menejer kunni qabul qilishdan
 * OLDIN shu ekranda ko'radi: qaysi ko'rsatkich to'liq yig'ilgan, tan narxi
 * yig'ilmagan cheklar ulushi qancha, nechta kun hali qabul qilinmagan.
 *
 * 🔴 EKRAN SHARTNOMASI — **NULL ≠ 0**. O'lchov bo'lmagan katak `0%` bo'lib
 * chizilmaydi, `—` bo'lib chiziladi. Nol foiz «tekshirildi, muammo yo'q»
 * degan xotirjamlik beradi; o'lchov yo'qligi esa aynan qarama-qarshi ma'no.
 * Bu farq yo'qolgani uchun kassa cheklari bir vaqtlar «100% marja» bo'lib
 * ko'ringan (analitika TZ X1).
 *
 * ⚠️ Panel HECH NARSANI BLOKLAMAYDI va tuzatmaydi — faqat ko'rinadi. Shuning
 * uchun bu yerda davr tanlashdan boshqa amal tugmasi yo'q.
 */

import { type DataQualityLevel, type DataQualityPanel, managerKpiApi } from '@/lib/manager-api';
import { Badge, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';

/** Tanlanadigan davrlar — kun soni. */
const RANGES = [30, 90] as const;

export function DataQualityScreen() {
  const t = useTranslations('pages.menejer');
  const locale = useLocale();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);

  const { data, isLoading } = useQuery<DataQualityPanel>({
    queryKey: ['manager-kpi', 'data-quality', days],
    queryFn: () => managerKpiApi.dataQuality(days === 30 ? undefined : rangeOf(days)),
  });

  /**
   * Foiz kataklarining YAGONA chizuvchisi. `null` — o'lchov yo'q: bu yerda
   * bir joyda `—` ga aylanadi, ya'ni birorta katak tasodifan `0%` bo'lib
   * qolishi mumkin emas.
   */
  const pct = (v: number | null): string => (v == null ? '—' : `${v}%`);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">{t('dq_title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('dq_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              data-test-id={`dq-range-${r}`}
              onClick={() => setDays(r)}
              className={
                r === days
                  ? 'font-semibold text-[var(--ms-text-brand)]'
                  : 'text-[var(--ms-text-muted)] underline hover:text-[var(--ms-text-brand)]'
              }
            >
              {t('dq_range_days', { days: r })}
            </button>
          ))}
        </div>
      </header>

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <LevelBadge level={data.overall} testId="dq-overall" />
            <span className="text-[var(--ms-text-muted)] text-sm" data-test-id="dq-range">
              {data.from} — {data.to}
            </span>
          </div>

          {/* ── Tan narx: X1 bug-klassining jonli o'lchovi ─────────────── */}
          <section className="rounded-md border border-[var(--ms-border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-medium text-[var(--ms-text-strong)]">{t('dq_cost_title')}</h2>
              <LevelBadge level={data.cost.level} testId="dq-cost-level" />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Tile
                label={t('dq_cost_receipts')}
                value={data.cost.receipts}
                testId="dq-cost-receipts"
              />
              <Tile
                label={t('dq_cost_missing')}
                value={data.cost.receiptsMissingCost}
                testId="dq-cost-missing"
                tone={data.cost.receiptsMissingCost > 0 ? 'warning' : 'neutral'}
              />
              <Tile
                label={t('dq_cost_percent')}
                value={pct(data.cost.missingPercent)}
                testId="dq-cost-percent"
                tone={data.cost.missingPercent ? 'warning' : 'neutral'}
              />
            </div>
            <p className="mt-2 text-[var(--ms-text-muted)] text-xs">{t('dq_cost_hint')}</p>
          </section>

          {/* ── Qabul qilinmagan kunlar (M-Q8: oylikni bloklaydi) ──────── */}
          <section className="rounded-md border border-[var(--ms-border)] p-3">
            <h2 className="mb-2 font-medium text-[var(--ms-text-strong)]">
              {t('dq_acceptance_title')}
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label={t('dq_days')} value={data.acceptance.days} testId="dq-days" />
              <Tile
                label={t('dq_accepted')}
                value={data.acceptance.accepted}
                testId="dq-accepted"
              />
              <Tile
                label={t('dq_unaccepted')}
                value={data.acceptance.unaccepted}
                testId="dq-unaccepted"
                tone={data.acceptance.unaccepted > 0 ? 'warning' : 'neutral'}
              />
              <Tile
                label={t('dq_unaccepted_percent')}
                value={pct(data.acceptance.unacceptedPercent)}
                testId="dq-unaccepted-percent"
                tone={data.acceptance.unacceptedPercent ? 'warning' : 'neutral'}
              />
              {/* Profilsiz kun ballanmaydi — qabul qilishning o'zi ma'nosini
                  yo'qotadi, shuning uchun alohida katak. */}
              <Tile
                label={t('dq_no_profile')}
                value={data.acceptance.daysWithoutProfile}
                testId="dq-no-profile"
                tone={data.acceptance.daysWithoutProfile > 0 ? 'warning' : 'neutral'}
                hint={t('dq_no_profile_hint')}
              />
            </div>
            {data.acceptance.byState.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-3 text-sm" data-test-id="dq-by-state">
                {data.acceptance.byState.map((s) => (
                  <li key={s.state} className="text-[var(--ms-text-muted)]">
                    {t(`state_${s.state}` as 'state_pending')}: {s.count}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[var(--ms-text-muted)] text-xs">{t('dq_acceptance_hint')}</p>
          </section>

          {/* ── Manbasi yo'q ko'rsatkichlar ────────────────────────────── */}
          <section className="rounded-md border border-[var(--ms-border)] p-3">
            <h2 className="mb-1 font-medium text-[var(--ms-text-strong)]">
              {t('dq_unsourced_title')}
            </h2>
            <p className="mb-2 text-[var(--ms-text-muted)] text-xs">{t('dq_unsourced_hint')}</p>
            {data.unsourced.length === 0 ? (
              <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="dq-unsourced-empty">
                {t('dq_unsourced_empty')}
              </p>
            ) : (
              <ul className="space-y-1 text-sm" data-test-id="dq-unsourced">
                {data.unsourced.map((m) => (
                  <li key={m.key} className="text-[var(--ms-text)]">
                    {locale === 'ru' ? m.labelRu : m.labelUz}
                    <span className="ml-2 text-[var(--ms-text-muted)] text-xs">{m.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Har ko'rsatkich bo'yicha bayroq ────────────────────────── */}
          <section className="rounded-md border border-[var(--ms-border)] p-3">
            <h2 className="mb-2 font-medium text-[var(--ms-text-strong)]">
              {t('dq_metrics_title')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ms-text-muted)]">
                    <th className="py-1 pr-3 font-normal">{t('dq_col_metric')}</th>
                    <th className="py-1 pr-3 font-normal">{t('dq_col_level')}</th>
                    <th className="py-1 pr-3 text-right font-normal">{t('dq_col_measured')}</th>
                    <th className="py-1 pr-3 text-right font-normal">{t('dq_col_partial')}</th>
                    <th className="py-1 text-right font-normal">{t('dq_col_coverage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.metrics.map((m) => (
                    <tr
                      key={m.key}
                      data-test-id={`dq-metric-${m.key}`}
                      className="border-[var(--ms-border)] border-t"
                    >
                      <td className="py-1 pr-3">{locale === 'ru' ? m.labelRu : m.labelUz}</td>
                      <td className="py-1 pr-3">
                        <LevelBadge level={m.level} testId={`dq-level-${m.key}`} />
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {m.measured}/{m.total}
                      </td>
                      <td className="py-1 pr-3 text-right">{m.partial}</td>
                      <td className="py-1 text-right">{pct(m.coveragePercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Bayroq — matn bilan BIRGA `data-level` (test va CSS bir manbadan o'qisin). */
function LevelBadge({ level, testId }: { level: DataQualityLevel; testId: string }) {
  const t = useTranslations('pages.menejer');
  const tone = level === 'complete' ? 'success' : level === 'partial' ? 'warning' : 'neutral';
  return (
    <Badge tone={tone} data-test-id={testId} data-level={level}>
      {t(`dq_level_${level}` as 'dq_level_complete')}
    </Badge>
  );
}

function Tile({
  label,
  value,
  testId,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: ReactNode;
  testId: string;
  tone?: 'neutral' | 'warning';
  hint?: string;
}) {
  return (
    <div
      data-test-id={testId}
      title={hint}
      className={`rounded-md border p-3 ${
        tone === 'warning'
          ? 'border-[var(--ms-border-warning,var(--ms-border))] bg-[var(--ms-bg-warning-subtle,transparent)]'
          : 'border-[var(--ms-border)]'
      }`}
    >
      <div className="text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className="font-semibold text-[var(--ms-text-strong)] text-lg">{value}</div>
    </div>
  );
}

/** `days` kunlik davr — bugungi kun bilan tugaydi (server bilan bir xil qoida). */
function rangeOf(days: number): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  const from = new Date(`${to}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to };
}
