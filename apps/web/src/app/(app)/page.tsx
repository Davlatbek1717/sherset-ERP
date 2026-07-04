'use client';

import { HomepageTabs } from '@/components/homepage-tabs';
import { api } from '@/lib/api-client';
import { Container, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Banknote,
  Coins,
  CreditCard,
  Monitor,
  Package,
  PiggyBank,
  Receipt,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';

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

// ---------------------------------------------------------------------------
// Time filter — presets + custom date range, drives the KPI cards below.
// Dates are the user's local calendar days (owner operates in Asia/Tashkent);
// backend maps "YYYY-MM-DD" to the Tashkent day window (resolveSotuvWindow).
// ---------------------------------------------------------------------------

/** Local calendar day as "YYYY-MM-DD" (no UTC shift — toISOString would drift past midnight). */
function dayIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

type PresetKey = 'today' | 'yesterday' | 'week' | 'month' | 'year';

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Bugun' },
  { key: 'yesterday', label: 'Kecha' },
  { key: 'week', label: 'Shu hafta' },
  { key: 'month', label: 'Shu oy' },
  { key: 'year', label: 'Shu yil' },
];

/** Inclusive [from, to] window for a preset, relative to `now`. Week starts Monday. */
function presetRange(key: PresetKey, now: Date): { from: string; to: string } {
  const today = dayIso(now);
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = dayIso(shiftDays(now, -1));
      return { from: y, to: y };
    }
    case 'week': {
      const mondayOffset = (now.getDay() + 6) % 7; // Yak=0 → 6, Du=1 → 0 …
      return { from: dayIso(shiftDays(now, -mondayOffset)), to: today };
    }
    case 'month':
      return { from: dayIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case 'year':
      return { from: dayIso(new Date(now.getFullYear(), 0, 1)), to: today };
  }
}

