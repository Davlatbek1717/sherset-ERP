'use client';

/**
 * §3.1 — QARZDORLAR RO'YXATI (bo'limning bosh sahifasi).
 *
 * Ro'yxatda faqat qoldig'i > 0 bo'lgan mijozlar (`scope=active`). Qarz to'liq
 * to'langanda server statusni `paid` ga o'giradi va u ro'yxatdan o'zi chiqadi —
 * FE hech narsa o'chirmaydi (§3.1: «o'chirilmaydi — faqat faol ro'yxatdan
 * chiqadi, tarixda saqlanib qoladi»).
 *
 * §3.8 real-time: `refetchInterval` bilan ro'yxat o'zi yangilanadi — kassada
 * qabul qilingan to'lov call-markaz ekranida sahifani yangilamasdan ko'rinadi.
 */

import { api } from '@/lib/api-client';
import { DEBT_POLL_MS, type DebtRow, type DebtScope, debtApi } from '@/lib/debt-api';
import {
  Badge,
  Button,
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  StatCard,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SCOPES: DebtScope[] = ['active', 'today', 'overdue', 'all'];

/** Mijoz-segment tablari (2026-07-11 talab): Hammasi · Elektriklar · Boshqalar. */
type Segment = 'all' | 'elektrik' | 'boshqa';

export default function DebtsPage() {
  const t = useTranslations('pages.debts');
  const router = useRouter();

  const [scope, setScope] = useState<DebtScope>('active');
  const [segment, setSegment] = useState<Segment>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'nextContactAt' | 'remainingMinor' | 'totalMinor'>(
    'nextContactAt',
  );

  // «Elektriklar» guruhi id'si nom bo'yicha topiladi — guruh hali yaratilmagan
  // akkauntlarda tablar shunchaki ko'rinmaydi (graceful degradation).
  const groups = useQuery({
    queryKey: ['counterparty-groups'],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/counterparty-groups'),
    staleTime: 5 * 60_000,
  });
  const elektrikGroupId = groups.data?.items.find((g) => g.name === 'Elektriklar')?.id;

  const summary = useQuery({
    queryKey: ['debts', 'summary'],
    queryFn: () => debtApi.summary(),
    refetchInterval: DEBT_POLL_MS,
  });

  const list = useQuery({
    queryKey: ['debts', 'list', scope, segment, elektrikGroupId, search, sortBy],
    queryFn: () =>
      debtApi.list({
        scope,
        search: search || undefined,
        // Segment → guruh filtri: Elektriklar = guruh ichida, Boshqalar = tashqarida.
        counterpartyGroupId:
          segment === 'elektrik' && elektrikGroupId ? elektrikGroupId : undefined,
        counterpartyGroupExclude:
          segment === 'boshqa' && elektrikGroupId ? elektrikGroupId : undefined,
        sortBy,
        // Qo'ng'iroq sanasi — eng erta yuqorida; pul — eng katta yuqorida.
        sortDir: sortBy === 'nextContactAt' ? 'asc' : 'desc',
        limit: 200,
      }),
    refetchInterval: DEBT_POLL_MS,
  });

  const statusTone = (r: DebtRow) =>
    r.status === 'paid' ? 'success' : r.status === 'partial' ? 'warning' : 'neutral';

  const statusLabel = (r: DebtRow) =>
    r.status === 'paid'
      ? t('status_paid')
      : r.status === 'partial'
        ? t('status_partial')
        : t('status_unpaid');

  const columns: DataTableColumn<DebtRow>[] = [
    {
      key: 'counterparty',
      header: t('col_counterparty'),
      cell: (r) => <span className="font-medium">{r.counterpartyName ?? '—'}</span>,
      cellText: (r) => r.counterpartyName ?? '',
    },
    {
      key: 'phone',
      header: t('col_phone'),
      cell: (r) => r.phone ?? '—',
      cellText: (r) => r.phone ?? '',
    },
    {
      key: 'total',
      header: t('col_total'),
      cell: (r) => <span className="tabular-nums">{formatMoney(r.totalMinor, r.currency)}</span>,
      cellText: (r) => r.totalMinor,
    },
    {
      key: 'paid',
      header: t('col_paid'),
      cell: (r) => (
        <span className="text-[var(--ms-text-success)] tabular-nums">
          {formatMoney(r.paidMinor, r.currency)}
        </span>
      ),
      cellText: (r) => r.paidMinor,
    },
    {
      key: 'remaining',
      header: t('col_remaining'),
      cell: (r) => (
        <span className="font-semibold tabular-nums">
          {formatMoney(r.remainingMinor, r.currency)}
        </span>
      ),
      cellText: (r) => r.remainingMinor,
    },
    {
      key: 'next',
      header: t('col_next_contact'),
      // §3.5 — muddati o'tgan qo'ng'iroq QIZIL bilan ajratiladi.
      cell: (r) =>
        r.nextContactAt ? (
          <span
            className={
              r.overdue
                ? 'font-semibold text-[var(--ms-text-destructive)] tabular-nums'
                : 'tabular-nums'
            }
          >
            {new Date(r.nextContactAt).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ) : (
          '—'
        ),
      cellText: (r) => r.nextContactAt ?? '',
    },
    {
      key: 'owner',
      header: t('col_owner'),
      cell: (r) => r.ownerName ?? '—',
      cellText: (r) => r.ownerName ?? '',
    },
    {
      key: 'status',
      header: t('col_status'),
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={statusTone(r)}>{statusLabel(r)}</Badge>
          {r.overdue && <Badge tone="destructive">{t('badge_overdue')}</Badge>}
        </div>
      ),
      cellText: (r) => r.status,
    },
  ];

  return (
    <Container>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href="/debts/calls">{t('tab_calls')}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts/payments">{t('tab_payments')}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts/reports">{t('tab_reports')}</Link>
            </Button>
            <Button asChild>
              <Link href="/debts/new">{t('new_debt')}</Link>
            </Button>
          </div>
        }
      />

      {/* §4 — umumiy hisobot kartochkalari */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('kpi_outstanding')}
          value={formatMoney(summary.data?.outstandingMinor ?? '0')}
        />
        <StatCard label={t('kpi_debtors')} value={summary.data?.debtorCount ?? 0} />
        <StatCard
          label={t('kpi_overdue')}
          value={formatMoney(summary.data?.overdueMinor ?? '0')}
          hint={`${summary.data?.overdueCount ?? 0}`}
          tone="destructive"
        />
        <StatCard
          label={t('kpi_today_calls')}
          value={summary.data?.todayCallCount ?? 0}
          tone="warning"
        />
      </div>

      {/* Mijoz-segment tablari: Hammasi · ⚡ Elektriklar · Boshqalar */}
      {elektrikGroupId && (
        <div className="mb-3 flex items-center gap-1" data-test-id="debt-segment">
          {(['all', 'elektrik', 'boshqa'] as Segment[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSegment(s)}
              className={[
                'rounded-[var(--ms-radius-default)] px-3 py-1.5 font-medium text-sm transition-colors',
                segment === s
                  ? 'bg-[var(--ms-primary-600)] text-white'
                  : 'bg-[var(--ms-bg-muted)] text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-hover)]',
              ].join(' ')}
              data-test-id={`debt-segment-${s}`}
            >
              {s === 'all'
                ? t('segment_all')
                : s === 'elektrik'
                  ? t('segment_elektrik')
                  : t('segment_boshqa')}
            </button>
          ))}
        </div>
      )}

      {/* Filtrlar (§3.1) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <NativeSelect
          value={scope}
          onChange={(e) => setScope(e.target.value as DebtScope)}
          className="w-[220px]"
          data-test-id="debt-scope"
        >
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {t(`scope_${s}` as 'scope_active')}
            </option>
          ))}
        </NativeSelect>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('filter_search')}
          className="w-[240px]"
          data-test-id="debt-search"
        />

        <NativeSelect
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value as 'nextContactAt' | 'remainingMinor' | 'totalMinor')
          }
          className="w-[200px]"
          data-test-id="debt-sort"
        >
          <option value="nextContactAt">{t('sort_next_contact')}</option>
          <option value="remainingMinor">{t('sort_remaining')}</option>
          <option value="totalMinor">{t('sort_total')}</option>
        </NativeSelect>
      </div>

      <DataTable
        columns={columns}
        rows={list.data?.rows ?? []}
        keyField="id"
        loading={list.isLoading}
        onRowClick={(r) => router.push(`/debts/${r.id}`)}
        rowTestId={(r) => `debt-row-${r.id}`}
        empty={<EmptyState title={t('empty')} />}
      />
    </Container>
  );
}
