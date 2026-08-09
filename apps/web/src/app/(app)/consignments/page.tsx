'use client';

/**
 * «Товары на реализации» (Consignment) — moysklad-parity batch /
 * lot list with FEFO sort. Sprint 8 ships read-only — manual batch
 * registration UI lands once the receive-with-batch form on Supply
 * is wired (until then batches arrive only through the inbound
 * document path that's already live).
 */

import { ColumnSettings } from '@/components/column-settings';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  Badge,
  type DataTableColumn,
  ListView,
  type ListViewFilter,
  formatDate,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ConsignmentRow {
  id: string;
  name: string;
  label: string;
  code: string | null;
  expiryDate: string | null;
  barcodes: string[];
  archived: boolean;
  description: string | null;
  product: { id: string; name: string; code: string | null; uom: string | null };
  variant: { id: string; name: string; code: string | null } | null;
}

const LIMIT = 100;

function isExpired(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

function isExpiringSoon(date: string | null): boolean {
  if (!date) return false;
  const days = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 30;
}

export default function ConsignmentsPage() {
  const t = useTranslations('pages.consignments');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [archivedFilter, setArchivedFilter] = useState<string | null>('false');
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('expiryDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const cols = useColumnVisibility('consignments', [
    'label',
    'product',
    'variant',
    'code',
    'expiry',
    'barcodes',
    'archived',
  ]);
  const colWidths = useColumnWidths('consignments');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(expiredOnly ? { expiredOnly: 'true' } : {}),
    ...(archivedFilter !== null ? { archived: archivedFilter } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const listQueryKey = [
    'consignments',
    search,
    expiredOnly,
    archivedFilter,
    cursor,
    sortKey,
    sortDir,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse<ConsignmentRow>>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse<ConsignmentRow>>(`/consignments?${params.toString()}`),
  });

  const filters: ListViewFilter[] = [
    {
      key: 'expired',
      label: t('expired_only'),
      active: expiredOnly,
      onClick: () => {
        setExpiredOnly((v) => !v);
        setCursor(undefined);
      },
    },
    {
      key: 'archived',
      label: tFields('archived'),
      active: archivedFilter === 'true',
      onClick: () => {
        setArchivedFilter((v) => (v === 'true' ? null : 'true'));
        setCursor(undefined);
      },
    },
  ];

  const columns: DataTableColumn<ConsignmentRow>[] = [
    {
      key: 'label',
      header: t('col_label'),
      width: '180px',
      sortable: true,
      cell: (o) => (
        <a
          href={`/consignments/${o.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {o.label}
        </a>
      ),
      cellText: (r) => r.label,
    },
    {
      key: 'product',
      header: t('col_product'),
      cell: (o) => (
        <div>
          <div className="max-w-[300px] truncate font-medium text-[var(--ms-text-primary)]">
            {o.product.name}
          </div>
          {o.product.code && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {o.product.code}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.product?.code ? `${r.product.name} (${r.product.code})` : (r.product?.name ?? ''),
    },
    {
      key: 'variant',
      header: t('col_variant'),
      width: '180px',
      cell: (o) =>
        o.variant ? (
          <span className="text-[var(--ms-text-primary)] text-sm">{o.variant.name}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-sm">—</span>
        ),
      cellText: (r) => r.variant?.name ?? '',
    },
    {
      key: 'code',
      header: tFields('code'),
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">{o.code ?? '—'}</span>
      ),
      cellText: (r) => r.code ?? '',
    },
    {
      key: 'expiry',
      header: t('col_expiry'),
      width: '160px',
      sortable: true,
      sortField: 'expiryDate',
      cell: (o) => {
        if (!o.expiryDate) return <span className="text-[var(--ms-text-muted)] text-sm">—</span>;
        const expired = isExpired(o.expiryDate);
        const soon = isExpiringSoon(o.expiryDate);
        return (
          <div className="flex items-center gap-2">
            <span
              className={
                expired
                  ? 'tabular-nums font-medium text-[var(--ms-text-destructive)]'
                  : soon
                    ? 'tabular-nums font-medium text-[var(--ms-text-warning)]'
                    : 'tabular-nums text-[var(--ms-text-primary)]'
              }
            >
              {formatDate(o.expiryDate)}
            </span>
            {expired && <Badge tone="destructive">{t('expired_badge')}</Badge>}
          </div>
        );
      },
      cellText: (r) => (r.expiryDate ? formatDate(r.expiryDate) : ''),
    },
    {
      key: 'barcodes',
      header: t('col_barcodes'),
      width: '140px',
      cell: (o) =>
        o.barcodes.length > 0 ? (
          <span className="text-[var(--ms-text-muted)] text-sm">
            {o.barcodes[0]}
            {o.barcodes.length > 1 && (
              <span className="ml-1 text-[var(--ms-text-muted)] text-xs">
                +{o.barcodes.length - 1}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-sm">—</span>
        ),
      cellText: (r) => r.barcodes.join(', '),
    },
    {
      key: 'archived',
      header: t('col_archived'),
      width: '110px',
      cell: (o) => (o.archived ? <Badge tone="neutral">{tFields('archived')}</Badge> : null),
      cellText: (r) => (r.archived ? '✓' : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (o) => (
        <span className="block max-w-[260px] truncate text-[var(--ms-text-muted)] text-sm">
          {o.description ?? ''}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
  ];

  const hasFilter = !!search || expiredOnly || archivedFilter === 'true';

  return (
    <ListView
      testId="consignments-page"
      title={t('title')}
      moyskladToolbar
      onRefresh={() => refetch()}
      selectionCount={0}
      // Manual create deferred to Supply-form receive-with-batch sprint.
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
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(o) => `consignment-row-${o.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      hasNext={!!data?.nextCursor}
      hasPrevious={!!cursor}
      onNext={() => setCursor(data?.nextCursor)}
      onPrevious={() => setCursor(undefined)}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={hasFilter ? tCommon('no_results') : t('empty_title')}
      hasActiveFilter={hasFilter}
      visibleColumnKeys={cols.visibleKeys}
      headerEndSlot={
        <ColumnSettings
          columns={columns.map((c) => ({ key: c.key, label: c.header }))}
          visibleKeys={cols.visibleKeys}
          onChange={cols.setVisibleKeys}
          onReset={cols.reset}
        />
      }
      columnWidths={colWidths.values}
      onColumnResize={colWidths.set}
    />
  );
}
