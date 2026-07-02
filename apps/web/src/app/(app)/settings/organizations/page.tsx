'use client';

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import {
  Badge,
  type DataTableColumn,
  ListView,
  type ListViewFilter,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface OrganizationRow {
  id: string;
  name: string;
  legalTitle: string | null;
  companyType: 'legalUZ' | 'entrepreneurUZ' | 'individualUZ';
  phone: string | null;
  uzRequisites: { inn?: string | null; okoned?: string | null; mfo?: string | null } | null;
  archived: boolean;
}

interface ListResponse {
  items: OrganizationRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function OrganizationsPage() {
  const t = useTranslations('pages.organizations');
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
    queryKey: ['organizations', search, archived, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/admin/organizations?${params.toString()}`),
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

  const columns: DataTableColumn<OrganizationRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/organizations/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'legalTitle',
      header: t('legal_title'),
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.legalTitle ?? '—'}</span>
      ),
      cellText: (row) => row.legalTitle ?? '',
    },
    {
      key: 'companyType',
      header: t('company_type'),
      width: '180px',
      cell: (row) => <Badge tone="neutral">{t(`types.${row.companyType}`)}</Badge>,
      cellText: (row) => row.companyType,
    },
    {
      key: 'inn',
      header: t('inn'),
      width: '140px',
      cell: (row) => <span className="text-sm tabular-nums">{row.uzRequisites?.inn ?? '—'}</span>,
      cellText: (row) => row.uzRequisites?.inn ?? '',
    },
    {
      key: 'phone',
      header: t('phone'),
      width: '160px',
      cell: (row) => <span className="text-sm">{row.phone ?? '—'}</span>,
      cellText: (row) => row.phone ?? '',
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
      testId="settings-organizations-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      createHref="/settings/organizations/new"
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
      rowTestId={(row) => `organization-row-${row.id}`}
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
