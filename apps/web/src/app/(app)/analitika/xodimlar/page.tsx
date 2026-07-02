'use client';

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { Badge, Button, Input, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface Employee {
  id: string;
  email: string | null;
  name: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  phone: string | null;
  username: string | null;
  archived: boolean;
  lastLoginAt: string | null;
}
interface HrListResponse {
  rows: Employee[];
  total: number;
  page: number;
  limit: number;
}

type Tab = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 50;

/**
 * Xodimlar ro'yxati — `GET /analitika/staff` (analitika RBAC bilan, HR
 * permission matrix'isiz). Tabs (Hammasi/Faol/Faolsiz) = archived bo'yicha
 * mijoz tomonida filter, server pagination saqlanadi. To'liq tahrirlash
 * uchun HR moduliga havola.
 */
export default function AnalitikaStaffListPage() {
  const t = useTranslations('pages.analitika_staff');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 300);
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps trigger the reset; body does not read them.
  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    page: String(page),
    limit: String(PAGE_SIZE),
  });
  const { data, isLoading, isFetching } = useQuery<HrListResponse>({
    queryKey: ['analitika', 'staff-list', search, page],
    queryFn: () => api.get<HrListResponse>(`/analitika/staff?${params.toString()}`),
    placeholderData: (prev) => prev,
  });

  const allRows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Tab filter is applied to the visible page; server total reflects the full set.
  const visible = useMemo(() => {
    if (tab === 'active') return allRows.filter((e) => !e.archived);
    if (tab === 'inactive') return allRows.filter((e) => e.archived);
    return allRows;
  }, [allRows, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: t('tab_all') },
    { key: 'active', label: t('tab_active') },
    { key: 'inactive', label: t('tab_inactive') },
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-[var(--ms-text-primary)] tracking-tight">
            {t('title')}
          </h1>
          <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/analitika/xodimlar/men"
            className="rounded-md border border-[var(--ms-border)] bg-white px-3 py-1.5 font-semibold text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-subtle)]"
          >
            {t('me_btn')}
          </Link>
          <Link
            href="/analitika/xodimlar/yangi"
            className="rounded-md bg-[var(--ms-text-brand)] px-3 py-1.5 font-semibold text-sm text-white hover:opacity-90"
          >
            + {t('new_btn')}
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-[var(--ms-border)] bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={searchInput}
            placeholder={t('search_ph')}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex gap-1">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                className={`rounded-full px-3 py-1 text-sm ${
                  tab === tb.key
                    ? 'bg-[var(--ms-text-brand)] text-white'
                    : 'bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)]'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[var(--ms-text-muted)] text-xs">
        {isLoading ? t('loading') : `${t('total_count', { total })}${isFetching ? ' …' : ''}`}
      </p>

      {/* Mobile cards */}
      <div className="space-y-2 lg:hidden">
        {visible.map((e) => (
          <Link
            key={e.id}
            href={`/analitika/xodimlar/${e.id}`}
            className={`block rounded-lg border border-[var(--ms-border)] bg-white p-3 hover:border-[var(--ms-text-brand)] ${e.archived ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--ms-text-primary)]">
                {e.fullName ?? e.name}
              </span>
              <StatusBadge archived={e.archived} t={t} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--ms-text-muted)] text-xs">
              {e.position && <span>{e.position}</span>}
              {e.email && <span>{e.email}</span>}
              {e.phone && <span>{e.phone}</span>}
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-[var(--ms-border)] bg-white lg:block">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">{t('col_name')}</th>
              <th className="w-56 px-3 py-2 text-left font-semibold">{t('col_email')}</th>
              <th className="w-40 px-3 py-2 text-left font-semibold">{t('col_position')}</th>
              <th className="w-40 px-3 py-2 text-left font-semibold">{t('col_phone')}</th>
              <th className="w-24 px-3 py-2 text-left font-semibold">{t('col_status')}</th>
              <th className="w-40 px-3 py-2 text-left font-semibold">{t('col_last_login')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ms-border)]">
            {visible.map((e) => (
              <tr
                key={e.id}
                className={`hover:bg-[var(--ms-bg-subtle)] ${e.archived ? 'opacity-60' : ''}`}
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/analitika/xodimlar/${e.id}`}
                    className="font-semibold text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                  >
                    {e.fullName ?? e.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">{e.email ?? '—'}</td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                  {e.position ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.phone ? (
                    <a href={`tel:${e.phone}`} className="hover:underline">
                      {e.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge archived={e.archived} t={t} />
                </td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                  {e.lastLoginAt ? new Date(e.lastLoginAt).toLocaleString('ru-RU') : '—'}
                </td>
              </tr>
            ))}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-[var(--ms-text-muted)]">
                  {t('no_items')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← {t('prev_page')}
          </Button>
          <span className="text-[var(--ms-text-muted)] text-xs">
            {t('page_of', { page, total: totalPages })}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next_page')} →
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  archived,
  t,
}: {
  archived: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Badge tone={archivedTone(archived)}>
      {archived ? t('status_inactive') : t('status_active')}
    </Badge>
  );
}
