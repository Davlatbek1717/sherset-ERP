'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import {
  Badge,
  Button,
  type DataTableColumn,
  Icons,
  ListView,
  type ListViewFilter,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface KorzinaItem {
  entity: string;
  id: string;
  name: string;
  deletedAt: string;
  secondary: string | null;
}

interface ListResponse {
  items: KorzinaItem[];
  total: number;
}

const ENTITY_GROUPS: { key: string; entities: string[] }[] = [
  { key: 'all', entities: [] },
  {
    key: 'sales',
    entities: ['customer_order', 'demand', 'invoice_out', 'sales_return'],
  },
  {
    key: 'purchase',
    entities: ['purchase_order', 'supply', 'invoice_in', 'purchase_return'],
  },
  { key: 'warehouse', entities: ['move', 'loss', 'enter', 'inventory'] },
  { key: 'money', entities: ['payment_in', 'payment_out', 'cash_in', 'cash_out'] },
  { key: 'retail', entities: ['retail_sale'] },
  { key: 'catalog', entities: ['product'] },
];

const LIMIT = 100;

export default function KorzinaPage() {
  const t = useTranslations('pages.korzina');
  const tEntity = useTranslations('korzina_entity');
  const qc = useQueryClient();
  const { runDestructive } = useDestructiveMutation();
  const [activeGroup, setActiveGroup] = useState('all');
  const [activeEntity, setActiveEntity] = useState<string | undefined>(undefined);
  // Click-to-sort — default: newest deleted first.
  const [sortKey, setSortKey] = useState<string>('deletedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const params = new URLSearchParams({ limit: String(LIMIT), sortBy: sortKey, sortDir });
  if (activeEntity) params.set('entity', activeEntity);

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['korzina', activeEntity ?? 'all', sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/korzina?${params.toString()}`),
  });

  const restoreMut = useApiMutation({
    mutationFn: (input: { entity: string; id: string }) =>
      api.post(`/korzina/${input.entity}/${input.id}/restore`, {}),
    successMessage: t('restored'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['korzina'] }),
  });

  const purgeMut = useApiMutation({
    mutationFn: (input: { entity: string; id: string }) =>
      api.delete(`/korzina/${input.entity}/${input.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['korzina'] }),
  });

  const emptyMut = useApiMutation({
    mutationFn: () => api.post('/korzina/empty', {}),
    successMessage: t('emptied'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['korzina'] }),
  });

  const filters: ListViewFilter[] = ENTITY_GROUPS.map((g) => ({
    key: g.key,
    label: t(`group_${g.key}` as 'group_all'),
    active: activeGroup === g.key,
    onClick: () => {
      setActiveGroup(g.key);
      // For "all" — clear the entity filter; for a specific group we
      // pick the first entity and let the user fine-tune via secondary
      // filter. Simpler UX than a multi-select.
      setActiveEntity(g.entities[0]);
    },
  }));

  const columns: DataTableColumn<KorzinaItem>[] = [
    {
      key: 'entity',
      header: t('col_entity'),
      width: '160px',
      cell: (r) => <Badge tone="neutral">{tEntity(r.entity as 'customer_order')}</Badge>,
      cellText: (r) => tEntity(r.entity as 'customer_order'),
    },
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-[var(--ms-text-primary)] text-sm">{r.name}</div>
          {r.secondary && (
            <div className="truncate text-[var(--ms-text-muted)] text-xs">{r.secondary}</div>
          )}
        </div>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'deletedAt',
      header: t('col_deleted_at'),
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {new Date(r.deletedAt).toLocaleString()}
        </span>
      ),
      cellText: (r) => r.deletedAt,
    },
    {
      key: 'actions',
      header: '',
      width: '180px',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => restoreMut.mutate({ entity: r.entity, id: r.id })}
            disabled={restoreMut.isPending}
            data-test-id={`korzina-restore-${r.id}`}
          >
            <Icons.restore className="mr-1 h-3.5 w-3.5" />
            {t('action_restore')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              runDestructive({
                title: t('purge_confirm', { name: r.name }),
                description: t('purge_warning'),
                confirmLabel: t('action_purge'),
                run: () => purgeMut.mutateAsync({ entity: r.entity, id: r.id }),
              })
            }
            data-test-id={`korzina-purge-${r.id}`}
            aria-label={t('action_purge')}
          >
            <Icons.delete className="h-4 w-4 text-[var(--ms-action-destructive)]" />
          </Button>
        </div>
      ),
    },
  ];

  const handleEmpty = () =>
    runDestructive({
      title: t('empty_confirm'),
      description: t('empty_warning'),
      confirmLabel: t('empty_action'),
      run: () => emptyMut.mutateAsync(),
    });

  return (
    <ListView
      testId="korzina-page"
      moyskladToolbar
      title={t('title')}
      subtitle={t('subtitle')}
      onRefresh={() => refetch()}
      filters={filters}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      total={data?.total ?? 0}
      limit={LIMIT}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
      }}
      emptyTitle={t('empty_title')}
      emptyDescription={t('empty_description')}
      extraActions={
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleEmpty}
          disabled={emptyMut.isPending || (data?.items ?? []).length === 0}
          data-test-id="korzina-empty-button"
        >
          <Icons.delete className="mr-1 h-3.5 w-3.5" />
          {t('empty_action')}
        </Button>
      }
    />
  );
}
