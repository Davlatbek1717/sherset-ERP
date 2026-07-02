'use client';

// Settings → Users (moysklad #employee parity, Settings location).
// Reuses the existing employee catalog (GET /hr/employees) — no duplicate
// backend. This page is the access-rights surface: the detail page assigns
// RBAC roles (GET/PUT /roles/employee/:id), pairing with the roles matrix at
// analitika/sozlamalar/rollar. The richer HR operational dashboard lives at
// /hr/employees.

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { Badge, type DataTableColumn, ListView, formatDate, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  username: string | null;
  position: string | null;
  archived: boolean;
  lastLoginAt: string | null;
}

interface ListResponse {
  rows: EmployeeRow[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 25;

export default function UsersPage() {
  const t = useTranslations('pages.user_admin');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (search) params.set('search', search);

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['settings-users', search, page],
    queryFn: () => api.get<ListResponse>(`/hr/employees?${params.toString()}`),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const columns: DataTableColumn<EmployeeRow>[] = [
    {
      key: 'lastLoginAt',
      header: t('col_last_login'),
      width: '170px',
      cell: (row) =>
        row.lastLoginAt ? (
          <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
            {formatDate(row.lastLoginAt)}
          </span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (row) => (row.lastLoginAt ? formatDate(row.lastLoginAt) : ''),
    },
    {
      key: 'name',
      header: t('col_name'),
      cell: (row) => (
        <a
          href={`/settings/users/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'email',
      header: t('col_email'),
      cell: (row) => <span className="text-[var(--ms-text-muted)] text-sm">{row.email}</span>,
      cellText: (row) => row.email,
    },
    {
      key: 'position',
      header: t('col_position'),
      width: '160px',
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.position ?? '—'}</span>
      ),
      cellText: (row) => row.position ?? '',
    },
    {
      key: 'phone',
      header: t('col_phone'),
      width: '150px',
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">{row.phone ?? '—'}</span>
      ),
      cellText: (row) => row.phone ?? '',
    },
    {
      key: 'username',
      header: t('col_login'),
      width: '150px',
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.username ?? '—'}</span>
      ),
      cellText: (row) => row.username ?? '',
    },
    {
      key: 'archived',
      header: t('col_state'),
      width: '120px',
      cell: (row) => (
        <Badge tone={archivedTone(row.archived)}>
          {row.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (row) => (row.archived ? 'archived' : 'active'),
    },
  ];

  return (
    <ListView
      testId="users-page"
      title={t('title')}
      columns={columns}
      rows={rows}
      keyField="id"
      rowTestId={(row) => `user-row-${row.id}`}
      total={total}
      limit={LIMIT}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setPage(1);
      }}
      searchPlaceholder={t('search_placeholder')}
      hasNext={page < totalPages}
      hasPrevious={page > 1}
      onNext={() => setPage((p) => Math.min(p + 1, totalPages))}
      onPrevious={() => setPage((p) => Math.max(p - 1, 1))}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={t('empty_title')}
      hasActiveFilter={!!search}
    />
  );
}
