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

import { useBackspaceBack } from '@/hooks/use-keyboard-nav';
import {
  type CashierReportRow,
  type DebtPaymentFeedRow,
  type OperatorReportRow,
  debtApi,
  fetchAllPayments,
} from '@/lib/debt-api';
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
  // Backspace → orqaga («Ro'yxatga qaytish» bosmasdan; matn maydonlarida ishlamaydi).
  useBackspaceBack();
  const [date, setDate] = useState(todayTashkent());

  const cashiers = useQuery({
    queryKey: ['debts', 'report', 'cashiers', date],
    queryFn: () => debtApi.cashierReport(date),
  });

  const operators = useQuery({
    queryKey: ['debts', 'report', 'operators', date],
    queryFn: () => debtApi.operatorReport(date),
  });

  // «AYNAN QAYSI MIJOZ to'lagani» — tanlangan kunning har bir to'lovi mijoz
  // ismi bilan (foydalanuvchi talabi 2026-07-11: hisobotda ham, Excel'da ham
  // ism aniq ko'rinsin). Kassir-jamlanmasi javob bermaydigan savolga javob.
  const payments = useQuery({
    queryKey: ['debts', 'report', 'payments', date],
    queryFn: () => debtApi.paymentsFeed({ from: date, to: date, limit: 200 }),
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

  // Mijozlar kesimidagi jadval ustunlari — ism BOSILADIGAN havola (kartochkaga).
  const paymentCols: DataTableColumn<DebtPaymentFeedRow>[] = [
    {
      key: 'time',
      header: t('col_time'),
      cell: (r) => (
        <span className="tabular-nums">
          {new Date(r.createdAt).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
      cellText: (r) => r.createdAt,
    },
    {
      key: 'client',
      header: t('col_counterparty'),
      cell: (r) => (
        <Link
          href={`/debts/${r.debtId}`}
          className="font-medium text-[var(--ms-primary-600)] hover:underline"
        >
          {r.counterpartyName}
        </Link>
      ),
      cellText: (r) => r.counterpartyName,
    },
    {
      key: 'debtName',
      header: t('col_number'),
      cell: (r) => <span className="text-[var(--ms-text-muted)]">{r.debtName}</span>,
      cellText: (r) => r.debtName,
    },
    {
      key: 'amount',
      header: t('col_amount'),
      cell: (r) => (
        <span className="font-semibold text-[var(--ms-text-success)] tabular-nums">
          {formatMoney(r.amountMinor)}
        </span>
      ),
      cellText: (r) => r.amountMinor,
    },
    {
      key: 'method',
      header: t('col_method'),
      cell: (r) =>
        r.method === 'cash'
          ? t('method_cash')
          : r.method === 'terminal'
            ? t('method_terminal')
            : r.method === 'manual_close'
              ? t('method_manual_close')
              : t('method_card_screenshot'),
      cellText: (r) => r.method,
    },
    {
      key: 'receivedBy',
      header: t('col_received_by'),
      cell: (r) => r.receivedByName ?? '—',
      cellText: (r) => r.receivedByName ?? '',
    },
    {
      key: 'remaining',
      header: t('col_remaining'),
      cell: (r) =>
        r.debtStatus === 'paid' ? (
          <span className="font-medium text-[var(--ms-text-success)]">{t('paid_full')}</span>
        ) : (
          <span className="tabular-nums">{formatMoney(r.remainingMinor)}</span>
        ),
      cellText: (r) => r.remainingMinor,
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

  /**
   * Excel eksport — MIJOZ ISMI bilan, tanlangan kunning har bir to'lovi.
   * Server sahifalab beradi (max 200) — fetchAllPayments hammasini yig'adi.
   * Summalar Excel hisob-kitobi uchun toza SO'M raqamida (bo'sh joysiz).
   */
  async function exportPayments() {
    const rows = await fetchAllPayments({ from: date, to: date });
    const csv = buildCsv<DebtPaymentFeedRow>(
      [
        {
          header: t('col_time'),
          cellText: (r) => new Date(r.createdAt).toLocaleString('ru-RU'),
        },
        { header: t('col_counterparty'), cellText: (r) => r.counterpartyName },
        { header: t('col_phone'), cellText: (r) => r.phone ?? '' },
        { header: t('col_number'), cellText: (r) => r.debtName },
        {
          header: `${t('col_amount')} (so'm)`,
          cellText: (r) => String(Number(r.amountMinor) / 100),
        },
        {
          header: t('col_method'),
          cellText: (r) =>
            r.method === 'cash'
              ? t('method_cash')
              : r.method === 'terminal'
                ? t('method_terminal')
                : r.method === 'manual_close'
                  ? t('method_manual_close')
                  : t('method_card_screenshot'),
        },
        { header: t('col_source'), cellText: (r) => r.sourceName ?? '' },
        { header: t('col_received_by'), cellText: (r) => r.receivedByName ?? '' },
        {
          header: `${t('col_remaining')} (so'm)`,
          cellText: (r) => String(Number(r.remainingMinor) / 100),
        },
        {
          header: t('col_status'),
          cellText: (r) =>
            r.debtStatus === 'paid'
              ? t('paid_full')
              : r.debtStatus === 'partial'
                ? t('status_partial')
                : t('status_unpaid'),
        },
      ],
      rows,
    );
    downloadCsv(csv, `tolovlar-mijozlar-${date}-${csvTimestamp()}.csv`);
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
            <Button variant="secondary" onClick={() => void exportPayments()}>
              {t('export_payments_csv')}
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
      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-sm">{t('report_operators')}</h2>
        <DataTable
          columns={operatorCols}
          rows={operators.data?.rows ?? []}
          keyField="operatorId"
          loading={operators.isLoading}
          empty={<EmptyState title={t('empty')} />}
        />
      </section>

      {/* ── AYNAN QAYSI MIJOZ to'lagani — kunning har bir to'lovi ismi bilan ── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-sm">{t('report_payments')}</h2>
          <span className="text-[var(--ms-text-muted)] text-xs">
            {payments.data?.total ?? 0} · {formatMoney(payments.data?.totalAmountMinor ?? '0')}
          </span>
        </div>
        <DataTable
          columns={paymentCols}
          rows={payments.data?.rows ?? []}
          keyField="id"
          loading={payments.isLoading}
          empty={<EmptyState title={t('payments_empty')} />}
        />
      </section>
    </Container>
  );
}
