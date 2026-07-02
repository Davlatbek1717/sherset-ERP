'use client';

import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { Input, NativeSelect, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface OrderRow {
  id: string;
  number: string;
  counterpartyName: string | null;
  state: string;
  totalMinor: string;
  createdAt: string;
  lineCount: number;
}
interface OrdersResponse {
  items: OrderRow[];
  total: number;
}

function fmtMoney(minor: string): string {
  return `${(Number(minor) / 100).toLocaleString('ru-RU')} so'm`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type StatusFilter = 'all' | 'draft' | 'formed' | 'done';

export default function AnalitikaOrdersPage() {
  const t = useTranslations('pages.analitika_orders');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>('all');

  const params = new URLSearchParams(search ? { search } : {});
  const { data, isLoading } = useQuery<OrdersResponse>({
    queryKey: ['analitika', 'orders', search],
    queryFn: () => api.get<OrdersResponse>(`/analitika/orders?${params.toString()}`),
    placeholderData: (prev) => prev,
  });

  const stateLabel = (s: string) =>
    s === 'draft' ? t('state_draft') : s === 'done' ? t('state_done') : t('state_formed');

  const items = data?.items ?? [];
  const filtered = useMemo(
    () => (status === 'all' ? items : items.filter((o) => o.state === status)),
    [items, status],
  );
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-[var(--ms-text-primary)] tracking-tight">
            {t('title')}
          </h1>
          <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <span className="text-[var(--ms-text-muted)] text-xs">{t('total_count', { total })}</span>
      </div>

      {/* Filter bar */}
      <div className="rounded-lg border border-[var(--ms-border)] bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={searchInput}
            placeholder={t('search_ph')}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-xs flex-1"
          />
          <NativeSelect
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="w-48"
            aria-label={t('col_state')}
          >
            <option value="all">{t('status_filter_all')}</option>
            <option value="draft">{t('state_draft')}</option>
            <option value="formed">{t('state_formed')}</option>
            <option value="done">{t('state_done')}</option>
          </NativeSelect>
        </div>
      </div>

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-[var(--ms-border)] border-dashed bg-white p-12 text-center">
          {items.length === 0 ? (
            <>
              <p className="font-medium text-[var(--ms-text-primary)] text-sm">
                {t('empty_title')}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[var(--ms-text-muted)] text-xs">
                {t('empty_hint')}
              </p>
              <Link
                href="/analitika/kontragentlar"
                className="mt-3 inline-block rounded-md bg-[var(--ms-text-brand)] px-3 py-1.5 font-semibold text-sm text-white hover:opacity-90"
              >
                {t('empty_cta')}
              </Link>
            </>
          ) : (
            <>
              <p className="font-medium text-[var(--ms-text-primary)] text-sm">
                {t('filter_empty_title')}
              </p>
              <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('filter_empty_hint')}</p>
            </>
          )}
        </div>
      )}

      {/* Mobile cards */}
      {filtered.length > 0 && (
        <div className="space-y-2 lg:hidden">
          {filtered.map((o) => (
            <Link
              key={o.id}
              href={`/analitika/buyurtmalar/${o.id}`}
              className="block rounded-lg border border-[var(--ms-border)] bg-white p-3 hover:border-[var(--ms-text-brand)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-[var(--ms-text-primary)] text-xs">
                    {o.number}
                  </div>
                  <div className="mt-0.5 truncate text-[var(--ms-text-primary)] text-sm">
                    {o.counterpartyName ?? (
                      <span className="text-[var(--ms-text-muted)] italic">
                        {t('counterparty_none')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--ms-text-muted)]">
                    {o.lineCount} · {fmtDate(o.createdAt)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold text-[var(--ms-text-primary)] text-sm tabular-nums">
                    {fmtMoney(o.totalMinor)}
                  </div>
                  <StateBadge state={o.state} label={stateLabel(o.state)} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Desktop table */}
      {filtered.length > 0 && (
        <div className="hidden overflow-x-auto rounded-lg border border-[var(--ms-border)] bg-white lg:block">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">{t('col_number')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('col_counterparty')}</th>
                <th className="w-24 px-3 py-2 text-center font-semibold">{t('col_lines')}</th>
                <th className="w-36 px-3 py-2 text-left font-semibold">{t('col_state')}</th>
                <th className="w-44 px-3 py-2 text-left font-semibold">{t('col_date')}</th>
                <th className="w-40 px-3 py-2 text-right font-semibold">{t('col_total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ms-border)]">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-[var(--ms-bg-subtle)]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/analitika/buyurtmalar/${o.id}`}
                      className="font-mono font-semibold text-[var(--ms-text-brand)] text-xs hover:underline"
                    >
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {o.counterpartyName ? (
                      <span className="font-medium text-[var(--ms-text-primary)]">
                        {o.counterpartyName}
                      </span>
                    ) : (
                      <span className="text-[var(--ms-text-muted)] italic">
                        {t('counterparty_none')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{o.lineCount}</td>
                  <td className="px-3 py-2">
                    <StateBadge state={o.state} label={stateLabel(o.state)} />
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {fmtDate(o.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {fmtMoney(o.totalMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StateBadge({ state, label }: { state: string; label: string }) {
  const tone = documentStateTone(state);
  return (
    <span className={`inline-block rounded border px-2 py-0.5 font-medium text-xs ${tone}`}>
      {label}
    </span>
  );
}
