'use client';

/**
 * HR Oylik — 6-tab payroll dashboard backed by the P5 engine:
 *   • Umumiy    — monthly roll-up cards (headcount + Σ final/bonus/fine, avg %)
 *   • KPI       — daily personal-sales snapshot logs + manual snapshot
 *   • Bonus/Jarima — 5-source ledger + manual entry + delete (manual only)
 *   • Komissiya — per-employee sales × commission% breakdown + total
 *   • Sozlama   — salary config editor (weights, target, budget, commission, tiers)
 *   • Yakuniy   — monthly score roster (final salary + all components) + recompute
 *
 * All money is BigInt-as-string from the API; formatted via fmtMinor (so'm,
 * tiyin dropped). Overview + Commission read the SAME monthly data as Yakuniy
 * (no extra endpoint) — distinct views, not duplicate rosters.
 */

import { bonusFineTone } from '@/lib/domain-status-tone';
import {
  type BonusFineRow,
  type HrBonusFineKind,
  type HrEmployeeListResult,
  type KpiDailyRow,
  type KpiTier,
  type MonthlyScoreRow,
  type SalaryConfig,
  hrBonusFineApi,
  hrEmployeeApi,
  hrKpiApi,
  hrSalaryApi,
} from '@/lib/hr-api';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  MoneyInput,
  NativeSelect,
  Skeleton,
  useConfirm,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

const TZ = 'Asia/Tashkent';

function fmtMinor(v: string | null | undefined): string {
  if (!v) return '—';
  const negative = v.startsWith('-');
  const digits = (negative ? v.slice(1) : v).replace(/^0+/, '') || '0';
  const som = digits.length <= 2 ? '0' : digits.slice(0, -2);
  const grouped = som.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  // Drop the sign once tiyin-truncation collapses a negative sub-1-som value
  // to zero — otherwise e.g. "-50" (−0.50 som) would render as "-0".
  return `${negative && grouped !== '0' ? '-' : ''}${grouped}`;
}

function currentYearMonth(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM');
}

type Tab = 'overview' | 'kpi' | 'bonus' | 'commission' | 'config' | 'final';

