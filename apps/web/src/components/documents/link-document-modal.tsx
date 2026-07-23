'use client';

/**
 * «Привязка документа» — moysklad's link-document modal (re-grounded 2026-07-09 on
 * the user's live screenshot, PO edit → Связанные документы → Привязать документ).
 *
 * A wide, filterable, MULTI-select table over ALL document types (BE
 * `/document-links/search` unions the doc tables). Filter panel mirrors moysklad:
 *   [Найти (green)] [Очистить] · ●Период: вч·сег·нед·мес [from]—[to] ·
 *   Номер документа · ●Контрагент (pre-filled chip) · ●Организация (pre-filled chip)
 *   Тип документа («Все») · ●Статус · ●На склад (pre-filled chip)
 * The chips arrive pre-scoped to the CURRENT doc's agent/org/store (`defaults`) —
 * moysklad opens the modal already filtered to the counterparty. Pick rows →
 * «Привязать» creates a manual DocumentLink for each. Self excluded server-side.
 */

import { api } from '@/lib/api-client';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  Icons,
  Input,
  Modal,
  NativeSelect,
  PeriodPicker,
  type PickerItem,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

/** Doc types the modal can search + link (PascalCase key ↔ i18n title). */
const DOC_TYPES: Array<{ type: string; titleKey: string }> = [
  { type: 'PurchaseOrder', titleKey: 'purchase_order' },
  { type: 'Supply', titleKey: 'supply' },
  { type: 'PurchaseReturn', titleKey: 'purchase_return' },
  { type: 'InvoiceIn', titleKey: 'invoice_in' },
  { type: 'Demand', titleKey: 'demand' },
  { type: 'CustomerOrder', titleKey: 'customer_order' },
  { type: 'InvoiceOut', titleKey: 'invoice_out' },
  { type: 'SalesReturn', titleKey: 'sales_return' },
  { type: 'Move', titleKey: 'move' },
];

// moysklad FSM statuses offered in the «Статус» filter (labels stay Russian —
// moysklad terms, per project rules).
const STATE_FILTERS = ['draft', 'posted', 'cancelled'] as const;
const STATE_LABELS: Record<string, string> = {
  draft: 'Черновик',
  posted: 'Проведён',
  cancelled: 'Отменён',
};

export interface SearchDoc {
  type: string;
  id: string;
  name: string;
  moment: string;
  state: string;
  sumMinor: string;
  organizationName: string | null;
  agentName: string | null;
  /** Custom «Статус» (State row) of the doc — moysklad renders it as the coloured
   *  chip in the table and the coloured strip on the linked card. */
  statusName?: string | null;
  statusColor?: string | null;
  storeFromName: string | null;
  storeToName: string | null;
}

type Ref = { id: string; name: string } | null;

export interface LinkDocumentModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The current document (the link's source). `id: ''`/'new' = unsaved /new form. */
  current: {
    entityType: string;
    id: string;
    name: string;
    moment: string;
    sumMinor: string;
    state?: string;
  };
  /** STAGED mode (unsaved /new forms): «Привязать» hands the checked docs to the
   *  caller instead of POSTing (the doc has no id yet) — no save, no navigation.
   *  The page persists the links right after the document itself is created. */
  onStage?: (docs: SearchDoc[]) => void;
  /** Pre-fill the Контрагент / Организация / На склад filter chips with the
   *  current doc's refs — moysklad opens the modal already scoped to them. */
  defaults?: {
    agent?: Ref;
    organization?: Ref;
    storeTo?: Ref;
  };
  /** Called after a successful link so the caller can refetch the related list.
   *  Unused in STAGED mode (`onStage`). */
  onLinked?: () => void;
}

const PAGE_SIZE = 10;

interface Filters {
  number: string;
  typeFilter: string;
  stateFilter: string;
  agent: Ref;
  organization: Ref;
  storeTo: Ref;
  dateFrom?: string;
  dateTo?: string;
}

const EMPTY_FILTERS: Filters = {
  number: '',
  typeFilter: '',
  stateFilter: '',
  agent: null,
  organization: null,
  storeTo: null,
  dateFrom: undefined,
  dateTo: undefined,
};

