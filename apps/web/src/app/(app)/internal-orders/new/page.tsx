'use client';

/**
 * /internal-orders/new — Yangi ichki buyurtma editor.
 *
 * Key differences vs. purchase-orders/new:
 *  - No agent (counterparty) — purely internal document
 *  - No bank account sub-line
 *  - No currency rate adjustment — fixed UZS
 *  - No discount column on positions
 *  - movedQuantity (fulfilled qty) is a read-only server field; irrelevant on create
 *  - deliveryPlannedMoment is date-only (no time component)
 *  - Positions: replace-all semantics on POST
 *
 * TOOLBAR (grounded on the user's live #internalorder/edit?new screenshots,
 * 2026-07-14): all four dropdowns OPEN with their moysklad item sets —
 *  «Изменить» = Удалить (disabled on /new) · Копировать;
 *  «Создать документ» = Перемещение · Заказ поставщику · Заказ поставщику
 *   (с учетом «доступно») · Снабжение (disabled — subsystem absent, mirrors
 *   customer-orders/new);
 *  «Печать» = Внутренний заказ · [account forms] ⎯ Комплект… ⎯ Настроить… ·
 *   «Запросить форму» promo footer;
 *  «Отправить» = Внутренний заказ ⎯ Комплект….
 * A new doc has nothing to act on yet, so every actionable item SAVES first
 * (afterSaveRef carries the intent), then lands on the right target.
 *
 * POSITIONS (grounded on the same screenshots): grid = ☑ · Наименование ▾ ·
 * Кол-во · Доступно · Цена ▾ · НДС · Сумма ⚙; the add bar = inline typeahead +
 * «Добавить из справочника» (full «Выбор товара» modal) + «Проверить
 * комплектацию» (save-confirm «Сохранение изменений» → completeness check).
 */

import { CompletenessCheckModal } from '@/components/documents/completeness-check-modal';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { ProductSelectModal } from '@/components/products/product-select-modal';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { imageRawUrl } from '@/lib/image-url';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { resolveDefaultSalePriceOrZero } from '@/lib/sale-price';
import { computePositionTotal } from '@moysklad/money';
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
  DocumentTotalsPanel,
  Icons,
  Input,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  useConfirm,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface RefItem {
  id: string;
  name: string;
  code?: string | null;
}

interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  uom: string | null;
  vat: number | null;
  mainImageId?: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  stock?: { onHand: string; reserved: string; inTransit: string; available: string };
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Per-line totals. No discount on InternalOrder — purely quantity × price.
 * BigInt-safe so page-level reduce stays exact.
 */
function computeLineTotal(
  p: NewPositionRow,
  vatIncluded: boolean,
): { net: bigint; vat: bigint; gross: bigint } {
  // Internal orders carry no discount — delegate to the shared canonical
  // `computePositionTotal` (discount fixed to 0) so the «Итого» footer agrees
  // with the per-row PositionTable cells + the stored total, and a fractional
  // «НДС» no longer throws a BigInt RangeError (the old `BigInt(Number(p.vat))`).
  try {
    const { totalMinor, vatAmountMinor, baseMinor } = computePositionTotal(
      {
        quantity: p.quantity || '0',
        priceMinor: p.priceMinor || '0',
        discount: '0',
        vat: p.vatEnabled && p.vat ? Number(p.vat) : null,
      },
      p.vatEnabled,
      vatIncluded,
    );
    return { net: baseMinor, vat: vatAmountMinor, gross: totalMinor };
  } catch {
    return { net: 0n, vat: 0n, gross: 0n };
  }
}

// moysklad #internalorder «Сумма ⚙» customizer — optional position columns.
// The grounded default grid (user screenshots 2026-07-14) shows: Наименование ·
// Кол-во · Доступно · Цена · НДС · Сумма; the ⚙ can reveal the rest.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: false },
  { key: 'code', labelKey: 'code', on: false },
  { key: 'article', labelKey: 'article', on: false },
  { key: 'unit', labelKey: 'unit', on: false },
  { key: 'available', labelKey: 'available', on: true },
  { key: 'vat', labelKey: 'vat', on: true },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

