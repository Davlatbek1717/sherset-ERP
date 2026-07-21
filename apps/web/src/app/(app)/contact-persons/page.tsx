'use client';

import { ColumnSettings } from '@/components/column-settings';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  NativeSelect,
  type PickerItem,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ContactPerson {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  archived: boolean;
  counterparty: { id: string; name: string; legalTitle: string | null };
  owner: { id: string; name: string } | null;
}

interface ListResponse {
  items: ContactPerson[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 25;

export default function ContactPersonsPage() {
  const t = useTranslations('pages.contact_persons');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tForm = useTranslations('form');
  const userDefaults = useUserDefaults();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort. Default: name asc (master-data convention).
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'agent' | 'owner'>(null);
  const [agentFilter, setAgentFilter] = useState<{ id?: string; label?: string }>({});
  const [ownerFilter, setOwnerFilter] = useState<{ id?: string; label?: string }>({});

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(agentFilter.id ? { counterpartyId: agentFilter.id } : {}),
    ...(ownerFilter.id ? { ownerId: ownerFilter.id } : {}),
  });

  const listQueryKey = [
    'contact-persons',
    search,
    archived,
    cursor,
    sortKey,
    sortDir,
    agentFilter.id,
    ownerFilter.id,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/contact-persons?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('contact-persons', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
  });
  const cols = useColumnVisibility('contact-persons', [
    'name',
    'position',
    'counterparty',
    'phone',
    'email',
  ]);
  const colWidths = useColumnWidths('contact-persons');

  // Parity finding (2026-05-30): moysklad has NO standalone contact-person
  // list — `#contactperson` resolves to the sector onboarding splash; contact
  // persons live as a sub-tab inside the Контрагент card. So this standalone
  // page deliberately gets NO catalog «Изменить»/«Печать» dropdowns (unlike
  // services/bundles, which DO live in the `#good` assortment): the sub-tab
  // reference has a simpler toolbar. We keep moyskladToolbar + Фильтр panel
  // (no pill sub-tabs) + bulk delete/archive only. Kontragent + Holat filtering
  // is the inline panel below, backed by ContactPersonFilterSchema
  // (counterpartyId/archived). No SavedFiltersPills — not FilterDrawerValues-
  // shaped (no-op otherwise). Full rationale + evidence:
  // docs/moysklad-reference/contact-persons/FINDING.md.

  const columns: DataTableColumn<ContactPerson>[] = [
    {
      key: 'name',
      header: tFields('name'),
      sortable: true,
      cell: (p) => (
        <a
          href={`/contact-persons/${p.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {p.name}
        </a>
      ),
      cellText: (p) => p.name,
    },
    {
      key: 'position',
      header: t('position'),
      cell: (p) => <span className="text-[var(--ms-text-muted)] text-sm">{p.position ?? '—'}</span>,
      cellText: (p) => p.position ?? '',
    },
    {
      key: 'counterparty',
      header: tFields('agent'),
      cell: (p) => (
        <a
          href={`/counterparties/${p.counterparty.id}`}
          className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
        >
          {p.counterparty.name}
        </a>
      ),
      cellText: (p) => p.counterparty.name,
    },
    {
      key: 'phone',
      header: t('phone'),
      width: '160px',
      cell: (p) =>
        p.phone ? (
          <a
            href={`tel:${p.phone}`}
            className="text-[var(--ms-text-brand)] text-sm tabular-nums underline-offset-2 hover:underline"
          >
            {p.phone}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (p) => p.phone ?? '',
    },
    {
      key: 'email',
      header: t('email'),
      cell: (p) =>
        p.email ? (
          <a
            href={`mailto:${p.email}`}
            className="block max-w-[260px] truncate text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {p.email}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (p) => p.email ?? '',
    },
    {
      key: 'archived',
      header: tFields('state'),
      width: '110px',
      cell: (p) => (
        <Badge tone={archivedTone(p.archived)}>
          {p.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (p) => (p.archived ? 'archived' : 'active'),
    },
  ];

  const hasActiveFilter =
    !!search || archived === 'archived' || !!agentFilter.id || !!ownerFilter.id;

  return (
    <>
      <ListView
        testId="contact-persons-page"
        moyskladToolbar
        title={t('title')}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        onRefresh={() => refetch()}
        selectionCount={bulk.selectedIds.size}
        createHref="/contact-persons/new"
        createLabel={t('create_button')}
        createPosition="start"
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(p) => `contact-person-row-${p.id}`}
        rowActions={(p) => bulk.rowDelete(p.id)}
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
        hasActiveFilter={hasActiveFilter}
        richEmpty={{
          heading: t('empty_rich_heading'),
          cta: { label: t('create_button'), href: '/contact-persons/new' },
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        {...bulk.listViewProps}
        editMenu={bulk.editMenu}
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setArchived('active');
              setAgentFilter({});
              setOwnerFilter({});
              setCursor(undefined);
            }}
            testId="contact-persons-inline-filter"
          >
            {/* 1. Контрагент (counterpartyId) */}
            <InlineFilterPanel.Field label={tFields('agent')} expandable>
              <CatalogPickerField
                value={
                  agentFilter.id
                    ? { id: agentFilter.id, label: agentFilter.label ?? agentFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agent')}
                onClear={() => {
                  setAgentFilter({});
                  setCursor(undefined);
                }}
                testId="filter-agent"
              />
            </InlineFilterPanel.Field>
            {/* 2. Mas'ul / Владелец (ownerId) */}
            <InlineFilterPanel.Field label={tFilters('owner')} expandable>
              <CatalogPickerField
                value={
                  ownerFilter.id
                    ? { id: ownerFilter.id, label: ownerFilter.label ?? ownerFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('owner')}
                onClear={() => {
                  setOwnerFilter({});
                  setCursor(undefined);
                }}
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>
            {/* 3. Holat (archived) */}
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
        headerEndSlot={
          <ColumnSettings
            columns={columns.map((c) => ({
              key: c.key,
              label: c.header,
              alwaysVisible: c.key === 'name',
            }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
      />
      <CatalogPicker
        open={pickerOpen === 'agent'}
        onClose={() => setPickerOpen(null)}
        title={tFields('agent')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          const items = r.items.map((x) => ({ id: x.id, primary: x.name }));
          return pinDefaultCustomer(
            items,
            userDefaults.data?.defaultCustomer,
            q,
            tForm('pinned_default'),
          );
        }}
        onSelect={(item) => {
          setAgentFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setOwnerFilter({ id: item.id, label: String(item.primary) });
          setCursor(undefined);
        }}
      />
    </>
  );
}
