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

import { CallOutcomeModal } from '@/components/debts/call-outcome-modal';
import { api } from '@/lib/api-client';
import {
  type CallOutcome,
  DEBT_POLL_MS,
  type DebtRow,
  type DebtScope,
  debtApi,
} from '@/lib/debt-api';
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

const SCOPES: DebtScope[] = ['active', 'today', 'overdue', 'called', 'all'];

/** Qo'ng'iroq natijasi → badge rangi (2026-07-12). */
const OUTCOME_TONE: Record<CallOutcome, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  paid_full: 'success',
  paid_partial: 'warning',
  not_paid: 'destructive',
  callback: 'neutral',
};

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
  // «Qo'ng'iroq qilinganlar» ko'rinishi filtrlari (2026-07-12).
  const [calledDate, setCalledDate] = useState('');
  const [callOutcome, setCallOutcome] = useState<CallOutcome | ''>('');
  // «Qo'ng'iroq qilindi» modali ochiq turgan qarzdor.
  const [callTarget, setCallTarget] = useState<DebtRow | null>(null);

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
    queryKey: [
      'debts',
      'list',
      scope,
      segment,
      elektrikGroupId,
      search,
      sortBy,
      calledDate,
      callOutcome,
    ],
    queryFn: () =>
      debtApi.list({
        scope,
        search: search || undefined,
        // Segment → guruh filtri: Elektriklar = guruh ichida, Boshqalar = tashqarida.
        counterpartyGroupId:
          segment === 'elektrik' && elektrikGroupId ? elektrikGroupId : undefined,
        counterpartyGroupExclude:
          segment === 'boshqa' && elektrikGroupId ? elektrikGroupId : undefined,
        // «Qo'ng'iroq qilinganlar» ko'rinishi: kun (default bugun) + natija filtri.
        calledDate: scope === 'called' && calledDate ? calledDate : undefined,
        callOutcome: scope === 'called' && callOutcome ? callOutcome : undefined,
        sortBy,
        // Qo'ng'iroq sanasi — eng erta yuqorida; pul — eng katta yuqorida.
        sortDir: sortBy === 'nextContactAt' ? 'asc' : 'desc',
        limit: 200,
      }),
    refetchInterval: DEBT_POLL_MS,
  });

  /**
   * PDF eksport (2026-07-12) — EKRANDAGI holatni aynan chiqaradi:
   * tanlangan tab (Elektriklar/Boshqalar/Hammasi), scope, qidiruv, natija
   * filtri — hammasi PDF'ga o'tadi; sarlavhaga tab nomi yoziladi.
   */
  async function exportPdf() {
    const params = new URLSearchParams();
    params.set('scope', scope);
    if (search) params.set('search', search);
    if (segment === 'elektrik' && elektrikGroupId)
      params.set('counterpartyGroupId', elektrikGroupId);
    if (segment === 'boshqa' && elektrikGroupId)
      params.set('counterpartyGroupExclude', elektrikGroupId);
    if (scope === 'called' && calledDate) params.set('calledDate', calledDate);
    if (scope === 'called' && callOutcome) params.set('callOutcome', callOutcome);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortBy === 'nextContactAt' ? 'asc' : 'desc');
    const heading =
      segment === 'elektrik'
        ? t('segment_elektrik')
        : segment === 'boshqa'
          ? t('segment_boshqa')
          : t('segment_all');
    params.set('heading', heading.replace('⚡ ', ''));
    await api.download(
      `/debts/print/pdf?${params.toString()}`,
      `qarzdorlar-${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  }

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
          {/* Oxirgi qo'ng'iroq natijasi — bir qarashda ko'rinadi (2026-07-12). */}
          {r.lastCallOutcome && (
            <Badge tone={OUTCOME_TONE[r.lastCallOutcome]}>
              📞 {t(`outcome_${r.lastCallOutcome}` as 'outcome_paid_full')}
            </Badge>
          )}
        </div>
      ),
      cellText: (r) => r.status,
    },
    {
      key: 'call',
      header: '',
      // «Qo'ng'iroq qilindi» — har qatorda; qator bosilishiga xalaqit bermaydi.
      cell: (r) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            setCallTarget(r);
          }}
          data-test-id={`call-btn-${r.id}`}
        >
          📞 {t('call_button')}
        </Button>
      ),
      cellText: () => '',
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
            <Button variant="secondary" onClick={() => void exportPdf()} data-test-id="debt-pdf">
              {t('export_pdf')}
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

        {/* «Qo'ng'iroq qilinganlar» rejimi: kun (bo'sh = bugun) + natija filtri */}
        {scope === 'called' && (
          <>
            <Input
              type="date"
              value={calledDate}
              onChange={(e) => setCalledDate(e.target.value)}
              className="w-[170px]"
              data-test-id="called-date"
            />
            <NativeSelect
              value={callOutcome}
              onChange={(e) => setCallOutcome(e.target.value as CallOutcome | '')}
              className="w-[210px]"
              data-test-id="called-outcome"
            >
              <option value="">{t('outcome_all')}</option>
              <option value="paid_full">{t('outcome_paid_full')}</option>
              <option value="paid_partial">{t('outcome_paid_partial')}</option>
              <option value="not_paid">{t('outcome_not_paid')}</option>
              <option value="callback">{t('outcome_callback')}</option>
            </NativeSelect>
          </>
        )}
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

      {/* «Qo'ng'iroq qilindi» — natija modali (umumiy komponent) */}
      {callTarget && (
        <CallOutcomeModal
          debtId={callTarget.id}
          debtorName={callTarget.counterpartyName ?? callTarget.name}
          open={callTarget !== null}
          onClose={() => setCallTarget(null)}
        />
      )}
    </Container>
  );
}
