'use client';

import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  type DataTableColumn,
  ListView,
  type ListViewFilter,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ContractRow {
  id: string;
  name: string;
  code: string | null;
  moment: string;
  currency: string;
  sumMinor: string;
  description: string | null;
  agent: { id: string; name: string } | null;
  ownAgent: { id: string; name: string } | null;
}

const LIMIT = 25;

export default function ContractsPage() {
  const t = useTranslations('pages.contracts');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse<ContractRow>>({
    queryKey: ['contracts', search, archived],
    queryFn: () => api.get<ListResponse<ContractRow>>(`/contracts?${params.toString()}`),
  });

  const filters: ListViewFilter[] = [
    {
      key: 'active',
      label: tCommon('active'),
      active: archived === 'active',
      onClick: () => setArchived('active'),
    },
    {
      key: 'archived',
      label: tCommon('archived'),
      active: archived === 'archived',
      onClick: () => setArchived('archived'),
    },
  ];

  const columns: DataTableColumn<ContractRow>[] = [
    {
      key: 'name',
      header: t('col_number'),
      cell: (row) => (
        <a
          href={`/contracts/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'code',
      header: t('col_code'),
      width: '120px',
      cell: (row) => <span className="text-sm">{row.code ?? '—'}</span>,
      cellText: (row) => row.code ?? '',
    },
    {
      key: 'moment',
      header: t('col_moment'),
      width: '160px',
      cell: (row) => <span className="text-sm tabular-nums">{formatDate(row.moment)}</span>,
      cellText: (row) => formatDate(row.moment),
    },
    {
      key: 'agent',
      header: tFields('agent'),
      cell: (row) => <span className="text-sm">{row.agent?.name ?? '—'}</span>,
      cellText: (row) => row.agent?.name ?? '',
    },
    {
      key: 'ownAgent',
      header: tFields('organization'),
      cell: (row) => <span className="text-sm">{row.ownAgent?.name ?? '—'}</span>,
      cellText: (row) => row.ownAgent?.name ?? '',
    },
    {
      key: 'sumMinor',
      header: tFields('sum'),
      width: '140px',
      align: 'right',
      cell: (row) => (
        <span className="text-sm tabular-nums">{formatMoney(row.sumMinor ?? '0')}</span>
      ),
      cellText: (row) => formatMoney(row.sumMinor ?? '0'),
    },
    {
      key: 'currency',
      header: tFields('currency'),
      width: '90px',
      cell: (row) => <span className="text-sm tabular-nums">{row.currency}</span>,
      cellText: (row) => row.currency,
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.description ?? '—'}</span>
      ),
      cellText: (row) => row.description ?? '',
    },
  ];

  return (
    <ListView
      testId="contracts-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
      createHref="/contracts/new"
      createLabel={t('create_button')}
      search={searchInput}
      onSearchChange={(v) => setSearchInput(v)}
      searchPlaceholder={t('search_placeholder')}
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `contract-row-${row.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      hasNext={false}
      hasPrevious={false}
      onNext={() => undefined}
      onPrevious={() => undefined}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={search ? tCommon('no_results') : t('empty_title')}
    />
  );
}
