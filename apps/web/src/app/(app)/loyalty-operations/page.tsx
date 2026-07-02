'use client';

/**
 * CRM → «Операции с баллами» (bonus-operations ledger). Live-grounded 2026-06-25 on
 * moysklad climart (#bonustransaction → docs/audits/crm-menu-2026-06-25/bonus-operations/
 * 01-bonus-operations.png): a list with toolbar (search «Номер или комментарий») and the
 * columns № · Дата создания · Тип операции · Бонусные баллы · Статус · Дата начисления ·
 * Бонусная программа · Контрагент · Комментарий, backed by GET /loyalty/operations.
 *
 * Phase-1: read + search 1:1. The «Операция» create dropdown + full Фильтр panel are a
 * later slice (the create endpoint POST /loyalty/operations already exists).
 */

import { api } from '@/lib/api-client';
import { Badge, type DataTableColumn, ListView, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface BonusOperation {
  id: string;
  name: string;
  moment: string;
  executionDate: string | null;
  transactionType: 'EARNING' | 'SPENDING';
  transactionStatus: 'COMMITTED' | 'PENDING' | 'CANCELLED';
  bonusValue: number;
  description: string | null;
  agent: { id: string; name: string } | null;
  bonusProgram: { id: string; name: string } | null;
}

interface ListResponse {
  items: BonusOperation[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(', ', ' ');
}

const TYPE_TONE = {
  EARNING: 'success',
  SPENDING: 'neutral',
} as const;
const STATUS_TONE = {
  COMMITTED: 'success',
  PENDING: 'warning',
  CANCELLED: 'destructive',
} as const;

export default function LoyaltyOperationsPage() {
  const t = useTranslations('pages.loyalty_operations');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    limit: String(LIMIT),
    ...(cursor ? { cursor } : {}),
  });
  const listQueryKey = ['loyalty-operations', search, cursor] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/loyalty/operations?${params.toString()}`),
  });

  const columns: DataTableColumn<BonusOperation>[] = [
    {
      key: 'name',
      header: t('col_number'),
      width: '120px',
      cell: (o) => (
        <span className="font-medium text-[var(--ms-text-primary)] text-sm tabular-nums">
          {o.name}
        </span>
      ),
      cellText: (o) => o.name,
    },
    {
      key: 'moment',
      header: t('col_created'),
      width: '150px',
      cell: (o) => <span className="text-sm tabular-nums">{formatDateTime(o.moment)}</span>,
      cellText: (o) => formatDateTime(o.moment),
    },
    {
      key: 'transactionType',
      header: t('col_type'),
      width: '130px',
      cell: (o) => (
        <Badge tone={TYPE_TONE[o.transactionType]}>{t(`types.${o.transactionType}`)}</Badge>
      ),
      cellText: (o) => o.transactionType,
    },
    {
      key: 'bonusValue',
      header: t('col_points'),
      width: '130px',
      align: 'right',
      cell: (o) => (
        <span
          className={`text-sm tabular-nums ${
            o.bonusValue < 0 ? 'text-[var(--ms-text-destructive)]' : 'text-[var(--ms-text-primary)]'
          }`}
        >
          {o.bonusValue > 0 ? `+${o.bonusValue}` : o.bonusValue}
        </span>
      ),
      cellText: (o) => String(o.bonusValue),
    },
    {
      key: 'transactionStatus',
      header: t('col_status'),
      width: '130px',
      cell: (o) => (
        <Badge tone={STATUS_TONE[o.transactionStatus]}>
          {t(`statuses.${o.transactionStatus}`)}
        </Badge>
      ),
      cellText: (o) => o.transactionStatus,
    },
    {
      key: 'executionDate',
      header: t('col_execution_date'),
      width: '150px',
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {formatDateTime(o.executionDate)}
        </span>
      ),
      cellText: (o) => formatDateTime(o.executionDate),
    },
    {
      key: 'bonusProgram',
      header: t('col_program'),
      cell: (o) =>
        o.bonusProgram ? (
          <span className="text-sm">{o.bonusProgram.name}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (o) => o.bonusProgram?.name ?? '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      cell: (o) =>
        o.agent ? (
          <a
            href={`/counterparties/${o.agent.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {o.agent.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (o) => o.agent?.name ?? '',
    },
    {
      key: 'description',
      header: t('col_comment'),
      cell: (o) =>
        o.description ? (
          <span className="block max-w-[320px] truncate text-[var(--ms-text-muted)] text-sm">
            {o.description}
          </span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (o) => o.description ?? '',
    },
  ];

  return (
    <ListView
      testId="loyalty-operations-page"
      moyskladToolbar
      title={t('title')}
      subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
      onRefresh={() => refetch()}
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(o) => `bonus-op-row-${o.id}`}
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
    />
  );
}
