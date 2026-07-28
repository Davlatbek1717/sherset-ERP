'use client';

import { api } from '@/lib/api-client';
import { Button, type DataTableColumn, ListView, formatDate } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

/**
 * «Yig'ish ro'yxatlari» (CUSTOM section, not moysklad parity).
 *
 * Cashiers keep selling in the REAL MoySklad; the API polls new «Заказ
 * покупателя» docs every 30s into MsPickList. This page is the warehouse
 * screen: the table refreshes itself, every row has a print button that opens
 * the printable pick list (grouped by warehouse, ordered by shelf/cell).
 */
interface PickRow {
  id: string;
  name: string;
  docType: string;
  moment: string;
  agentName: string | null;
  storeName: string | null;
  ownerName: string | null;
  sumMinor: string | number;
  payedMinor: string | number;
  positionsCount: number;
  printedAt: string | null;
}

/** Оплачен / Частично / Не оплачен — from MoySklad sum vs payedSum (tiyin). */
function paymentState(r: PickRow): 'full' | 'partial' | 'none' {
  const sum = BigInt(r.sumMinor ?? 0);
  const payed = BigInt(r.payedMinor ?? 0);
  if (sum <= 0n || payed >= sum) return 'full';
  if (payed > 0n) return 'partial';
  return 'none';
}

const LIMIT = 100;
/** The warehouse leaves this page open — refetch on a timer so new sales appear. */
const POLL_MS = 15_000;

export default function PickListsPage() {
  const t = useTranslations('pages.pickLists');

  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<PickRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!opts?.background) setLoading(true);
      try {
        const qs = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
        if (searchInput.trim()) qs.set('search', searchInput.trim());
        const r = await api.get<{ items: PickRow[]; total: number }>(`/pick-lists?${qs}`);
        setRows(r.items);
        setTotal(r.total);
        setError(null);
      } catch (e) {
        if (!opts?.background) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!opts?.background) setLoading(false);
      }
    },
    [offset, searchInput],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load({ background: true }), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const openPrint = (r: PickRow) => {
    window.open(`/pick-lists/${r.id}/print`, '_blank', 'noopener');
  };

  const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[11px]';
  const PAY_STYLE: Record<ReturnType<typeof paymentState>, string> = {
    full: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    partial: 'bg-amber-50 text-amber-700 border border-amber-200',
    none: 'bg-red-50 text-red-700 border border-red-200',
  };

  const columns: DataTableColumn<PickRow>[] = [
    {
      key: 'name',
      header: t('col_number'),
      width: '150px',
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-[13px] text-[var(--ms-text-brand)]">{r.name}</span>
          {r.docType === 'salesreturn' && (
            <span
              className={`${chip} border border-rose-200 bg-rose-50 text-rose-700`}
              data-test-id={`pick-list-return-${r.name}`}
            >
              ↩ {t('doc_return')}
            </span>
          )}
        </span>
      ),
      cellText: (r) => (r.docType === 'salesreturn' ? `${r.name} ${t('doc_return')}` : r.name),
    },
    {
      key: 'moment',
      header: t('col_datetime'),
      width: '140px',
      cell: (r) => {
        const [d, tm] = formatDate(r.moment).split(' ');
        return (
          <span className="whitespace-nowrap text-[13px]">
            {d} <span className="text-[var(--ms-text-muted)] text-xs">{tm}</span>
          </span>
        );
      },
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'owner',
      header: t('col_seller'),
      width: '150px',
      cell: (r) => <span className="text-[13px]">{r.ownerName ?? '—'}</span>,
      cellText: (r) => r.ownerName ?? '',
    },
    {
      key: 'agent',
      header: t('col_agent'),
      cell: (r) => (
        <span className="block max-w-[340px] truncate text-[13px]">{r.agentName ?? '—'}</span>
      ),
      cellText: (r) => r.agentName ?? '',
    },
    {
      key: 'positions',
      header: t('col_positions'),
      width: '86px',
      align: 'center',
      cell: (r) => (
        <span className="inline-flex min-w-[26px] justify-center rounded-full bg-[var(--ms-bg-muted)] px-2 py-0.5 font-medium text-[12px]">
          {r.positionsCount}
        </span>
      ),
      cellText: (r) => String(r.positionsCount),
    },
    {
      key: 'payment',
      header: t('col_payment'),
      width: '120px',
      align: 'center',
      cell: (r) => {
        const st = paymentState(r);
        return (
          <span className={`${chip} ${PAY_STYLE[st]}`} data-test-id={`pick-list-pay-${r.name}`}>
            {st === 'full' ? '✓ ' : ''}
            {t(`paid_${st}`)}
          </span>
        );
      },
      cellText: (r) => t(`paid_${paymentState(r)}`),
    },
    {
      key: 'printed',
      header: t('col_printed'),
      width: '116px',
      align: 'center',
      cell: (r) =>
        r.printedAt ? (
          <span
            className={`${chip} bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]`}
            title={formatDate(r.printedAt)}
          >
            ✓ {t('printed_yes')}
          </span>
        ) : (
          <span className={`${chip} border border-sky-200 bg-sky-50 text-sky-700`}>
            {t('printed_no')}
          </span>
        ),
      cellText: (r) => (r.printedAt ? t('printed_yes') : t('printed_no')),
    },
    {
      key: 'print',
      header: '',
      width: '108px',
      align: 'right',
      cell: (r) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            openPrint(r);
          }}
          data-test-id={`pick-list-print-${r.name}`}
        >
          🖨 {t('print')}
        </Button>
      ),
      cellText: () => '',
    },
  ];

  return (
    <ListView
      testId="pick-lists-page"
      title={t('title')}
      moyskladToolbar
      onRefresh={() => void load()}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setOffset(0);
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={rows}
      keyField="id"
      rowTestId={(r) => `pick-list-row-${r.name}`}
      total={total}
      limit={LIMIT}
      hasNext={offset + LIMIT < total}
      hasPrevious={offset > 0}
      onNext={() => setOffset((o) => o + LIMIT)}
      onPrevious={() => setOffset((o) => Math.max(0, o - LIMIT))}
      loading={loading}
      error={error}
      emptyTitle={t('empty_title')}
      hasActiveFilter={false}
    />
  );
}
