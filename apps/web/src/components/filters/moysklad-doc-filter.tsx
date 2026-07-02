'use client';

/**
 * Reusable moysklad-style inline filter panel + picker mounts.
 *
 * Wraps the standard 6-field set used across all FSM-document list
 * pages (period / agent / organization / store / sum-from / sum-to)
 * plus the saved-filter pill row + the CatalogPicker mounts.
 *
 * Usage on a list page:
 *   const filter = useMoyskladDocFilter({ entity: 'paymentin' });
 *   ...
 *   <ListView
 *     headerSlot={filter.panel(filterValues, setFilterValues, () => setCursor(undefined))}
 *     extraActionsLeft={filter.toggleButton(tFilters)}
 *     ...
 *   />
 *   {filter.pickers(filterValues, setFilterValues, () => setCursor(undefined))}
 */

import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { api } from '@/lib/api-client';
import { filterFromQueryString, queryFromFilter } from '@/lib/filter-from-query';
import {
  CatalogPicker,
  CatalogPickerField,
  type FilterDrawerValues,
  InlineFilterPanel,
  MoneyInput,
  NativeSelect,
  PeriodPicker,
  type PickerItem,
} from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { FilterToggleButton } from './filter-toggle-button';

type ResetFn = () => void;
type SetFV = React.Dispatch<React.SetStateAction<FilterDrawerValues>>;

export interface MoyskladDocFilterOptions {
  /** Entity slug for SavedFiltersPills + testId prefix. */
  entity: string;
  /** Show the Store picker field. Off for cash-in/cash-out which use cashDesk. */
  hasStore?: boolean;
  /**
   * FSM state slugs to expose as a "Статус" select inside the panel.
   * Opt-in: when omitted the status field is not rendered (so the
   * existing non-FSM-filtered callers are unchanged). moysklad surfaces
   * status as a dropdown inside the filter panel, never as pill
   * sub-tabs — matching the customer-orders gold standard.
   */
  states?: readonly string[];
  /** Current selected state slug (null = all). Required when `states` is set. */
  state?: string | null;
  /** Setter for the selected state slug. Required when `states` is set. */
  onStateChange?: (next: string | null) => void;
  /** Translates a state slug to its display label (page-owned i18n namespace). */
  stateLabeler?: (slug: string) => string;
}