export function LinkDocumentModal({
  open,
  onOpenChange,
  current,
  onStage,
  defaults,
  onLinked,
}: LinkDocumentModalProps) {
  const t = useTranslations('link_modal');
  const tTitles = useTranslations('detail_titles');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tCommon = useTranslations('common');

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  // committed filters (applied on «Найти»)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState<null | 'agent' | 'org' | 'store'>(null);
  const [selected, setSelected] = useState<Map<string, SearchDoc>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // moysklad opens the modal ALREADY scoped to the doc's agent/org/store — seed
  // both the visible chips and the committed filters each time it opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seed only on open — defaults identity churns per render
  useEffect(() => {
    if (!open) return;
    const seeded: Filters = {
      ...EMPTY_FILTERS,
      agent: defaults?.agent ?? null,
      organization: defaults?.organization ?? null,
      storeTo: defaults?.storeTo ?? null,
    };
    setDraft(seeded);
    setApplied(seeded);
    setPage(1);
    setSelected(new Map());
    setError(null);
  }, [open]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  // Unsaved /new forms have no id yet — nothing to self-exclude.
  if (current.id && current.id !== 'new') {
    params.set('selfType', current.entityType);
    params.set('selfId', current.id);
  }
  if (applied.number) params.set('number', applied.number);
  if (applied.typeFilter) params.set('types', applied.typeFilter);
  if (applied.stateFilter) params.set('state', applied.stateFilter);
  if (applied.agent) params.set('agentIds', applied.agent.id);
  if (applied.organization) params.set('organizationIds', applied.organization.id);
  if (applied.storeTo) params.set('storeToId', applied.storeTo.id);
  if (applied.dateFrom) params.set('dateFrom', applied.dateFrom);
  if (applied.dateTo) params.set('dateTo', applied.dateTo);

  const { data, isFetching } = useQuery<{
    items: SearchDoc[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ['link-doc-search', params.toString()],
    queryFn: () => api.get(`/document-links/search?${params.toString()}`),
    enabled: open,
    staleTime: 5_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const typeLabel = (ty: string) => {
    const dt = DOC_TYPES.find((d) => d.type === ty);
    return dt ? tTitles(dt.titleKey) : ty;
  };
  const stateLabel = (s: string) => STATE_LABELS[s] ?? s;

  const search = () => {
    setPage(1);
    setApplied(draft);
  };
  const clear = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };
  const toggle = (doc: SearchDoc) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const key = `${doc.type}:${doc.id}`;
      if (next.has(key)) next.delete(key);
      else next.set(key, doc);
      return next;
    });
  };

  // Picker fetchers for the Контрагент / Организация / На склад filter chips.
  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/counterparties?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/organizations?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/stores?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
  };

  const linkMut = useMutation({
    mutationFn: async () => {
      const docs = [...selected.values()];
      const results = await Promise.allSettled(
        docs.map((doc) =>
          api.post('/document-links', {
            sourceType: current.entityType,
            sourceId: current.id,
            sourceName: current.name,
            sourceMoment: current.moment,
            sourceSumMinor: current.sumMinor,
            sourceState: current.state ?? 'draft',
            targetType: doc.type,
            targetId: doc.id,
            targetName: doc.name,
            targetMoment: doc.moment,
            targetSumMinor: doc.sumMinor,
            targetState: doc.state,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length === docs.length && docs.length > 0) {
        throw new Error((failed[0] as PromiseRejectedResult).reason?.message ?? 'link failed');
      }
    },
    onSuccess: () => {
      setSelected(new Map());
      onLinked?.();
      onOpenChange(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  /** «●Label» — the bullet marks an ACTIVE filter (moysklad's orange dot). */
  const FLabel = ({ active, children }: { active: boolean; children: ReactNode }) => (
    <span className="text-[12px] text-[var(--ms-text-primary)] leading-tight">
      {active && (
        <span aria-hidden className="mr-0.5 text-[9px] text-[var(--ms-text-muted)]">
          ●
        </span>
      )}
      {children}
    </span>
  );

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={t('title')}
        testId="link-document-modal"
        widthClass="w-[1180px]"
        footer={
          <>
            <Button
              type="button"
              variant="success"
              size="sm"
              disabled={selected.size === 0 || linkMut.isPending}
              onClick={() => {
                setError(null);
                // STAGED mode — hand the picked docs to the /new form (no POST yet);
                // the page links them right after the document itself is saved.
                if (onStage) {
                  onStage([...selected.values()]);
                  setSelected(new Map());
                  onOpenChange(false);
                  return;
                }
                linkMut.mutate();
              }}
              data-test-id="link-doc-confirm"
            >
              {t('link')}
              {selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {/* Filter panel — grey box, moysklad's «Привязка документа» layout. */}
          <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] p-3">
            <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
              <div className="flex items-center gap-2 pt-4">
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  onClick={search}
                  data-test-id="link-doc-find"
                >
                  {t('find')}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={clear}>
                  {tCommon('clear')}
                </Button>
              </div>
              <div className="flex flex-col gap-0.5">
                <FLabel active={!!(draft.dateFrom || draft.dateTo)}>{tFilters('period')}</FLabel>
                <PeriodPicker
                  from={draft.dateFrom}
                  to={draft.dateTo}
                  onChange={({ from: f, to: tt }) =>
                    setDraft((d) => ({ ...d, dateFrom: f, dateTo: tt }))
                  }
                  labels={{
                    yesterday: tFilters('period_yesterday'),
                    today: tFilters('period_today'),
                    week: tFilters('period_week'),
                    month: tFilters('period_month'),
                  }}
                  testId="link-doc-period"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <FLabel active={!!draft.number}>{t('number')}</FLabel>
                <Input
                  value={draft.number}
                  onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && search()}
                  className="h-8 w-44"
                  data-test-id="link-doc-number"
                />
              </div>
              <div className="flex w-56 flex-col gap-0.5">
                <FLabel active={!!draft.agent}>{tFields('agent')}</FLabel>
                <CatalogPickerField
                  value={draft.agent ? { id: draft.agent.id, label: draft.agent.name } : null}
                  placeholder=""
                  onPick={() => setPickerOpen('agent')}
                  onClear={() => setDraft((d) => ({ ...d, agent: null }))}
                  testId="link-doc-agent"
                />
              </div>
              <div className="flex w-56 flex-col gap-0.5">
                <FLabel active={!!draft.organization}>{tFields('organization')}</FLabel>
                <CatalogPickerField
                  value={
                    draft.organization
                      ? { id: draft.organization.id, label: draft.organization.name }
                      : null
                  }
                  placeholder=""
                  onPick={() => setPickerOpen('org')}
                  onClear={() => setDraft((d) => ({ ...d, organization: null }))}
                  testId="link-doc-org"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <FLabel active={!!draft.typeFilter}>{t('type')}</FLabel>
                <NativeSelect
                  value={draft.typeFilter}
                  onChange={(e) => setDraft((d) => ({ ...d, typeFilter: e.target.value }))}
                  className="h-8 w-48"
                  data-test-id="link-doc-type-filter"
                >
                  <option value="">{t('all_types')}</option>
                  {DOC_TYPES.map((d) => (
                    <option key={d.type} value={d.type}>
                      {tTitles(d.titleKey)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-0.5">
                <FLabel active={!!draft.stateFilter}>{t('status')}</FLabel>
                <NativeSelect
                  value={draft.stateFilter}
                  onChange={(e) => setDraft((d) => ({ ...d, stateFilter: e.target.value }))}
                  className="h-8 w-40"
                  data-test-id="link-doc-state-filter"
                >
                  <option value="">{t('all_types')}</option>
                  {STATE_FILTERS.map((s) => (
                    <option key={s} value={s}>
                      {stateLabel(s)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex w-56 flex-col gap-0.5">
                <FLabel active={!!draft.storeTo}>{t('store_to')}</FLabel>
                <CatalogPickerField
                  value={draft.storeTo ? { id: draft.storeTo.id, label: draft.storeTo.name } : null}
                  placeholder=""
                  onPick={() => setPickerOpen('store')}
                  onClear={() => setDraft((d) => ({ ...d, storeTo: null }))}
                  testId="link-doc-store-to"
                />
              </div>
            </div>
          </div>

          <p className="text-[var(--ms-text-primary)] text-sm">{t('select_docs')}</p>

          {/* Results table */}
          <div className="max-h-[42vh] overflow-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
            <table className="w-full text-sm" data-test-id="link-doc-table">
              <thead className="sticky top-0 bg-[var(--ms-bg-muted)] text-left text-[var(--ms-text-muted)] text-xs">
                <tr>
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2">{t('type')}</th>
                  <th className="px-2 py-2">{tFields('number')}</th>
                  <th className="px-2 py-2">{t('col_date')}</th>
                  <th className="px-2 py-2">{tFields('organization')}</th>
                  <th className="px-2 py-2">{tFields('agent')}</th>
                  <th className="px-2 py-2">{t('status')}</th>
                  <th className="px-2 py-2 text-right">{t('col_sum')}</th>
                  <th className="px-2 py-2">{t('store_from')}</th>
                  <th className="px-2 py-2">{t('store_to')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => {
                  const key = `${d.type}:${d.id}`;
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the <Checkbox> is the keyboard-operable control; row onClick is a mouse-only convenience (moysklad table)
                    <tr
                      key={key}
                      className="cursor-pointer border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-muted)]"
                      onClick={() => toggle(d)}
                      data-test-id={`link-doc-row-${d.type}-${d.id}`}
                    >
                      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stops the row toggle double-firing when the checkbox is clicked — no keyboard path needed */}
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(d)} />
                      </td>
                      <td className="px-2 py-1.5">{typeLabel(d.type)}</td>
                      <td className="px-2 py-1.5 font-medium">{d.name}</td>
                      <td className="px-2 py-1.5 tabular-nums">{formatDate(d.moment)}</td>
                      <td className="px-2 py-1.5">{d.organizationName ?? ''}</td>
                      <td className="px-2 py-1.5">{d.agentName ?? ''}</td>
                      {/* moysklad shows the doc's CUSTOM status as a coloured chip
                          («Киритилди» orange); docs without one show blank. */}
                      <td className="px-2 py-1.5">
                        {d.statusName ? (
                          <span
                            className="inline-block px-2 py-0.5 font-semibold text-[12px] text-white leading-tight"
                            style={{ backgroundColor: d.statusColor ?? '#9ca3af' }}
                          >
                            {d.statusName}
                          </span>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {formatMoney(d.sumMinor, 'UZS')}
                      </td>
                      <td className="px-2 py-1.5">{d.storeFromName ?? ''}</td>
                      <td className="px-2 py-1.5">{d.storeToName ?? ''}</td>
                    </tr>
                  );
                })}
                {!isFetching && items.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-2 py-8 text-center text-[var(--ms-text-muted)]"
                      data-test-id="link-doc-empty"
                    >
                      {t('empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-40"
              aria-label="prev"
            >
              <Icons.left className="h-4 w-4" />
            </button>
            <span className="tabular-nums" data-test-id="link-doc-range">
              {t('range', { from, to, total })}
            </span>
            <button
              type="button"
              disabled={to >= total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded p-1 hover:bg-[var(--ms-bg-muted)] disabled:opacity-40"
              aria-label="next"
            >
              <Icons.right className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <p
              className="text-[var(--ms-action-destructive)] text-sm"
              data-test-id="link-doc-error"
            >
              {error}
            </p>
          )}
        </div>
      </Modal>

      {/* Filter chip pickers — the same sliding CatalogPicker the doc filters use. */}
      <CatalogPicker
        open={pickerOpen === 'agent'}
        onClose={() => setPickerOpen(null)}
        title={tFields('agent')}
        fetcher={agentFetcher}
        onSelect={(item) =>
          setDraft((d) => ({ ...d, agent: { id: item.id, name: String(item.primary) } }))
        }
      />
      <CatalogPicker
        open={pickerOpen === 'org'}
        onClose={() => setPickerOpen(null)}
        title={tFields('organization')}
        fetcher={orgFetcher}
        onSelect={(item) =>
          setDraft((d) => ({ ...d, organization: { id: item.id, name: String(item.primary) } }))
        }
      />
      <CatalogPicker
        open={pickerOpen === 'store'}
        onClose={() => setPickerOpen(null)}
        title={t('store_to')}
        fetcher={storeFetcher}
        onSelect={(item) =>
          setDraft((d) => ({ ...d, storeTo: { id: item.id, name: String(item.primary) } }))
        }
      />
    </>
  );
}
