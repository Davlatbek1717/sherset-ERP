'use client';

/**
 * /settings/uoms — Единицы измерения catalog (Настройки → Справочники →
 * Единицы измерения).
 *
 * moysklad parity (§4 clean PNG capture
 * docs/moysklad-reference/visual-captures/04-module/uom/screenshots/00-clean-default.png):
 * title «Единицы измерения», create «+ Единица измерения», search «Наименование»
 * (BE searches name only), columns Тип · Краткое наименование · Полное наименование ·
 * Цифровой код, no «Печать», no archived state. «Тип» = Системный (shared seed unit) /
 * Пользовательский (account-created). The «Изменить ▾» bulk menu (UomBulkActionsDropdown)
 * = {Удалить, Массовое редактирование[disabled placeholder]} — the 2-item system-catalog
 * menu (see docs/moysklad-reference/uoms/FINDING.md for the mass-edit decision).
 */

import { UomBulkActionsDropdown } from '@/components/uoms/bulk-actions-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import { type DataTableColumn, ListView, type ListViewFilter, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface UomRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  shared: boolean;
}

const LIMIT = 50;

export default function UomsPage() {
  const t = useTranslations('pages.uom_admin');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    sortBy: sortKey,
    sortDir,
  });

  const listQueryKey = ['uoms', search, sortKey, sortDir] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse<UomRow>>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse<UomRow>>(`/uoms?${params.toString()}`),
  });

  // Единицы измерения is a flat system catalog: no FSM transitions, no
  // archive (2-item moysklad menu). The hook drives row selection + the
  // inline bar; the toolbar «Изменить ▾» dropdown is rendered separately.
  const bulk = useBulkDocumentActions('uoms', listQueryKey, {
    hasFSM: false,
    hasArchive: false,
  });

  const columns: DataTableColumn<UomRow>[] = [
    {
      key: 'type',
      header: t('col_type'),
      width: '150px',
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {row.shared ? t('type_system') : t('type_custom')}
        </span>
      ),
      cellText: (row) => (row.shared ? t('type_system') : t('type_custom')),
    },
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/uoms/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'description',
      header: t('col_full_name'),
      cell: (row) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{row.description ?? '—'}</span>
      ),
      cellText: (row) => row.description ?? '',
    },
    {
      key: 'code',
      header: t('col_code'),
      width: '120px',
      cell: (row) => (
        <span className="font-mono text-[var(--ms-text-muted)] text-sm">{row.code ?? '—'}</span>
      ),
      cellText: (row) => row.code ?? '',
    },
  ];

  const filters: ListViewFilter[] = [];

  return (
    <ListView
      {...bulk.listViewProps}
      editMenu={bulk.editMenu}
      testId="uoms-page"
      title={t('title')}
      moyskladToolbar
      onRefresh={() => refetch()}
      selectionCount={bulk.selectedIds.size}
      subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
      createHref="/settings/uoms/new"
      createLabel={t('create_button')}
      createPosition="start"
      search={searchInput}
      onSearchChange={(v) => setSearchInput(v)}
      searchPlaceholder={t('search_placeholder')}
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(row) => `uom-row-${row.id}`}
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
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
      }}
      extraActions={
        <UomBulkActionsDropdown
          selectedIds={bulk.selectedIds}
          listQueryKey={listQueryKey}
          onClearSelection={bulk.clearSelection}
        />
      }
    />
  );
}