export default function NewInternalOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.internal_order');
  const totalsLabels = useTotalsLabels();
  const tErrors = useTranslations('errors');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.internal_order');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const tBulk = useTranslations('bulk_actions');
  const tPrint = useTranslations('print_menu');
  const tCheck = useTranslations('completeness_check');
  const tProductSelect = useTranslations('product_select');
  const tFilters = useTranslations('filters');
  const tCommon = useTranslations('common');
  const docEditorLabels = useDocumentEditorLabels();
  const { openTemplates } = usePrintTemplatesManager();
  const { confirm } = useConfirm();

  // moysklad internal-order FSM = draft / posted / cancelled (mirrors internal-orders/[id]).
  // Status is decorative on /new — moysklad's pill reads «Статус» (nothing picked).
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('');
  const [applicable, setApplicable] = useState(true);

  // Meta state — no agent, no contract, no bank account
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  // deliveryPlannedMoment: date-only (no time), nullable
  const [deliveryDate, setDeliveryDate] = useState('');
  const [description, setDescription] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [externalCodeVisible, setExternalCodeVisible] = useState(false);

  // VAT toggles — both «НДС» and «Цена включает НДС» default CHECKED on a new
  // moysklad internal order (user screenshots 2026-07-14).
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(true);

  // «Владелец» (owner/access) — defaults to the current user; department +
  // «Общий доступ» editable via the header popover (moysklad's «Файзуллоев Ф. ▾»).
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>(() => ({
    ownerId: user?.id ?? null,
    ownerLabel: user?.name ?? '',
    groupId: null,
    groupLabel: '',
    shared: false,
  }));

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  const [withGroups, setWithGroups] = useState(false);
  const [priceSortDir, setPriceSortDir] = useState<'asc' | 'desc' | null>(null);

  const [openPicker, setOpenPicker] = useState<
    null | 'org' | 'store' | 'project' | { kind: 'product'; rowUid: string }
  >(null);
  // «Добавить из справочника» — the full «Выбор товара» modal.
  const [productModalOpen, setProductModalOpen] = useState(false);
  // «Проверить комплектацию» — opens AFTER the save-confirm flow (savedIdRef
  // holds the freshly-created doc id the check writes back to / lands on).
  const [checkOpen, setCheckOpen] = useState(false);
  const savedIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the user's «Значения по умолчанию» once the reference lists +
  // settings settle (moysklad applies the user defaults to EVERY new document).
  // Stock doc — no counterparty; Организация/Склад fall back to the first list
  // item, Проект only from an explicit default.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || !storesData) return;
    if (userDefaults.isLoading) return;
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
    if (!storeId) {
      if (us?.defaultStore) {
        setStoreId(us.defaultStore.id);
        setStoreLabel(us.defaultStore.name);
      } else if (storesData.items[0]) {
        setStoreId(storesData.items[0].id);
        setStoreLabel(storesData.items[0].name);
      }
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    orgsData,
    storesData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    storeId,
    projectId,
  ]);

  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };

  // «Kelishuv» — spread the negotiated delta across the lines (owner 2026-07-17).
  const applyAgreement = useCallback(
    (deltaMinor: bigint) => {
      setPositions((ps) => {
        const patch = distributeAgreementDelta(ps, deltaMinor, vatIncluded);
        if (patch.size === 0) return ps;
        return ps.map((p) => {
          const next = patch.get(p.id);
          return next != null ? { ...p, priceMinor: next } : p;
        });
      });
    },
    [vatIncluded],
  );

  /** Build one position row from a /products item (typeahead pick, per-row
   *  swap and the «Выбор товара» modal all agree on the same mapping). */
  const rowFromProduct = (p: ProductItem, quantity = '1'): NewPositionRow => ({
    id: uid(),
    assortmentId: p.id,
    productLabel: p.name,
    productCode: p.code ?? undefined,
    productArticle: p.article ?? undefined,
    productUom: p.uom,
    quantity,
    // «Цена» is indicative on an internal order — default to the product's
    // default sale price (what the destination would restock at list price).
    priceMinor: resolveDefaultSalePriceOrZero(p.salePrices ?? null),
    discount: '0',
    vat: p.vat != null ? String(p.vat) : '0',
    vatEnabled: true,
    available: p.stock?.available,
    stock: p.stock?.onHand,
    imageUrl: p.mainImageId ? imageRawUrl(p.mainImageId) : undefined,
  });

  const totals = useMemo(
    () =>
      positions.reduce(
        (acc, p) => {
          const t = computeLineTotal(p, vatIncluded);
          return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
        },
        { net: 0n, vat: 0n, gross: 0n },
      ),
    [positions, vatIncluded],
  );

  // «Печать»/«Отправить» also list the account's own uploaded print forms
  // (moysklad shows them between the built-in form and Комплект…).
  const { data: printTemplatesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['print-templates-menu', 'internalorder'],
    queryFn: () => api.get('/print-templates?entity=internalorder&enabled=true&limit=100'),
    staleTime: 60_000,
  });
  const accountTemplates = printTemplatesData?.items ?? [];

  // moysklad toolbar actions on a NEW doc save first, then act — the intent
  // rides this ref into createMut.onSuccess (mirrors losses/enters/new).
  const afterSaveRef = useRef<
    'view' | 'print' | 'move' | 'po' | 'po-available' | 'check' | { templateId: string }
  >('view');

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!storeId) throw new Error(tErrors('select_store'));
      // Owner 2026-07-08: «Проведено» has NO position precondition — an empty document may be saved/posted (BE allows it: 0 positions ⇒ 0 stock delta).
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tErrors('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tErrors('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        organizationId,
        storeId,
        ...(projectId ? { projectId } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        ...(deliveryDate ? { deliveryPlannedMoment: deliveryDate } : {}),
        ...(docNumber ? { name: docNumber } : {}),
        ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
        ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
        ...(ownerAccess.shared ? { shared: true } : {}),
        applicable,
        currency: 'UZS',
        rateValue: '100000000',
        vatEnabled,
        vatIncluded,
        description: description || undefined,
        externalCode: externalCode || undefined,
        positions: positions.map((p, idx) => ({
          assortmentKind: 'product' as const,
          // biome-ignore lint/style/noNonNullAssertion: validated above — positions with no assortmentId throw before this
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          priceMinor: p.priceMinor || undefined,
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          // position index — 1-based, in submission order
          position: idx + 1,
        })),
      };
      return api.post<{ id: string }>('/internal-orders', payload);
    },
    onSuccess: (created) => {
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      if (intent === 'print') {
        // Open the print form in a NEW TAB (user presses «Печать» there — no
        // auto-print), then land on the saved order's detail page.
        window.open(`/print/internal-order/${created.id}`, '_blank');
      } else if (typeof intent === 'object') {
        // Account print form — render through bulk-print and open the PDF.
        void api.postOpenInBrowser('/internal-orders/bulk-print', {
          ids: [created.id],
          templateId: intent.templateId,
        });
      } else if (intent === 'move') {
        router.push(`/moves/new?fromInternalOrderId=${created.id}`);
        return;
      } else if (intent === 'po') {
        router.push(`/purchase-orders/new?fromInternalOrder=${created.id}`);
        return;
      } else if (intent === 'po-available') {
        router.push(`/purchase-orders/new?fromInternalOrder=${created.id}&availability=1`);
        return;
      } else if (intent === 'check') {
        // «Проверить комплектацию» — the doc is now saved (moysklad's
        // «Сохранение изменений» flow); open the check window in place.
        savedIdRef.current = created.id;
        setCheckOpen(true);
        return;
      }
      router.push(`/internal-orders/${created.id}`);
    },
    onError: (err: Error) => {
      afterSaveRef.current = 'view';
      setError(err.message);
    },
  });

  const saveWithIntent = (intent: typeof afterSaveRef.current) => {
    setError(null);
    afterSaveRef.current = intent;
    createMut.mutate();
  };

  // «Проверить комплектацию» on /new: prerequisites → moysklad's
  // «Сохранение изменений» confirm (user screenshot 2026-07-14: «Данные были
  // изменены. / Сохранить изменения?» OK/Отмена) → OK saves, then the check
  // window opens on the saved doc. Отмена = nothing happens.
  const handleCheckCompleteness = async () => {
    if (!storeId) {
      setError(t('select_store_first'));
      return;
    }
    if (positions.length === 0) {
      setError(t('add_position_first'));
      return;
    }
    setError(null);
    const ok = await confirm({
      title: tCheck('unsaved_title'),
      description: (
        <>
          <p>{tCheck('unsaved_body')}</p>
          <p className="mt-2">{tCheck('unsaved_question')}</p>
        </>
      ),
      confirmLabel: tCheck('ok'),
      cancelLabel: tCheck('unsaved_cancel'),
    });
    if (ok !== true) return;
    saveWithIntent('check');
  };

  // «Изменить текущий документ» inside the check — write the counted facts back
  // to the just-saved doc (PATCH with the fresh version), then land on detail.
  const applyCheckToDocument = async (updated: Array<{ id: string; quantity: string }>) => {
    const id = savedIdRef.current;
    if (!id) return;
    try {
      const doc = await api.get<{ version: number }>(`/internal-orders/${id}`);
      const qtyById = new Map(updated.map((u) => [u.id, u.quantity]));
      await api.patch(`/internal-orders/${id}`, {
        version: doc.version,
        positions: positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: rows were validated at save time
          assortmentId: p.assortmentId!,
          quantity: qtyById.get(p.id) ?? p.quantity,
          priceMinor: p.priceMinor || undefined,
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
        })),
      });
    } catch (e) {
      setCheckOpen(false);
      setError((e as Error).message);
      return;
    }
    setCheckOpen(false);
    router.push(`/internal-orders/${id}`);
  };

  const closeCheck = () => {
    setCheckOpen(false);
    const id = savedIdRef.current;
    // The doc was already saved by the confirm flow — land on its detail page.
    if (id) router.push(`/internal-orders/${id}`);
  };

  // Fetchers
  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({ id: o.id, primary: o.name }));
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

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    // moysklad parity: a picked product's name LINKS to its product card (where the
    // «Аналоги» tab lives). Swapping moves to the row ⋮ «Заменить» (onReplace below).
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

  // moysklad #internalorder position grid (grounded 2026-07-14): ☑ ·
  // Наименование ▾ · Кол-во · Доступно · Цена ▾ · НДС · Сумма ⚙. No № column.
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    if (colVisible.code) cols.push({ key: 'code', label: tCols('code') });
    if (colVisible.article) cols.push({ key: 'article', label: tCols('article') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
    // «Цена ▾» — brand-blue header button toggling a sort by price (mirrors losses).
    cols.push({
      key: 'price',
      label: (
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-0.5 text-[var(--ms-text-brand)] hover:underline focus:outline-none"
          onClick={() => {
            const dir = priceSortDir === 'asc' ? 'desc' : 'asc';
            setPriceSortDir(dir);
            setPositions((ps) =>
              [...ps].sort((a, b) => {
                const av = Number(a.priceMinor || '0');
                const bv = Number(b.priceMinor || '0');
                return dir === 'asc' ? av - bv : bv - av;
              }),
            );
          }}
          data-test-id="position-price-sort"
        >
          {tCols('price')}
          <Icons.down
            className={`h-3 w-3 transition-transform ${priceSortDir === 'asc' ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      ),
    });
    if (colVisible.vat) cols.push({ key: 'vat', label: tCols('vat') });
    cols.push({ key: 'amount', label: tCols('amount') });
    cols.push({
      key: 'menu',
      label: (
        <PositionColumnCustomizer
          options={OPTIONAL_POSITION_COLUMNS.map((c) => ({
            key: c.key,
            label: tCols(c.labelKey),
          }))}
          visible={colVisible}
          onToggle={(key, next) => setColVisible((v) => ({ ...v, [key]: next }))}
          ariaLabel={tCols('configure')}
        />
      ),
    });
    return cols;
  }, [colVisible, tCols, tPos, priceSortDir]);

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
              <DocumentMetaField label={t('destination_store')} required>
                <CatalogPickerField
                  value={storeId ? { id: storeId, label: storeLabel } : null}
                  onPick={() => setOpenPicker('store')}
                  inlineFetcher={storeFetcher}
                  onInlineSelect={(item) => {
                    setStoreId(item.id);
                    setStoreLabel(String(item.primary));
                  }}
                  onClear={() => {
                    setStoreId(null);
                    setStoreLabel('');
                  }}
                />
              </DocumentMetaField>
            </DocumentMetaRow>

            <DocumentMetaRow>
              <DocumentMetaField label={t('delivery_planned')}>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  data-test-id="field-delivery-date"
                />
              </DocumentMetaField>
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
            </DocumentMetaRow>
          </DocumentMetaPanel>

          {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
              top-right corner (same spot in every section). */}
          <div className="-mb-2.5 flex justify-end">
            <PositionAgreementButton
              totalMinor={totals.gross}
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
            emptyText=""
            rows={positions}
            onUpdate={(id, patch) => updatePosition(id, patch as Partial<NewPositionRow>)}
            onRemove={removePosition}
            onDuplicate={(id) => {
              const source = positions.find((p) => p.id === id);
              if (!source) return;
              setPositions((ps) => [...ps, { ...source, id: uid() }]);
            }}
            // moysklad «Наименование ▾» — sort the document's lines by name / code,
            // grouping by product folder first when «С учётом групп» is checked.
            onSortPositions={(by) =>
              setPositions((ps) => {
                const key = (p: NewPositionRow) =>
                  by === 'name' ? (p.productLabel ?? '') : (p.productCode ?? '');
                return [...ps].sort((a, b) => key(a).localeCompare(key(b), 'ru'));
              })
            }
            sortByNameLabel={tPos('sort_by_name')}
            sortByCodeLabel={tPos('sort_by_code')}
            withGroups={withGroups}
            onWithGroupsChange={setWithGroups}
            withGroupsLabel={tPos('sort_with_groups')}
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
            vatIncluded={vatIncluded}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            footerToolbar={
              <PositionInlineAdd
                placeholder={tPos('addPositionPlaceholder')}
                addFromCatalogLabel={tPos('addFromCatalog')}
                checkCompletenessLabel={tPos('checkCompleteness')}
                onSearch={async (q) => {
                  const r = await api.get<{ items: ProductItem[]; total: number }>(
                    `/products?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return {
                    items: r.items.map((p) => ({
                      id: p.id,
                      primary: p.name,
                      code: p.code ?? undefined,
                      available: Number(p.stock?.available ?? 0),
                      imageUrl: p.mainImageId ? imageRawUrl(p.mainImageId) : undefined,
                      // Pick modal (owner 2026-07-18): reference «Цена» = the same
                      // default the row would get (default sale price on internal orders).
                      priceMinor: resolveDefaultSalePriceOrZero(p.salePrices ?? null),
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
                // (was sales-only). No price-scope checkboxes here — an internal
                // order is a stock document, not a sales document.
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
                onPick={(item, entry) => {
                  const raw = item.raw as ProductItem | undefined;
                  if (!raw) return;
                  const row = rowFromProduct(raw, entry?.quantity ?? '1');
                  row.priceMinor = entry?.priceMinor ?? row.priceMinor;
                  setPositions((ps) => [...ps, row]);
                  // owner 2026-07-18: returning the id hands focus to the new
                  // row's «Кол-во» (modal → table entry chain).
                  return row.id;
                }}
                // «Добавить из справочника» — the full «Выбор товара» modal
                // (was: appended an empty row; user 2026-07-14 bug report).
                onAddFromCatalog={() => setProductModalOpen(true)}
                onCheckCompleteness={handleCheckCompleteness}
                testId="io-position-add"
              />
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tFields('description')}
                rows={3}
                data-test-id="field-description"
              />
              {externalCodeVisible ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="external-code" className="text-[var(--ms-text-muted)] text-sm">
                    {tDetailForm('external_code')}:
                  </label>
                  <Input
                    id="external-code"
                    type="text"
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                    className="flex-1"
                    data-test-id="field-external-code"
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setExternalCodeVisible(true)}
                  className="h-auto px-0 font-normal text-xs"
                  data-test-id="show-external-code"
                >
                  {tDetailForm('external_code')}
                </Button>
              )}
            </div>
            <DocumentTotalsPanel
              labels={totalsLabels}
              subtotalMinor={totals.net}
              vatMinor={totals.vat}
              totalMinor={totals.gross}
              currency="UZS"
              vatEnabled={vatEnabled}
              onVatEnabledChange={setVatEnabled}
              vatIncluded={vatIncluded}
              onVatIncludedChange={setVatIncluded}
              quantity={positions.reduce((acc, p) => acc + Number(p.quantity || '0'), 0)}
            />
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
        testId="internal-order-new-page"
        documentTypeLabel={tDetailTitles('internal_order')}
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
        onSave={() => saveWithIntent('view')}
        saving={createMut.isPending}
        onClose={() => router.push('/internal-orders')}
        // «Изменить» — moysklad #internalorder/edit?new (user screenshots
        // 2026-07-14): Удалить (greyed — nothing saved to delete) · Копировать
        // (saves first, then lands on detail where the clone action lives).
        modifyMenu={[
          { label: tBulk('delete'), disabled: true },
          { label: tBulk('copy'), onClick: () => saveWithIntent('view') },
        ]}
        // «Создать документ» — Перемещение · Заказ поставщику · Заказ поставщику
        // (с учетом «доступно») · Снабжение. Each saves first, then opens the
        // target /new pre-linked (?fromInternalOrder…). «Снабжение» is disabled —
        // no supply-planning subsystem yet (mirrors customer-orders/new).
        createDocMenu={[
          { label: tDetailTitles('move'), onClick: () => saveWithIntent('move') },
          { label: tDetailTitles('purchase_order'), onClick: () => saveWithIntent('po') },
          {
            label: tDetailTitles('po_with_available'),
            onClick: () => saveWithIntent('po-available'),
          },
          { label: tDetailTitles('supply_planning'), disabled: true },
        ]}
        // «Печать» — Внутренний заказ · [account forms] ⎯ Комплект… ⎯ Настроить… ·
        // «Запросить форму» promo footer (grounded item set, 2026-07-14).
        printMenu={[
          { label: tDetailTitles('internal_order'), onClick: () => saveWithIntent('print') },
          ...accountTemplates.map((tpl) => ({
            label: tpl.name,
            onClick: () => saveWithIntent({ templateId: tpl.id }),
          })),
          { divider: true },
          { label: tPrint('set'), onClick: () => saveWithIntent('view') },
          { divider: true },
          {
            // «Настроить…» — open the print-template manager slide-over (no save).
            label: tPrint('configure'),
            onClick: () => openTemplates('internalorder'),
          },
          {
            // «Запросить форму» — moysklad's non-interactive promo footer.
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
                  onClick={() => window.open('/help/internal-orders', '_blank')}
                  className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1 text-[11px] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]"
                  data-test-id="print-request-form-btn"
                >
                  {tPrint('request_form_cta')}
                </button>
              </div>
            ),
          },
        ]}
        // «Отправить» — Внутренний заказ ⎯ Комплект… (grounded item set).
        sendMenu={[
          { label: tDetailTitles('internal_order'), onClick: () => saveWithIntent('view') },
          { divider: true },
          { label: tPrint('set'), onClick: () => saveWithIntent('view') },
        ]}
        rightSlot={<OwnerAccessPopover value={ownerAccess} onChange={setOwnerAccess} />}
        error={error}
        onErrorRetry={() => saveWithIntent('view')}
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
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tForm('store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
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
          if (!raw) return;
          // «Заменить» keeps the row's quantity — only the product swaps.
          const { id: _id, quantity: _qty, ...patch } = rowFromProduct(raw);
          updatePosition(openPicker.rowUid, patch);
        }}
      />

      {/* «Добавить из справочника» — moysklad's full «Выбор товара» modal
          (folder tree + Фильтр + qty steppers + Выбрать). */}
      <ProductSelectModal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
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
        onConfirm={(rows) => {
          setPositions((ps) => [
            ...ps,
            ...rows.map(({ product, quantity }) =>
              rowFromProduct(
                {
                  id: product.id,
                  name: product.name,
                  code: product.code,
                  article: product.article,
                  uom: product.uom,
                  vat: product.vat,
                  mainImageId: product.mainImageId,
                  salePrices: product.salePrices,
                  stock: product.stock,
                } satisfies ProductItem,
                Number(quantity) > 0 ? quantity : '1',
              ),
            ),
          ]);
        }}
        onCreate={() => {
          setProductModalOpen(false);
          router.push('/products/new');
        }}
      />

      {/* «Проверить комплектацию» — opens after the save-confirm flow. */}
      <CompletenessCheckModal
        open={checkOpen}
        onClose={closeCheck}
        rows={positions
          .filter((p) => p.assortmentId)
          .map((p) => ({
            id: p.id,
            name: p.productLabel ?? '',
            code: p.productCode,
            article: p.productArticle,
            quantity: p.quantity,
          }))}
        labels={{
          title: tCheck('title'),
          scanPlaceholder: tPos('addPositionPlaceholder'),
          colName: tCheck('col_name'),
          colQty: tCheck('col_qty'),
          colFact: tCheck('col_fact'),
          colDiff: tCheck('col_diff'),
          colStatus: tCheck('col_status'),
          statusShort: tCheck('status_short'),
          statusOver: tCheck('status_over'),
          statusOk: tCheck('status_ok'),
          applyToDoc: tCheck('apply_to_doc'),
          accept: tCheck('accept'),
          cancel: tCheck('cancel'),
          notFound: tCheck('not_found'),
        }}
        onApplyToDocument={applyCheckToDocument}
        onAccept={closeCheck}
      />
    </>
  );
}
