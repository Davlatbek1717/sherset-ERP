'use client';

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
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

interface BankAccountRow {
  id: string;
  name: string;
  organization: { id: string; name: string } | null;
  currency: string;
  isDefault: boolean;
  balanceMinor: string;
  bankName: string | null;
  accountNumber: string | null;
  archived: boolean;
}

interface ListResponse {
  items: BankAccountRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function BankAccountsPage() {
  const t = useTranslations('pages.bank_accounts');
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

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['organization-accounts', search, archived, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/admin/organization-accounts?${params.toString()}`),
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

  const columns: DataTableColumn<BankAccountRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/bank-accounts/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'organization',
      header: t('organization'),
      cell: (row) =>
        row.organization ? (
          <a
            href={`/settings/organizations/${row.organization.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {row.organization.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (row) => row.organization?.name ?? '',
    },
    {
      key: 'currency',
      header: t('currency'),
      width: '100px',
      cell: (row) => <Badge tone="neutral">{row.currency}</Badge>,
      cellText: (row) => row.currency,
    },
    {
      key: 'isDefault',
      header: t('is_default'),
      width: '120px',
      cell: (row) =>
        row.isDefault ? (
          <Badge tone="brand">{tCommon('default')}</Badge>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (row) => (row.isDefault ? 'default' : ''),
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
      key: 'bankName',
      header: t('bank_name'),
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.bankName ?? '—'}</span>
      ),
      cellText: (row) => row.bankName ?? '',
    },
    {
      key: 'accountNumber',
      header: t('account_number'),
      width: '180px',
      cell: (row) => <span className="text-sm tabular-nums">{row.accountNumber ?? '—'}</span>,
      cellText: (row) => row.accountNumber ?? '',
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
      testId="settings-bank-accounts-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      createHref="/settings/bank-accounts/new"
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
      rowTestId={(row) => `bank-account-row-${row.id}`}
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
