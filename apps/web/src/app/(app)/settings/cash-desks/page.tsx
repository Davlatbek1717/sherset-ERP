'use client';

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  Badge,
  type DataTableColumn,
  ListView,
  type ListViewFilter,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CashDeskRow {
  id: string;
  name: string;
  currency: string;
  balanceMinor: string;
  archived: boolean;
}

const LIMIT = 25;

export default function CashDesksPage() {
  const t = useTranslations('pages.cash_desks');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse<CashDeskRow>>({
    queryKey: ['cash-desks', search, archived, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse<CashDeskRow>>(`/admin/cash-desks?${params.toString()}`),
  });

  const filters: ListViewFilter[] = [
    {
      key: 'active',
      label: tCommon('active'),
      active: archived === 'active',
      onClick: () => {
        setArchived('active');
        setCursor(undefined);
      },
    },
    {
      key: 'archived',
      label: tCommon('archived'),
      active: archived === 'archived',
      onClick: () => {
        setArchived('archived');
        setCursor(undefined);
      },
    },
  ];

  const columns: DataTableColumn<CashDeskRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/cash-desks/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'currency',
      header: t('currency'),
      width: '100px',
      cell: (row) => <Badge tone="neutral">{row.currency}</Badge>,
      cellText: (row) => row.currency,
    },
    {
      key: 'balance',
      header: t('balance'),
      width: '160px',
      cell: (row) => (
        <span className="font-medium text-sm tabular-nums">
          {formatMoney(BigInt(row.balanceMinor), row.currency)}
        </span>
      ),
      cellText: (row) => row.balanceMinor,
    },
    {
      key: 'archived',
      header: tFields('state'),
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
      testId="settings-cash-desks-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
      createHref="/settings/cash-desks/new"
      createLabel={t('create_button')}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `cash-desk-row-${row.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      hasNext={!!data?.nextCursor}
      hasPrevious={!!cursor}
      onNext={() => setCursor(data?.nextCursor)}
      onPrevious={() => setCursor(undefined)}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={search ? tCommon('no_results') : t('empty_title')}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
        setCursor(undefined);
      }}
    />
  );
}
