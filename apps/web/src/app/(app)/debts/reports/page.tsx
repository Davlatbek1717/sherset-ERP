'use client';

/**
 * §3.9 — KASSIRLAR BO'YICHA KUNLIK HISOBOT (+ §4 operatorlar hisoboti).
 *
 * Call-markaz rahbariyati uchun. Har bir kassir bo'yicha tanlangan kun kesimida:
 *   - qabul qilingan to'lovlar (FAQAT naqd/terminal),
 *   - berilgan yangi qarzlar,
 *   - tranzaksiyalar soni.
 *
 * TZ ning muhim ajratmasi: «Screenshot orqali operator kiritgan to'lovlar bu
 * yerga KIRMAYDI — ular alohida operator hisobotida ko'rinadi». Shuning uchun
 * ikkita jadval va ekranda buni tushuntiruvchi izoh bor.
 *
 * Ruxsat: `debtreport.view` — kassirga BERILMAGAN (server 403 qaytaradi).
 */

import { type CashierReportRow, type OperatorReportRow, debtApi } from '@/lib/debt-api';
import {
  Button,
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

/** Bugungi Toshkent sanasi — `YYYY-MM-DD` (input[type=date] uchun). */
function todayTashkent(): string {
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  return new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

export default function DebtReportsPage() {
  const t = useTranslations('pages.debts');
  const [date, setDate] = useState(todayTashkent());

  const cashiers = useQuery({
    queryKey: ['debts', 'report', 'cashiers', date],
    queryFn: () => debtApi.cashierReport(date),
  });

  const operators = useQuery({
    queryKey: ['debts', 'report', 'operators', date],
    queryFn: () => debtApi.operatorReport(date),
  });

  const cashierCols: DataTableColumn<CashierReportRow>[] = [
    {
      key: 'name',
      header: t('col_cashier'),
      cell: (r) => <span className="font-medium">{r.cashierName}</span>,
      cellText: (r) => r.cashierName,
    },
    {
      key: 'collected',
      header: t('col_collected'),
      cell: (r) => (
        <span className="font-semibold text-[var(--ms-text-success)] tabular-nums">
          {formatMoney(r.collectedMinor)}
        </span>
      ),
      cellText: (r) => r.collectedMinor,
    },
    {
      key: 'issued',
      header: t('col_issued'),
      cell: (r) => <span className="tabular-nums">{formatMoney(r.issuedMinor)}</span>,
      cellText: (r) => r.issuedMinor,
    },
    {
      key: 'tx',
      header: t('col_tx_count'),
      cell: (r) => (
        <span className="tabular-nums">
          {r.collectedCount} / {r.issuedCount}
        </span>
      ),
      cellText: (r) => `${r.collectedCount}/${r.issuedCount}`,
    },
  ];

  const operatorCols: DataTableColumn<OperatorReportRow>[] = [
    {
      key: 'name',
      header: t('col_operator'),
      cell: (r) => <span className="font-medium">{r.operatorName}</span>,
      cellText: (r) => r.operatorName,
    },
    {
      key: 'calls',
      header: t('col_calls'),
      cell: (r) => <span className="tabular-nums">{r.callCount}</span>,
      cellText: (r) => String(r.callCount),
    },
    {
      key: 'screenshots',
      header: t('col_screenshots'),
      cell: (r) => (
        <span className="tabular-nums">
          {r.screenshotCount} · {formatMoney(r.screenshotMinor)}
        </span>
      ),
      cellText: (r) => r.screenshotMinor,
    },
  ];

  function exportCashiers() {
    const rows = cashiers.data?.rows ?? [];
    const csv = buildCsv<CashierReportRow>(
      [
        { header: t('col_cashier'), cellText: (r) => r.cashierName },
        { header: t('col_collected'), cellText: (r) => r.collectedMinor },
        { header: t('col_issued'), cellText: (r) => r.issuedMinor },
        {
          header: t('col_tx_count'),
          cellText: (r) => `${r.collectedCount}/${r.issuedCount}`,
        },
      ],
      rows,
    );
    downloadCsv(csv, `kassirlar-${date}-${csvTimestamp()}.csv`);
  }

  const totals = cashiers.data?.totals;

  return (
    <Container>
      <PageHeader
        title={t('tab_reports')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={exportCashiers}>
              {t('export_csv')}
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts">{t('back_to_list')}</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <span className="text-[var(--ms-text-secondary)] text-sm">{t('report_date')}</span>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[180px]"
          data-test-id="report-date"
        />
      </div>

      {/* §3.9 kunlik jamlanma */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('col_collected')}
          value={formatMoney(totals?.collectedMinor ?? '0')}
          tone="success"
        />
        <StatCard label={t('col_issued')} value={formatMoney(totals?.issuedMinor ?? '0')} />
        <StatCard label={t('col_tx_count')} value={totals?.collectedCount ?? 0} />
        <StatCard label={t('kpi_debtors')} value={cashiers.data?.rows.length ?? 0} />
      </div>

      {/* ── Kassirlar hisoboti ─────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-sm">{t('report_cashiers')}</h2>
        {/* TZ ning aniq izohi — screenshot to'lovlari bu yerga kirmaydi */}
        <div className="mb-2 rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] p-2 text-[var(--ms-text-secondary)] text-xs">
          {t('cashier_report_hint')}
        </div>
        <DataTable
          columns={cashierCols}
          rows={cashiers.data?.rows ?? []}
          keyField="cashierId"
          loading={cashiers.isLoading}
          empty={<EmptyState title={t('empty')} />}
        />
      </section>

      {/* ── Operatorlar hisoboti (§4) ──────────────────────────────────── */}
      <section>
        <h2 className="mb-2 font-semibold text-sm">{t('report_operators')}</h2>
        <DataTable
          columns={operatorCols}
          rows={operators.data?.rows ?? []}
          keyField="operatorId"
          loading={operators.isLoading}
          empty={<EmptyState title={t('empty')} />}
        />
      </section>
    </Container>
  );
}
