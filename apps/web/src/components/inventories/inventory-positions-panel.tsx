'use client';

/**
 * Инвентаризация positions block — moysklad 1:1 (owner report 2026-07-14 band 3,
 * user screenshots #inventoryaddresswarehouse/edit):
 *
 *   [Остатки по складу | Остатки по ячейке]  [Фильтр]  [Наименование, код или артикул]
 *   ── optional in-grid filter panel (Ячейка · Штрихкод · Наименование · Код ·
 *      Описание · Артикул · Группа товаров (без подгрупп) · Товар или группа ·
 *      Поставщик; Найти/Очистить + ⚙ field-visibility, NO 🔖) ──
 *   [☑] Наименование ▾ | (Ячейка) | Расчетный остаток ▾ | Фактический остаток |
 *       Разница | Цена | Избыток/недостача
 *   [Добавить позицию — введите…] [Добавить из справочника] [Дополнить из остатков]
 *       [Дополнить из номенклатуры]              ← saved DRAFT doc only
 *   «1-N из M» pagination · Комментарий textarea · Итого: <sum>
 *
 * Data: rows live in the PARENT (unsaved grid state — «Сохранить» persists,
 * mirrors moysklad). Enrichment (catalog fields for the filter, store balance,
 * per-unit cost, StockByCell rows) comes from POST /inventories/position-meta.
 * The two «Дополнить…» modals fetch candidate ids from
 * GET /inventories/fill-candidates and append rows CLIENT-SIDE.
 *
 * «Остатки по ячейке» — per-cell COUNTING surface (2026-08-22): InventoryPosition
 * now carries cellId/cell, so the cell tab's «Фактический» is editable on drafts.
 * Entering a value upserts a CELL row (assortmentId + cellId) into the parent
 * grid state; posting snapshots that cell's StockByCell as expected and aligns
 * Stock + StockByCell together (see InventoryService.post).
 *
 * Double-count guard: when the FIRST cell row appears for a product, its
 * UNTOUCHED (actual = 0) store-level row is dropped — otherwise post would
 * align the whole store balance to 0 alongside the cell rows. A store row the
 * operator explicitly counted (actual > 0) is kept — their call.
 */

import {
  ProductSelectModal,
  type ProductSelectRow,
} from '@/components/products/product-select-modal';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { api } from '@/lib/api-client';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  type DocPositionRow,
  DropdownMenu,
  Icons,
  InlineFilterPanel,
  Input,
  Modal,
  Pagination,
  type PickerItem,
  PositionInlineAdd,
  PositionTable,
  type PositionTableColumnConfig,
  StickyHScroll,
  Textarea,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

export interface InventoryPanelRow {
  /** Stable client uid (React key). */
  id: string;
  assortmentId: string;
  productLabel: string;
  productCode?: string;
  productUom?: string | null;
  /** «Фактический остаток» — the counter's entry (editable on drafts). */
  actualQty: string;
  /** Post-time snapshots (present on a POSTED doc — the grid renders these
   *  instead of live stock so the document stays historically true). */
  postedExpectedQty?: string;
  postedVarianceQty?: string;
  postedCostMinor?: string | null;
  /** «Ячейка» — set on a per-cell count row (the cell tab writes these);
   *  null/absent = store-level row (pre-cell behaviour unchanged). */
  cellId?: string | null;
  /** Denormalized cell label (survives cell deletion). */
  cell?: string | null;
}

interface MetaItem {
  assortmentId: string;
  name: string;
  code: string | null;
  article: string | null;
  description: string | null;
  uom: string | null;
  barcodes: string[];
  supplierId: string | null;
  supplierName: string | null;
  folderId: string | null;
  folderName: string | null;
  stockQty: string;
  unitCostMinor: string | null;
  cells: Array<{ cellId: string; name: string; qty: string }>;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
}

/** Nested node of GET /product-folders/tree (defensively typed). */
interface FolderNode {
  id: string;
  name: string;
  parentId?: string | null;
  children?: FolderNode[];
}

interface GridFilterValues {
  cell?: string;
  barcode?: string;
  name?: string;
  code?: string;
  description?: string;
  article?: string;
  folder?: string;
  productOrGroup?: { kind: 'product' | 'folder'; id: string; label: string } | null;
  supplierId?: string;
  supplierLabel?: string;
}

export interface InventoryPositionsPanelProps {
  /** 'new' — unsaved doc: no add-bar/fill buttons (moysklad shows them only on
   *  a saved doc); 'detail' — saved doc (add-bar on drafts). */
  mode: 'new' | 'detail';
  storeId: string | null;
  rows: InventoryPanelRow[];
  onRowsChange?: (rows: InventoryPanelRow[]) => void;
  /** Posted doc — grid read-only, values from posted* snapshots. */
  readOnly?: boolean;
  description: string;
  onDescriptionChange?: (v: string) => void;
  descriptionDisabled?: boolean;
  testId?: string;
}

const PAGE_SIZE = 100;

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)));
}

function fmtSigned(n: number): string {
  if (n > 0) return `+${fmtQty(n)}`;
  return fmtQty(n);
}

function contains(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? '').toLowerCase().includes(needle.trim().toLowerCase());
}

function flattenFolders(nodes: FolderNode[], acc: FolderNode[] = []): FolderNode[] {
  for (const n of nodes) {
    acc.push(n);
    if (n.children?.length) flattenFolders(n.children, acc);
  }
  return acc;
}

