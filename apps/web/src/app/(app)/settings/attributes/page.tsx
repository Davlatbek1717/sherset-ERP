'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
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
import { AttributeMetadataDialog } from './attribute-metadata-dialog';

interface AttributeRow {
  id: string;
  entity: string;
  code: string;
  name: string;
  type: string;
  required: boolean;
  position: number;
  archived: boolean;
  description: string | null;
  enumOptions: Array<{ value: string; label: string }> | null;
  referenceEntity: string | null;
  customEntityId: string | null;
}

const LIMIT = 200;

const ENTITY_GROUPS: Array<{ key: string; entities: string[] }> = [
  { key: 'sales', entities: ['CustomerOrder', 'Demand', 'InvoiceOut', 'SalesReturn'] },
  { key: 'purchase', entities: ['PurchaseOrder', 'Supply', 'InvoiceIn', 'PurchaseReturn'] },
  { key: 'warehouse', entities: ['Move', 'Loss', 'Enter', 'Inventory'] },
  { key: 'money', entities: ['PaymentIn', 'PaymentOut', 'CashIn', 'CashOut'] },
  { key: 'catalog', entities: ['Product', 'Variant', 'Bundle', 'Service', 'ProductFolder'] },
  { key: 'parties', entities: ['Counterparty', 'Employee', 'Organization', 'Store'] },
  {
    key: 'other',
    entities: ['Project', 'Contract', 'RetailSale', 'InternalOrder', 'Prepayment', 'PriceList'],
  },
];

export default function AttributesAdminPage() {
  const t = useTranslations('pages.attribute_admin');
  const tCommon = useTranslations('common');
  const tEntities = useTranslations('attribute_entity');
  const tTypes = useTranslations('attribute_type');
  const { runDestructive } = useDestructiveMutation();
  const qc = useQueryClient();

  const [entity, setEntity] = useState<string>('CustomerOrder');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string>('position');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    entity,
    archived: 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse<AttributeRow>>({
    queryKey: ['attribute-metadata', entity, sortKey, sortDir],
    queryFn: () => api.get<ListResponse<AttributeRow>>(`/attribute-metadata?${params.toString()}`),
  });

  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete(`/attribute-metadata/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attribute-metadata'] });
    },
  });

  const filters: ListViewFilter[] = ENTITY_GROUPS.flatMap((g) =>
    g.entities.map((e) => ({
      key: e,
      label: tEntities(e as Parameters<typeof tEntities>[0]),
      active: entity === e,
      onClick: () => setEntity(e),
    })),
  );

  const columns: DataTableColumn<AttributeRow>[] = [
    {
      key: 'position',
      header: '#',
      width: '60px',
      sortable: true,
      sortField: 'position',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">{r.position}</span>
      ),
      cellText: (r) => String(r.position),
    },
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      sortField: 'name',
      cell: (r) => (
        <button
          type="button"
          onClick={() => setEditingId(r.id)}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </button>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'code',
      header: t('col_code'),
      width: '180px',
      cell: (r) => <code className="text-xs">{r.code}</code>,
      cellText: (r) => r.code,
    },
    {
      key: 'type',
      header: t('col_type'),
      width: '140px',
      cell: (r) => <Badge tone="neutral">{tTypes(r.type as Parameters<typeof tTypes>[0])}</Badge>,
      cellText: (r) => r.type,
    },
    {
      key: 'required',
      header: t('col_required'),
      width: '110px',
      align: 'center',
      cell: (r) =>
        r.required ? (
          <Icons.check className="mx-auto h-4 w-4 text-[var(--ms-text-success)]" />
        ) : (
          <span className="text-[var(--ms-text-muted)]">—</span>
        ),
      cellText: (r) => (r.required ? '✓' : ''),
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditingId(r.id)}
            data-test-id={`attr-edit-${r.id}`}
            aria-label={tCommon('edit')}
          >
            <Icons.edit className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              runDestructive({
                title: t('delete_confirm', { name: r.name }),
                run: () => deleteMut.mutateAsync(r.id),
              })
            }
            data-test-id={`attr-delete-${r.id}`}
            aria-label={tCommon('delete')}
          >
            <Icons.delete className="h-4 w-4 text-[var(--ms-action-destructive)]" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListView
        testId="attribute-admin-page"
        title={t('title')}
        subtitle={t('subtitle')}
        onCreate={() => setCreateOpen(true)}
        createLabel={t('create_button')}
        filters={filters}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(r) => `attribute-row-${r.id}`}
        total={data?.total ?? 0}
        limit={LIMIT}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={t('empty_title', {
          entity: tEntities(entity as Parameters<typeof tEntities>[0]),
        })}
        emptyDescription={t('empty_description')}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
        }}
      />
      {createOpen && (
        <AttributeMetadataDialog
          mode="create"
          entity={entity}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['attribute-metadata'] });
            setCreateOpen(false);
          }}
        />
      )}
      {editingId && (
        <AttributeMetadataDialog
          mode="edit"
          id={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['attribute-metadata'] });
            setEditingId(null);
          }}
        />
      )}
    </>
  );
}
