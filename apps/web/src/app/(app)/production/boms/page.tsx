'use client';

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import {
  Badge,
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  NativeSelect,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface BomProduct {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
}

interface Bom {
  id: string;
  name: string;
  productId: string;
  outputQty: string;
  standardCostMinor: string;
  archived: boolean;
  createdAt: string;
  product: BomProduct;
  _count: { components: number };
}

interface BomListResponse {
  items: Bom[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function BomsPage() {
  const t = useTranslations('pages.boms');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(true);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const listQueryKey = ['boms', search, archived, cursor, sortKey, sortDir] as const;
  const { data, isLoading, error, refetch } = useQuery<BomListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<BomListResponse>(`/boms?${params.toString()}`),
  });

  // moysklad's "Техкарты" list uses the standard moyskladToolbar +
  // Фильтр panel chrome (verified: visual-captures/10-module/
  // processingplan/dom/00-clean-default.html), not active/archived pill
  // sub-tabs. The archive filter is a select inside the inline panel.
  // BomFilterSchema only exposes search + archived, so the panel holds
  // just the Holat field (no period/sum — would be silent no-ops).

  const columns: DataTableColumn<Bom>[] = [
    {
      key: 'name',
      header: tFields('name'),
      sortable: true,
      cell: (b) => (
        <a
          href={`/production/boms/${b.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {b.name}
        </a>
      ),
      cellText: (b) => b.name,
    },
    {
      key: 'output_product',
      header: t('output_product'),
      cell: (b) => (
        <span className="text-[var(--ms-text-secondary)] text-sm">{b.product.name}</span>
      ),
      cellText: (b) => b.product.name,
    },
    {
      key: 'components_count',
      header: t('components'),
      align: 'right',
      width: '120px',
      cell: (b) => <span className="text-sm tabular-nums">{b._count.components}</span>,
      cellText: (b) => String(b._count.components),
    },
    {
      key: 'standard_cost',
      header: t('standard_cost'),
      align: 'right',
      width: '160px',
      cell: (b) => (
        <span className="font-medium tabular-nums">
          {b.standardCostMinor !== '0' ? (
            formatMoney(b.standardCostMinor)
          ) : (
            <span className="text-[var(--ms-text-muted)]">—</span>
          )}
        </span>
      ),
      cellText: (b) => (b.standardCostMinor !== '0' ? formatMoney(b.standardCostMinor) : ''),
    },
    {
      key: 'archived',
      header: tFields('state'),
      width: '110px',
      cell: (b) => (
        <Badge tone={archivedTone(b.archived)}>
          {b.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (b) => (b.archived ? 'archived' : 'active'),
    },
  ];

  return (
    <ListView
      testId="boms-page"
      title={t('title')}
      moyskladToolbar
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      onRefresh={() => refetch()}
      createHref="/production/boms/new"
      createLabel={t('create_button')}
      createPosition="start"
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(b) => `bom-row-${b.id}`}
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
      hasActiveFilter={!!search || archived === 'archived'}
      headerSlot={
        <InlineFilterPanel
          hidden={!filterOpen}
          applyLabel={tFilters('find')}
          clearLabel={tFilters('clear')}
          onClear={() => {
            setArchived('active');
            setCursor(undefined);
          }}
          testId="boms-inline-filter"
        >
          <InlineFilterPanel.Field label={tFields('state')} expandable>
            <NativeSelect
              value={archived}
              onChange={(e) => {
                setArchived(e.target.value as 'active' | 'archived');
                setCursor(undefined);
              }}
              data-test-id="filter-archived"
            >
              <option value="active">{tCommon('active')}</option>
              <option value="archived">{tCommon('archived')}</option>
            </NativeSelect>
          </InlineFilterPanel.Field>
        </InlineFilterPanel>
      }
      extraActionsLeft={
        <FilterToggleButton
          open={filterOpen}
          onToggle={() => setFilterOpen((v) => !v)}
          label={tFilters('trigger')}
        />
      }
    />
  );
}
