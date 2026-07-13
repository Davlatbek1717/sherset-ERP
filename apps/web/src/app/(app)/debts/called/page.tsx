'use client';

/**
 * «QO'NG'IROQ QILINGANLAR» — alohida sahifa (2026-07-13 talab).
 *
 * «Bugun kimga qo'ng'iroq qilingan, kim nima deb javob bergan» — hammasi
 * shu yerda. Default: BUGUNGI kun; sana va natija bo'yicha filtr. Har
 * qatorda: qo'ng'iroq vaqti, mijoz, natija (rangli badge), JAVOB matni
 * (operator yozgan izoh), qolgan qarz. 10s auto-refresh.
 *
 * Manba: /debts?scope=called (server lastCallAt kuni bo'yicha filtrlaydi;
 * lastCallOutcome — natija, lastNote — oxirgi izoh matni).
 */

import { useBackspaceBack } from '@/hooks/use-keyboard-nav';
import { useReturnToRow } from '@/hooks/use-list-memory';
import {
  type CallOutcome,
  DEBT_POLL_MS,
  type DebtRow,
  debtApi,
  todayAt9InputValue,
} from '@/lib/debt-api';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useState } from 'react';

const OUTCOME_TONE: Record<CallOutcome, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  paid_full: 'success',
  paid_partial: 'warning',
  not_paid: 'destructive',
  callback: 'neutral',
};

/** Bugungi Toshkent kuni 'YYYY-MM-DD' (date input defaulti). */
function todayDate(): string {
  return todayAt9InputValue().slice(0, 10);
}

export default function DebtCalledPage() {
  const t = useTranslations('pages.debts');
  // Backspace → orqaga («Ro'yxatga qaytish» bosmasdan; matn maydonlarida ishlamaydi).
  useBackspaceBack();

  const [date, setDate] = useState(todayDate());
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');

  const list = useQuery({
    queryKey: ['debts', 'called-page', date, outcome],
    queryFn: () =>
      debtApi.list({
        scope: 'called',
        calledDate: date || undefined,
        callOutcome: outcome || undefined,
        // Eng katta qoldiq tepada.
        sortBy: 'remainingMinor',
        sortDir: 'desc',
        limit: 200,
      }),
    refetchInterval: DEBT_POLL_MS,
  });

  const rows = list.data?.rows ?? [];

  const { remember, highlightId } = useReturnToRow(
    'debts-called',
    Boolean(list.data),
    useCallback((id: string) => `[data-test-id="called-row-${id}"]`, []),
  );
  const outcomeLabel = (o: CallOutcome): string =>
    o === 'paid_full'
      ? t('outcome_paid_full')
      : o === 'paid_partial'
        ? t('outcome_paid_partial')
        : o === 'not_paid'
          ? t('outcome_not_paid')
          : t('outcome_callback');

  return (
    <Container>
      <PageHeader
        title={t('tab_called')}
        subtitle={t('called_subtitle')}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/debts">{t('back_to_list')}</Link>
          </Button>
        }
      />

      {/* Jami kartochka */}
      <div className="mb-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 py-3">
        <span className="text-[var(--ms-text-muted)] text-xs">{t('called_total')}: </span>
        <span className="font-semibold tabular-nums">{list.data?.total ?? 0}</span>
      </div>

      {/* Filtrlar: kun (default bugun) + natija */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('called_date')}</div>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-test-id="called-date"
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('called_outcome')}</div>
          <NativeSelect
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as CallOutcome | '')}
            className="w-[220px]"
            data-test-id="called-outcome"
          >
            <option value="">{t('outcome_all')}</option>
            <option value="paid_full">{t('outcome_paid_full')}</option>
            <option value="paid_partial">{t('outcome_paid_partial')}</option>
            <option value="not_paid">{t('outcome_not_paid')}</option>
            <option value="callback">{t('outcome_callback')}</option>
          </NativeSelect>
        </div>
      </div>

      {rows.length === 0 && !list.isLoading ? (
        <EmptyState title={t('called_empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--ms-border-default)] border-b text-left text-[var(--ms-text-muted)]">
                <th className="px-2 py-2 text-right">{t('col_num')}</th>
                <th className="px-2 py-2">{t('col_time')}</th>
                <th className="px-2 py-2">{t('col_counterparty')}</th>
                <th className="px-2 py-2">{t('called_col_outcome')}</th>
                <th className="px-2 py-2">{t('called_col_answer')}</th>
                <th className="px-2 py-2 text-right">{t('col_remaining')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: DebtRow, i: number) => (
                <tr
                  key={r.id}
                  data-test-id={`called-row-${r.id}`}
                  className={[
                    'border-[var(--ms-border-default)] border-b',
                    r.id === highlightId ? 'bg-[var(--ms-warning-100)]' : '',
                  ].join(' ')}
                >
                  <td className="px-2 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                    {i + 1}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                    {r.lastCallAt
                      ? new Date(r.lastCallAt).toLocaleString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/debts/${r.id}`}
                      onClick={() => remember(r.id)}
                      className="font-medium text-[var(--ms-primary-600)] hover:underline"
                    >
                      {r.counterpartyName}
                    </Link>
                    {r.phone && (
                      <div className="text-[var(--ms-text-muted)] text-xs">{r.phone}</div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {r.lastCallOutcome ? (
                      <Badge tone={OUTCOME_TONE[r.lastCallOutcome]}>
                        {outcomeLabel(r.lastCallOutcome)}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  {/* Kim nima deb javob bergani — operator yozgan izoh */}
                  <td className="max-w-[360px] px-2 py-2 text-[var(--ms-text-secondary)]">
                    {r.lastNote ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(r.remainingMinor, r.currency)}
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
