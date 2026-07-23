'use client';

/**
 * /moves/new — moysklad-parity «Перемещение» editor.
 *
 * Built on the document-editor framework. Warehouse-internal doc: no
 * counterparty, no Ожидание, no VAT columns. Has Склад-источник and
 * Склад-получатель (both required). Shows live stock for source store.
 */

import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { scaleMinorByQty } from '@moysklad/money';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  type DocPositionRow,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaPanel,
  DocumentMetaRow,
  DocumentTabs,
  Icons,
  Input,
  NativeSelect,
  type PickerItem,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  formatMoney,
  useConfirm,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
  code?: string | null;
}
interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  // Buy price in minor units — /products returns `buyPrice` (NOT buyPriceMinor);
  // it seeds the line's «Цена» so Сумма/Итого have a real cost basis.
  buyPrice?: string | null;
  // Live stock cluster — feeds the rich search dropdown's «Доступно» badge.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

export default function NewMovePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const t = useTranslations('pages.moves');
  const tErrors = useTranslations('errors');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailHeader = useTranslations('detail_header');
  const tStates = useTranslations('states.move');
  const tPos = useTranslations('position_editor');
  const tBulk = useTranslations('bulk_actions');
  const tPrint = useTranslations('print_menu');
  const tUnsaved = useTranslations('unsaved_dialog');
  const tTotals = useTranslations('list_totals');
  const docEditorLabels = useDocumentEditorLabels();
  const { confirm } = useConfirm();
  const { openTemplates } = usePrintTemplatesManager();

  // moysklad move/new position grid (owner screenshots 2026-07-14, #move/edit?new):
  // Наименование · Кол-во · Остаток (со склада) · Остаток (на склад) · Цена ·
  // Сумма — no «Уп.», no VAT/discount (internal transfer). The oversell guard
  // reads `available`, so SOURCE-store balance maps there.
  const positionColumns: PositionTableColumnConfig[] = [
    { key: 'dragarea' },
    { key: 'select' },
    { key: 'index' },
    { key: 'image' },
    { key: 'name' },
    // moysklad move/new header is bare «Кол-во» (not «Кол-во б. ед.»).
    { key: 'quantity', label: tPos('quantity') },
    { key: 'available', label: tPos('stock_from') },
    { key: 'stock', label: tPos('stock_to') },
    { key: 'price' },
    { key: 'amount' },
    { key: 'menu' },
  ];

  // moysklad move FSM = draft / posted / cancelled (mirrors moves/[id]).
  // Status is decorative on /new (not sent on create — API always creates a draft).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const fromOrderId = searchParams.get('fromOrder');

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });

  // Optional pre-fill from a customer order — «Перемещение» of the ordered
  // goods. Mirrors the sales-returns ?fromDemand flow: copy the order's
  // organization, store (the "from" warehouse) and positions; the user picks
  // the destination store. The order's currency/totals/VAT are irrelevant to a
  // warehouse-internal move, so only org/source-store/positions are consumed.
  const { data: fromOrder } = useQuery<{
    id: string;
    organization: { id: string; name: string };
    store: { id: string; name: string } | null;
    positions: Array<{
      id: string;
      assortmentId: string;
      assortmentKind: string;
      quantity: string;
      product: { id: string; name: string; code: string | null; uom: string | null } | null;
    }>;
  }>({
    queryKey: ['customer-order', fromOrderId],
    queryFn: () => api.get(`/customer-orders/${fromOrderId}`),
    enabled: !!fromOrderId,
  });

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('draft');
  const [applicable, setApplicable] = useState(true);

  // Meta state
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState<string>('');
  const [sourceStoreId, setSourceStoreId] = useState<string | null>(null);
  const [sourceStoreLabel, setSourceStoreLabel] = useState<string>('');
  const [destinationStoreId, setDestinationStoreId] = useState<string | null>(null);
  const [destinationStoreLabel, setDestinationStoreLabel] = useState<string>('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [description, setDescription] = useState('');
  // «Накладные расходы» — inter-warehouse transfer cost capitalised into
  // the destination landed cost (§65, mirrors Приёмка/Оприходование).
  const [overheadMajor, setOverheadMajor] = useState('');
  const [overheadDistribution, setOverheadDistribution] = useState<
    'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY'
  >('WEIGHT');

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'org'
    | 'sourceStore'
    | 'destStore'
    | 'project'
    // «Добавить из справочника» — the catalog modal in APPEND mode (each pick
    // lands as a new position row; moysklad opens «Выбор товара» directly).
    | 'catalogAdd'
    | { kind: 'product'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from the user's «Значения по умолчанию» (moysklad applies the user
  // defaults to every new document). Организация=default with a first-item
  // fallback; Склад-откуда=defaultStore (the "from" store, inline-fetch picker so
  // default-only); Проект=defaultProject. The destination store is left for the
  // user to choose. Skipped when pre-filling from a customer order — the order's
  // own values win (mirrors the sales-returns ?fromDemand skip).
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current || fromOrderId) return;
    if (!orgsData || userDefaults.isLoading) return;
    defaultsAppliedRef.current = true;
    const us = userDefaults.data;
    if (!organizationId) {
      if (us?.defaultCompany) {
        setOrganizationId(us.defaultCompany.id);
        setOrganizationLabel(us.defaultCompany.name);
      } else if (orgsData.items[0]) {
        setOrganizationId(orgsData.items[0].id);
        setOrganizationLabel(orgsData.items[0].name);
      }
    }
    if (!sourceStoreId && us?.defaultStore) {
      setSourceStoreId(us.defaultStore.id);
      setSourceStoreLabel(us.defaultStore.name);
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    orgsData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    sourceStoreId,
    projectId,
    fromOrderId,
  ]);

  // Pre-fill from a customer order when loaded (applied once via a ref guard).
  // A move FROM a customer order = move the ordered goods: org + source store
  // come from the order; positions copy assortment/label/uom/quantity. The
  // destination store is left for the user.
  const fromOrderAppliedRef = useRef(false);
  useEffect(() => {
    if (fromOrderAppliedRef.current || !fromOrder) return;
    fromOrderAppliedRef.current = true;
    setOrganizationId(fromOrder.organization.id);
    setOrganizationLabel(fromOrder.organization.name);
    if (fromOrder.store) {
      setSourceStoreId(fromOrder.store.id);
      setSourceStoreLabel(fromOrder.store.name);
    }
    setPositions(
      fromOrder.positions.map((p) => ({
        id: uid(),
        assortmentId: p.assortmentId,
        productLabel: p.product?.name ?? '',
        productUom: p.product?.uom ?? null,
        quantity: p.quantity,
        priceMinor: '0',
        discount: '0',
        vat: '0',
        vatEnabled: false,
      })),
    );
  }, [fromOrder]);

  // Live stock for source store to warn shortages
  const assortmentIds = useMemo(
    () => positions.map((p) => p.assortmentId).filter((id): id is string => !!id),
    [positions],
  );
  const { data: stockData } = useQuery<{ items: Array<{ assortmentId: string; qty: string }> }>({
    queryKey: ['stocks', sourceStoreId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${sourceStoreId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!sourceStoreId && assortmentIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of stockData?.items ?? []) m.set(r.assortmentId, r.qty);
    return m;
  }, [stockData]);

  // «Остаток (на склад)» — live stock at the DESTINATION store (second grid
  // column; moysklad shows both legs side by side).
  const { data: destStockData } = useQuery<{
    items: Array<{ assortmentId: string; qty: string }>;
  }>({
    queryKey: ['stocks', destinationStoreId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${destinationStoreId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!destinationStoreId && assortmentIds.length > 0,
  });
  const destStockMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of destStockData?.items ?? []) m.set(r.assortmentId, r.qty);
    return m;
  }, [destStockData]);

  // Grid rows with both stock legs resolved (available = source, stock = dest).
  const tableRows = useMemo(
    () =>
      positions.map((p) => ({
        ...p,
        available: p.assortmentId && sourceStoreId ? stockMap.get(p.assortmentId) : undefined,
        stock: p.assortmentId && destinationStoreId ? destStockMap.get(p.assortmentId) : undefined,
      })),
    [positions, stockMap, destStockMap, sourceStoreId, destinationStoreId],
  );

  // «Итого» — Σ Цена × Кол-во (informational on /new; the BE re-snapshots the
  // real per-unit cost from source stock when the move posts).
  const totalMinor = useMemo(
    () =>
      positions.reduce(
        (acc, p) => acc + scaleMinorByQty(BigInt(p.priceMinor || '0'), p.quantity || '0'),
        0n,
      ),
    [positions],
  );

  // Append a picked product as a fresh position row — shared by the inline
  // typeahead («Добавить позицию») and the catalog modal («Добавить из
  // справочника»). Seeds Цена from the product's buy price. `entry` carries the
  // qty/price the user confirmed in the pick modal (inline bar only); returning
  // the new row's id hands focus to that row's «Кол-во» (modal → table entry
  // chain, owner 2026-07-18).
  const appendProduct = (
    item: { id: string; primary: unknown; raw?: unknown },
    entry?: { quantity: string; priceMinor: string },
  ) => {
    const raw = item.raw as ProductItem | undefined;
    const newId = uid();
    setPositions((ps) => [
      ...ps,
      {
        id: newId,
        assortmentId: item.id,
        productLabel: String(item.primary),
        productCode: raw?.code ?? undefined,
        productUom: raw?.uom ?? null,
        quantity: entry?.quantity ?? '1',
        priceMinor: entry?.priceMinor ?? raw?.buyPrice ?? '0',
        discount: '0',
        vat: '0',
        vatEnabled: false,
      },
    ]);
    return newId;
  };
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };
  // «Договорная цена» — spread the negotiated delta across the lines (mirrors
  // customer-orders/new). Internal transfer has no VAT — vatIncluded=false.
  const applyAgreement = useCallback((deltaMinor: bigint) => {
    setPositions((ps) => {
      const patch = distributeAgreementDelta(ps, deltaMinor, false);
      if (patch.size === 0) return ps;
      return ps.map((p) => {
        const next = patch.get(p.id);
        return next != null ? { ...p, priceMinor: next } : p;
      });
    });
  }, []);

  // moysklad «Печать» on a NEW move: silently save, then open the print form in
  // a NEW TAB — the flag lives on a ref so `createMut.onSuccess` knows whether
  // the save came from «Печать» (mirrors enters/new · 5fb75461).
  const afterSaveRef = useRef<'view' | 'print'>('view');
  // «Печать» — which form the save-first print should open once the move exists:
  // {view} = the standard print page (new tab), {form,templateId} = an account
  // custom form PDF (mirrors purchase-orders/new).
  const printTargetRef = useRef<{ kind: 'view' | 'form'; templateId?: string }>({
    kind: 'view',
  });
  // The account's own custom «Перемещение» print forms (moysklad «Печать» lists
  // them ABOVE the standard form). Empty on accounts with none configured.
  // Doc-scoped endpoint (/moves/print-forms) — gated on the DOC view permission, not
  // settings, so a cashier sees the pinned check buttons too (the shared
  // /print-templates listing is admin-only). Bare array, PO/new shape.
  const { data: printFormsData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['move-print-forms'],
    queryFn: () => api.get('/moves/print-forms'),
    staleTime: 60_000,
  });
  const printForms = printFormsData ?? [];
  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!sourceStoreId) throw new Error(tErrors('select_store'));
      if (!destinationStoreId) throw new Error(tErrors('select_store'));
      if (sourceStoreId === destinationStoreId) throw new Error(t('same_store_error'));
      // Owner 2026-07-08: «Проведено» has NO position precondition — an empty document may be saved/posted (BE allows it: 0 positions ⇒ 0 stock delta).
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tErrors('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tErrors('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        organizationId,
        sourceStoreId,
        destinationStoreId,
        ...(projectId ? { projectId } : {}),
        // Link back to the source order («Создать документ → Перемещение») so it
        // appears in that order's «Связанные документы».
        ...(fromOrderId ? { customerOrderId: fromOrderId } : {}),
        ...(externalCode ? { externalCode } : {}),
        description: description || undefined,
        ...(docNumber ? { name: docNumber } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        ...(Number(overheadMajor) > 0
          ? {
              overheadSumMinor: String(BigInt(Math.round(Number(overheadMajor) * 100))),
              overheadDistribution,
              overheadCurrency: 'UZS',
            }
          : {}),
        positions: positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
        })),
      };
      return api.post<{ id: string }>('/moves', payload);
    },
    onSuccess: (created) => {
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      // «Печать»: open the print form in a NEW TAB (user presses «Печать» there —
      // no auto-print), then land on the saved move's detail page.
      if (intent === 'print') {
        const target = printTargetRef.current;
        printTargetRef.current = { kind: 'view' };
        if (target.kind === 'form' && target.templateId) {
          // An account custom form → render its PDF and OPEN IT IN A NEW TAB
          // (moysklad «Открыть в браузере» — the user presses «Печать» there; NOT a
          // save-to-disk download).
          void api.postOpenInBrowser('/moves/bulk-print', {
            ids: [created.id],
            templateId: target.templateId,
          });
        } else {
          window.open(`/print/move/${created.id}`, '_blank');
        }
      }
      router.push(`/moves/${created.id}`);
    },
    onError: (err: Error) => {
      afterSaveRef.current = 'view';
      setError(err.message);
    },
  });

  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: ProductItem[] }>(
      `/products?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
      meta: p.uom ?? undefined,
      raw: p,
    }));
  };
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/stores?search=${encodeURIComponent(s)}`);
    return d.items.map((st) => ({ id: st.id, primary: st.name, secondary: st.code ?? undefined }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    // moysklad parity: a picked product's name LINKS to its product card (where the
    // «Аналоги» tab lives). Swapping moves to the row ⋮ «Заменить» (onReplace below).
    // Source/destination balances render as their own grid columns now — no
    // under-name stock line (owner screenshots 2026-07-14).
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <PositionNameCell
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
        productHref={href}
        onNavigate={href ? () => router.push(href) : undefined}
        testId={`pos-${p.id}-name`}
      />
    );
  };

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <DocumentMetaPanel compact>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('organization')} required>
                <CatalogPickerField
                  value={organizationId ? { id: organizationId, label: organizationLabel } : null}
                  onPick={() => setOpenPicker('org')}
                  inlineFetcher={orgFetcher}
                  onInlineSelect={(item) => {
                    setOrganizationId(item.id);
                    setOrganizationLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setOrganizationId(null);
                    setOrganizationLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={tFields('store_from')} required>
                <CatalogPickerField
                  value={sourceStoreId ? { id: sourceStoreId, label: sourceStoreLabel } : null}
                  onPick={() => setOpenPicker('sourceStore')}
                  inlineFetcher={storeFetcher}
                  onInlineSelect={(item) => {
                    setSourceStoreId(item.id);
                    setSourceStoreLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setSourceStoreId(null);
                    setSourceStoreLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tFields('store_to')} required>
                <CatalogPickerField
                  value={
                    destinationStoreId
                      ? { id: destinationStoreId, label: destinationStoreLabel }
                      : null
                  }
                  onPick={() => setOpenPicker('destStore')}
                  inlineFetcher={storeFetcher}
                  onInlineSelect={(item) => {
                    setDestinationStoreId(item.id);
                    setDestinationStoreLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setDestinationStoreId(null);
                    setDestinationStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>
            <DocumentMetaRow>
              <DocumentMetaField label={tFields('project')}>
                <CatalogPickerField
                  value={projectId ? { id: projectId, label: projectLabel } : null}
                  onPick={() => setOpenPicker('project')}
                  inlineFetcher={projectFetcher}
                  onInlineSelect={(item) => {
                    setProjectId(item.id);
                    setProjectLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setProjectId(null);
                    setProjectLabel('');
                  }}
                />
              </DocumentMetaField>
              <DocumentMetaField label={tDetailForm('external_code')}>
                <Input
                  value={externalCode}
                  onChange={(e) => setExternalCode(e.target.value)}
                  data-test-id="field-external-code"
                />
              </DocumentMetaField>
            </DocumentMetaRow>
          </DocumentMetaPanel>

          {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
              top-right corner (same spot in every section). */}
          <div className="-mb-2.5 flex justify-end">
            <PositionAgreementButton
              totalMinor={totalMinor}
              currency="UZS"
              labels={{
                button: tPos('agreement_button'),
                total: tPos('agreement_total'),
                amount: tPos('agreement_amount'),
                add: tPos('agreement_add'),
                subtract: tPos('agreement_subtract'),
                save: tPos('pick_modal_save'),
                cancel: tPos('pick_modal_cancel'),
              }}
              onApply={applyAgreement}
            />
          </div>

          <PositionTable
            columns={positionColumns}
            rows={tableRows}
            emptyText={tPos('empty')}
            onUpdate={(id, patch) => updatePosition(id, patch as Partial<NewPositionRow>)}
            onRemove={removePosition}
            onDuplicate={(id) => {
              const source = positions.find((p) => p.id === id);
              if (!source) return;
              setPositions((ps) => [...ps, { ...source, id: uid() }]);
            }}
            onReorder={(from, to) => {
              setPositions((ps) => {
                const next = ps.slice();
                const [moved] = next.splice(from, 1);
                if (moved) next.splice(to, 0, moved);
                return next;
              });
            }}
            renderNameCell={renderPositionNameCell}
            // moysklad row ⋮ «Заменить» — swap the line's product (the name is now a
            // card link, so swapping moves here). Opens the per-row product picker.
            onReplace={(id) => setOpenPicker({ kind: 'product', rowUid: id })}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            // moysklad-parity add-position bar (owner report 2026-07-14 band 3):
            // inline typeahead + «Добавить из справочника» + «Проверить
            // комплектацию» — replaces the old lone «+ Добавить позицию» button.
            footerToolbar={
              <PositionInlineAdd
                placeholder={tPos('addPositionPlaceholder')}
                addFromCatalogLabel={tPos('addFromCatalog')}
                checkCompletenessLabel={tPos('checkCompleteness')}
                // moysklad rich product dropdown: thumbnail · code · highlighted
                // name · «Доступно» badge; {items,total} feeds the «Ещё N» footer.
                onSearch={async (q) => {
                  const r = await api.get<{ items: ProductItem[]; total: number }>(
                    `/products?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return {
                    items: r.items.map((p) => ({
                      id: p.id,
                      primary: p.name,
                      code: p.code ?? undefined,
                      available: p.stock?.available != null ? Number(p.stock.available) : 0,
                      // Pick modal (owner 2026-07-18): reference «Цена» = the same
                      // default the row would get (buy-price seed on moves).
                      priceMinor: p.buyPrice ?? '0',
                      uomLabel: p.uom ?? undefined,
                      raw: p,
                    })),
                    total: r.total ?? r.items.length,
                  };
                }}
                sortAvailableLabel={tPos('sortByAvailable')}
                moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                createProductLabel={(qq) => tPos('createProductNamed', { query: qq })}
                onCreateProduct={() => router.push('/products/new')}
                // owner 2026-07-18: qty/price modal on EVERY product-add search
                // (was sales-only). No price-scope checkboxes here — writing a
                // permanent SALE price from a buy price would be wrong. Moves
                // carry no document currency — UZS-only.
                pickModal={{
                  currency: 'UZS',
                  permanentPriceOption: false,
                  labels: {
                    stock: tPos('pick_modal_stock'),
                    price: tPos('pick_modal_price'),
                    quantity: tPos('pick_modal_quantity'),
                    salePrice: tPos('pick_modal_sale_price'),
                    priceThisSale: tPos('pick_modal_price_this_sale'),
                    pricePermanent: tPos('pick_modal_price_permanent'),
                    save: tPos('pick_modal_save'),
                    cancel: tPos('pick_modal_cancel'),
                  },
                }}
                onPick={appendProduct}
                // «Добавить из справочника» — opens the product catalog modal
                // directly (moysklad opens «Выбор товара»); every pick appends a row.
                onAddFromCatalog={() => setOpenPicker('catalogAdd')}
                // «Проверить комплектацию» on an UNSAVED move — moysklad first asks
                // «Сохранение изменений: Данные были изменены. Сохранить изменения?»
                // (OK/Отмена); OK saves and lands on the detail page.
                onCheckCompleteness={async () => {
                  const ok = await confirm({
                    title: tUnsaved('title'),
                    description: `${tUnsaved('changed')} ${tUnsaved('question')}`,
                    confirmLabel: tUnsaved('ok'),
                    cancelLabel: tUnsaved('cancel'),
                    tone: 'warning',
                  });
                  if (ok === true) {
                    setError(null);
                    createMut.mutate();
                  }
                }}
                testId="move-position-add"
              />
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tFields('description')}
                rows={3}
                data-test-id="field-description"
              />
            </div>
            {/* moysklad move/new bottom-right block: bold «Итого» + the
                «Накладные расходы» input with its distribution select right
                under it (was wrongly a meta-panel row above the grid). */}
            <div className="flex min-w-[300px] flex-col gap-2 py-1">
              <div className="flex items-baseline justify-between gap-8 font-semibold text-base">
                <span>{tTotals('total')}:</span>
                <span className="text-xl tabular-nums" data-test-id="move-total">
                  {formatMoney(totalMinor, 'UZS', { displayAs: 'none' })}
                </span>
              </div>
              <hr className="border-[var(--ms-border-default)]" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--ms-text-primary)]">{tDetailForm('overhead_sum')}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={overheadMajor}
                  placeholder="0"
                  onChange={(e) => setOverheadMajor(e.target.value)}
                  className="w-24"
                  data-test-id="field-overhead-sum"
                />
                <NativeSelect
                  value={overheadDistribution}
                  onChange={(e) =>
                    setOverheadDistribution(
                      e.target.value as 'WEIGHT' | 'PRICE' | 'VOLUME' | 'QUANTITY',
                    )
                  }
                  data-test-id="field-overhead-distribution"
                  disabled={!(Number(overheadMajor) > 0)}
                  className="w-auto"
                >
                  <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                  <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                  <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                  <option value="QUANTITY">{tDetailForm('overhead_by_quantity')}</option>
                </NativeSelect>
              </div>
            </div>
          </div>

          <DocumentDisclosurePanel
            title={tForm('tasks_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_task')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('tasks_after_save_hint')}</p>
          </DocumentDisclosurePanel>

          <DocumentDisclosurePanel
            title={tForm('files_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_file')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('files_after_save_hint')}</p>
          </DocumentDisclosurePanel>
        </div>
      ),
    },
    {
      key: 'related',
      label: tDetailTabs('related'),
      content: (
        <p className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-6 text-center text-[var(--ms-text-muted)] text-sm">
          {t('related_empty')}
        </p>
      ),
    },
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="move-new-page"
        documentTypeLabel={tDetailTitles('move')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={status}
        statusOptions={STATUS_OPTIONS}
        onStatusChange={setStatus}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/moves')}
        // moysklad-parity: on a NEW «Перемещение» the toolbar dropdowns OPEN and
        // list their items (were dead/empty — owner report 2026-07-14 band 2).
        // A new doc has nothing to act on yet, so every actionable item SAVES the
        // move first, then lands on the detail page. Item sets ground-truthed on
        // #move/edit?new (owner screenshots): Изменить = Удалить(grey)+Копировать;
        // Печать = Перемещение · Комплект… · Настроить… · «Запросить форму» promo;
        // Отправить = Перемещение · Комплект…
        modifyMenu={[
          { label: tBulk('delete'), disabled: true, destructive: true },
          {
            label: tBulk('copy'),
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          },
        ]}
        // moysklad has NO «Создать документ» on a Перемещение /new (internal
        // transfer, no downstream docs) — hide the slot entirely.
        hideCreateDoc
        printMenu={[
          // moysklad «Печать»: the account's own custom forms first, then the
          // standard «Перемещение» below. Each form saves the move first (it
          // can't print before it exists), then renders its PDF into a new tab.
          ...printForms.map((f) => ({
            label: f.name,
            onClick: () => {
              printTargetRef.current = { kind: 'form' as const, templateId: f.id };
              afterSaveRef.current = 'print' as const;
              setError(null);
              createMut.mutate();
            },
          })),
          {
            // «Перемещение» — silently save, then open the print form in a NEW
            // TAB (user presses «Печать» there; no auto-print).
            label: tDetailTitles('move'),
            onClick: () => {
              printTargetRef.current = { kind: 'view' };
              setError(null);
              afterSaveRef.current = 'print';
              createMut.mutate();
            },
          },
          {
            label: tPrint('set'),
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          },
          {
            // «Настроить…» — open the print-template manager slide-over (no save).
            label: tPrint('configure'),
            onClick: () => openTemplates('move'),
          },
          {
            // «Запросить форму» — moysklad's non-interactive promo footer (mirrors
            // enters/new).
            testId: 'print-request-form',
            content: (
              <div className="mt-1 border-[var(--ms-border-default)] border-t px-2 pt-2 pb-1">
                <div className="font-semibold text-[13px] text-[var(--ms-text-primary)]">
                  {tPrint('request_form')}
                </div>
                <p className="mt-0.5 max-w-[230px] text-[11px] text-[var(--ms-text-muted)] leading-snug">
                  {tPrint('request_form_description')}
                </p>
                <button
                  type="button"
                  onClick={() => window.open('/help/moves', '_blank')}
                  className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1 text-[11px] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]"
                  data-test-id="print-request-form-btn"
                >
                  {tPrint('request_form_cta')}
                </button>
              </div>
            ),
          },
        ]}
        sendMenu={[tDetailTitles('move'), tPrint('set')].map((label) => ({
          label,
          onClick: () => {
            setError(null);
            createMut.mutate();
          },
        }))}
        // moysklad pins each configured custom print form as its OWN button right
        // after «Отправить». Each saves the move first, then renders that form's
        // PDF into a new tab. Mirror PO/new.
        trailingSlot={printForms.map((f) => (
          <Button
            key={f.id}
            type="button"
            variant="secondary"
            size="sm"
            // «Past ko'k» — check-print type buttons stand out in a soft blue
            // (brand-100 fill · brand-600 text · brand-300 border), matching
            // supplies/new. Owner request 2026-07-15/16.
            className="border-[var(--ms-brand-300)] bg-[var(--ms-brand-100)] text-[var(--ms-brand-600)] hover:bg-[var(--ms-brand-200)] hover:text-[var(--ms-brand-700)]"
            onClick={() => {
              printTargetRef.current = { kind: 'form', templateId: f.id };
              afterSaveRef.current = 'print';
              setError(null);
              createMut.mutate();
            }}
            data-test-id={`toolbar-print-form-${f.id}`}
          >
            <Icons.print className="h-4 w-4" />
            {f.name}
          </Button>
        ))}
        rightSlot={
          user ? (
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-[var(--ms-text-primary)]">{user.name}</div>
              <div className="text-[var(--ms-text-muted)]">
                {user.position ?? tDetailHeader('role_primary')}
              </div>
            </div>
          ) : null
        }
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tForm('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'sourceStore'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store_from')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setSourceStoreId(item.id);
          setSourceStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'destStore'}
        onClose={() => setOpenPicker(null)}
        title={tFields('store_to')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setDestinationStoreId(item.id);
          setDestinationStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tForm('project_picker_title')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setProjectId(item.id);
          setProjectLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'product'
        }
        onClose={() => setOpenPicker(null)}
        title={tForm('product_picker_title')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          const raw = (item as PickerItem & { raw?: ProductItem }).raw;
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productCode: raw?.code ?? undefined,
            productUom: raw?.uom ?? null,
            priceMinor: raw?.buyPrice ?? '0',
          });
        }}
      />
      {/* «Добавить из справочника» — the same product catalog modal in APPEND
          mode: each pick lands as a new position row (moysklad «Выбор товара»,
          owner report 2026-07-14 band 3). */}
      <CatalogPicker
        open={openPicker === 'catalogAdd'}
        onClose={() => setOpenPicker(null)}
        title={tForm('product_picker_title')}
        fetcher={productFetcher}
        onSelect={appendProduct}
      />
    </>
  );
}
