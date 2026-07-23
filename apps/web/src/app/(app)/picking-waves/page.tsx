'use client';

import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { api } from '@/lib/api-client';
import {
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  MultiCombobox,
  PeriodInputs,
  PeriodShortcuts,
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
  // «Склад» — moysklad is a checkbox DROPDOWN (multi-select), not a modal
  // (owner 2026-07-12, «Волны отбора» ground). Same MultiCombobox as losses.
  const [stores, setStores] = useState<Array<{ id: string; label: string }>>([]);
  // Bookmark («Закладки») + ⚙ field-visibility — moysklad's two round buttons
  // next to «Очистить» (both were dead placeholders before).
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const filterHidden = useColumnVisibility('picking-waves-filter-hidden', []);
  const savedFilterQuery = [
    momentFrom ? `momentFrom=${momentFrom}` : '',
    momentTo ? `momentTo=${momentTo}` : '',
    deliveryFrom ? `deliveryFrom=${deliveryFrom}` : '',
    deliveryTo ? `deliveryTo=${deliveryTo}` : '',
    updatedFrom ? `updatedFrom=${updatedFrom}` : '',
    updatedTo ? `updatedTo=${updatedTo}` : '',
    stores.length ? `storeIds=${stores.map((s) => s.id).join(',')}` : '',
  ]
    .filter(Boolean)
    .join('&');
  const applySavedFilter = (qs: string) => {
    const p = new URLSearchParams(qs);
    setMomentFrom(p.get('momentFrom') ?? undefined);
    setMomentTo(p.get('momentTo') ?? undefined);
    setDeliveryFrom(p.get('deliveryFrom') ?? undefined);
    setDeliveryTo(p.get('deliveryTo') ?? undefined);
    setUpdatedFrom(p.get('updatedFrom') ?? undefined);
    setUpdatedTo(p.get('updatedTo') ?? undefined);
    const ids = (p.get('storeIds') ?? '').split(',').filter(Boolean);
    setStores(ids.map((id) => ({ id, label: id })));
  };

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
        <span className="max-w-[240px] truncate text-[var(--ms-text-muted)] text-[11px]">
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
        setStores([]);
      }}
      onBookmarkClick={() => setSaveFilterOpen(true)}
      fieldVisibility={{
        hidden: filterHidden.visibleKeys,
        onToggle: (k) => {
          const next = new Set(filterHidden.visibleKeys);
          if (next.has(k)) next.delete(k);
          else next.add(k);
          filterHidden.setVisibleKeys(next);
        },
      }}
      pills={
        <SavedFiltersPills
          entity="pickingwave"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
        />
      }
      testId="picking-waves-inline-filter"
    >
      {/* 1. Период */}
      <InlineFilterPanel.Field
        label={`${tFilters('period')}:`}
        expandable
        fieldKey="period"
        active={!!(momentFrom && momentTo)}
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
      {/* 2. Склад — moysklad checkbox dropdown (multi), not a modal. */}
      <InlineFilterPanel.Field
        label={t('col_store')}
        expandable
        fieldKey="store"
        active={stores.length > 0}
      >
        <MultiCombobox
          value={stores.map((x) => x.id)}
          items={stores.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/stores?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setStores((prev) =>
              nextIds.map((id) => {
                const ex = prev.find((s) => s.id === id);
                if (ex) return ex;
                if (toggled?.value === id) return { id, label: String(toggled.label) };
                return { id, label: id };
              }),
            );
          }}
          placeholder=""
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 3. План. дата отгрузки */}
      <InlineFilterPanel.Field
        label={`${t('col_delivery_date')}:`}
        expandable
        fieldKey="delivery"
        active={!!(deliveryFrom && deliveryTo)}
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
        fieldKey="updated"
        active={!!(updatedFrom && updatedTo)}
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
      />{' '}
    </>
  );
}
