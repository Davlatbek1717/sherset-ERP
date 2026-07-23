'use client';

/**
 * /settings/countries — «Страны» reference list (Настройки → Справочники →
 * Страны).
 *
 * READ-ONLY on purpose: the backend country module exposes only GET /countries
 * (search + cursor) and GET /countries/:id — no create/update/delete yet
 * (country.controller.ts documents full CRUD as "Settings later"). So this page
 * honestly renders no create/edit affordances.
 *
 * BE shape (country.service.ts list): { items: [{ id, name, code,
 * externalCode }] } — name-asc, `search` matches name/code (insensitive),
 * `limit` 1..250 (default 50), `cursor` = last row id (skip 1). No total and
 * no nextCursor in the payload, hence the client-side cursor stack below.
 */

import { api } from '@/lib/api-client';
import { type DataTableColumn, ListView, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CountryRow {
  id: string;
  name: string;
  code: string | null;
  externalCode: string | null;
}

interface ListResponse {
  items: CountryRow[];
}

const LIMIT = 50;

export default function CountriesPage() {
  const t = useTranslations('pages.countries');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  // The BE returns neither total nor nextCursor — keep the stack of cursors we
  // paged through so «previous» can rewind without an offset param.
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack[cursorStack.length - 1];

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    limit: String(LIMIT),
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['countries', search, cursor],
    queryFn: () => api.get<ListResponse>(`/countries?${params.toString()}`),
  });

  const rows = data?.items ?? [];
  // No total from the BE — a full page implies (at least) one more page.
  const hasNext = rows.length === LIMIT;
  const lastId = rows[rows.length - 1]?.id;

  const columns: DataTableColumn<CountryRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      cell: (row) => <span className="font-medium text-[var(--ms-text-primary)]">{row.name}</span>,
      cellText: (row) => row.name,
    },
    {
      key: 'code',
      header: t('col_code'),
      width: '140px',
      cell: (row) => (
        <span className="font-mono text-[var(--ms-text-muted)] text-sm">{row.code ?? '—'}</span>
      ),
      cellText: (row) => row.code ?? '',
    },
    {
      key: 'externalCode',
      header: t('col_external_code'),
      width: '160px',
      cell: (row) => (
        <span className="font-mono text-[var(--ms-text-muted)] text-sm">
          {row.externalCode ?? '—'}
        </span>
      ),
      cellText: (row) => row.externalCode ?? '',
    },
  ];

  return (
    <ListView
      testId="countries-page"
      title={t('title')}
      moyskladToolbar
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursorStack([]);
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={rows}
      keyField="id"
      rowTestId={(row) => `country-row-${row.id}`}
      total={rows.length}
      limit={LIMIT}
      hasNext={hasNext}
      hasPrevious={cursorStack.length > 0}
      onNext={() => {
        if (lastId) setCursorStack((s) => [...s, lastId]);
      }}
      onPrevious={() => setCursorStack((s) => s.slice(0, -1))}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={search ? tCommon('no_results') : t('empty_title')}
    />
  );
}