export default function HrPayrollPage() {
  const t = useTranslations('pages.hrPayroll');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('overview');
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [detailFor, setDetailFor] = useState<MonthlyScoreRow | null>(null);

  const tabs: Array<{ id: Tab; label: string }> = useMemo(
    () => [
      { id: 'overview', label: t('tab_overview') },
      { id: 'kpi', label: t('tab_kpi') },
      { id: 'bonus', label: t('tab_bonus') },
      { id: 'commission', label: t('tab_commission') },
      { id: 'config', label: t('tab_config') },
      { id: 'final', label: t('tab_final') },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
        {tab !== 'config' && (
          <Input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="w-auto"
            data-test-id="hr-payroll-month"
          />
        )}
      </div>

      <div className="flex border-[var(--ms-border-default)] border-b">
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
              tab === item.id
                ? 'border-[var(--ms-border-focus)] text-[var(--ms-text-strong)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
            data-test-id={`hr-payroll-tab-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab yearMonth={yearMonth} />}
      {tab === 'kpi' && <KpiTab yearMonth={yearMonth} qc={qc} />}
      {tab === 'bonus' && <BonusTab yearMonth={yearMonth} qc={qc} />}
      {tab === 'commission' && <CommissionTab yearMonth={yearMonth} />}
      {tab === 'config' && <ConfigTab qc={qc} />}
      {tab === 'final' && <FinalTab yearMonth={yearMonth} qc={qc} onSelect={setDetailFor} />}

      <PayrollDetailModal
        detail={detailFor}
        yearMonth={yearMonth}
        onClose={() => setDetailFor(null)}
      />
    </div>
  );

  // helpers below use t/tCommon via closure
  function ConfigTab({ qc: client }: { qc: ReturnType<typeof useQueryClient> }) {
    const cfgQuery = useQuery<SalaryConfig>({
      queryKey: ['hr-salary-config'],
      queryFn: () => hrSalaryApi.getConfig(),
    });
    const [draft, setDraft] = useState<SalaryConfig | null>(null);
    const [error, setError] = useState<string | null>(null);
    const cfg = draft ?? cfgQuery.data ?? null;

    const saveMut = useMutation({
      mutationFn: () => {
        if (!cfg) throw new Error('no config');
        return hrSalaryApi.upsertConfig({
          fixWeight: cfg.fixWeight,
          kpiWeight: cfg.kpiWeight,
          bonusWeight: cfg.bonusWeight,
          monthlySalesTarget: cfg.monthlySalesTargetMinor,
          monthlyKpiBudget: cfg.monthlyKpiBudgetMinor,
          commissionPercent: cfg.commissionPercent,
          kpiTiers: cfg.kpiTiers,
        });
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey: ['hr-salary-config'] });
        setDraft(null);
        setError(null);
      },
      onError: (e: Error) => setError(e.message),
    });

    if (cfgQuery.isLoading || !cfg) return <Skeleton className="h-60" />;

    const patch = (p: Partial<SalaryConfig>) => setDraft({ ...cfg, ...p });
    const patchTier = (i: number, p: Partial<KpiTier>) => {
      const next = cfg.kpiTiers.map((tier, idx) => (idx === i ? { ...tier, ...p } : tier));
      patch({ kpiTiers: next });
    };

    return (
      <div className="max-w-2xl space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('cfg_fix_weight')}>
            <NumInput value={cfg.fixWeight} step={0.05} onChange={(v) => patch({ fixWeight: v })} />
          </Field>
          <Field label={t('cfg_kpi_weight')}>
            <NumInput value={cfg.kpiWeight} step={0.05} onChange={(v) => patch({ kpiWeight: v })} />
          </Field>
          <Field label={t('cfg_bonus_weight')}>
            <NumInput
              value={cfg.bonusWeight}
              step={0.05}
              onChange={(v) => patch({ bonusWeight: v })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('cfg_sales_target')} hint={t('cfg_minor_hint')}>
            <MoneyInput
              valueMinor={cfg.monthlySalesTargetMinor}
              onChangeMinor={(v) => patch({ monthlySalesTargetMinor: v })}
            />
          </Field>
          <Field label={t('cfg_kpi_budget')} hint={t('cfg_minor_hint')}>
            <MoneyInput
              valueMinor={cfg.monthlyKpiBudgetMinor}
              onChangeMinor={(v) => patch({ monthlyKpiBudgetMinor: v })}
            />
          </Field>
        </div>
        <Field label={t('cfg_commission')}>
          <NumInput
            value={cfg.commissionPercent}
            step={0.1}
            onChange={(v) => patch({ commissionPercent: v })}
          />
        </Field>

        <div>
          <div className="mb-2 font-medium text-[var(--ms-text-primary)] text-sm">
            {t('cfg_tiers')}
          </div>
          <div className="space-y-2">
            {cfg.kpiTiers.map((tier, i) => (
              <div key={`tier-${i}-${tier.min}`} className="flex items-center gap-2">
                <span className="w-20 text-[var(--ms-text-muted)] text-xs">
                  {t('cfg_tier_min')}
                </span>
                <NumInput value={tier.min} step={5} onChange={(v) => patchTier(i, { min: v })} />
                <span className="w-20 text-[var(--ms-text-muted)] text-xs">
                  {t('cfg_tier_payout')}
                </span>
                <NumInput
                  value={tier.payout}
                  step={5}
                  onChange={(v) => patchTier(i, { payout: v })}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => patch({ kpiTiers: cfg.kpiTiers.filter((_, idx) => idx !== i) })}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => patch({ kpiTiers: [...cfg.kpiTiers, { min: 0, payout: 0 }] })}
            >
              {t('cfg_add_tier')}
            </Button>
          </div>
        </div>

        {error && (
          <div className="text-[var(--ms-text-destructive)] text-sm" role="alert">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !draft}>
            {tCommon('save')}
          </Button>
          {draft && (
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {tCommon('cancel')}
            </Button>
          )}
        </div>
      </div>
    );
  }
}

function OverviewTab({ yearMonth }: { yearMonth: string }) {
  const t = useTranslations('pages.hrPayroll');
  const query = useQuery<MonthlyScoreRow[]>({
    queryKey: ['hr-payroll', yearMonth],
    queryFn: () => hrSalaryApi.listMonthly(yearMonth),
  });

  if (query.isLoading) return <Skeleton className="h-40" />;
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return <EmptyState title={t('empty_final')} description={t('empty_final_hint')} />;
  }

  const sumOf = (pick: (r: MonthlyScoreRow) => string | null | undefined): string =>
    rows.reduce((acc, r) => acc + BigInt(pick(r) || '0'), 0n).toString();
  const avgAchievement = Math.round(
    rows.reduce((acc, r) => acc + Number(r.achievementPercent), 0) / rows.length,
  );

  const cards: Array<{ label: string; value: string; tone?: 'success' | 'destructive' }> = [
    { label: t('ov_headcount'), value: String(rows.length) },
    { label: t('ov_total_final'), value: fmtMinor(sumOf((r) => r.finalSalaryMinor)) },
    { label: t('ov_total_commission'), value: fmtMinor(sumOf((r) => r.commissionMinor)) },
    { label: t('ov_total_bonus'), value: fmtMinor(sumOf((r) => r.bonusSumMinor)), tone: 'success' },
    {
      label: t('ov_total_fine'),
      value: fmtMinor(sumOf((r) => r.fineSumMinor)),
      tone: 'destructive',
    },
    { label: t('ov_avg_achievement'), value: `${avgAchievement}%` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3" data-test-id="hr-payroll-overview">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 py-3"
        >
          <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {c.label}
          </div>
          <div
            className={`mt-1 font-semibold text-xl tabular-nums ${
              c.tone === 'success'
                ? 'text-[var(--ms-text-success)]'
                : c.tone === 'destructive'
                  ? 'text-[var(--ms-text-destructive)]'
                  : 'text-[var(--ms-text-strong)]'
            }`}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommissionTab({ yearMonth }: { yearMonth: string }) {
  const t = useTranslations('pages.hrPayroll');
  const query = useQuery<MonthlyScoreRow[]>({
    queryKey: ['hr-payroll', yearMonth],
    queryFn: () => hrSalaryApi.listMonthly(yearMonth),
  });
  const cfgQuery = useQuery<SalaryConfig>({
    queryKey: ['hr-salary-config'],
    queryFn: () => hrSalaryApi.getConfig(),
  });

  if (query.isLoading) return <Skeleton className="h-40" />;
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return <EmptyState title={t('empty_final')} description={t('empty_final_hint')} />;
  }

  const pct = cfgQuery.data?.commissionPercent;
  const totalSales = rows.reduce((acc, r) => acc + BigInt(r.totalSalesMinor || '0'), 0n);
  const totalCommission = rows.reduce((acc, r) => acc + BigInt(r.commissionMinor || '0'), 0n);

  return (
    <div className="space-y-3">
      {typeof pct === 'number' && (
        <div
          className="text-[var(--ms-text-muted)] text-sm"
          data-test-id="hr-payroll-commission-rate"
        >
          {t('commission_rate', { pct })}
        </div>
      )}
      <table className="w-full border-collapse text-sm" data-test-id="hr-payroll-commission-table">
        <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">{t('col_employee')}</th>
            <th className="px-3 py-2 text-right">{t('col_sales')}</th>
            <th className="px-3 py-2 text-right">{t('col_commission')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
              data-test-id={`hr-payroll-commission-${r.employeeId}`}
            >
              <td className="px-3 py-2 font-medium text-[var(--ms-text-strong)]">
                {r.employee?.name ?? '—'}
              </td>
              <td className="px-3 py-2 text-right font-mono">{fmtMinor(r.totalSalesMinor)}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold">
                {fmtMinor(r.commissionMinor)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-[var(--ms-border-default)] border-t-2 font-semibold">
            <td className="px-3 py-2 text-[var(--ms-text-muted)]">{t('total')}</td>
            <td className="px-3 py-2 text-right font-mono">{fmtMinor(totalSales.toString())}</td>
            <td className="px-3 py-2 text-right font-mono">
              {fmtMinor(totalCommission.toString())}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FinalTab({
  yearMonth,
  qc,
  onSelect,
}: {
  yearMonth: string;
  qc: ReturnType<typeof useQueryClient>;
  onSelect: (row: MonthlyScoreRow) => void;
}) {
  const t = useTranslations('pages.hrPayroll');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const query = useQuery<MonthlyScoreRow[]>({
    queryKey: ['hr-payroll', yearMonth],
    queryFn: () => hrSalaryApi.listMonthly(yearMonth),
  });
  const computeMut = useMutation({
    mutationFn: () => hrSalaryApi.computeAll(yearMonth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-payroll', yearMonth] }),
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => computeMut.mutate()} disabled={computeMut.isPending}>
          {t('recompute_all')}
        </Button>
      </div>
      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : query.data && query.data.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-test-id="hr-payroll-final-table">
          <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('col_employee')}</th>
              <th className="px-3 py-2 text-right">{t('col_sales')}</th>
              <th className="px-3 py-2 text-right">{t('col_achievement')}</th>
              <th className="px-3 py-2 text-right">{t('col_fix')}</th>
              <th className="px-3 py-2 text-right">{t('col_kpi')}</th>
              <th className="px-3 py-2 text-right">{t('col_commission')}</th>
              <th className="px-3 py-2 text-right">{t('col_bonus')}</th>
              <th className="px-3 py-2 text-right">{t('col_fine')}</th>
              <th className="px-3 py-2 text-right">{t('col_final')}</th>
              {/* Qabul holati — TZ §4.4: buxgalter ko'r-ko'rona to'lamasin. */}
              <th className="px-3 py-2 text-right">{t('col_acceptance')}</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                onClick={() => onSelect(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(r);
                }}
                tabIndex={0}
                data-test-id={`hr-payroll-final-${r.employeeId}`}
              >
                <td className="px-3 py-2 font-medium text-[var(--ms-text-strong)]">
                  {r.employee?.name ?? '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtMinor(r.totalSalesMinor)}</td>
                <td className="px-3 py-2 text-right">
                  <Badge tone={Number(r.achievementPercent) >= 100 ? 'success' : 'neutral'}>
                    {Number(r.achievementPercent).toFixed(0)}%
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtMinor(r.fixComponentMinor)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtMinor(r.kpiEarnedMinor)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtMinor(r.commissionMinor)}</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                  {fmtMinor(r.bonusSumMinor)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-red-600 dark:text-red-400">
                  {fmtMinor(r.fineSumMinor)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-[var(--ms-text-strong)]">
                  {fmtMinor(r.finalSalaryMinor)}
                </td>
                <td className="px-3 py-2 text-right">
                  <AcceptanceCell row={r} t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('empty_final')} description={t('empty_final_hint')} />
      )}
    </div>
  );
}

/**
 * Oylik qatorining QABUL holati (TZ §4.4, bosqich 4M.3).
 *
 * Menejer ko'rmagan kun oylikka KIRMAYDI (M-Q8 bloklash). Buni ko'rsatmaslik
 * eng xavfli variant bo'lardi: buxgalter kamaygan raqamni sababsiz deb
 * qabul qilardi. Shuning uchun bu yerda uch narsa ochiq turadi — nechta kun
 * kutmoqda, nechtasi hisobga kirgan va QANCHA SUMMA bloklangan.
 */
function AcceptanceCell({
  row,
  t,
}: {
  row: MonthlyScoreRow;
  t: ReturnType<typeof useTranslations>;
}) {
  const blocked = BigInt(row.blockedSalesMinor || '0');
  if (row.pendingDays === 0) {
    return <Badge tone="success">{t('acceptance_all_accepted', { days: row.acceptedDays })}</Badge>;
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <Badge tone="warning" data-test-id={`hr-payroll-pending-${row.employeeId}`}>
        {t('acceptance_pending', { days: row.pendingDays })}
      </Badge>
      {blocked > 0n && (
        <span className="font-mono text-[var(--ms-text-muted)] text-xs">
          −{fmtMinor(row.blockedSalesMinor)}
        </span>
      )}
    </div>
  );
}

function KpiTab({ yearMonth, qc }: { yearMonth: string; qc: ReturnType<typeof useQueryClient> }) {
  const t = useTranslations('pages.hrPayroll');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [from, to] = monthRange(yearMonth);
  const query = useQuery<KpiDailyRow[]>({
    queryKey: ['hr-kpi-daily', from, to],
    queryFn: () => hrKpiApi.listDaily(from, to),
  });
  // Snapshot upserts TODAY's KpiDailyLog — invalidate so the table reflects it.
  // (qc was never threaded into KpiTab, so the button used to fire with no
  // visible refresh and swallow errors silently.)
  const snapMut = useMutation({
    mutationFn: () => hrKpiApi.snapshot(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-kpi-daily'] }),
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => snapMut.mutate()} disabled={snapMut.isPending}>
          {t('snapshot_today')}
        </Button>
      </div>
      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : query.data && query.data.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-test-id="hr-payroll-kpi-table">
          <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('col_date')}</th>
              <th className="px-3 py-2 text-left">{t('col_employee')}</th>
              <th className="px-3 py-2 text-right">{t('col_sales')}</th>
              <th className="px-3 py-2 text-right">{t('col_target')}</th>
              <th className="px-3 py-2 text-right">{t('col_achievement')}</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((r) => (
              <tr
                key={r.id}
                className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
              >
                <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                  {formatInTimeZone(new Date(r.date), TZ, 'yyyy-MM-dd')}
                </td>
                <td className="px-3 py-2">{r.employee?.name ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtMinor(r.personalSalesMinor)}</td>
                <td className="px-3 py-2 text-right font-mono text-[var(--ms-text-muted)]">
                  {fmtMinor(r.targetMinor)}
                </td>
                <td className="px-3 py-2 text-right">{Number(r.achievementPercent).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('empty_kpi')} description={t('empty_kpi_hint')} />
      )}
    </div>
  );
}

function BonusTab({
  yearMonth,
  qc,
}: {
  yearMonth: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const t = useTranslations('pages.hrPayroll');
  const tCommon = useTranslations('common');
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [from, to] = monthRange(yearMonth);
  const [adding, setAdding] = useState(false);

  const query = useQuery<{ rows: BonusFineRow[] }>({
    queryKey: ['hr-bonus-fine', from, to],
    queryFn: () => hrBonusFineApi.list({ dateFrom: from, dateTo: to, limit: 200 }),
  });
  const empQuery = useQuery<HrEmployeeListResult>({
    queryKey: ['hr-employees', 'bonus-picker'],
    queryFn: () => hrEmployeeApi.list({ limit: 200 }),
    enabled: adding,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => hrBonusFineApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-bonus-fine'] }),
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)} data-test-id="hr-bonus-add">
          {t('add_manual')}
        </Button>
      </div>
      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : query.data && query.data.rows.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-test-id="hr-payroll-bonus-table">
          <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('col_date')}</th>
              <th className="px-3 py-2 text-left">{t('col_employee')}</th>
              <th className="px-3 py-2 text-left">{t('col_kind')}</th>
              <th className="px-3 py-2 text-left">{t('col_source')}</th>
              <th className="px-3 py-2 text-right">{t('col_amount')}</th>
              <th className="px-3 py-2 text-left">{t('col_reason')}</th>
              <th className="px-3 py-2 text-right">{tCommon('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {query.data.rows.map((r) => (
              <tr
                key={r.id}
                className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
              >
                <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                  {formatInTimeZone(new Date(r.createdAt), TZ, 'yyyy-MM-dd HH:mm')}
                </td>
                <td className="px-3 py-2">{r.employeeName ?? r.employee?.name ?? '—'}</td>
                <td className="px-3 py-2">
                  <Badge tone={bonusFineTone(r.kind)}>{t(`kind_${r.kind}`)}</Badge>
                </td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                  {t(`source_${r.source}`)}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtMinor(r.amountMinor)}</td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)]">{r.reason ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  {r.source === 'manual' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('delete_confirm'),
                          confirmLabel: tCommon('delete'),
                          tone: 'destructive',
                        });
                        if (ok) removeMut.mutate(r.id);
                      }}
                    >
                      {tCommon('delete')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('empty_bonus')} />
      )}

      {adding && (
        <ManualBonusModal
          employees={empQuery.data?.rows ?? []}
          onClose={() => setAdding(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['hr-bonus-fine'] });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function ManualBonusModal({
  employees,
  onClose,
  onSaved,
}: {
  employees: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('pages.hrPayroll');
  const tCommon = useTranslations('common');
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<HrBonusFineKind>('bonus');
  const [amountSom, setAmountSom] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!employeeId) throw new Error(t('err_employee'));
      const som = amountSom.replace(/[\s,]/g, '');
      if (!/^\d+$/.test(som) || som === '0') throw new Error(t('err_amount'));
      const minor = `${som}00`; // so'm → tiyin
      return hrBonusFineApi.createManual({
        employeeId,
        kind,
        amountMinor: minor,
        reason: reason.trim() || null,
      });
    },
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

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
      data-test-id="hr-bonus-modal"
    >
      <div className="w-full max-w-md rounded-[var(--ms-radius-lg)] bg-[var(--ms-bg-surface)] p-6 shadow-xl">
        <h2 className="font-semibold text-[var(--ms-text-strong)] text-lg">{t('add_manual')}</h2>
        <div className="mt-4 space-y-3">
          <Field label={t('col_employee')} required>
            <NativeSelect
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              data-test-id="hr-bonus-employee"
            >
              <option value="">— {t('err_employee')} —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t('col_kind')} required>
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as HrBonusFineKind)}>
              <option value="bonus">{t('kind_bonus')}</option>
              <option value="fine">{t('kind_fine')}</option>
            </NativeSelect>
          </Field>
          <Field label={t('col_amount')} hint={t('amount_som_hint')} required>
            <Input
              type="text"
              inputMode="numeric"
              value={amountSom}
              onChange={(e) => setAmountSom(e.target.value)}
              placeholder="100000"
              data-test-id="hr-bonus-amount"
            />
          </Field>
          <Field label={t('col_reason')}>
            <Input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
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
            data-test-id="hr-bonus-save"
          >
            {tCommon('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Detail modal — click an employee in the Yakuniy roster to see their
 * bonus/fine ledger for the month, grouped by day (yangibolim OylikPage
 * detail modal parity, spec §6.7).
 */
function PayrollDetailModal({
  detail,
  yearMonth,
  onClose,
}: {
  detail: MonthlyScoreRow | null;
  yearMonth: string;
  onClose: () => void;
}) {
  const t = useTranslations('pages.hrPayroll');
  const [from, to] = monthRange(yearMonth);
  const query = useQuery<{ rows: BonusFineRow[] }>({
    queryKey: ['hr-bonus-fine', 'detail', detail?.employeeId, from, to],
    queryFn: () =>
      hrBonusFineApi.list({
        employeeId: detail?.employeeId,
        dateFrom: from,
        dateTo: to,
        limit: 500,
      }),
    enabled: !!detail,
  });

  if (!detail) return null;

  const byDay = new Map<string, BonusFineRow[]>();
  for (const r of query.data?.rows ?? []) {
    const day = formatInTimeZone(new Date(r.createdAt), TZ, 'yyyy-MM-dd');
    const arr = byDay.get(day) ?? [];
    arr.push(r);
    byDay.set(day, arr);
  }
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // newest first

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
      data-test-id="hr-payroll-detail-modal"
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-[var(--ms-radius-lg)] bg-[var(--ms-bg-surface)] p-6 shadow-xl">
        <h2 className="font-semibold text-[var(--ms-text-strong)] text-lg">
          {detail.employee?.name ?? '—'} · {yearMonth}
        </h2>
        <div className="mt-1 text-[var(--ms-text-muted)] text-sm">
          {t('col_final')}: <span className="font-mono">{fmtMinor(detail.finalSalaryMinor)}</span>
        </div>

        <div className="mt-4 space-y-3">
          {query.isLoading ? (
            <Skeleton className="h-32" />
          ) : days.length === 0 ? (
            <div className="py-6 text-center text-[var(--ms-text-muted)] text-sm">
              {t('detail_empty')}
            </div>
          ) : (
            days.map(([day, rows]) => {
              const dayTotal = rows.reduce(
                (acc, r) =>
                  acc + (r.kind === 'bonus' ? BigInt(r.amountMinor) : -BigInt(r.amountMinor)),
                0n,
              );
              return (
                <div
                  key={day}
                  className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)]"
                >
                  <div className="flex items-center justify-between bg-[var(--ms-bg-app)] px-3 py-1.5 font-medium text-sm">
                    <span>{day}</span>
                    <span className="font-mono tabular-nums">{fmtMinor(dayTotal.toString())}</span>
                  </div>
                  <div className="divide-y divide-[var(--ms-border-subtle)]">
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <Badge tone={bonusFineTone(r.kind)}>{t(`kind_${r.kind}`)}</Badge>
                        <span className="font-mono tabular-nums">{fmtMinor(r.amountMinor)}</span>
                        <span className="text-[var(--ms-text-muted)] text-xs">
                          {t(`source_${r.source}`)}
                        </span>
                        {r.reason && (
                          <span className="ml-auto truncate text-[var(--ms-text-muted)] text-[11px]">
                            {r.reason}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NumInput({
  value,
  step,
  onChange,
}: {
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <Input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-[var(--ms-text-primary)] text-sm">
        {label}
        {required && <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>}
      </span>
      {children}
      {hint && <span className="text-[var(--ms-text-muted)] text-xs">{hint}</span>}
    </div>
  );
}

/** [first-day, last-day] yyyy-MM-dd strings for a "YYYY-MM". */
function monthRange(yearMonth: string): [string, string] {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) {
    const now = currentYearMonth();
    return [`${now}-01`, `${now}-28`];
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${yearMonth}-01`, `${yearMonth}-${String(lastDay).padStart(2, '0')}`];
}
