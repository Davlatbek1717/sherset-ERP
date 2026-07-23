'use client';

import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { api } from '@/lib/api-client';
import { serviceRequestPriorityTone, serviceRequestStatusTone } from '@/lib/domain-status-tone';
import {
  Badge,
  CatalogPicker,
  type DataTableColumn,
  ListView,
  type ListViewFilter,
  MassEditModal,
  type PickerItem,
  formatDate,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ServiceRequestRow {
  id: string;
  name: string;
  subject: string;
  status: string;
  priority: string;
  channel: string;
  dueDate: string | null;
  createdAt: string;
  counterparty: { id: string; name: string } | null;
  contactPerson: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
}

interface ListResponse {
  items: ServiceRequestRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 50;

export default function ServiceRequestsListPage() {
  const router = useRouter();
  const t = useTranslations('pages.service_requests');
  const tFilters = useTranslations('filters');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  // Click-to-sort. Default: newest first.
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState<null | 'massEditOwner'>(null);

  const params = new URLSearchParams({ limit: String(LIMIT), sortBy: sortKey, sortDir });
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (statusFilter) params.set('status', statusFilter);
  if (openOnly) params.set('openOnly', 'true');

  const listQueryKey = [
    'service-requests',
    debouncedSearch,
    statusFilter,
    openOnly,
    sortKey,
    sortDir,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/service-requests?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('service-requests', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditOpen(true);
    },
  });

  const filters: ListViewFilter[] = [
    {
      key: 'all',
      label: t('filter_all'),
      active: statusFilter === null && !openOnly,
      onClick: () => {
        setStatusFilter(null);
        setOpenOnly(false);
      },
    },
    {
      key: 'open',
      label: t('filter_open'),
      active: openOnly && statusFilter === null,
      onClick: () => {
        setStatusFilter(null);
        setOpenOnly(true);
      },
    },
    ...['new', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'cancelled'].map((s) => ({
      key: s,
      label: t(`status_${s}`),
      active: statusFilter === s,
      onClick: () => {
        setStatusFilter(s);
        setOpenOnly(false);
      },
    })),
  ];

  const columns: DataTableColumn<ServiceRequestRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/service-requests/${r.id}`}
          className="font-medium text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'status',
      header: t('col_status'),
      width: '130px',
      cell: (r) => (
        <Badge tone={serviceRequestStatusTone(r.status)}>{t(`status_${r.status}`)}</Badge>
      ),
      cellText: (r) => r.status,
    },
    {
      key: 'priority',
      header: t('col_priority'),
      width: '100px',
      cell: (r) => (
        <Badge tone={serviceRequestPriorityTone(r.priority)}>{t(`priority_${r.priority}`)}</Badge>
      ),
      cellText: (r) => r.priority,
    },
    {
      key: 'subject',
      header: t('col_subject'),
      cell: (r) => <span className="font-medium">{r.subject}</span>,
      cellText: (r) => r.subject,
    },
    {
      key: 'counterparty',
      header: t('col_counterparty'),
      cell: (r) => <span>{r.counterparty?.name ?? '—'}</span>,
      cellText: (r) => r.counterparty?.name ?? '',
    },
    {
      key: 'assignee',
      header: t('col_assignee'),
      cell: (r) => <span>{r.assignee?.name ?? '—'}</span>,
      cellText: (r) => r.assignee?.name ?? '',
    },
    {
      key: 'dueDate',
      header: t('col_due'),
      width: '130px',
      sortable: true,
      cell: (r) => {
        if (!r.dueDate) return <span className="text-[var(--ms-text-muted)]">—</span>;
        // Overdue red only while the request is still live (mirrors the tasks
        // list) — a resolved/closed/cancelled request can't be "overdue".
        const isOverdue =
          ['new', 'in_progress', 'waiting_customer'].includes(r.status) &&
          new Date(r.dueDate) < new Date();
        return (
          <span
            className={`text-xs tabular-nums ${isOverdue ? 'text-[var(--ms-text-destructive)]' : ''}`}
          >
            {formatDate(r.dueDate)}
          </span>
        );
      },
      cellText: (r) => r.dueDate ?? '',
    },
    {
      key: 'createdAt',
      header: t('col_created'),
      width: '130px',
      sortable: true,
      cell: (r) => <span className="text-xs tabular-nums">{formatDate(r.createdAt)}</span>,
      cellText: (r) => r.createdAt,
    },
  ];

  return (
    <>
      <ListView
        {...bulk.listViewProps}
        selectionCount={bulk.selectedIds.size}
        editMenu={bulk.editMenu}
        testId="service-requests-page"
        moyskladToolbar
        title={t('title')}
        onCreate={() => {
          router.push('/service-requests/new');
        }}
        createLabel={t('create_button')}
        createPosition="start"
        onRefresh={() => refetch()}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('search_placeholder')}
        filters={filters}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        total={data?.total ?? 0}
        limit={LIMIT}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={t('empty_title')}
        emptyDescription={t('empty_description')}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
        }}
      />

      <CatalogPicker
        open={pickerOpen === 'massEditOwner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMassEditOwner({ id: item.id, label: String(item.primary) });
          setPickerOpen(null);
        }}
      />

      <MassEditModal
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        selectedCount={massEditIds.length}
        submitting={bulk.massEdit.isPending}
        hideProject
        ownerValue={massEditOwner}
        onOwnerPick={() => setPickerOpen('massEditOwner')}
        onOwnerClear={() => setMassEditOwner(null)}
        projectValue={null}
        onProjectPick={() => undefined}
        onProjectClear={() => undefined}
        labels={{
          title: t('mass_edit_title'),
          ownerLabel: tFilters('owner_employee'),
          projectLabel: tFilters('project'),
          descriptionLabel: t('mass_edit_description_label'),
          apply: t('mass_edit_apply'),
          cancel: t('mass_edit_cancel'),
          hint: t('mass_edit_hint', { count: massEditIds.length }),
        }}
        onSubmit={async (patch) => {
          await bulk.massEdit.mutateAsync({ ids: massEditIds, ...patch });
          setMassEditOpen(false);
        }}
      />
    </>
  );
}
