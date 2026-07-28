'use client';

/**
 * «ERTAGA TELEFON QILINISHI KERAK BO'LGANLAR» (2026-07-27 talab).
 *
 * «Bugungi qo'ng'iroqlar» bilan bir xil ro'yxat, faqat ERTANGI Toshkent kuniga
 * rejalashtirilganlar (`?dayOffset=1`). Operator ertangi navbatni oldindan
 * ko'rib, rejalashtirib qo'yishi uchun.
 *
 * Bugungi sahifadan farqlari (ataylab):
 *   • «muddati o'tgan» (overdue) tushunchasi YO'Q — kelajakdagi kun;
 *   • qo'ng'iroq-natija tugmasi YO'Q — ertangi qo'ng'iroqni bugun «qilindi» deb
 *     belgilash mantiqsiz. Faqat ko'rish + kartochkaga o'tish.
 */

import { useBackspaceBack } from '@/hooks/use-keyboard-nav';
import { useReturnToRow } from '@/hooks/use-list-memory';
import { DEBT_POLL_MS, debtApi } from '@/lib/debt-api';
import { Button, Container, EmptyState, PageHeader, Pagination, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/** Bir sahifadagi qo'ng'iroq soni. */
const PAGE_SIZE = 25;

export default function DebtCallsTomorrowPage() {
  const t = useTranslations('pages.debts');
  useBackspaceBack();

  const calls = useQuery({
    queryKey: ['debts', 'calls', 'tomorrow'],
    queryFn: () => debtApi.todayCalls(undefined, 1),
    refetchInterval: DEBT_POLL_MS,
  });

  const allRows = calls.data?.rows ?? [];
  // Sahifalash mijoz tomonida: endpoint bir kunlik (chegaralangan) to'plamni
  // bir martada qaytaradi — qo'shimcha so'rov shart emas.
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  // Ro'yxat qisqarganda (to'lov/qo'ng'iroq) joriy sahifa bo'sh qolib ketmasin.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const offset = (page - 1) * PAGE_SIZE;
  const rows = allRows.slice(offset, offset + PAGE_SIZE);

  const { remember, highlightId } = useReturnToRow(
    'debts-calls-tomorrow',
    Boolean(calls.data),
    useCallback((id: string) => `[data-test-id="call-row-${id}"]`, []),
  );

  return (
    <Container size="full">
      <PageHeader
        title={t('tab_calls_tomorrow')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href="/debts/calls">{t('tab_calls')}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts">{t('back_to_list')}</Link>
            </Button>
          </div>
        }
      />

      {rows.length === 0 && !calls.isLoading ? (
        <EmptyState title={t('empty_calls_tomorrow')} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.id}
              data-test-id={`call-row-${r.id}`}
              className={[
                'flex flex-wrap items-center gap-4 rounded-[var(--ms-radius-default)] border p-3',
                'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]',
                r.id === highlightId
                  ? 'ring-2 ring-[var(--ms-warning-400)] transition-shadow duration-500'
                  : '',
              ].join(' ')}
            >
              {/* Qo'ng'iroq vaqti */}
              <div className="w-[92px] shrink-0 font-semibold tabular-nums">
                {r.nextContactAt
                  ? new Date(r.nextContactAt).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </div>

              {/* Mijoz + telefon */}
              <div className="min-w-[180px] flex-1">
                <Link
                  href={`/debts/${r.id}`}
                  onClick={() => remember(r.id)}
                  className="font-medium text-[var(--ms-text-brand)] hover:underline"
                >
                  {r.counterpartyName ?? '—'}
                </Link>
                <div className="text-[var(--ms-text-secondary)] text-sm tabular-nums">
                  {r.phone ?? '—'}
                </div>
              </div>

              {/* Oxirgi izoh */}
              <div className="min-w-[200px] flex-[2] text-[var(--ms-text-secondary)] text-sm">
                {r.lastNote ?? '—'}
              </div>

              {/* Qolgan qarz */}
              <div className="w-[150px] shrink-0 text-right">
                <div className="font-semibold tabular-nums">
                  {formatMoney(r.remainingMinor, r.currency)}
                </div>
                <div className="text-[var(--ms-text-secondary)] text-xs">
                  {t('remaining_label')}
                </div>
              </div>
            </div>
          ))}

          <Pagination
            total={allRows.length}
            limit={PAGE_SIZE}
            offset={offset}
            visibleCount={rows.length}
            hasPrevious={page > 1}
            hasNext={page < pageCount}
            onFirst={() => setPage(1)}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
            onLast={() => setPage(pageCount)}
            // MASTER-TODO #139 tiklashda moslashtirildi: bu branch'ning
            // Pagination'ida `showPageNumbers`/`onPage` proplari yo'q, va
            // qo'shni `debts/page.tsx` `moyskladStyle`siz ishlatadi — sibling
            // parity uchun aynan o'shanga moslandi.
            data-test-id="calls-tomorrow-pagination"
          />
        </div>
      )}
    </Container>
  );
}
