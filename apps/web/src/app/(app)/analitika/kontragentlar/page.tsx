'use client';

import { api } from '@/lib/api-client';
import { legalStatusTone } from '@/lib/domain-status-tone';
import { Badge, Input, NativeSelect, StickyHScroll, Switch, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface PartnerRow {
  id: string;
  code: string | null;
  name: string;
  fullname: string | null;
  legalStatus: 'Juridical' | 'Natural' | null;
  groupName: string | null;
  inn: string | null;
  phones: string | null;
  isDeleted: boolean;
}
interface ListResponse {
  partners: PartnerRow[];
  groups: string[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 50;

export default function AnalitikaCounterpartiesPage() {
  const t = useTranslations('pages.analitika_counterparties');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [groupName, setGroupName] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);

  // Reset to page 1 when any filter changes (matches ref behaviour).
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps trigger the reset; body does not read them.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, groupName, showDeleted]);

  const params = new URLSearchParams({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(groupName ? { groupName } : {}),
    ...(showDeleted ? { showDeleted: 'true' } : {}),
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const { data, isLoading, isFetching } = useQuery<ListResponse>({
    queryKey: ['analitika', 'cp-list', debouncedSearch, groupName, showDeleted, page],
    queryFn: () => api.get<ListResponse>(`/analitika/counterparties?${params.toString()}`),
    placeholderData: (prev) => prev,
  });
  const partners = data?.partners ?? [];
  const groups = data?.groups ?? [];
  const pg = data?.pagination;

  const statusLabel = (s: PartnerRow['legalStatus']) =>
    s === 'Juridical' ? t('status_juridical') : s === 'Natural' ? t('status_natural') : '—';

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-bold text-2xl text-[var(--ms-text-primary)] tracking-tight">
          {t('title')}
        </h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-end lg:grid-cols-[minmax(0,1fr)_14rem_auto]">
          <div className="space-y-1.5">
            <label
              htmlFor="cp-search"
              className="block font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {t('search_label')}
            </label>
            <Input
              id="cp-search"
              value={search}
              placeholder={t('search_ph')}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('search_label')}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="cp-group"
              className="block font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {t('group_label')}
            </label>
            <NativeSelect
              id="cp-group"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              aria-label={t('group_label')}
            >
              <option value="">{t('group_all')}</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-center gap-2 md:col-span-2 md:pt-2 lg:col-span-1 lg:pt-0">
            <Switch id="cp-show-deleted" checked={showDeleted} onCheckedChange={setShowDeleted} />
            <label
              htmlFor="cp-show-deleted"
              className="cursor-pointer text-[var(--ms-text-muted)] text-xs"
            >
              {t('show_deleted')}
            </label>
          </div>
        </div>
      </div>

      {/* Pagination summary */}
      <div
        className="flex items-center justify-between text-[var(--ms-text-muted)] text-xs"
        aria-live="polite"
      >
        <span>
          {isLoading
            ? t('loading')
            : pg
              ? `${t('total_count', { total: pg.total })}${isFetching ? ' …' : ''}`
              : ''}
        </span>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 lg:hidden">
        {partners.map((p) => (
          <a
            key={p.id}
            href={`/analitika/kontragentlar/${p.id}`}
            className={`block rounded-lg border border-[var(--ms-border)] bg-white p-3 hover:border-[var(--ms-text-brand)] ${p.isDeleted ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--ms-text-primary)]">{p.name}</span>
              <StatusBadge status={p.legalStatus} label={statusLabel(p.legalStatus)} />
            </div>
            {p.fullname && (
              <p className="mt-0.5 text-[var(--ms-text-muted)] text-xs">{p.fullname}</p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <span className="text-[var(--ms-text-muted)]">
                {t('col_group')}: {p.groupName ?? '—'}
              </span>
              <span className="text-[var(--ms-text-muted)]">
                {t('col_inn')}: {p.inn ?? '—'}
              </span>
              <span className="col-span-2 text-[var(--ms-text-muted)]">
                {t('col_phone')}: {p.phones ?? '—'}
              </span>
            </div>
          </a>
        ))}
      </div>

      {/* Desktop table */}
      <StickyHScroll className="hidden rounded-lg border border-[var(--ms-border)] bg-white lg:block">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <Th className="w-24">{t('col_code')}</Th>
              <Th>{t('col_name')}</Th>
              <Th className="w-40">{t('col_group')}</Th>
              <Th className="w-24">{t('col_status')}</Th>
              <Th className="w-32">{t('col_inn')}</Th>
              <Th className="w-40">{t('col_phone')}</Th>
              <Th className="w-24 text-right">{t('col_actions')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ms-border)]">
            {partners.map((p) => (
              <tr
                key={p.id}
                className={`hover:bg-[var(--ms-bg-subtle)] ${p.isDeleted ? 'opacity-50' : ''}`}
              >
                <Td className="font-mono text-[var(--ms-text-muted)] text-xs">{p.code ?? '—'}</Td>
                <Td>
                  <a
                    href={`/analitika/kontragentlar/${p.id}`}
                    className="font-semibold text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                  >
                    {p.name}
                  </a>
                  {p.fullname && (
                    <p className="mt-0.5 text-[var(--ms-text-muted)] text-xs">{p.fullname}</p>
                  )}
                </Td>
                <Td className="text-[var(--ms-text-muted)] text-xs">{p.groupName ?? '—'}</Td>
                <Td>
                  <StatusBadge status={p.legalStatus} label={statusLabel(p.legalStatus)} />
                </Td>
                <Td className="font-mono text-xs">{p.inn ?? '—'}</Td>
                <Td className="text-xs">
                  {p.phones ? (
                    <a href={`tel:${p.phones}`} className="hover:underline">
                      {p.phones}
                    </a>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td className="text-right">
                  <a
                    href={`/analitika/kontragentlar/${p.id}`}
                    className="text-[var(--ms-text-brand)] text-xs hover:underline"
                  >
                    {t('open_analysis')}
                  </a>
                </Td>
              </tr>
            ))}
            {!isLoading && partners.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-[var(--ms-text-muted)]">
                  {t('no_items')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </StickyHScroll>

      {/* Pagination */}
      {pg && pg.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            disabled={isFetching || page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-[var(--ms-border)] bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            ← {t('prev_page')}
          </button>
          <span className="text-[var(--ms-text-muted)] text-xs">
            {t('page_of', { page: pg.page, total: pg.totalPages })}
          </span>
          <button
            type="button"
            disabled={isFetching || page >= pg.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-[var(--ms-border)] bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t('next_page')} →
          </button>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`h-10 px-3 text-left font-semibold tracking-wider ${className ?? ''}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-sm ${className ?? ''}`}>{children}</td>;
}
function StatusBadge({
  status,
  label,
}: {
  status: PartnerRow['legalStatus'];
  label: string;
}) {
  if (!status) return <span className="text-[var(--ms-text-muted)] text-xs">—</span>;
  return <Badge tone={legalStatusTone(status)}>{label}</Badge>;
}
