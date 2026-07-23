'use client';

/**
 * /settings/label-templates — Label template list.
 *
 * Templates define paper layout (cols × rows, margins, label dimensions)
 * and which product fields to include. They're reused across many
 * print jobs.
 */

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { Badge, type DataTableColumn, ListView, formatDate, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  pageSize: string;
  cols: number;
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
  barcodeFormat: string;
  archived: boolean;
  createdAt: string;
}

interface ListResponse {
  items: TemplateRow[];
  total: number;
}

const LIMIT = 100;

export default function LabelTemplatesPage() {
  const t = useTranslations('pages.label_template');
  const tCommon = useTranslations('common');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(showArchived ? { archived: 'true' } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['label-templates', search, showArchived, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/label-templates?${params.toString()}`),
  });

  const columns: DataTableColumn<TemplateRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      cell: (r) => (
        <a
          href={`/settings/label-templates/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'description',
      header: t('description'),
      cell: (r) => (
        <span className="max-w-[280px] truncate text-[var(--ms-text-muted)] text-sm">
          {r.description ?? '—'}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
    {
      key: 'pageSize',
      header: t('paper'),
      width: '100px',
      cell: (r) => <Badge tone="neutral">{r.pageSize}</Badge>,
      cellText: (r) => r.pageSize,
    },
    {
      key: 'grid',
      header: t('grid'),
      width: '100px',
      align: 'right',
      cell: (r) => (
        <span className="text-sm tabular-nums">
          {r.cols} × {r.rows}
        </span>
      ),
      cellText: (r) => `${r.cols}x${r.rows}`,
    },
    {
      key: 'size',
      header: t('label_size'),
      width: '120px',
      align: 'right',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {r.labelWidthMm} × {r.labelHeightMm} mm
        </span>
      ),
      cellText: (r) => `${r.labelWidthMm}x${r.labelHeightMm}mm`,
    },
    {
      key: 'barcode',
      header: t('barcode_format'),
      width: '110px',
      cell: (r) => <Badge tone="brand">{r.barcodeFormat}</Badge>,
      cellText: (r) => r.barcodeFormat,
    },
    {
      key: 'archived',
      header: tCommon('status'),
      width: '110px',
      cell: (r) => (
        <Badge tone={archivedTone(r.archived)}>{r.archived ? t('archived') : t('active')}</Badge>
      ),
      cellText: (r) => (r.archived ? 'archived' : 'active'),
    },
    {
      key: 'createdAt',
      sortField: 'createdAt',
      header: tCommon('created_at'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(r.createdAt)}
        </span>
      ),
      cellText: (r) => formatDate(r.createdAt),
    },
  ];

  return (
    <ListView
      testId="label-templates-page"
      title={t('title')}
      moyskladToolbar
      onRefresh={() => refetch()}
      createHref="/settings/label-templates/new"
      createLabel={t('create_button')}
      createPosition="start"
      search={searchInput}
      onSearchChange={setSearchInput}
      searchPlaceholder={t('search_placeholder')}
      filters={[
        {
          key: 'active',
          label: t('active'),
          active: !showArchived,
          onClick: () => setShowArchived(false),
        },
        {
          key: 'archived',
          label: t('archived'),
          active: showArchived,
          onClick: () => setShowArchived(true),
        },
      ]}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(r) => `label-template-${r.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={search ? tCommon('no_results') : t('empty_title')}
      richEmpty={{
        heading: t('empty_rich_heading'),
        helper: { label: t('empty_rich_helper'), href: '/help/label-templates' },
        cta: { label: t('create_button'), href: '/settings/label-templates/new' },
      }}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
      }}
    />
  );
}