export function useMoyskladDocFilter(options: MoyskladDocFilterOptions) {
  const { entity, hasStore = true, states, state = null, onStateChange, stateLabeler } = options;
  const tFilters = useTranslations('filters');
  const [filterOpen, setFilterOpen] = React.useState(true);
  const [pickerOpen, setPickerOpen] = React.useState<null | 'agent' | 'org' | 'store'>(null);

  const panel = (filterValues: FilterDrawerValues, setFilterValues: SetFV, onReset: ResetFn) => (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setFilterValues({});
        onReset();
      }}
      pills={
        <SavedFiltersPills
          entity={entity}
          currentQueryString={queryFromFilter(filterValues)}
          onApply={(qs) => {
            setFilterValues(filterFromQueryString(qs));
            onReset();
          }}
        />
      }
      testId={`${entity}-inline-filter`}
    >
      <InlineFilterPanel.Field label={tFilters('period')} expandable>
        <PeriodPicker
          from={filterValues.momentFrom}
          to={filterValues.momentTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
            onReset();
          }}
          labels={{
            yesterday: tFilters('period_yesterday'),
            today: tFilters('period_today'),
            week: tFilters('period_week'),
            month: tFilters('period_month'),
          }}
          testId="filter-period"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={tFilters('agent')} expandable>
        <CatalogPickerField
          value={
            filterValues.agentId
              ? { id: filterValues.agentId, label: filterValues.agentLabel ?? filterValues.agentId }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('agent')}
          onClear={() => {
            setFilterValues({ ...filterValues, agentId: undefined, agentLabel: undefined });
            onReset();
          }}
          testId="filter-agent"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={tFilters('organization')} expandable>
        <CatalogPickerField
          value={
            filterValues.organizationId
              ? {
                  id: filterValues.organizationId,
                  label: filterValues.organizationLabel ?? filterValues.organizationId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('org')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              organizationId: undefined,
              organizationLabel: undefined,
            });
            onReset();
          }}
          testId="filter-org"
        />
      </InlineFilterPanel.Field>
      {hasStore && (
        <InlineFilterPanel.Field label={tFilters('store')} expandable>
          <CatalogPickerField
            value={
              filterValues.storeId
                ? {
                    id: filterValues.storeId,
                    label: filterValues.storeLabel ?? filterValues.storeId,
                  }
                : null
            }
            placeholder=""
            onPick={() => setPickerOpen('store')}
            onClear={() => {
              setFilterValues({ ...filterValues, storeId: undefined, storeLabel: undefined });
              onReset();
            }}
            testId="filter-store"
          />
        </InlineFilterPanel.Field>
      )}
      <InlineFilterPanel.Field label={tFilters('sum_from')} expandable>
        {/* Money filter: user types som (major); stored as minor (tiyin). allowEmpty
            so a cleared field drops the bound instead of becoming a ≥0 match-all. */}
        <MoneyInput
          allowEmpty
          valueMinor={
            filterValues.sumMinorFrom !== undefined ? String(filterValues.sumMinorFrom) : ''
          }
          onChangeMinor={(minor) => {
            setFilterValues({
              ...filterValues,
              sumMinorFrom: minor === '' ? undefined : Number(minor),
            });
            onReset();
          }}
          data-test-id="filter-sum-from"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={tFilters('sum_to')} expandable>
        <MoneyInput
          allowEmpty
          valueMinor={filterValues.sumMinorTo !== undefined ? String(filterValues.sumMinorTo) : ''}
          onChangeMinor={(minor) => {
            setFilterValues({
              ...filterValues,
              sumMinorTo: minor === '' ? undefined : Number(minor),
            });
            onReset();
          }}
          data-test-id="filter-sum-to"
        />
      </InlineFilterPanel.Field>
      {states && onStateChange && (
        // Статус — FSM state filter. moysklad surfaces this as a
        // dropdown inside the filter panel, not pill sub-tabs.
        <InlineFilterPanel.Field label={tFilters('state')} expandable>
          <NativeSelect
            value={state ?? ''}
            onChange={(e) => {
              onStateChange(e.target.value || null);
              onReset();
            }}
            data-test-id="filter-state"
          >
            <option value="" />
            {states.map((s) => (
              <option key={s} value={s}>
                {stateLabeler ? stateLabeler(s) : s}
              </option>
            ))}
          </NativeSelect>
        </InlineFilterPanel.Field>
      )}
    </InlineFilterPanel>
  );

  const toggleButton = (
    <FilterToggleButton
      open={filterOpen}
      onToggle={() => setFilterOpen((v) => !v)}
      label={tFilters('trigger')}
    />
  );

  const pickers = (filterValues: FilterDrawerValues, setFilterValues: SetFV, onReset: ResetFn) => (
    <>
      <CatalogPicker
        open={pickerOpen === 'agent'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            agentId: item.id,
            agentLabel: String(item.primary),
          });
          onReset();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'org'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('organization')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/organizations?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            organizationId: item.id,
            organizationLabel: String(item.primary),
          });
          onReset();
        }}
      />
      {hasStore && (
        <CatalogPicker
          open={pickerOpen === 'store'}
          onClose={() => setPickerOpen(null)}
          title={tFilters('store')}
          fetcher={async (q): Promise<PickerItem[]> => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/stores?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ id: x.id, primary: x.name }));
          }}
          onSelect={(item) => {
            setFilterValues({
              ...filterValues,
              storeId: item.id,
              storeLabel: String(item.primary),
            });
            onReset();
          }}
        />
      )}
    </>
  );

  return { filterOpen, panel, toggleButton, pickers };
}