export function InventoryPositionsPanel({
  mode,
  storeId,
  rows,
  onRowsChange,
  readOnly,
  description,
  onDescriptionChange,
  descriptionDisabled,
  testId = 'inventory-positions-panel',
}: InventoryPositionsPanelProps) {
  const t = useTranslations('pages.inventories');
  const tPos = useTranslations('position_editor');
  const tPO = useTranslations('pages.purchase_orders');
  const tFilters = useTranslations('filters');
  const tCommon = useTranslations('common');
  const tProductSelect = useTranslations('product_select');
  const tTotals = useTranslations('list_totals');
  const router = useRouter();
  const qc = useQueryClient();

  const canEdit = mode === 'detail' && !readOnly && !!onRowsChange;

  const [tab, setTab] = useState<'store' | 'cell'>('store');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<GridFilterValues>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [withGroups, setWithGroups] = useState(false);
  const [lastSortKey, setLastSortKey] = useState<'name' | 'code'>('name');
  // ⚙ field-visibility of the in-grid filter (hidden-key set, persisted).
  const filterHidden = useColumnVisibility('inventory-grid-filter-hidden', []);

  // Modals
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [fillStockOpen, setFillStockOpen] = useState(false);
  const [fillStockSetActual, setFillStockSetActual] = useState(false);
  const [fillAssortOpen, setFillAssortOpen] = useState(false);
  const [fillAssortSetActual, setFillAssortSetActual] = useState(false);
  const [assortPick, setAssortPick] = useState<GridFilterValues['productOrGroup']>(null);
  const [fillBusy, setFillBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | 'productOrGroup' | 'supplier'>(null);

  // ---------------------------------------------------------------- meta
  const ids = useMemo(() => Array.from(new Set(rows.map((r) => r.assortmentId))), [rows]);
  const idsKey = useMemo(() => ids.slice().sort().join(','), [ids]);
  const metaQuery = useQuery<{ items: MetaItem[] }>({
    queryKey: ['inventory-position-meta', storeId, idsKey],
    queryFn: () =>
      api.post<{ items: MetaItem[] }>('/inventories/position-meta', {
        storeId,
        assortmentIds: ids,
      }),
    enabled: !!storeId && ids.length > 0,
  });
  const metaMap = useMemo(() => {
    const m = new Map<string, MetaItem>();
    for (const item of metaQuery.data?.items ?? []) m.set(item.assortmentId, item);
    return m;
  }, [metaQuery.data]);

  // Folder tree — subtree matching for «Товар или группа» + the fill-assortment
  // combobox. Fetched lazily (first time the filter panel / modal opens).
  const folderTreeQuery = useQuery<unknown>({
    queryKey: ['product-folders-tree'],
    queryFn: () => api.get('/product-folders/tree'),
    enabled: filterOpen || fillAssortOpen,
    staleTime: 60_000,
  });
  const flatFolders = useMemo(() => {
    const raw = folderTreeQuery.data as { items?: FolderNode[] } | FolderNode[] | undefined;
    const nodes = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return flattenFolders(nodes);
  }, [folderTreeQuery.data]);
  /** All folder ids inside `rootId`'s subtree (incl. itself). */
  const folderSubtree = useMemo(() => {
    return (rootId: string): Set<string> => {
      const children = new Map<string | null | undefined, string[]>();
      for (const f of flatFolders) {
        const list = children.get(f.parentId) ?? [];
        list.push(f.id);
        children.set(f.parentId, list);
      }
      const out = new Set<string>();
      const queue = [rootId];
      while (queue.length) {
        const cur = queue.pop();
        if (!cur || out.has(cur)) continue;
        out.add(cur);
        queue.push(...(children.get(cur) ?? []));
      }
      return out;
    };
  }, [flatFolders]);

  // Store-level rows drive the «Остатки по складу» grid; cell rows live only
  // on the «Остатки по ячейке» tab (one product may have MANY cell rows).
  const storeRows = useMemo(() => rows.filter((r) => !r.cellId), [rows]);
  const cellCountRows = useMemo(() => rows.filter((r) => !!r.cellId), [rows]);

  // ---------------------------------------------------------------- filter
  const rowPasses = useMemo(() => {
    const f = filterValues;
    const subtree = f.productOrGroup?.kind === 'folder' ? folderSubtree(f.productOrGroup.id) : null;
    return (r: InventoryPanelRow) => {
      const m = metaMap.get(r.assortmentId);
      const name = r.productLabel || m?.name || '';
      const code = r.productCode ?? m?.code ?? '';
      const article = m?.article ?? '';
      if (
        search &&
        !(contains(name, search) || contains(code, search) || contains(article, search))
      )
        return false;
      if (f.name && !contains(name, f.name)) return false;
      if (f.code && !contains(code, f.code)) return false;
      if (f.article && !contains(article, f.article)) return false;
      if (f.description && !contains(m?.description, f.description)) return false;
      if (f.barcode && !(m?.barcodes ?? []).some((b) => contains(b, f.barcode ?? ''))) return false;
      if (f.cell && !(m?.cells ?? []).some((c) => contains(c.name, f.cell ?? ''))) return false;
      // «Группа товаров (без подгрупп)» — matches the product's DIRECT folder only.
      if (f.folder && !contains(m?.folderName, f.folder)) return false;
      if (f.productOrGroup) {
        if (f.productOrGroup.kind === 'product' && r.assortmentId !== f.productOrGroup.id)
          return false;
        if (f.productOrGroup.kind === 'folder' && !(m?.folderId && subtree?.has(m.folderId)))
          return false;
      }
      if (f.supplierId && m?.supplierId !== f.supplierId) return false;
      return true;
    };
  }, [metaMap, filterValues, search, folderSubtree]);

  const filteredRows = useMemo(() => storeRows.filter(rowPasses), [storeRows, rowPasses]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // ---------------------------------------------------------------- derived
  const unitCostOf = useCallback(
    (r: InventoryPanelRow): number | null => {
      const m = metaMap.get(r.assortmentId);
      const raw = readOnly
        ? (r.postedCostMinor ?? m?.unitCostMinor ?? null)
        : (m?.unitCostMinor ?? null);
      return raw != null ? Number(raw) : null;
    },
    [metaMap, readOnly],
  );

  const totalMinor = useMemo(
    () =>
      rows.reduce((acc, r) => {
        const cost = unitCostOf(r);
        if (cost == null) return acc;
        return acc + Math.round(Number(r.actualQty || '0') * cost);
      }, 0),
    [rows, unitCostOf],
  );

  const tableRows: DocPositionRow[] = pagedRows.map((r) => {
    const m = metaMap.get(r.assortmentId);
    const calcNum = readOnly ? Number(r.postedExpectedQty ?? '0') : Number(m?.stockQty ?? '0');
    const actualNum = Number(r.actualQty || '0');
    const diffNum = readOnly ? Number(r.postedVarianceQty ?? '0') : actualNum - calcNum;
    const cost = unitCostOf(r);
    return {
      id: r.id,
      productLabel: r.productLabel || m?.name || '…',
      productCode: r.productCode ?? m?.code ?? undefined,
      productUom: r.productUom ?? m?.uom ?? null,
      quantity: r.actualQty,
      priceMinor: '0',
      discount: '0',
      vat: '',
      vatEnabled: false,
      available: fmtQty(calcNum),
      shipped: fmtSigned(diffNum),
      reserve: cost != null ? formatMoney(String(cost), 'UZS', { displayAs: 'none' }) : '—',
      waiting:
        cost != null
          ? `${diffNum > 0 ? '+' : diffNum < 0 ? '−' : ''}${formatMoney(String(Math.abs(Math.round(diffNum * cost))), 'UZS', { displayAs: 'none' })}`
          : '—',
    };
  });

  // «Остатки по ячейке» — per-cell COUNTING grid. One display row per
  // (product × cell): candidates come from StockByCell (position-meta) plus any
  // persisted cell rows whose cell no longer holds stock. `row` is the backing
  // InventoryPanelRow when the cell has been counted (else null = not counted).
  interface CellGridRow {
    key: string;
    assortmentId: string;
    name: string;
    productCode?: string;
    productUom?: string | null;
    cellId: string | null;
    cellName: string;
    calcQty: string;
    costMinor: number | null;
    row: InventoryPanelRow | null;
  }
  const cellRows = useMemo(() => {
    const out: CellGridRow[] = [];
    const byKey = new Map<string, InventoryPanelRow>();
    for (const r of cellCountRows) byKey.set(`${r.assortmentId}:${r.cellId}`, r);

    // Unique products across the WHOLE doc (a product counted only by cells has
    // no store row, so filteredRows alone would hide it).
    const seenProducts = new Map<string, InventoryPanelRow>();
    for (const r of rows) {
      if (!seenProducts.has(r.assortmentId) && rowPasses(r)) seenProducts.set(r.assortmentId, r);
    }

    for (const [assortmentId, r] of seenProducts) {
      const m = metaMap.get(assortmentId);
      const cost = unitCostOf(r);
      const name = r.productLabel || m?.name || '…';
      const consumed = new Set<string>();
      const cells = (m?.cells ?? []).filter(
        (c) => !filterValues.cell || contains(c.name, filterValues.cell),
      );
      for (const c of cells) {
        consumed.add(c.cellId);
        out.push({
          key: `${assortmentId}:${c.cellId}`,
          assortmentId,
          name,
          productCode: r.productCode ?? m?.code ?? undefined,
          productUom: r.productUom ?? m?.uom ?? null,
          cellId: c.cellId,
          cellName: c.name,
          calcQty: fmtQty(Number(c.qty)),
          costMinor: cost,
          row: byKey.get(`${assortmentId}:${c.cellId}`) ?? null,
        });
      }
      // Persisted cell rows outside the live StockByCell list (cell emptied or
      // deleted since counting) — still shown so the count isn't invisible.
      for (const cr of cellCountRows) {
        if (cr.assortmentId !== assortmentId || consumed.has(cr.cellId ?? '')) continue;
        if (filterValues.cell && !contains(cr.cell, filterValues.cell)) continue;
        out.push({
          key: `${assortmentId}:${cr.cellId}`,
          assortmentId,
          name,
          productCode: cr.productCode,
          productUom: cr.productUom,
          cellId: cr.cellId ?? null,
          cellName: cr.cell ?? '—',
          calcQty: readOnly ? fmtQty(Number(cr.postedExpectedQty ?? '0')) : '0',
          costMinor: cost,
          row: cr,
        });
      }
      // Product without a single cell — orientation row (not countable by cell).
      if (cells.length === 0 && !cellCountRows.some((cr) => cr.assortmentId === assortmentId)) {
        out.push({
          key: r.id,
          assortmentId,
          name,
          cellId: null,
          cellName: '—',
          calcQty: fmtQty(Number(m?.stockQty ?? '0')),
          costMinor: cost,
          row: null,
        });
      }
    }
    return out;
  }, [rows, cellCountRows, rowPasses, metaMap, filterValues.cell, unitCostOf, readOnly]);
  const pagedCellRows = cellRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  /**
   * Cell-tab «Фактический» editor: '' clears the count (row removed), any value
   * upserts the (product × cell) row. Creating the FIRST cell row for a product
   * drops its untouched (actual = 0) store-level row — otherwise post would
   * align the whole store balance to 0 alongside the cell counts.
   */
  const setCellActual = (g: CellGridRow, value: string) => {
    if (!onRowsChange || !g.cellId) return;
    const idx = rows.findIndex((r) => r.assortmentId === g.assortmentId && r.cellId === g.cellId);
    const next = [...rows];
    if (value === '') {
      if (idx >= 0) next.splice(idx, 1);
    } else if (idx >= 0) {
      next[idx] = { ...next[idx], actualQty: value };
    } else {
      next.push({
        id: uid(),
        assortmentId: g.assortmentId,
        productLabel: g.name,
        productCode: g.productCode,
        productUom: g.productUom,
        actualQty: value,
        cellId: g.cellId,
        cell: g.cellName,
      });
      const sIdx = next.findIndex(
        (r) => r.assortmentId === g.assortmentId && !r.cellId && Number(r.actualQty || '0') === 0,
      );
      if (sIdx >= 0) next.splice(sIdx, 1);
    }
    onRowsChange(next);
  };

  // ---------------------------------------------------------------- actions
  const appendRows = (additions: InventoryPanelRow[]) => {
    if (!onRowsChange || additions.length === 0) return;
    onRowsChange([...rows, ...additions]);
  };

  const appendPicked = (
    item: { id: string; primary: string; raw?: unknown },
    entry?: { quantity: string; priceMinor: string },
  ) => {
    // One line per product — on a duplicate pick return the EXISTING row's id
    // so focus still lands on its «Кол-во» (nothing is appended or changed).
    const existing = rows.find((r) => r.assortmentId === item.id);
    if (existing) return existing.id;
    const raw = item.raw as ProductItem | undefined;
    const newId = uid();
    appendRows([
      {
        id: newId,
        assortmentId: item.id,
        productLabel: item.primary,
        productCode: raw?.code ?? undefined,
        productUom: raw?.uom ?? null,
        actualQty: entry?.quantity ?? '0',
      },
    ]);
    // owner 2026-07-18: returning the id hands focus to the new row's
    // «Кол-во» (modal → table entry chain).
    return newId;
  };

  const appendCandidates = (
    items: Array<{ assortmentId: string; qty: string }>,
    setActual: boolean,
  ) => {
    const present = new Set(rows.map((r) => r.assortmentId));
    appendRows(
      items
        .filter((i) => !present.has(i.assortmentId))
        .map((i) => ({
          id: uid(),
          assortmentId: i.assortmentId,
          productLabel: '',
          actualQty: setActual && Number(i.qty) > 0 ? i.qty : '0',
        })),
    );
  };

  const runFill = async (source: 'stock' | 'assortment', setActual: boolean) => {
    if (!storeId) return;
    setFillBusy(true);
    try {
      const params = new URLSearchParams({ storeId, source });
      if (source === 'assortment' && assortPick) {
        if (assortPick.kind === 'product') params.set('productId', assortPick.id);
        else params.set('folderId', assortPick.id);
      }
      const res = await api.get<{ items: Array<{ assortmentId: string; qty: string }> }>(
        `/inventories/fill-candidates?${params.toString()}`,
      );
      appendCandidates(res.items, setActual);
      setFillStockOpen(false);
      setFillAssortOpen(false);
      setAssortPick(null);
    } finally {
      setFillBusy(false);
    }
  };

  const sortRows = (by: 'name' | 'code', grouped = withGroups) => {
    if (!onRowsChange) return;
    setLastSortKey(by);
    const keyOf = (r: InventoryPanelRow) => {
      const m = metaMap.get(r.assortmentId);
      return by === 'name'
        ? (r.productLabel || m?.name || '').toLowerCase()
        : (r.productCode ?? m?.code ?? '').toLowerCase();
    };
    const groupOf = (r: InventoryPanelRow) =>
      (metaMap.get(r.assortmentId)?.folderName ?? '').toLowerCase();
    onRowsChange(
      [...rows].sort((a, b) => {
        if (grouped) {
          const g = groupOf(a).localeCompare(groupOf(b), 'ru');
          if (g !== 0) return g;
        }
        return keyOf(a).localeCompare(keyOf(b), 'ru');
      }),
    );
  };

  // ---------------------------------------------------------------- fetchers
  const productSearch = async (q: string) => {
    const r = await api.get<{ items: ProductItem[]; total: number }>(
      `/products?search=${encodeURIComponent(q)}&limit=20`,
    );
    return {
      items: r.items.map((p) => ({
        id: p.id,
        primary: p.name,
        code: p.code ?? undefined,
        available: p.stock?.available != null ? Number(p.stock.available) : 0,
        // Pick modal (owner 2026-07-18): reference «Цена» = the same default
        // the row would get (inventory rows carry no price — always 0).
        priceMinor: '0',
        uomLabel: p.uom ?? undefined,
        raw: p,
      })),
      total: r.total ?? r.items.length,
    };
  };

  // «Товар или папка» — folders first (client-filtered from the tree), then products.
  const productOrFolderFetcher = async (q: string): Promise<PickerItem[]> => {
    const [prods] = await Promise.all([
      api.get<{ items: ProductItem[] }>(`/products?search=${encodeURIComponent(q)}&limit=15`),
    ]);
    const folderHits = flatFolders
      .filter((f) => contains(f.name, q))
      .slice(0, 10)
      .map((f) => ({ id: `folder:${f.id}`, primary: f.name, secondary: tPO('filter_product') }));
    return [
      ...folderHits,
      ...prods.items.map((p) => ({
        id: `product:${p.id}`,
        primary: p.name,
        secondary: p.code ?? undefined,
      })),
    ];
  };
  const decodePick = (item: PickerItem): GridFilterValues['productOrGroup'] => {
    const [kind, ...rest] = String(item.id).split(':');
    return {
      kind: kind === 'folder' ? 'folder' : 'product',
      id: rest.join(':'),
      label: String(item.primary),
    };
  };

  const supplierFetcher = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  // ---------------------------------------------------------------- header nodes
  const calcHeader = (
    <DropdownMenu
      align="start"
      testId="inventory-calc-menu"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-[var(--ms-text-brand)] hover:underline focus:outline-none"
          data-test-id="inventory-calc-menu-trigger"
        >
          {t('calc_stock')}
          <Icons.down className="h-3 w-3" aria-hidden />
        </button>
      }
    >
      <DropdownMenu.Item
        onSelect={() => {
          // «Пересчитать» — re-read the live store balances (meta refetch).
          qc.invalidateQueries({ queryKey: ['inventory-position-meta'] });
        }}
        testId="inventory-calc-recalculate"
      >
        {t('recalculate')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );

  const columns: PositionTableColumnConfig[] = [
    { key: 'select' },
    { key: 'name', label: t('filter_name') },
    { key: 'available', label: calcHeader, width: '150px' },
    { key: 'quantity', label: t('actual_stock'), width: '170px' },
    { key: 'shipped', label: t('diff_qty'), width: '110px' },
    { key: 'reserve', label: t('price_col'), width: '130px' },
    { key: 'waiting', label: t('surplus_shortage'), width: '160px' },
  ];

  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      hideBookmark
      fieldVisibility={{
        hidden: filterHidden.visibleKeys,
        onToggle: (k) => {
          const next = new Set(filterHidden.visibleKeys);
          if (next.has(k)) next.delete(k);
          else next.add(k);
          filterHidden.setVisibleKeys(next);
        },
      }}
      onClear={() => {
        setFilterValues({});
        setPage(0);
      }}
      testId="inventory-grid-filter"
    >
      <InlineFilterPanel.Field label={t('filter_cell')} fieldKey="cell" expandable={false}>
        <Input
          value={filterValues.cell ?? ''}
          onChange={(e) => {
            setFilterValues({ ...filterValues, cell: e.target.value || undefined });
            setPage(0);
          }}
          data-test-id="grid-filter-cell"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={t('filter_barcode')} fieldKey="barcode" expandable={false}>
        <Input
          value={filterValues.barcode ?? ''}
          onChange={(e) => {
            setFilterValues({ ...filterValues, barcode: e.target.value || undefined });
            setPage(0);
          }}
          data-test-id="grid-filter-barcode"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={t('filter_name')} fieldKey="name" expandable={false}>
        <Input
          value={filterValues.name ?? ''}
          onChange={(e) => {
            setFilterValues({ ...filterValues, name: e.target.value || undefined });
            setPage(0);
          }}
          data-test-id="grid-filter-name"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={t('filter_code')} fieldKey="code" expandable={false}>
        <Input
          value={filterValues.code ?? ''}
          onChange={(e) => {
            setFilterValues({ ...filterValues, code: e.target.value || undefined });
            setPage(0);
          }}
          data-test-id="grid-filter-code"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field
        label={t('filter_description')}
        fieldKey="description"
        expandable={false}
      >
        <Input
          value={filterValues.description ?? ''}
          onChange={(e) => {
            setFilterValues({ ...filterValues, description: e.target.value || undefined });
            setPage(0);
          }}
          data-test-id="grid-filter-description"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={t('filter_article')} fieldKey="article" expandable={false}>
        <Input
          value={filterValues.article ?? ''}
          onChange={(e) => {
            setFilterValues({ ...filterValues, article: e.target.value || undefined });
            setPage(0);
          }}
          data-test-id="grid-filter-article"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={t('filter_folder')} fieldKey="folder" expandable={false}>
        <Input
          value={filterValues.folder ?? ''}
          onChange={(e) => {
            setFilterValues({ ...filterValues, folder: e.target.value || undefined });
            setPage(0);
          }}
          data-test-id="grid-filter-folder"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={tPO('filter_product')} fieldKey="productOrGroup">
        <CatalogPickerField
          value={
            filterValues.productOrGroup
              ? {
                  id: `${filterValues.productOrGroup.kind}:${filterValues.productOrGroup.id}`,
                  label: filterValues.productOrGroup.label,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('productOrGroup')}
          inlineFetcher={productOrFolderFetcher}
          onInlineSelect={(item) => {
            setFilterValues({ ...filterValues, productOrGroup: decodePick(item) });
            setPage(0);
          }}
          onClear={() => {
            setFilterValues({ ...filterValues, productOrGroup: null });
            setPage(0);
          }}
          testId="grid-filter-product"
        />
      </InlineFilterPanel.Field>
      <InlineFilterPanel.Field label={t('filter_supplier')} fieldKey="supplier">
        <CatalogPickerField
          value={
            filterValues.supplierId
              ? {
                  id: filterValues.supplierId,
                  label: filterValues.supplierLabel ?? filterValues.supplierId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('supplier')}
          inlineFetcher={supplierFetcher}
          onInlineSelect={(item) => {
            setFilterValues({
              ...filterValues,
              supplierId: item.id,
              supplierLabel: String(item.primary),
            });
            setPage(0);
          }}
          onClear={() => {
            setFilterValues({ ...filterValues, supplierId: undefined, supplierLabel: undefined });
            setPage(0);
          }}
          testId="grid-filter-supplier"
        />
      </InlineFilterPanel.Field>
    </InlineFilterPanel>
  );

  const addBar = canEdit ? (
    <PositionInlineAdd
      placeholder={tPos('addPositionPlaceholder')}
      addFromCatalogLabel={tPos('addFromCatalog')}
      onSearch={productSearch}
      sortAvailableLabel={tPos('sortByAvailable')}
      moreItemsLabel={(n) => tPos('moreItems', { count: n })}
      createProductLabel={(q) => tPos('createProductNamed', { query: q })}
      onCreateProduct={() => router.push('/products/new')}
      // owner 2026-07-18: qty/price modal on EVERY product-add search
      // (was sales-only). No price-scope checkboxes here — writing a
      // permanent SALE price from an inventory doc would be wrong.
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
      onPick={appendPicked}
      onAddFromCatalog={() => setCatalogOpen(true)}
      extraActions={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFillStockOpen(true)}
            data-test-id="fill-from-stock"
          >
            {t('fill_from_stock')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFillAssortOpen(true)}
            data-test-id="fill-from-assortment"
          >
            {t('fill_from_assortment')}
          </Button>
        </>
      }
      testId="inventory-position-add"
    />
  ) : undefined;

  const paginationNode = (
    <Pagination
      moyskladStyle
      total={tab === 'store' ? filteredRows.length : cellRows.length}
      limit={PAGE_SIZE}
      visibleCount={tab === 'store' ? pagedRows.length : pagedCellRows.length}
      offset={safePage * PAGE_SIZE}
      hasPrevious={safePage > 0}
      hasNext={
        (safePage + 1) * PAGE_SIZE < (tab === 'store' ? filteredRows.length : cellRows.length)
      }
      onPrevious={() => setPage((p) => Math.max(0, p - 1))}
      onNext={() => setPage((p) => p + 1)}
      onFirst={() => setPage(0)}
      onLast={() => setPage(pageCount - 1)}
    />
  );

  return (
    <div className="flex flex-col gap-3" data-test-id={testId}>
      {/* ── [Остатки по складу | Остатки по ячейке] [Фильтр] [search] ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'store'}
            onClick={() => {
              setTab('store');
              setPage(0);
            }}
            className={`rounded-l-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-1 text-sm ${
              tab === 'store'
                ? 'border-[var(--ms-border-strong)] bg-[var(--ms-bg-muted)] font-medium'
                : 'bg-[var(--ms-bg-surface)] hover:bg-[var(--ms-bg-hover)]'
            }`}
            data-test-id="inventory-tab-store"
          >
            {t('stock_by_store')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'cell'}
            onClick={() => {
              setTab('cell');
              setPage(0);
            }}
            className={`-ml-px rounded-r-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-1 text-sm ${
              tab === 'cell'
                ? 'border-[var(--ms-border-strong)] bg-[var(--ms-bg-muted)] font-medium'
                : 'bg-[var(--ms-bg-surface)] hover:bg-[var(--ms-bg-hover)]'
            }`}
            data-test-id="inventory-tab-cell"
          >
            {t('stock_by_cell')}
          </button>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setFilterOpen((v) => !v)}
          className={filterOpen ? 'bg-[var(--ms-bg-muted)]' : undefined}
          data-test-id="inventory-grid-filter-toggle"
        >
          {tFilters('trigger')}
        </Button>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={t('grid_search_placeholder')}
          className="w-64"
          data-test-id="inventory-grid-search"
        />
      </div>

      {filterPanel}

      {/* ── grid ── */}
      {tab === 'store' ? (
        <PositionTable
          columns={columns}
          rows={tableRows}
          emptyText=""
          readOnly={!canEdit}
          onUpdate={(id, patch) => {
            if (!canEdit || !onRowsChange) return;
            if (patch.quantity === undefined) return;
            onRowsChange(
              rows.map((r) => (r.id === id ? { ...r, actualQty: patch.quantity ?? '0' } : r)),
            );
          }}
          onRemove={(id) => {
            if (!canEdit || !onRowsChange) return;
            onRowsChange(rows.filter((r) => r.id !== id));
          }}
          renderNameCell={(row) => {
            const src = rows.find((r) => r.id === row.id);
            return (
              <a
                href={src ? `/products/${src.assortmentId}` : '#'}
                className="text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {row.productLabel}
              </a>
            );
          }}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onSortPositions={canEdit ? (by) => sortRows(by) : undefined}
          sortByNameLabel={t('sort_by_name')}
          sortByCodeLabel={t('sort_by_code')}
          withGroups={withGroups}
          onWithGroupsChange={
            canEdit
              ? (v) => {
                  setWithGroups(v);
                  sortRows(lastSortKey, v);
                }
              : undefined
          }
          withGroupsLabel={t('with_groups')}
          footerToolbar={addBar}
        />
      ) : (
        <StickyHScroll>
          <table className="w-full text-sm" data-test-id="inventory-cell-table">
            <thead>
              <tr className="border-[var(--ms-border-default)] border-b text-left text-[var(--ms-text-muted)] text-xs">
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 font-medium">{t('filter_name')}</th>
                <th className="w-40 px-2 py-2 font-medium">{t('filter_cell')}</th>
                <th className="w-36 px-2 py-2 text-right font-medium">{calcHeader}</th>
                <th className="w-40 px-2 py-2 text-right font-medium">{t('actual_stock')}</th>
                <th className="w-28 px-2 py-2 text-right font-medium">{t('diff_qty')}</th>
                <th className="w-32 px-2 py-2 text-right font-medium">{t('price_col')}</th>
                <th className="w-40 px-2 py-2 text-right font-medium">{t('surplus_shortage')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedCellRows.map((g) => {
                const counted = g.row != null;
                const calcNum =
                  readOnly && counted ? Number(g.row?.postedExpectedQty ?? '0') : Number(g.calcQty);
                const actualNum = counted ? Number(g.row?.actualQty || '0') : null;
                const diffNum = !counted
                  ? null
                  : readOnly
                    ? Number(g.row?.postedVarianceQty ?? '0')
                    : (actualNum ?? 0) - calcNum;
                const editable = canEdit && !!g.cellId;
                return (
                  <tr
                    key={g.key}
                    className="border-[var(--ms-border-default)] border-b last:border-0"
                  >
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5">{g.name}</td>
                    <td className="px-2 py-1.5">{g.cellName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(calcNum)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {editable ? (
                        <Input
                          value={g.row?.actualQty ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            // actualQty schema: ^\d+(\.\d{1,6})?$ — reject other
                            // keystrokes early (trailing '.' normalized on save).
                            if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setCellActual(g, v);
                          }}
                          inputMode="decimal"
                          className="ml-auto h-7 w-24 text-right"
                          data-test-id="inventory-cell-actual"
                        />
                      ) : counted ? (
                        <span className="tabular-nums">{fmtQty(actualNum ?? 0)}</span>
                      ) : (
                        <span className="text-[var(--ms-text-muted)]">—</span>
                      )}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${
                        diffNum == null ? 'text-[var(--ms-text-muted)]' : ''
                      }`}
                    >
                      {diffNum == null ? '—' : fmtSigned(diffNum)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {g.costMinor != null
                        ? formatMoney(String(g.costMinor), 'UZS', { displayAs: 'none' })
                        : '—'}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${
                        diffNum == null ? 'text-[var(--ms-text-muted)]' : ''
                      }`}
                    >
                      {diffNum == null || g.costMinor == null
                        ? '—'
                        : `${diffNum > 0 ? '+' : diffNum < 0 ? '−' : ''}${formatMoney(
                            String(Math.abs(Math.round(diffNum * g.costMinor))),
                            'UZS',
                            { displayAs: 'none' },
                          )}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </StickyHScroll>
      )}

      {paginationNode}

      {/* ── Комментарий + Итого ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange?.(e.target.value)}
          placeholder={t('comment_placeholder')}
          rows={4}
          disabled={descriptionDisabled || !onDescriptionChange}
          data-test-id="inventory-grid-comment"
        />
        <div className="flex min-w-[280px] items-start justify-between gap-8 py-1 font-semibold text-base">
          <span>{tTotals('total')}:</span>
          <span className="text-xl tabular-nums" data-test-id="inventory-grid-total">
            {formatMoney(String(totalMinor), 'UZS', { displayAs: 'none' })}
          </span>
        </div>
      </div>

      {/* ── «Добавить из справочника» — moysklad «Выбор товара» ── */}
      <ProductSelectModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        currency="UZS"
        labels={{
          title: tProductSelect('title'),
          create: tProductSelect('create'),
          filter: {
            toggle: tFilters('trigger'),
            kind: tFilters('product_kind'),
            kindOptions: [
              { value: '', label: tCommon('all') },
              { value: 'product', label: tFilters('kind_product') },
              { value: 'service', label: tFilters('kind_service') },
              { value: 'bundle', label: tFilters('kind_bundle') },
            ],
            show: tFilters('show'),
            showOptions: [
              { value: 'active', label: tFilters('show_regular') },
              { value: 'archived', label: tFilters('show_archived') },
              { value: 'all', label: tCommon('all') },
            ],
            barcode: tFilters('barcode'),
            belowMinimum: tFilters('below_minimum'),
            belowMinimumOptions: [
              { value: '', label: tCommon('all') },
              { value: 'true', label: tCommon('yes') },
              { value: 'false', label: tCommon('no') },
            ],
            reset: tCommon('clear'),
            description: tFilters('description'),
            article: tFilters('article'),
            code: tFilters('code'),
            externalCode: tFilters('external_code'),
            supplier: tFilters('supplier'),
            supplierPlaceholder: tFilters('supplier'),
            stock: tFilters('stock'),
            stockOptions: [
              { value: 'any', label: tFilters('stock_any') },
              { value: 'positive', label: tFilters('stock_positive') },
              { value: 'nonzero', label: tFilters('stock_nonzero') },
              { value: 'zero', label: tFilters('stock_zero') },
              { value: 'negative', label: tFilters('stock_negative') },
            ],
            available: tFilters('available'),
            availableOptions: [
              { value: 'any', label: tFilters('avail_any') },
              { value: 'positive', label: tFilters('avail_positive') },
              { value: 'nonzero', label: tFilters('avail_nonzero') },
              { value: 'negative', label: tFilters('avail_negative') },
            ],
            onlyReserve: tFilters('only_reserve'),
            onlyIncoming: tFilters('only_incoming'),
            toggleOptions: [
              { value: '', label: tCommon('no') },
              { value: 'true', label: tCommon('yes') },
            ],
            weighed: tFilters('weighed'),
            weighedOptions: [
              { value: '', label: tCommon('all') },
              { value: 'false', label: tCommon('no') },
              { value: 'true', label: tCommon('yes') },
            ],
          },
          refresh: tProductSelect('refresh'),
          priceColumns: tProductSelect('priceColumns'),
          searchPlaceholder: tProductSelect('searchPlaceholder'),
          colName: tProductSelect('colName'),
          colQty: tProductSelect('colQty'),
          colOnHand: tProductSelect('colOnHand'),
          colReserved: tProductSelect('colReserved'),
          colInTransit: tProductSelect('colInTransit'),
          colAvailable: tProductSelect('colAvailable'),
          colCode: tProductSelect('colCode'),
          colArticle: tProductSelect('colArticle'),
          colUom: tProductSelect('colUom'),
          colPrice: tProductSelect('colPrice'),
          select: tProductSelect('select'),
          cancel: tProductSelect('cancel'),
          close: tProductSelect('close'),
          empty: tProductSelect('empty'),
          loading: tProductSelect('loading'),
        }}
        onCreate={() => router.push('/products/new')}
        onConfirm={(picked: Array<{ product: ProductSelectRow; quantity: string }>) => {
          const present = new Set(rows.map((r) => r.assortmentId));
          appendRows(
            picked
              .filter(({ product }) => !present.has(product.id))
              .map(({ product, quantity }) => ({
                id: uid(),
                assortmentId: product.id,
                productLabel: product.name,
                productCode: product.code ?? undefined,
                productUom: product.uom,
                actualQty: Number(quantity) > 0 ? quantity : '0',
              })),
          );
          setCatalogOpen(false);
        }}
      />

      {/* ── «Дополнить из остатков» ── */}
      <Modal
        open={fillStockOpen}
        onOpenChange={(open) => {
          setFillStockOpen(open);
          if (!open) setFillStockSetActual(false);
        }}
        title={t('positions_modal_title')}
        testId="fill-from-stock-modal"
        footer={
          <>
            <Button
              type="button"
              variant="success"
              size="sm"
              disabled={fillBusy}
              onClick={() => runFill('stock', fillStockSetActual)}
              data-test-id="fill-from-stock-confirm"
            >
              {t('fill_confirm')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFillStockOpen(false)}
            >
              {t('fill_cancel')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-4 py-3 text-sm">
          <p>{t('fill_stock_question')}</p>
          <label className="flex items-center gap-2">
            <span>{t('set_actual_stocks')}</span>
            <Checkbox
              checked={fillStockSetActual}
              onCheckedChange={(v) => setFillStockSetActual(Boolean(v))}
              data-test-id="fill-from-stock-set-actual"
            />
          </label>
        </div>
      </Modal>

      {/* ── «Дополнить из номенклатуры» ── */}
      <Modal
        open={fillAssortOpen}
        onOpenChange={(open) => {
          setFillAssortOpen(open);
          if (!open) {
            setFillAssortSetActual(false);
            setAssortPick(null);
          }
        }}
        title={t('positions_modal_title')}
        testId="fill-from-assortment-modal"
        footer={
          <>
            <Button
              type="button"
              variant="success"
              size="sm"
              disabled={fillBusy}
              onClick={() => runFill('assortment', fillAssortSetActual)}
              data-test-id="fill-from-assortment-confirm"
            >
              {t('fill_confirm')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFillAssortOpen(false)}
            >
              {t('fill_cancel')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-4 py-3 text-sm">
          <p className="max-w-[420px]">{t('assortment_hint')}</p>
          <div className="flex items-center gap-2">
            <span className="shrink-0">{t('product_or_folder')}</span>
            <div className="w-64">
              <CatalogPickerField
                value={
                  assortPick
                    ? { id: `${assortPick.kind}:${assortPick.id}`, label: assortPick.label }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('productOrGroup')}
                inlineFetcher={productOrFolderFetcher}
                onInlineSelect={(item) => setAssortPick(decodePick(item))}
                onClear={() => setAssortPick(null)}
                testId="fill-assortment-pick"
              />
            </div>
            <button
              type="button"
              onClick={() => router.push('/products/new')}
              className="font-semibold text-[var(--ms-text-brand)] text-lg leading-none hover:opacity-70"
              aria-label={tProductSelect('create')}
              title={tProductSelect('create')}
              data-test-id="fill-assortment-create"
            >
              +
            </button>
          </div>
          <label className="flex items-center gap-2">
            <span>{t('set_actual_stocks')}</span>
            <Checkbox
              checked={fillAssortSetActual}
              onCheckedChange={(v) => setFillAssortSetActual(Boolean(v))}
              data-test-id="fill-from-assortment-set-actual"
            />
          </label>
        </div>
      </Modal>

      {/* Chevron-modal fallbacks for the two combobox filter fields. */}
      <CatalogPicker
        open={pickerOpen === 'productOrGroup'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_product')}
        fetcher={productOrFolderFetcher}
        onSelect={(item) => {
          const decoded = decodePick(item);
          if (fillAssortOpen) setAssortPick(decoded);
          else {
            setFilterValues({ ...filterValues, productOrGroup: decoded });
            setPage(0);
          }
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'supplier'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_supplier')}
        fetcher={supplierFetcher}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            supplierId: item.id,
            supplierLabel: String(item.primary),
          });
          setPage(0);
        }}
      />
    </div>
  );
}
