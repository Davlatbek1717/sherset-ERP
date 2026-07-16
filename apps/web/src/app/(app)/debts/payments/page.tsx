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

import { ReceiptViewer } from '@/components/debts/receipt-viewer';
import { ReversePaymentModal } from '@/components/debts/reverse-payment-modal';
import { StatusLegend } from '@/components/debts/status-legend';
import { useBackspaceBack } from '@/hooks/use-keyboard-nav';
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
  Pagination,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

const METHODS: Array<DebtPaymentMethod | ''> = ['', 'cash', 'terminal', 'card_screenshot'];

/** Bir sahifadagi to'lovlar soni — qarzdorlar ro'yxati bilan bir xil. */
const PAGE_SIZE = 100;

export default function DebtPaymentsFeedPage() {
  const t = useTranslations('pages.debts');
  // Backspace → orqaga («Ro'yxatga qaytish» bosmasdan; matn maydonlarida ishlamaydi).
  useBackspaceBack();

  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  // Ochilgan chek (2026-07-14) — null bo'lsa modal yopiq.
  const [receiptId, setReceiptId] = useState<string | null>(null);
  // QAYTARILAYOTGAN to'lov (storno, 2026-07-16) — null bo'lsa modal yopiq.
  const [reversing, setReversing] = useState<DebtPaymentFeedRow | null>(null);
  const [to, setTo] = useState('');
  const [method, setMethod] = useState<DebtPaymentMethod | ''>('');
  const [search, setSearch] = useState('');
  // SAHIFALASH (2026-07-13 UX tuzatishi): ilgari `limit: 100` qattiq yozilgan
  // va sahifalash yo'q edi — 100 dan keyingi to'lovlar JIMGINA yo'qolardi,
  // holbuki tepada «jami: 250» deb turardi. Endi hamma to'lovga yetish mumkin.
  const [page, setPage] = useState(1);
  const offset = (page - 1) * PAGE_SIZE;

  const feed = useQuery({
    queryKey: ['debts', 'payments-feed', from, to, method, search, offset],
    queryFn: () =>
      debtApi.paymentsFeed({
        from: from || undefined,
        to: to || undefined,
        method: method || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    refetchInterval: DEBT_POLL_MS,
  });

  const rows = feed.data?.rows ?? [];
  const total = feed.data?.total ?? 0;

  /** Filtr o'zgarsa — 1-sahifaga qaytamiz (aks holda bo'sh sahifada qolib ketiladi). */
  const resetPage = () => setPage(1);

  const methodLabel = (m: DebtPaymentMethod): string =>
    m === 'cash'
      ? t('method_cash')
      : m === 'terminal'
        ? t('method_terminal')
        : m === 'manual_close'
          ? t('method_manual_close')
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
          // Storno qatori Excel'da ham «qaytarilgan» deb chiqadi — buxgalteriya
          // yig'indini qo'lda solishtirsa adashmasin.
          cellText: (r) =>
            r.reversedAt
              ? t('reversed_badge')
              : r.debtStatus === 'paid'
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
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('filter_to')}</div>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('filter_method')}</div>
          <NativeSelect
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as DebtPaymentMethod | '');
              resetPage();
            }}
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
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
        />
      </div>

      <StatusLegend items={['paid', 'partial']} />

      {rows.length === 0 && !feed.isLoading ? (
        <EmptyState title={t('payments_empty')} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            {/* Sarlavha KO'K va yopishqoq (2026-07-13): uzun ro'yxatda pastga
                tushganda ham qaysi ustun nima ekani ko'rinib tursin. */}
            <thead className="sticky top-0 z-10">
              <tr className="border-[var(--ms-thead-border)] border-b-2 bg-[var(--ms-thead-bg)] text-left font-semibold text-[var(--ms-thead-text)]">
                <th className="px-3 py-2.5">{t('col_time')}</th>
                <th className="px-3 py-2.5">{t('col_counterparty')}</th>
                <th className="px-3 py-2.5">{t('col_number')}</th>
                <th className="px-3 py-2.5 text-right">{t('col_amount')}</th>
                <th className="px-3 py-2.5">{t('col_method')}</th>
                <th className="px-3 py-2.5">{t('col_source')}</th>
                <th className="px-3 py-2.5">{t('col_received_by')}</th>
                <th className="px-3 py-2.5">{t('receipt_title')}</th>
                <th className="px-3 py-2.5 text-right">{t('col_remaining')}</th>
                {/* STORNO ustuni (2026-07-16) — xato to'lov shu yerdan qaytariladi */}
                <th className="px-3 py-2.5" aria-label={t('reverse_payment')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: DebtPaymentFeedRow) => (
                <tr
                  key={r.id}
                  data-test-id={`feed-row-${r.id}`}
                  className={[
                    'border-[var(--ms-border-default)] border-b transition-colors',
                    // HOLAT RANGI (2026-07-13): ilgari hamma qator oq edi va
                    // bir-biriga qo'shilib ketardi. Endi:
                    //   to'liq to'landi → YASHIL · qisman to'ladi → SARIQ
                    //   QAYTARILGAN (storno) → XIRA QIZIL chiziq (2026-07-16)
                    // Rangga qo'shimcha CHAP CHIZIQ ham bor — rang ko'rmaydigan
                    // foydalanuvchi ham ajratadi (faqat rangga tayanmaymiz).
                    r.reversedAt
                      ? 'border-l-[3px] border-l-[var(--ms-destructive-300)] opacity-60'
                      : r.debtStatus === 'paid'
                        ? 'border-l-[3px] border-l-[var(--ms-row-paid-accent)] bg-[var(--ms-row-paid-bg)]'
                        : 'border-l-[3px] border-l-[var(--ms-row-partial-accent)] bg-[var(--ms-row-partial-bg)]',
                    'hover:brightness-[0.97]',
                  ].join(' ')}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    {new Date(r.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-3 py-2.5">
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
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ms-text-muted)]">
                    {r.debtName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                    <span className={r.reversedAt ? 'line-through' : undefined}>
                      {formatMoney(r.amountMinor)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{methodLabel(r.method)}</td>
                  <td className="px-3 py-2.5">{r.sourceName ?? '—'}</td>
                  <td className="px-3 py-2.5">{r.receivedByName ?? '—'}</td>
                  {/* CHEK (2026-07-14): Click to'lovining skrinshoti shu yerdan
                      modal oynada ochiladi — mijoz sahifasiga o'tish shart emas. */}
                  <td className="px-3 py-2.5">
                    {r.attachmentId ? (
                      <button
                        type="button"
                        onClick={() => setReceiptId(r.attachmentId as string)}
                        className="text-[var(--ms-text-brand)] hover:underline"
                        data-test-id={`feed-receipt-${r.id}`}
                      >
                        🧾 {t('view_screenshot')}
                      </button>
                    ) : (
                      <span className="text-[var(--ms-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {r.debtStatus === 'paid' ? (
                      <Badge tone="success">{t('paid_full')}</Badge>
                    ) : (
                      formatMoney(r.remainingMinor)
                    )}
                  </td>
                  {/* STORNO (2026-07-16): qaytarilgan — belgi (sabab title'da),
                      jonli to'lov — «Qaytarish» tugmasi. Server baribir faqat
                      kiritgan xodim yoki rahbarni o'tkazadi. */}
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {r.reversedAt ? (
                      <span title={r.reverseReason ?? undefined}>
                        <Badge tone="destructive">{t('reversed_badge')}</Badge>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReversing(r)}
                        className="text-[var(--ms-text-destructive)] hover:underline"
                        data-test-id={`feed-reverse-${r.id}`}
                      >
                        ↩︎ {t('reverse_payment')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sahifalash — «1-100 / 250». Ilgari 100 tadan keyingi to'lovlar
          umuman ko'rinmasdi (jimgina kesib tashlanardi). */}
      {total > PAGE_SIZE && (
        <div className="mt-3">
          <Pagination
            total={total}
            limit={PAGE_SIZE}
            offset={offset}
            visibleCount={rows.length}
            hasPrevious={page > 1}
            hasNext={offset + rows.length < total}
            onFirst={() => setPage(1)}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
            onLast={() => setPage(Math.max(1, Math.ceil(total / PAGE_SIZE)))}
          />
        </div>
      )}
      {/* CHEK — modal oynada (rasm API'si token talab qiladi, havola 401 berardi) */}
      <ReceiptViewer
        attachmentId={receiptId}
        title={rows.find((r) => r.attachmentId === receiptId)?.counterpartyName}
        open={receiptId !== null}
        onClose={() => setReceiptId(null)}
      />
      {/* TO'LOVNI QAYTARISH — storno (2026-07-16): sabab majburiy, tarixda qoladi */}
      <ReversePaymentModal
        debtId={reversing?.debtId ?? ''}
        payment={reversing}
        open={reversing !== null}
        onClose={() => setReversing(null)}
        onReversed={() => void qc.invalidateQueries({ queryKey: ['debts'] })}
      />
    </Container>
  );
}
