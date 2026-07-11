'use client';

/**
 * «TO'LOVLAR LENTASI» — aynan QAYSI MIJOZ qarzini to'laganini ko'rsatadi
 * (foydalanuvchi talabi 2026-07-11; §3.8 umumiy-ko'rinish printsipining davomi).
 *
 * Default — BUGUNGI to'lovlar («bugun kim to'ladi?»); sana oralig'i, usul va
 * mijoz-qidiruv filtrlari bilan istalgan davr ochiladi. Ro'yxat har 10 s da
 * o'zi yangilanadi — kassada to'lov kiritilgan zahoti bu yerda paydo bo'ladi.
 *
 * Qarzi TO'LIQ yopilgan mijoz yashil «To'liq to'landi» belgisi bilan ajralib
 * turadi — bir qarashda kim uzil-kesil qutulgani ko'rinadi.
 */

import {
  DEBT_POLL_MS,
  type DebtPaymentFeedRow,
  type DebtPaymentMethod,
  debtApi,
  fetchAllPayments,
} from '@/lib/debt-api';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

const METHODS: Array<DebtPaymentMethod | ''> = ['', 'cash', 'terminal', 'card_screenshot'];

export default function DebtPaymentsFeedPage() {
  const t = useTranslations('pages.debts');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState<DebtPaymentMethod | ''>('');
  const [search, setSearch] = useState('');

  const feed = useQuery({
    queryKey: ['debts', 'payments-feed', from, to, method, search],
    queryFn: () =>
      debtApi.paymentsFeed({
        from: from || undefined,
        to: to || undefined,
        method: method || undefined,
        search: search || undefined,
        limit: 100,
      }),
    refetchInterval: DEBT_POLL_MS,
  });

  const rows = feed.data?.rows ?? [];

  const methodLabel = (m: DebtPaymentMethod): string =>
    m === 'cash'
      ? t('method_cash')
      : m === 'terminal'
        ? t('method_terminal')
        : t('method_card_screenshot');

  /**
   * Excel eksport — MIJOZ ISMI bilan, joriy filtrlar bo'yicha HAMMA to'lov
   * (server 200-talik sahifalarini fetchAllPayments yig'adi). Summalar toza
   * so'm raqamida — Excel'da yig'indini formulaga solish mumkin.
   */
  async function exportCsv() {
    const all = await fetchAllPayments({
      from: from || undefined,
      to: to || undefined,
      method: method || undefined,
      search: search || undefined,
    });
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
        { header: t('col_method'), cellText: (r) => methodLabel(r.method) },
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
      all,
    );
    downloadCsv(csv, `tolovlar-mijozlar-${csvTimestamp()}.csv`);
  }

  return (
    <Container>
      <PageHeader
        title={t('tab_payments')}
        subtitle={t('payments_subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void exportCsv()}>
              {t('export_payments_csv')}
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts">{t('back_to_list')}</Link>
            </Button>
          </div>
        }
      />

      {/* Jami kartochka — tanlangan davr bo'yicha */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 py-3">
          <div className="text-[var(--ms-text-muted)] text-xs">{t('payments_total')}</div>
          <div className="font-semibold text-lg tabular-nums" data-test-id="feed-total">
            {formatMoney(feed.data?.totalAmountMinor ?? '0')} · {feed.data?.total ?? 0}
          </div>
        </div>
      </div>

      {/* Filtrlar: sana oralig'i (bo'sh = bugun) · usul · mijoz qidiruvi */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('filter_from')}</div>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('filter_to')}</div>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('filter_method')}</div>
          <NativeSelect
            value={method}
            onChange={(e) => setMethod(e.target.value as DebtPaymentMethod | '')}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m === '' ? t('filter_all_methods') : methodLabel(m)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Input
          className="w-[240px]"
          placeholder={t('filter_search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows.length === 0 && !feed.isLoading ? (
        <EmptyState title={t('payments_empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--ms-border-default)] border-b text-left text-[var(--ms-text-muted)]">
                <th className="px-2 py-2">{t('col_time')}</th>
                <th className="px-2 py-2">{t('col_counterparty')}</th>
                <th className="px-2 py-2">{t('col_number')}</th>
                <th className="px-2 py-2 text-right">{t('col_amount')}</th>
                <th className="px-2 py-2">{t('col_method')}</th>
                <th className="px-2 py-2">{t('col_source')}</th>
                <th className="px-2 py-2">{t('col_received_by')}</th>
                <th className="px-2 py-2 text-right">{t('col_remaining')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: DebtPaymentFeedRow) => (
                <tr
                  key={r.id}
                  data-test-id={`feed-row-${r.id}`}
                  className={[
                    'border-[var(--ms-border-default)] border-b',
                    // To'liq yopilgan qarz — yashil fon: «mana bu mijoz UZIL-KESIL to'ladi».
                    r.debtStatus === 'paid' ? 'bg-[var(--ms-success-50)]' : '',
                  ].join(' ')}
                >
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                    {new Date(r.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/debts/${r.debtId}`}
                      className="font-medium text-[var(--ms-primary-600)] hover:underline"
                    >
                      {r.counterpartyName}
                    </Link>
                    {r.phone && (
                      <div className="text-[var(--ms-text-muted)] text-xs">{r.phone}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-[var(--ms-text-muted)]">
                    {r.debtName}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(r.amountMinor)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{methodLabel(r.method)}</td>
                  <td className="px-2 py-2">{r.sourceName ?? '—'}</td>
                  <td className="px-2 py-2">{r.receivedByName ?? '—'}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                    {r.debtStatus === 'paid' ? (
                      <Badge tone="success">{t('paid_full')}</Badge>
                    ) : (
                      formatMoney(r.remainingMinor)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
