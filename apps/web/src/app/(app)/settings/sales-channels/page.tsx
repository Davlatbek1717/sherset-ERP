'use client';

/**
 * /settings/sales-channels — «Каналы продаж» catalog (Настройки → Справочники →
 * Каналы продаж).
 *
 * Modal-CRUD surface over the existing sales-channel backend (the richer
 * ecommerce dashboard lives at /ecommerce/channels — this page is the settings
 * catalog view):
 *   GET    /sales-channels?search&kind&archived&limit&cursor&sortBy&sortDir
 *          → { items, total, nextCursor }
 *   GET    /sales-channels/:id      → full record incl. `version` + externalCode
 *   POST   /sales-channels          { name, kind, externalRef?, externalCode? }
 *   PATCH  /sales-channels/:id      { version, …fields } (optimistic lock — 409
 *          on stale version, surfaced by useApiMutation's conflict toast)
 *   POST   /sales-channels/:id/archive | /restore
 *   DELETE /sales-channels/:id      (400 when the channel has online orders)
 *
 * Schema note: SalesChannel has NO description field — the modal renders
 * exactly what CreateSalesChannelSchema accepts (name required, kind enum,
 * externalRef, externalCode). The list select omits version/externalCode, so
 * row-click edit fetches GET /:id before the PATCH can be enabled.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { channelKindTone } from '@/lib/domain-status-tone';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  Badge,
  Button,
  type DataTableColumn,
  FormField,
  Icons,
  Input,
  ListView,
  type ListViewFilter,
  Modal,
  NativeSelect,
  useConfirm,
  useDebounce,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type ChannelKind =
  | 'telegram'
  | 'instagram'
  | 'website'
  | 'marketplace_uzum'
  | 'marketplace_olcha'
  | 'custom';

const KINDS: ChannelKind[] = [
  'telegram',
  'instagram',
  'website',
  'marketplace_uzum',
  'marketplace_olcha',
  'custom',
];

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

interface ChannelRow {
  id: string;
  name: string;
  kind: ChannelKind;
  externalRef: string | null;
  archived: boolean;
  _count: { orders: number };
}

interface ChannelDetail {
  id: string;
  name: string;
  kind: ChannelKind;
  externalRef: string | null;
  externalCode: string | null;
  archived: boolean;
  version: number;
}

const LIMIT = 50;

export default function SettingsSalesChannelsPage() {
  const t = useTranslations('pages.sales_channels');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { confirm } = useConfirm();

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

  const { data, isLoading, error, refetch } = useQuery<ListResponse<ChannelRow>>({
    queryKey: ['sales-channels', search, archived, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse<ChannelRow>>(`/sales-channels?${params.toString()}`),
  });

  const invalidateList = () => qc.invalidateQueries({ queryKey: ['sales-channels'] });

  // ── Create / edit modal ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('telegram');
  const [externalRef, setExternalRef] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  // Which record id the form fields were last seeded from — guards the effect
  // below against clobbering in-progress user edits on query refreshes.
  const seededId = useRef<string | null>(null);

  // The list select omits version + externalCode, so edit mode needs the full
  // record before PATCH (version is required by UpdateSalesChannelSchema).
  const detailQuery = useQuery<ChannelDetail>({
    queryKey: ['sales-channel', editingId],
    queryFn: () => api.get<ChannelDetail>(`/sales-channels/${editingId}`),
    enabled: !!editingId,
  });

  useEffect(() => {
    const d = detailQuery.data;
    if (d && d.id === editingId && seededId.current !== d.id) {
      seededId.current = d.id;
      setName(d.name);
      setKind(d.kind);
      setExternalRef(d.externalRef ?? '');
      setExternalCode(d.externalCode ?? '');
    }
  }, [detailQuery.data, editingId]);

  const openCreate = () => {
    setEditingId(null);
    seededId.current = null;
    setName('');
    setKind('telegram');
    setExternalRef('');
    setExternalCode('');
    setNameError(null);
    setModalOpen(true);
  };

  const openEdit = (row: ChannelRow) => {
    setEditingId(row.id);
    seededId.current = null;
    // Seed from the row immediately so the modal isn't blank while GET /:id is
    // in flight; the effect above re-seeds (adds externalCode) once it lands.
    setName(row.name);
    setKind(row.kind);
    setExternalRef(row.externalRef ?? '');
    setExternalCode('');
    setNameError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    seededId.current = null;
    setNameError(null);
  };

  const saveMut = useApiMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        kind,
        // The Zod schema maps '' → null, clearing the field on PATCH.
        externalRef,
        externalCode,
      };
      if (editingId) {
        return api.patch(`/sales-channels/${editingId}`, {
          version: detailQuery.data?.version,
          ...body,
        });
      }
      return api.post('/sales-channels', body);
    },
    onSuccess: () => {
      invalidateList();
      if (editingId) qc.invalidateQueries({ queryKey: ['sales-channel', editingId] });
      closeModal();
    },
  });

  const submit = () => {
    if (!name.trim()) {
      setNameError(t('name_required'));
      return;
    }
    setNameError(null);
    saveMut.mutate();
  };

  // ── Row actions: archive / restore / delete ──────────────────────────────
  const archiveMut = useApiMutation({
    mutationFn: (id: string) => api.post(`/sales-channels/${id}/archive`, {}),
    onSuccess: () => invalidateList(),
  });
  const restoreMut = useApiMutation({
    mutationFn: (id: string) => api.post(`/sales-channels/${id}/restore`, {}),
    onSuccess: () => invalidateList(),
  });
  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete(`/sales-channels/${id}`),
    onSuccess: () => invalidateList(),
  });

  const onDelete = async (row: ChannelRow) => {
    const r = await confirm({
      title: t('delete_confirm_title', { name: row.name }),
      description: tCommon('action_irreversible'),
      confirmLabel: tCommon('delete'),
      tone: 'destructive',
    });
    if (r === true || r === 'confirm') deleteMut.mutate(row.id);
  };

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

  const columns: DataTableColumn<ChannelRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => <span className="font-medium text-[var(--ms-text-primary)]">{row.name}</span>,
      cellText: (row) => row.name,
    },
    {
      key: 'kind',
      header: t('kind'),
      width: '160px',
      cell: (row) => (
        <Badge tone={channelKindTone(row.kind)}>
          {t(`kinds.${row.kind}` as Parameters<typeof t>[0])}
        </Badge>
      ),
      cellText: (row) => row.kind,
    },
    {
      key: 'externalRef',
      header: t('external_ref'),
      cell: (row) => (
        <span className="block max-w-xs truncate text-[var(--ms-text-muted)] text-sm">
          {row.externalRef ?? '—'}
        </span>
      ),
      cellText: (row) => row.externalRef ?? '',
    },
    {
      key: 'orders',
      header: t('orders_count'),
      width: '100px',
      cell: (row) => <span className="text-sm tabular-nums">{row._count.orders}</span>,
      cellText: (row) => String(row._count.orders),
    },
    {
      key: 'state',
      header: t('col_state'),
      width: '120px',
      cell: (row) => (
        <Badge tone={archivedTone(row.archived)}>
          {row.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (row) => (row.archived ? 'archived' : 'active'),
    },
  ];

  const modalTitle = editingId ? t('edit_title') : t('new_title');
  // PATCH requires the record's version — block save until GET /:id lands.
  const saveDisabled = saveMut.isPending || (!!editingId && !detailQuery.data);

  return (
    <>
      <ListView
        testId="sales-channels-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        subtitle={data ? tCommon('records_count', { count: data.total ?? 0 }) : undefined}
        extraActionsLeft={
          <Button variant="secondary" onClick={openCreate} data-test-id="sales-channel-create">
            <Icons.createCircle className="h-4 w-4 text-[var(--ms-brand-400)]" />
            {t('create_button_settings')}
          </Button>
        }
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
        onRowClick={openEdit}
        rowTestId={(row) => `sales-channel-row-${row.id}`}
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={row.archived ? tCommon('restore') : tCommon('archive')}
              title={row.archived ? tCommon('restore') : tCommon('archive')}
              disabled={archiveMut.isPending || restoreMut.isPending}
              onClick={() => (row.archived ? restoreMut.mutate(row.id) : archiveMut.mutate(row.id))}
              data-test-id={`sales-channel-${row.archived ? 'restore' : 'archive'}-${row.id}`}
            >
              {row.archived ? (
                <Icons.restore className="h-4 w-4" />
              ) : (
                <Icons.archive className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tCommon('delete')}
              title={tCommon('delete')}
              disabled={deleteMut.isPending}
              onClick={() => onDelete(row)}
              data-test-id={`sales-channel-delete-${row.id}`}
            >
              <Icons.delete className="h-4 w-4" />
            </Button>
          </div>
        )}
        headerEndSlot={<span aria-hidden className="block w-10" />}
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

      <Modal
        open={modalOpen}
        onOpenChange={(o) => {
          if (!o) closeModal();
        }}
        title={modalTitle}
        testId="sales-channel-modal"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} data-test-id="sales-channel-cancel">
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={submit}
              loading={saveMut.isPending}
              disabled={saveDisabled}
              data-test-id="sales-channel-save"
            >
              {tCommon('save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4 p-4">
          <FormField id="sc-name" label={t('name')} required error={nameError}>
            <Input
              id="sc-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              autoFocus
              placeholder={t('name_placeholder')}
              data-test-id="sales-channel-field-name"
            />
          </FormField>

          <FormField id="sc-kind" label={t('kind')}>
            <NativeSelect
              id="sc-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ChannelKind)}
              className={SELECT_CLASS}
              data-test-id="sales-channel-field-kind"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <FormField id="sc-external-ref" label={t('external_ref')}>
            <Input
              id="sc-external-ref"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder={t('external_ref_placeholder')}
              data-test-id="sales-channel-field-external-ref"
            />
          </FormField>

          <FormField id="sc-external-code" label={t('external_code')}>
            <Input
              id="sc-external-code"
              value={externalCode}
              onChange={(e) => setExternalCode(e.target.value)}
              data-test-id="sales-channel-field-external-code"
            />
          </FormField>
        </div>
      </Modal>
    </>
  );
}