function DateFilterBar({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}) {
  const now = new Date();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* Preset pills — same segmented-control treatment the dashboard used before */}
      <div className="inline-flex rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-0.5">
        {PRESETS.map((p) => {
          const range = presetRange(p.key, now);
          const active = range.from === dateFrom && range.to === dateTo;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(range.from, range.to)}
              data-active={active || undefined}
              className={`min-w-[72px] rounded-[calc(var(--ms-radius-default)-2px)] px-4 py-1.5 font-medium text-sm transition-colors ${
                active
                  ? 'bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)] shadow-sm'
                  : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom range */}
      <div className="flex items-center gap-2 text-sm">
        <input
          type="date"
          value={dateFrom}
          max={dateTo}
          onChange={(e) => e.target.value && onChange(e.target.value, dateTo)}
          aria-label="Boshlanish sanasi"
          className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-1.5 text-[var(--ms-text-primary)]"
        />
        <span className="text-[var(--ms-text-muted)]">—</span>
        <input
          type="date"
          value={dateTo}
          min={dateFrom}
          onChange={(e) => e.target.value && onChange(dateFrom, e.target.value)}
          aria-label="Tugash sanasi"
          className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-1.5 text-[var(--ms-text-primary)]"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sotuv KPI cards — the kassa summary (Sherset custom). One backend call
// (/reports/sotuv-dashboard?dateFrom&dateTo) feeds every card: income split
// (sotuvdan / qarzdan), profit chain, debt ledger snapshot, warehouse totals,
// payment method breakdown, and the per-cashier table. Auto-refreshes every
// 30s. Windowed metrics follow the selected range; the «joriy» cards (qarzlar,
// tovarlar, ombor qiymati) are point-in-time snapshots by design.
// ---------------------------------------------------------------------------

function KpiCard({
  icon: Icon,
  label,
  primary,
  secondary,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  primary: string;
  secondary?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ms-bg-muted)] text-[var(--ms-text-brand)]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-[var(--ms-text-muted)] text-xs">{label}</span>
      </div>
      <div
        className="font-light text-2xl tabular-nums leading-none"
        style={{ color: accent ?? 'var(--ms-text-primary)' }}
      >
        {primary}
      </div>
      {secondary ? (
        <div className="mt-1 text-[var(--ms-text-muted)] text-xs">{secondary}</div>
      ) : null}
    </div>
  );
}

interface PaymentMethodBlock {
  sumMinor: string;
  count: number;
}

interface SotuvCashierRow {
  cashierId: string;
  cashierName: string;
  salesCount: number;
  salesSumMinor: string;
}

interface SotuvDashboardResult {
  date: string;
  dateFrom: string;
  dateTo: string;
  salesCount: number;
  salesSumMinor: string;
  salesIncomeMinor: string;
  debtIncomeMinor: string;
  totalIncomeMinor: string;
  profitMinor: string;
  expenseMinor: string;
  netProfitMinor: string;
  newDebtMinor: string;
  customerDebtMinor: string;
  ourDebtMinor: string;
  productCount: number;
  stockValueMinor: string;
  payments: {
    cash: PaymentMethodBlock;
    card: PaymentMethodBlock;
    terminal: PaymentMethodBlock;
  };
  cashiers: SotuvCashierRow[];
}

const PAYMENT_METHOD_STYLES = [
  { key: 'cash' as const, label: 'Naqd', icon: Banknote, color: '#10b981' },
  { key: 'card' as const, label: 'Karta', icon: CreditCard, color: '#3b82f6' },
  { key: 'terminal' as const, label: 'Terminal', icon: Monitor, color: '#8b5cf6' },
];

function SotuvKpiSection({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading } = useQuery<SotuvDashboardResult>({
    queryKey: ['sotuv-dashboard', dateFrom, dateTo],
    queryFn: () =>
      api.get<SotuvDashboardResult>(
        `/reports/sotuv-dashboard?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      ),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const v = (minor: string | undefined) => (isLoading ? '…' : fmt(minor ?? '0'));
  const netProfit = BigInt(data?.netProfitMinor ?? '0');

  return (
    <div className="space-y-3">
      {/* Kirim (income) row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Receipt}
          label="Sotuv soni"
          primary={isLoading ? '…' : `${data?.salesCount ?? 0} ta`}
          secondary={`jami ${fmt(data?.salesSumMinor ?? '0')}`}
          accent="#3e9f9f"
        />
        <KpiCard icon={Banknote} label="Sotuvdan kirim" primary={v(data?.salesIncomeMinor)} />
        <KpiCard icon={Coins} label="Qarzdan kirim" primary={v(data?.debtIncomeMinor)} />
        <KpiCard
          icon={Wallet}
          label="Umumiy kirim"
          primary={v(data?.totalIncomeMinor)}
          accent="#3e9f9f"
        />
      </div>

      {/* Foyda (profit) row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Foyda" primary={v(data?.profitMinor)} accent="#16a34a" />
        <KpiCard
          icon={TrendingDown}
          label="Xarajat"
          primary={v(data?.expenseMinor)}
          accent="#dc2626"
        />
        <KpiCard
          icon={PiggyBank}
          label="Sof foyda"
          primary={v(data?.netProfitMinor)}
          accent={netProfit < 0n ? '#dc2626' : '#16a34a'}
        />
        <KpiCard
          icon={AlertCircle}
          label="Yangi qarz"
          primary={v(data?.newDebtMinor)}
          secondary={`qarzdan kirim: ${fmt(data?.debtIncomeMinor ?? '0')}`}
          accent="#d97706"
        />
      </div>

      {/* Joriy holat (snapshot) row — always point-in-time, not windowed */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={Users} label="Mijoz qarzlari (joriy)" primary={v(data?.customerDebtMinor)} />
        <KpiCard icon={User} label="Shaxsiy qarzlar (joriy)" primary={v(data?.ourDebtMinor)} />
        <KpiCard
          icon={Package}
          label="Tovarlar (joriy)"
          primary={isLoading ? '…' : `${(data?.productCount ?? 0).toLocaleString('uz-UZ')} ta`}
        />
        <KpiCard
          icon={Warehouse}
          label="Ombor qiymati (joriy)"
          primary={v(data?.stockValueMinor)}
        />
      </div>

      {/* To'lov turlari row */}
      <div className="grid grid-cols-3 gap-3">
        {PAYMENT_METHOD_STYLES.map((m) => {
          const block = data?.payments[m.key];
          return (
            <div
              key={m.key}
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-md"
                  style={{ background: `${m.color}1a`, color: m.color }}
                >
                  <m.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-[var(--ms-text-muted)] text-xs">{m.label}</span>
              </div>
              <div className="font-light text-2xl text-[var(--ms-text-primary)] tabular-nums leading-none">
                {isLoading ? '…' : fmt(block?.sumMinor ?? '0')}
              </div>
              <div className="mt-1 text-[var(--ms-text-muted)] text-xs">{block?.count ?? 0} ta</div>
            </div>
          );
        })}
      </div>

      {/* Kassirlar table */}
      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="mb-2 font-semibold text-[13px] text-[var(--ms-text-primary)]">
          Kassirlar
        </div>
        <div className="grid grid-cols-[2fr_1fr_1.5fr] gap-2 border-[var(--ms-border-default)] border-b pb-2 font-medium text-[var(--ms-text-muted)] text-xs">
          <div>Kassir</div>
          <div className="text-right">Sotuv</div>
          <div className="text-right">Summa</div>
        </div>
        {isLoading ? (
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (data?.cashiers ?? []).length === 0 ? (
          <div className="pt-3 text-center text-[var(--ms-text-muted)] text-sm">
            Bu davrda sotuv yo'q
          </div>
        ) : (
          <div className="divide-y divide-[var(--ms-border-default)]">
            {(data?.cashiers ?? []).map((c) => (
              <div
                key={c.cashierId}
                className="grid grid-cols-[2fr_1fr_1.5fr] gap-2 py-2 text-sm hover:bg-[var(--ms-bg-hover)]"
              >
                <div className="truncate text-[var(--ms-text-primary)]">{c.cashierName}</div>
                <div className="text-right text-[var(--ms-text-primary)] tabular-nums">
                  {c.salesCount}
                </div>
                <div className="text-right text-[var(--ms-text-primary)] tabular-nums">
                  {fmt(c.salesSumMinor)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page — tabs, time filter on top, KPI cards. The old moysklad
// «Показатели» sections (Продажи chart, Просроченные, Деньги, Недавние
// документы) were removed 2026-07-04 per user request: the homepage is the
// kassa summary, and /sales·/money·/audit keep the detailed views.
// ---------------------------------------------------------------------------

export default function HomePage() {
  const todayIso = dayIso(new Date());
  const [dateFrom, setDateFrom] = useState(todayIso);
  const [dateTo, setDateTo] = useState(todayIso);

  return (
    <Container size="lg" className="space-y-4 py-4">
      {/* Page-level tabs (Показатели / Документы / Корзина / Аудит / Файлы / Начало работы) */}
      <HomepageTabs activeKey="metrics" />

      <DateFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
        }}
      />

      <SotuvKpiSection dateFrom={dateFrom} dateTo={dateTo} />
    </Container>
  );
}
