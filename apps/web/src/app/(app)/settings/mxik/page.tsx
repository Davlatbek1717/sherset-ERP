'use client';

import { api } from '@/lib/api-client';
import { mxikSourceTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Button,
  type DataTableColumn,
  Icons,
  ListView,
  type ListViewFilter,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface MxikRow {
  code: string;
  nameUz: string;
  nameRu: string | null;
  nameEn: string | null;
  unitCode: string | null;
  groupCode: string | null;
  classCode: string | null;
  source: 'soliq' | 'manual' | 'override';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: MxikRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function MxikAdminPage() {
  const t = useTranslations('pages.mxik_admin');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [sourceFilter, setSourceFilter] = useState<MxikRow['source'] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const queryKey = [
    'mxik-admin',
    search,
    archived,
    sourceFilter,
    cursor,
    sortKey,
    sortDir,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey,
    queryFn: () => api.get<ListResponse>(`/mxik?${params.toString()}`),
  });

  const filters: ListViewFilter[] = [
    {
      key: 'all',
      label: tCommon('all'),
      active: sourceFilter === null,
      onClick: () => {
        setSourceFilter(null);
        setCursor(undefined);
      },
    },
    ...(['soliq', 'manual', 'override'] as MxikRow['source'][]).map((s) => ({
      key: s,
      label: t(`source_${s}`),
      active: sourceFilter === s,
      onClick: () => {
        setSourceFilter(s);
        setCursor(undefined);
      },
    })),
    {
      key: 'archived_toggle',
      label: archived === 'archived' ? tCommon('active') : tCommon('archived'),
      active: false,
      onClick: () => {
        setArchived(archived === 'archived' ? 'active' : 'archived');
        setCursor(undefined);
      },
    },
  ];

  const columns: DataTableColumn<MxikRow>[] = [
    {
      key: 'code',
      header: t('col_code'),
      width: '200px',
      sortable: true,
      sortField: 'code',
      cell: (row) => <span className="font-mono text-xs tabular-nums">{row.code}</span>,
      cellText: (r) => r.code,
    },
    {
      key: 'nameUz',
      header: t('col_name_uz'),
      sortable: true,
      sortField: 'nameUz',
      cell: (row) => <span className="text-sm">{row.nameUz}</span>,
      cellText: (r) => r.nameUz,
    },
    {
      key: 'nameRu',
      header: t('col_name_ru'),
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.nameRu ?? tCommon('none')}</span>
      ),
      cellText: (r) => r.nameRu ?? '—',
    },
    {
      key: 'unitCode',
      header: t('col_unit'),
      width: '80px',
      cell: (row) => <span className="font-mono text-xs">{row.unitCode ?? tCommon('none')}</span>,
      cellText: (r) => r.unitCode ?? '—',
    },
    {
      key: 'source',
      header: t('col_source'),
      width: '110px',
      cell: (row) => <Badge tone={mxikSourceTone(row.source)}>{t(`source_${row.source}`)}</Badge>,
      cellText: (r) => r.source,
    },
  ];

  return (
    <ListView
      testId="mxik-admin-page"
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : t('subtitle')}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="code"
      rowTestId={(r) => `mxik-row-${r.code}`}
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
      extraActions={
        <Button variant="secondary" size="sm" asChild>
          <a href="/settings/mxik/import" data-test-id="mxik-import-link">
            <Icons.upload className="h-4 w-4" aria-hidden />
            {t('import_button')}
          </a>
        </Button>
      }
    />
  );
}
