'use client';

import { HomepageTabs } from '@/components/homepage-tabs';
import { api } from '@/lib/api-client';
import { Button, Container, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types — mirror DashboardResult from apps/api/src/modules/report/dashboard.schema.ts
// ---------------------------------------------------------------------------

// Full moysklad «Показатели» period selector (Сегодня/Неделя/Месяц/
// Квартал/Год) — matches the tested backend DashboardPeriod enum.
type Period = 'today' | 'week' | 'month' | 'quarter' | 'year';

interface SalesBlock {
  count: number;
  sumMinor: string;
  comparisonSumMinor: string;
  comparisonPercent: number;
  comparisonLabelKey: 'previous_weekday' | 'last_week' | 'last_month' | 'last_year' | 'yesterday';
  comparisonLabelExtra?: { weekdayIndex?: number };
}

interface SalesChartPoint {
  date: string;
  label: string;
  sumMinor: string;
}

interface OverdueDocItem {
  id: string;
  number: string;
  counterpartyName: string | null;
  sumMinor: string;
  daysOverdue: number;
}

interface OverdueBlock {
  count: number;
  totalSumMinor: string;
  items: OverdueDocItem[];
}

interface MoneyByOrgRow {
  orgId: string;
  orgName: string;
  balanceMinor: string;
}

interface MoneyChartPoint {
  monthIso: string;
  label: string;
  inflowMinor: string;
  outflowMinor: string;
  balanceMinor: string;
}

interface RecentDocItem {
  id: string;
  type: string;
  number: string;
  posted: boolean;
  momentDate: string;
  counterpartyName: string | null;
  orgName: string | null;
  sumMinor: string;
  currency: string;
  modifiedAt: string;
  modifiedByName: string | null;
}

interface DashboardResult {
  period: Period;
  dateFrom: string;
  dateTo: string;
  sales: {
    count: number;
    sumMinor: string;
    netSumMinor: string;
    profitMinor: string;
    today: SalesBlock;
    period: SalesBlock;
    chart: SalesChartPoint[];
  };
  overdueOrders: OverdueBlock;
  overdueInvoices: OverdueBlock;
  money: {
    totalSumMinor: string;
    byOrg: MoneyByOrgRow[];
    chart: MoneyChartPoint[];
  };
  recentDocs: RecentDocItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[var(--ms-border-default)] ${className ?? ''}`} />
  );
}

/** Format minor units as "X сум" via design-system formatMoney (UZS → сум). */
function fmt(minor: string | bigint | number | null | undefined): string {
  return formatMoney(minor, 'UZS');
}

/**
 * Today's date heading. moysklad ships "Сегодня, четверг 30 апреля" —
 * we mirror it via Intl.DateTimeFormat. uz falls back to uz-Latn-UZ
 * because stock `uz` resolves to Cyrillic on some Node builds.
 */
function buildTodayHeading(locale: string, todayWord: string): string {
  const now = new Date();
  const intlLocale = locale === 'uz' ? 'uz-Latn-UZ' : locale;
  const weekday = now.toLocaleDateString(intlLocale, { weekday: 'long' });
  const dayMonth = now.toLocaleDateString(intlLocale, { day: 'numeric', month: 'long' });
  return `${todayWord}, ${weekday} ${dayMonth}`;
}

const PERIODS: Period[] = ['today', 'week', 'month', 'quarter', 'year'];

/**
 * Localised x-axis label override. Backend ships Russian labels (пн / Янв.)
 * coupled to the bucket sums. uz frontend swaps the fixed vocabulary
 * client-side so an Uzbek user sees `Du` / `Yan.` instead of Cyrillic.
 */
const WEEKDAYS_RU = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;
const WEEKDAYS_UZ = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'] as const;
const MONTHS_RU = [
  'Янв.',
  'Февр.',
  'Март',
  'Апр.',
  'Май',
  'Июнь',
  'Июль',
  'Авг.',
  'Сент.',
  'Окт.',
  'Нояб.',
  'Дек.',
] as const;
const MONTHS_UZ = [
  'Yan.',
  'Fev.',
  'Mar.',
  'Apr.',
  'May',
  'Iyun',
  'Iyul',
  'Avg.',
  'Sen.',
  'Okt.',
  'Noy.',
  'Dek.',
] as const;

/**
 * Decide whether `label` is one of the canonical Russian weekday /
 * month strings the backend ships, then translate to uz when needed.
 * Day-of-month numerals pass through unchanged.
 */
function localiseChartLabel(label: string, locale: string): string {
  const weekdayIdx = WEEKDAYS_RU.indexOf(label as (typeof WEEKDAYS_RU)[number]);
  if (weekdayIdx !== -1) {
    // weekdayIdx is in-range here (indexOf hit) — `?? label` is a safe
    // fallback that also satisfies noUncheckedIndexedAccess without `!`.
    return (locale === 'uz' ? WEEKDAYS_UZ[weekdayIdx] : WEEKDAYS_RU[weekdayIdx]) ?? label;
  }
  const monthIdx = MONTHS_RU.indexOf(label as (typeof MONTHS_RU)[number]);
  if (monthIdx !== -1) {
    return (locale === 'uz' ? MONTHS_UZ[monthIdx] : MONTHS_RU[monthIdx]) ?? label;
  }
  return label; // numeric day-of-month — stays as-is
}

/** ISO → "DD.MM.YYYY HH:MM" in ru-RU locale. Used in Recent docs table. */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Common section title — orange title with thin border underline + (?) help
// ---------------------------------------------------------------------------

function SectionTitle({
  title,
  href,
  helpText,
  trailing,
}: {
  title: string;
  href?: string;
  helpText?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-[var(--ms-warning-500)] border-b py-2">
      <div className="flex items-center gap-1.5">
        {href ? (
          <a
            href={href}
            className="font-semibold text-[var(--ms-warning-500)] text-base hover:underline"
          >
            {title}
          </a>
        ) : (
          <span className="font-semibold text-[var(--ms-warning-500)] text-base">{title}</span>
        )}
        {helpText ? (
          <span
            role="img"
            aria-label={helpText}
            title={helpText}
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[var(--ms-text-muted)] text-[10px] text-[var(--ms-text-muted)]"
          >
            ?
          </span>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Продажи
// ---------------------------------------------------------------------------

function SalesSubBlock({
  heading,
  block,
  loading,
}: {
  heading: string;
  block: SalesBlock | undefined;
  loading: boolean;
}) {
  const tSales = useTranslations('pages.homepage.sales');
  const tCmp = useTranslations('pages.homepage.sales.comparison');
  const tWeekdays = useTranslations('pages.homepage.sales.weekdays_dative');

  // Resolve localised comparison label.
  const cmpLabel = (() => {
    if (!block) return '';
    if (block.comparisonLabelKey === 'previous_weekday') {
      const idx = block.comparisonLabelExtra?.weekdayIndex ?? 0;
      const dayName = tWeekdays(String(idx));
      return tCmp('previous_weekday', { day: dayName });
    }
    return tCmp(block.comparisonLabelKey);
  })();

  // Tone — moysklad parity: positive = green, negative = red.
  // Both the absolute sum AND the percentage AND the prepended ▲/▼
  // share the same color (their dashboard puts them in one tinted run).
  // Existing tokens: --ms-text-success / --ms-text-destructive
  // (we used --ms-status-* before but those weren't defined → text
  // rendered as plain black, no color cue).
  const percent = block?.comparisonPercent ?? 0;
  const cmpTone =
    percent > 0
      ? 'text-[var(--ms-text-success)]'
      : percent < 0
        ? 'text-[var(--ms-text-destructive)]'
        : 'text-[var(--ms-text-muted)]';
  const arrow = percent > 0 ? '▲' : percent < 0 ? '▼' : '';
  const percentSigned = `(${percent > 0 ? '+' : ''}${percent}%)`;

  return (
    <div className="space-y-2">
      <div className="font-semibold text-[13px] text-[var(--ms-text-primary)]">{heading}</div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        {/* count — moysklad parity: count number renders in the same
            teal as the sales chart line (#3e9f9f), making the
            number/chart relationship visually obvious. */}
        <div>
          {loading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <div
              className="font-light text-2xl tabular-nums leading-none"
              style={{ color: '#3e9f9f' }}
            >
              {block?.count ?? 0}
            </div>
          )}
          <div className="mt-1 text-[10px] text-[var(--ms-text-muted)]">{tSales('stat_count')}</div>
        </div>
        {/* sum */}
        <div>
          {loading ? (
            <Skeleton className="h-7 w-28" />
          ) : (
            <div className="font-light text-2xl text-[var(--ms-text-primary)] tabular-nums leading-none">
              {fmt(block?.sumMinor ?? '0')}
            </div>
          )}
        </div>
        {/* comparison — arrow + sum + (%) all in the same tone */}
        <div>
          {loading ? (
            <Skeleton className="h-7 w-40" />
          ) : (
            <div className={`flex items-baseline gap-1 ${cmpTone}`}>
              {arrow && <span className="text-sm leading-none">{arrow}</span>}
              <div className="font-light text-2xl tabular-nums leading-none">
                {fmt(block?.comparisonSumMinor ?? '0')}
              </div>
              <span className="font-medium text-xs tabular-nums leading-none">{percentSigned}</span>
            </div>
          )}
          <div className="mt-1 text-[10px] text-[var(--ms-text-muted)]">{cmpLabel}</div>
        </div>
      </div>
    </div>
  );
}

function SalesSection({
  data,
  loading,
  period,
  setPeriod,
}: {
  data: DashboardResult | undefined;
  loading: boolean;
  period: Period;
  setPeriod: (p: Period) => void;
}) {
  const t = useTranslations('pages.homepage');
  const locale = useLocale();
  const tPeriods = useTranslations('pages.homepage.periods');

  const todayHeading = buildTodayHeading(locale, t('periods.today'));
  // Period sub-block heading. `today` reuses the dynamic dated heading
  // (mirrors the always-on Сегодня block — moysklad shows both when the
  // Сегодня tab is active); the rest use static localised labels.
  const periodHeading =
    period === 'today'
      ? todayHeading
      : period === 'week'
        ? t('sales.this_week')
        : period === 'month'
          ? t('sales.this_month')
          : period === 'quarter'
            ? t('sales.this_quarter')
            : t('sales.this_year');

  // recharts wants a number for the Y axis. We display sums in major units
  // (whole UZS, not tiyin) — readable axis ticks plus the tooltip formats
  // back to "X сум" via toLocaleString. Number() is safe up to 2^53,
  // covering 9×10^13 UZS — well past any realistic per-day total.
  const chartData = (data?.sales.chart ?? []).map((p) => ({
    label: localiseChartLabel(p.label, locale),
    sum: Number(BigInt(p.sumMinor) / 100n),
  }));

  return (
    <section>
      <SectionTitle title={t('sales.title')} href="/sales" />

      {/* Period selector — moysklad parity: LEFT-aligned beneath the
          orange title (was: small chip in the title's right-trailing
          slot, which read as a quiet "view options" widget; the real
          moysklad treats the selector as a primary control on the
          left of the section). Bigger pill: px-5 py-1.5 + min-w-[80px]
          so each option has comfortable hit area, and the active
          option uses a clean white pill on the muted bar — same
          treatment moysklad uses for its segmented control. */}
      <div className="pt-3">
        <div className="inline-flex rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              data-active={period === p || undefined}
              className={`min-w-[72px] rounded-[calc(var(--ms-radius-default)-2px)] px-5 py-1.5 font-medium text-sm transition-colors ${
                period === p
                  ? 'bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)] shadow-sm'
                  : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
              }`}
            >
              {tPeriods(p)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 pt-5 lg:grid-cols-2">
        <div className="space-y-6">
          <SalesSubBlock heading={todayHeading} block={data?.sales.today} loading={loading} />
          <SalesSubBlock heading={periodHeading} block={data?.sales.period} loading={loading} />
        </div>
        <div className="h-[200px] w-full">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--ms-border-default)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--ms-text-muted)' }}
                  axisLine={{ stroke: 'var(--ms-border-default)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--ms-text-muted)' }}
                  axisLine={{ stroke: 'var(--ms-border-default)' }}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  formatter={(value) => {
                    // recharts types `value` as ValueType (number | string |
                    // (number|string)[] | undefined). On our line charts
                    // it's always a single number, so narrow defensively.
                    const n = typeof value === 'number' ? value : 0;
                    return [`${n.toLocaleString('uz-UZ')} сум`, ''];
                  }}
                  contentStyle={{
                    background: 'var(--ms-bg-surface)',
                    border: '1px solid var(--ms-border-default)',
                    fontSize: '12px',
                  }}
                />
                <Line
                  // moysklad parity: their sales chart uses straight
                  // line segments (chord, not monotone Bézier) and the
                  // teal stroke #3e9f9f. The smoother curve hid daily
                  // spikes that matter for the comparison view.
                  type="linear"
                  dataKey="sum"
                  stroke="#3e9f9f"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Просроченные заказы / Просроченные счета
// ---------------------------------------------------------------------------

function OverduePanel({
  variant,
  block,
  loading,
}: {
  variant: 'orders' | 'invoices';
  block: OverdueBlock | undefined;
  loading: boolean;
}) {
  const ns = variant === 'orders' ? 'overdue_orders' : 'overdue_invoices';
  const t = useTranslations(`pages.homepage.${ns}`);
  const detailHref = variant === 'orders' ? '/customer-orders' : '/invoices-out';

  return (
    <section>
      <SectionTitle title={t('title')} href={detailHref} helpText={t('help')} />

      {/* Headline count + sum row */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2 pt-3">
        <div>
          {loading ? (
            <Skeleton className="h-7 w-10" />
          ) : (
            <div
              className="font-light text-2xl tabular-nums leading-none"
              style={{ color: '#3e9f9f' }}
            >
              {block?.count ?? 0}
            </div>
          )}
          <div className="mt-1 text-[10px] text-[var(--ms-text-muted)]">{t('stat_count')}</div>
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-7 w-28" />
          ) : (
            <div className="font-light text-2xl text-[var(--ms-text-primary)] tabular-nums leading-none">
              {fmt(block?.totalSumMinor ?? '0')}
            </div>
          )}
        </div>
      </div>

      {/* Items table — header always rendered (matches moysklad's empty state) */}
      <div className="mt-4">
        <div className="grid grid-cols-[2fr_1fr_1fr_0.7fr] gap-2 border-[var(--ms-border-default)] border-b pb-2 font-medium text-[var(--ms-text-muted)] text-xs">
          <div>{t('col_counterparty')}</div>
          <div>{t('col_number')}</div>
          <div className="text-right">
            {t('col_sum')}
            <div className="font-normal text-[10px] text-[var(--ms-text-muted)]">
              {t('stat_sum')}
            </div>
          </div>
          <div className="text-right">
            {t('col_days')}
            <div className="font-normal text-[10px] text-[var(--ms-text-muted)]">
              {t('days_unit')}
            </div>
          </div>
        </div>
        {(block?.items ?? []).length === 0 ? null : (
          <div className="divide-y divide-[var(--ms-border-default)]">
            {(block?.items ?? []).map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[2fr_1fr_1fr_0.7fr] gap-2 py-2 text-sm hover:bg-[var(--ms-bg-hover)]"
              >
                <div className="truncate text-[var(--ms-text-primary)]">
                  {item.counterpartyName ?? '—'}
                </div>
                <div className="truncate text-[var(--ms-text-primary)] tabular-nums">
                  {item.number}
                </div>
                <div className="text-right text-[var(--ms-text-primary)] tabular-nums">
                  {fmt(item.sumMinor)}
                </div>
                <div className="text-right text-[var(--ms-text-destructive)] tabular-nums">
                  {item.daysOverdue}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OverdueSection({
  data,
  loading,
}: {
  data: DashboardResult | undefined;
  loading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
      <OverduePanel variant="orders" block={data?.overdueOrders} loading={loading} />
      <OverduePanel variant="invoices" block={data?.overdueInvoices} loading={loading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Деньги
// ---------------------------------------------------------------------------

function MoneySection({
  data,
  loading,
}: {
  data: DashboardResult | undefined;
  loading: boolean;
}) {
  const t = useTranslations('pages.homepage.money');
  const locale = useLocale();

  const chartData = (data?.money.chart ?? []).map((p) => ({
    label: localiseChartLabel(p.label, locale),
    inflow: Number(BigInt(p.inflowMinor) / 100n),
    outflow: Number(BigInt(p.outflowMinor) / 100n),
    balance: Number(BigInt(p.balanceMinor) / 100n),
  }));

  return (
    <section>
      <SectionTitle title={t('title')} href="/money" />

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 pt-3 lg:grid-cols-2">
        <div>
          {loading ? (
            <Skeleton className="h-7 w-28" />
          ) : (
            <div className="font-light text-2xl text-[var(--ms-text-primary)] tabular-nums leading-none">
              {fmt(data?.money.totalSumMinor ?? '0')}
            </div>
          )}
          <div className="mt-1 text-[10px] text-[var(--ms-text-muted)]">{t('stat_sum')}</div>

          <div className="mt-4">
            <div className="grid grid-cols-[3fr_1fr] gap-2 border-[var(--ms-border-default)] border-b pb-2 font-medium text-[var(--ms-text-muted)] text-xs">
              <div>{t('col_org')}</div>
              <div className="text-right">{t('col_balance')}</div>
            </div>
            {loading ? (
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : (
              <div className="divide-y divide-[var(--ms-border-default)]">
                {(data?.money.byOrg ?? []).map((row) => (
                  <div
                    key={row.orgId}
                    className="grid grid-cols-[3fr_1fr] gap-2 py-2 text-sm hover:bg-[var(--ms-bg-hover)]"
                  >
                    <div className="truncate text-[var(--ms-text-primary)]">{row.orgName}</div>
                    <div className="text-right text-[var(--ms-text-primary)] tabular-nums">
                      {fmt(row.balanceMinor)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="h-[200px] w-full">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {/* Money chart — moysklad parity (exact same render):
                    - Приход: pastel-green BARS (fill #daf3c0, stroke #9fcf6a)
                    - Расход: pastel-red BARS  (fill #ffabab, stroke #d04a49)
                    - Остаток: medium-blue LINE (#6ab0cf)
                    Bars + line on the same axis via ComposedChart. */}
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--ms-border-default)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--ms-text-muted)' }}
                    axisLine={{ stroke: 'var(--ms-border-default)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--ms-text-muted)' }}
                    axisLine={{ stroke: 'var(--ms-border-default)' }}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value) => {
                      const n = typeof value === 'number' ? value : 0;
                      return [`${n.toLocaleString('uz-UZ')} сум`, ''];
                    }}
                    contentStyle={{
                      background: 'var(--ms-bg-surface)',
                      border: '1px solid var(--ms-border-default)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="inflow" fill="#daf3c0" stroke="#9fcf6a" />
                  <Bar dataKey="outflow" fill="#ffabab" stroke="#d04a49" />
                  <Line
                    type="linear"
                    dataKey="balance"
                    stroke="#6ab0cf"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Inline legend — recharts' built-in <Legend> wraps awkwardly,
              so we render dots + names ourselves to mirror moysklad. */}
          {/* Legend — small squares for bar series, line for the
              balance series, mirroring moysklad's exact style. */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="block h-3 w-3 rounded-[2px] border"
                style={{ background: '#daf3c0', borderColor: '#9fcf6a' }}
              />
              <span className="text-[var(--ms-text-muted)]">{t('legend_inflow')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="block h-3 w-3 rounded-[2px] border"
                style={{ background: '#ffabab', borderColor: '#d04a49' }}
              />
              <span className="text-[var(--ms-text-muted)]">{t('legend_outflow')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="block h-3 w-3 rounded-[2px] border"
                style={{ background: '#b0dff4', borderColor: '#6ab0cf' }}
              />
              <span className="text-[var(--ms-text-muted)]">{t('legend_balance')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Недавние документы
// ---------------------------------------------------------------------------

function RecentDocsSection({
  docs,
  loading,
  onRefresh,
}: {
  docs: RecentDocItem[] | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations('pages.homepage.recent_docs');

  const refreshButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onRefresh}
      aria-label={t('refresh')}
      title={t('refresh')}
      className="h-5 w-5"
    >
      ↻
    </Button>
  );

  return (
    <section>
      <SectionTitle title={t('title')} href="/audit" trailing={refreshButton} />

      <div className="overflow-x-auto pt-3">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-[var(--ms-border-default)] border-b text-left font-medium text-[var(--ms-text-muted)] text-xs">
              <th className="py-2 pr-3">{t('col_doc')}</th>
              <th className="py-2 pr-3">{t('col_posted')}</th>
              <th className="py-2 pr-3">{t('col_moment')}</th>
              <th className="py-2 pr-3">{t('col_counterparty')}</th>
              <th className="py-2 pr-3">{t('col_org')}</th>
              <th className="py-2 pr-3 text-right">{t('col_sum')}</th>
              <th className="py-2 pr-3">{t('col_currency')}</th>
              <th className="py-2 pr-3">{t('col_modified_at')}</th>
              <th className="py-2 pr-3">{t('col_modified_by')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-3">
                  <Skeleton className="h-4 w-full" />
                </td>
              </tr>
            ) : (docs ?? []).length === 0 ? null : (
              (docs ?? []).map((d) => (
                <tr
                  key={d.id}
                  className="border-[var(--ms-border-default)] border-b hover:bg-[var(--ms-bg-hover)]"
                >
                  <td className="py-2 pr-3 text-[var(--ms-text-primary)]">{d.number}</td>
                  <td className="py-2 pr-3 text-center">{d.posted ? '✓' : ''}</td>
                  <td className="py-2 pr-3 text-[var(--ms-text-muted)]">
                    {formatDateTime(d.momentDate)}
                  </td>
                  <td className="py-2 pr-3 text-[var(--ms-text-primary)]">
                    {d.counterpartyName ?? '—'}
                  </td>
                  <td className="py-2 pr-3 text-[var(--ms-text-primary)]">{d.orgName ?? '—'}</td>
                  <td className="py-2 pr-3 text-right text-[var(--ms-text-primary)] tabular-nums">
                    {fmt(d.sumMinor)}
                  </td>
                  <td className="py-2 pr-3 text-[var(--ms-text-muted)]">{d.currency}</td>
                  <td className="py-2 pr-3 text-[var(--ms-text-muted)]">
                    {formatDateTime(d.modifiedAt)}
                  </td>
                  <td className="py-2 pr-3 text-[var(--ms-text-muted)]">
                    {d.modifiedByName ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HomePage() {
  // moysklad's default visible tab is "Неделя" — we mirror it.
  const [period, setPeriod] = useState<Period>('week');

  const { data, isLoading, refetch } = useQuery<DashboardResult>({
    queryKey: ['dashboard', period],
    queryFn: () => api.get<DashboardResult>(`/reports/dashboard?period=${period}`),
    staleTime: 60_000,
  });

  return (
    <Container size="lg" className="space-y-8 py-4">
      {/* Page-level tabs (Показатели / Документы / Корзина / Аудит / Файлы / Начало работы) */}
      <HomepageTabs activeKey="metrics" />

      <SalesSection data={data} loading={isLoading} period={period} setPeriod={setPeriod} />
      <OverdueSection data={data} loading={isLoading} />
      <MoneySection data={data} loading={isLoading} />
      <RecentDocsSection docs={data?.recentDocs} loading={isLoading} onRefresh={() => refetch()} />
    </Container>
  );
}
