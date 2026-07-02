'use client';

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { api } from '@/lib/api-client';
import {
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  formatDate,
} from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * «Волны отбора» (picking waves, #5 of moysklad's 10 Склад sub-sections).
 *
 * The list view, 1:1 with moysklad.uz #warehouseorder (live-grounded 2026-06-21):
 * moysklad toolbar (? · ⟳ · «Фильтр» · search «Номер или комментарий») + an inline
 * filter panel (Период · Склад · План. дата отгрузки · Когда изменен) + the grid
 * Номер · Дата и время · Склад · План. дата отгрузки · Когда изменен · Комментарий
 * + «Все 0» / «1-0 из 0».
 *
 * A picking wave AGGREGATES selected customer orders for batch warehouse picking,
 * so it is created FROM the «Заказы покупателей» list (no create button here). The
 * picking-wave DOCUMENT backend (Prisma model + API + create-from-orders + detail/
 * picking workflow) is the next build — until then the list is genuinely empty
 * (the climart account also shows 0), which is the faithful state. Filter controls
 * render 1:1; they wire to the API once the backend lands.
 */
interface WaveRow {
  id: string;
  name: string;
  moment: string;
  store: { id: string; name: string } | null;
  deliveryPlannedMoment: string | null;
  updatedAt: string;
  description: string | null;
}

const LIMIT = 100;

export default function PickingWavesPage() {
  const t = useTranslations('pages.pickingWaves');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [momentFrom, setMomentFrom] = useState<string | undefined>();
  const [momentTo, setMomentTo] = useState<string | undefined>();
  const [deliveryFrom, setDeliveryFrom] = useState<string | undefined>();
  const [deliveryTo, setDeliveryTo] = useState<string | undefined>();
  const [updatedFrom, setUpdatedFrom] = useState<string | undefined>();
  const [updatedTo, setUpdatedTo] = useState<string | undefined>();
  const [storeId, setStoreId] = useState<string | undefined>();
  const [storeLabel, setStoreLabel] = useState<string | undefined>();
  const [storePickerOpen, setStorePickerOpen] = useState(false);

  // No backend yet — a picking wave is a document still to be built. The list is
  // genuinely empty (matches the live account's «Все 0»); filters render 1:1 and
  // get wired to the API when the backend lands.
  const rows: WaveRow[] = [];

  const columns: DataTableColumn<WaveRow>[] = [
    {
      key: 'name',
      header: t('col_number'),
      width: '160px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/picking-waves/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: t('col_datetime'),
      width: '150px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'store',
      header: t('col_store'),
      cell: (r) => <span className="text-sm">{r.store?.name ?? '—'}</span>,
      cellText: (r) => r.store?.name ?? '',
    },
    {
      key: 'deliveryPlanned',
      header: t('col_delivery_date'),
      width: '170px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {r.deliveryPlannedMoment ? formatDate(r.deliveryPlannedMoment) : '—'}
        </span>
      ),
      cellText: (r) => (r.deliveryPlannedMoment ? formatDate(r.deliveryPlannedMoment) : ''),
    },
    {
      key: 'updated',
      header: t('col_updated'),
      width: '150px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.updatedAt)}</span>
      ),
      cellText: (r) => formatDate(r.updatedAt),
    },
    {
      key: 'description',
      header: t('col_comment'),
      cell: (r) => (
        <span className="max-w-[240px] truncate text-[var(--ms-text-muted)] text-xs">
          {r.description ?? ''}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
  ];

  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setMomentFrom(undefined);
        setMomentTo(undefined);
        setDeliveryFrom(undefined);
        setDeliveryTo(undefined);
        setUpdatedFrom(undefined);
        setUpdatedTo(undefined);
        setStoreId(undefined);
        setStoreLabel(undefined);
      }}
      testId="picking-waves-inline-filter"
    >
      {/* 1. Период */}
      <InlineFilterPanel.Field
        label={`${tFilters('period')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setMomentFrom(from);
              setMomentTo(to);
            }}
            labels={{
              yesterday: tFilters('period_yesterday'),
              today: tFilters('period_today'),
              week: tFilters('period_week'),
              month: tFilters('period_month'),
            }}
          />
        }
      >
        <PeriodInputs
          from={momentFrom}
          to={momentTo}
          onChange={({ from, to }) => {
            setMomentFrom(from);
            setMomentTo(to);
          }}
          testId="filter-period"
        />
      </InlineFilterPanel.Field>
      {/* 2. Склад */}
      <InlineFilterPanel.Field label={t('col_store')} expandable>
        <CatalogPickerField
          value={storeId ? { id: storeId, label: storeLabel ?? storeId } : null}
          onPick={() => setStorePickerOpen(true)}
          onClear={() => {
            setStoreId(undefined);
            setStoreLabel(undefined);
          }}
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 3. План. дата отгрузки */}
      <InlineFilterPanel.Field
        label={`${t('col_delivery_date')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setDeliveryFrom(from);
              setDeliveryTo(to);
            }}
            labels={{
              yesterday: tFilters('period_yesterday'),
              today: tFilters('period_today'),
              week: tFilters('period_week'),
              month: tFilters('period_month'),
            }}
          />
        }
      >
        <PeriodInputs
          from={deliveryFrom}
          to={deliveryTo}
          onChange={({ from, to }) => {
            setDeliveryFrom(from);
            setDeliveryTo(to);
          }}
          testId="filter-delivery"
        />
      </InlineFilterPanel.Field>
      {/* 4. Когда изменен */}
      <InlineFilterPanel.Field
        label={`${t('col_updated')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setUpdatedFrom(from);
              setUpdatedTo(to);
            }}
            labels={{
              yesterday: tFilters('period_yesterday'),
              today: tFilters('period_today'),
              week: tFilters('period_week'),
              month: tFilters('period_month'),
            }}
          />
        }
      >
        <PeriodInputs
          from={updatedFrom}
          to={updatedTo}
          onChange={({ from, to }) => {
            setUpdatedFrom(from);
            setUpdatedTo(to);
          }}
          testId="filter-updated"
        />
      </InlineFilterPanel.Field>
    </InlineFilterPanel>
  );

  return (
    <>
      <ListView
        testId="picking-waves-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => {}}
        onHelp={() => window.open('/stock-training', '_blank')}
        search={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={rows}
        keyField="id"
        rowTestId={(r) => `picking-wave-row-${r.id}`}
        total={0}
        limit={LIMIT}
        hasNext={false}
        hasPrevious={false}
        onNext={() => {}}
        onPrevious={() => {}}
        loading={false}
        error={null}
        emptyTitle={t('empty_title')}
        hasActiveFilter={false}
        headerSlot={filterPanel}
        extraActionsLeft={
          <FilterToggleButton
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            label={tFilters('trigger')}
          />
        }
      />

      <CatalogPicker
        open={storePickerOpen}
        onClose={() => setStorePickerOpen(false)}
        title={t('col_store')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/stores?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
        }}
      />
    </>
  );
}
