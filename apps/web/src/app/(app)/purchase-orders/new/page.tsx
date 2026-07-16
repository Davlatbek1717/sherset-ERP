'use client';

/**
 * /purchase-orders/new — moysklad-parity «Заказ поставщику» editor.
 *
 * Built on the document-editor framework (DocumentEditor + Toolbar +
 * Header + MetaPanel + PositionTable + TotalsPanel + DisclosurePanel
 * + Tabs). For a brand-new document many toolbar dropdowns are empty
 * by design — the framework auto-disables them so the layout stays
 * stable. After save, the user is redirected to /purchase-orders/[id]
 * which mounts the same shell with all toolbar entries populated.
 */

import { CounterpartyBalanceInline } from '@/components/counterparty-balance-inline';
import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionDiscountMenu } from '@/components/documents/position-discount-menu';
import { PositionPriceMenu } from '@/components/documents/position-price-menu';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { computePositionTotal } from '@moysklad/money';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  type DocPositionRow,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaRow,
  DocumentTabs,
  DocumentTotalsPanel,
  Icons,
  Input,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
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
  // Buy price in minor units — the field /products actually returns is `buyPrice`
  // (NOT `buyPriceMinor`; the API has no such key), so reading the wrong name made
  // every picked line pre-fill its price as 0. Mirrors the detail page's ProductItem.
  buyPrice: string | null;
  vat: number | null;
  // moysklad position table shows the product's live stock cluster (Остаток /
  // Доступно) per row; /products returns it, we carry it onto the position.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  // Sale-price list, carried so the «Цена ▾» → «Расценить» menu can re-price a line.
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  // Product folder (denormalised pathName) — drives «Наименование ▾ → С учётом групп».
  productFolder?: { id: string; name: string; pathName: string } | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  folderPath?: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Per-line VAT-aware totals. Returns BigInt minor-unit values so the
 * page-level reduce stays exact (no Number rounding drift across
 * 2000-position docs).
 */
function computeLineTotal(
  p: NewPositionRow,
  vatIncluded: boolean,
): { net: bigint; vat: bigint; gross: bigint } {
  // Delegates to the shared `computePositionTotal` — the SAME single-round,
  // micro-tiyin discipline the API posts with — so the «Итого» footer agrees
  // with the per-row «Сумма» cells (PositionTable) and the stored document
  // total exactly (no FE↔BE rounding drift; a fractional «НДС» like 7.5 no
  // longer throws a BigInt RangeError mid-edit).
  try {
    const { totalMinor, vatAmountMinor, baseMinor } = computePositionTotal(
      {
        quantity: p.quantity || '0',
        priceMinor: p.priceMinor || '0',
        discount: p.discount || '0',
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

// moysklad «Заказ поставщику» position columns. Always-on (not in the ⚙
// customizer): Наименование · Кол-во · Цена · НДС · Скидка · Сумма. The rest
// toggle via the gear on the «Сумма» header. Live-grounded defaults
// (2026-06-20, climart old design — `docs/audits/po-new-live-groundtruth-2026-06-20.md`):
// Изображение · Единица измерения · Принято · Доступно ON; Остаток · Резерв ·
// Ожидание · Вес · Объем · Сумма НДС OFF. The `shipped` column key is moysklad's
// «Принято» (received qty) on inbound docs — labelled via the `received` i18n key
// (CO reuses the same key as «Отгружено»). Order mirrors the customizer popup.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: true },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'shipped', labelKey: 'received', on: true },
  { key: 'available', labelKey: 'available', on: true },
  { key: 'stock', labelKey: 'stock', on: false },
  { key: 'reserve', labelKey: 'reserve', on: false },
  { key: 'waiting', labelKey: 'waiting', on: false },
  { key: 'weight', labelKey: 'weight', on: false },
  { key: 'volume', labelKey: 'volume', on: false },
  { key: 'vatAmount', labelKey: 'vatAmount', on: false },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // «Создать → Заказ поставщику» off a customer order pre-fills this PO with the
  // order's products (so you can re-order them from a supplier). `fromOrder` may
  // be a CSV (multi-select) — pre-fill from the FIRST order. The supplier (agent)
  // is left empty — the CO's agent is the CUSTOMER, not the supplier.
  // `availability=1` («с учётом доступно») uses the /supply-shortfall basis:
  // only positions the order's store can't cover, quantity = shortfall.
  const fromOrderId = searchParams.get('fromOrder')?.split(',')[0] ?? null;
  const fromOrderAvailability = searchParams.get('availability') === '1';
  const { user } = useAuth();
  const t = useTranslations('pages.purchase_orders');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.purchase_order');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const tCommon = useTranslations('common');
  const docEditorLabels = useDocumentEditorLabels();

  // moysklad purchase-order FSM surfaces 3 manually-settable states:
  // draft / confirmed / cancelled (mirrors purchase-orders/[id]). The
  // status field is decorative on /new (not sent on create — the API
  // always creates a draft), so we surface the same three real states.
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'confirmed', label: tStates('confirmed'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  // Reference data — pre-fetched so the user picks open instantly.
  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });
  // Price types for the «Цена ▾» → «Расценить» (re-price by type) menu.
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
  });

  // Header state
  const [docNumber, setDocNumber] = useState('');
  // datetime-local format = "YYYY-MM-DDTHH:MM" (no seconds, no Z)
  // moysklad shows hujjat sanasi + vaqti bilan, masalan "10.05.2026 17:34"
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  // moysklad shows «Статус» (no status picked) on a new doc — custom workflow
  // statuses are user-defined per doc type («Настроить…» in the dropdown), not the
  // built-in draft/confirmed/cancelled. Default to none so the pill reads «Статус».
  const [status, setStatus] = useState<string>('');
  // moysklad «Проведено» (posted) defaults to CHECKED on a new purchase order
  // (DOM-verified live 2026-06-20) — the doc commits to stock/accounting on save.
  const [applicable, setApplicable] = useState(true);
  const [waiting, setWaiting] = useState(false);

  // Meta state
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  // Bank account is org-scoped — moysklad shows a sub-row under
  // Организация with the org's bank accounts (sum / USD / EUR ...).
  // Clearing the org also clears the picked bank account.
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [bankAccountLabel, setBankAccountLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [currency, setCurrency] = useState<string>('UZS');
  // User-overridable currency rate. When null, the account's справочник rate is
  // used. moysklad lets clerks override the rate for the specific document.
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateEditing, setRateEditing] = useState(false);

  // «Курс валюты документа» — the rate is the account's currency-справочник rate
  // (Настройки → Валюты), the SAME admin-set value moysklad books documents at.
  // NOT a live CB feed: that drifts from the admin rate (e.g. 11 990 vs 12 200),
  // so USD docs were stored at the wrong base-currency value. One source of
  // truth → GET /currencies (mirror enters / losses / payments-in).
  const { data: currenciesData } = useQuery<{ items: Array<{ isoCode: string; rate: string }> }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const adminRate = (currenciesData?.items ?? []).find((c) => c.isoCode === currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';
  const [description, setDescription] = useState('');

  // VAT toggles (totals panel). Both «НДС» and «Цена включает НДС» default to
  // CHECKED on a new moysklad purchase order (DOM-verified live 2026-06-20).
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(true);
  // External code = 1C / soliq.uz integration cross-reference. Hidden
  // by default in moysklad — appears as a link «Внешний код» under
  // the comment textarea that expands into an input on click.
  const [externalCode, setExternalCode] = useState('');
  const [externalCodeVisible, setExternalCodeVisible] = useState(false);

  // moysklad «Владелец» (owner/access) — a new doc defaults to the current user as
  // owner; department (groupId) + «Общий доступ» (shared) are editable via the
  // header owner popover. Sent on create (ownerId/groupId/shared), tenant-validated BE.
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>(() => ({
    ownerId: user?.id ?? null,
    ownerLabel: user?.name ?? '',
    groupId: null,
    groupLabel: '',
    shared: false,
  }));

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  // moysklad-parity: row checkboxes drive bulk-delete and per-row
  // hover state in the position table.
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  // moysklad «Сумма ⚙» column customizer — toggles the optional position columns.
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  // moysklad «Наименование ▾ → ☐ С учётом групп» — when on, the name/code sort groups
  // lines by product folder first.
  const [withGroups, setWithGroups] = useState(false);

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'contract'
    | 'project'
    | 'bankAccount'
    | { kind: 'product'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Source customer order — fetched only when ?fromOrder is present. The
  // «доступно» variant fetches the /supply-shortfall basis (same shape, but
  // positions reduced to the per-store stock shortfall).
  const { data: fromOrder } = useQuery<{
    organization: { id: string; name: string };
    store: { id: string; name: string } | null;
    positions: Array<{
      assortmentId: string;
      quantity: number | string;
      product: { name: string } | null;
    }>;
  }>({
    queryKey: ['customer-order-prefill', fromOrderId, fromOrderAvailability],
    queryFn: () =>
      api.get(
        fromOrderAvailability
          ? `/customer-orders/${fromOrderId}/supply-shortfall`
          : `/customer-orders/${fromOrderId}`,
      ),
    enabled: !!fromOrderId,
  });

  // Auto-fill organization + store — from the user's «Значения по умолчанию»
  // (defaultCompany / defaultStore), falling back to the first reference item.
  // Skipped entirely when pre-filling from a source order (the order wins).
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current || fromOrderId) return;
    if (!orgsData || !storesData || userDefaults.isLoading) return;
    defaultsAppliedRef.current = true;
    const us = userDefaults.data;
    if (!organizationId) {
      const org = us?.defaultCompany ?? orgsData.items[0];
      if (org) {
        setOrganizationId(org.id);
        setOrganizationLabel(org.name);
      }
    }
    if (!storeId) {
      const store = us?.defaultStore ?? storesData.items[0];
      if (store) {
        setStoreId(store.id);
        setStoreLabel(store.name);
      }
    }
  }, [
    orgsData,
    storesData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    storeId,
    fromOrderId,
  ]);

  // Apply the source customer order once loaded — Организация + Склад from the
  // order, and one PO row per order product (quantity carried; PRICE left at 0
  // since the CO holds the SALE price, not the supplier buy price).
  const fromOrderAppliedRef = useRef(false);
  useEffect(() => {
    if (fromOrderAppliedRef.current || !fromOrder) return;
    fromOrderAppliedRef.current = true;
    setOrganizationId(fromOrder.organization.id);
    setOrganizationLabel(fromOrder.organization.name);
    if (fromOrder.store) {
      setStoreId(fromOrder.store.id);
      setStoreLabel(fromOrder.store.name);
    }
    setPositions(
      fromOrder.positions.map((p) => ({
        id: uid(),
        assortmentId: p.assortmentId,
        productLabel: p.product?.name ?? '',
        productUom: null,
        quantity: String(p.quantity ?? 1),
        priceMinor: '0',
        discount: '0',
        vat: '0',
        vatEnabled: true,
      })),
    );
  }, [fromOrder]);

  // moysklad parity: choosing (or changing) the organization auto-fills its
  // default account for the document currency — the «Сум» sub-line under
  // Организация (moysklad pre-selects it; ours was empty). Keyed on org/currency
  // only, so a manual account pick isn't clobbered by unrelated re-renders.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void (async () => {
      const d = await api.get<{
        items: Array<{ id: string; name: string; accountNumber: string | null; currency: string }>;
      }>(`/bank-accounts?organizationId=${organizationId}`);
      if (cancelled) return;
      const acct = d.items.find((a) => a.currency === currency) ?? d.items[0];
      setBankAccountId(acct?.id ?? null);
      // moysklad shows the account NAME («Сум»), not the (often blank) number.
      setBankAccountLabel(acct ? acct.name || acct.accountNumber || acct.currency : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, currency]);

  const addPosition = () => {
    setPositions((ps) => [
      ...ps,
      {
        id: uid(),
        assortmentId: null,
        productLabel: '',
        productUom: null,
        quantity: '1',
        priceMinor: '0',
        discount: '0',
        vat: '0',
        vatEnabled: true,
      },
    ]);
  };
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };

  // «Цена ▾» → «Расценить» — re-price every row from the chosen price type (the
  // product's carried salePrices). moysklad lets you reprice PO lines from any type.
  const repricePositions = useCallback((priceTypeId: string) => {
    setPositions((ps) =>
      ps.map((p) => {
        const sp = p.salePrices?.find((x) => x.priceTypeId === priceTypeId);
        return sp ? { ...p, priceMinor: sp.value } : p;
      }),
    );
  }, []);
  // «Цена ▾» → «Сохранить цены» — push each line's price back onto its product. On a
  // PURCHASE order the line price is the BUY price, so save to Product.buyPrice (NOT
  // salePrices — that's customer-orders). Fetch for the lock version, then PATCH.
  const saveProductPrices = useCallback(async () => {
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId || seen.has(p.assortmentId)) continue;
      seen.add(p.assortmentId);
      try {
        const prod = await api.get<{ version: number }>(`/products/${p.assortmentId}`);
        await api.patch(`/products/${p.assortmentId}`, {
          version: prod.version,
          buyPrice: p.priceMinor,
        });
      } catch {
        // skip products that can't be updated (e.g. concurrent edit); others proceed
      }
    }
  }, [positions]);
  // «Скидка ▾» → «Скидка/наценка» modal — a discount % sets each line's `discount`; a
  // markup % raises the unit price instead. Targets the selected rows, or ALL rows
  // when the selection is empty (moysklad parity).
  const applyDiscountMarkup = useCallback(
    (mode: 'discount' | 'markup', percent: number) => {
      setPositions((ps) =>
        ps.map((p) => {
          if (selectedRowIds.size > 0 && !selectedRowIds.has(p.id)) return p;
          if (mode === 'discount') return { ...p, discount: String(percent) };
          const base = Number(p.priceMinor || '0');
          if (!Number.isFinite(base)) return p;
          return { ...p, priceMinor: String(Math.round(base * (1 + percent / 100))) };
        }),
      );
    },
    [selectedRowIds],
  );

  // Totals — BigInt-safe reduce.
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

  // moysklad «Заказ поставщику» columns, built dynamically from the customizer.
  // Always-on columns frame the optional ones; the ⚙ on «Сумма» toggles the rest.
  // Order live-grounded (2026-06-20): Изображение · Наименование · Кол-во ·
  // Единица измерения · Принято · Доступно · Цена · НДС · Скидка · Сумма.
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    // moysklad has NO «#» row-number column — the select checkbox sits directly
    // beside «Наименование».
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    // Each column carries an explicit i18n label — without it PositionTable falls
    // back to its Russian DEFAULT_LABELS, which would leak Russian headers in UZ.
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    // `shipped` = moysklad «Принято» (received qty) on inbound purchase docs.
    if (colVisible.shipped) cols.push({ key: 'shipped', label: tCols('received') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.reserve) cols.push({ key: 'reserve', label: tCols('reserve') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
    if (colVisible.waiting) cols.push({ key: 'waiting', label: tCols('waiting') });
    cols.push({
      key: 'price',
      label: (
        <PositionPriceMenu
          label={tCols('price')}
          repriceLabel={tCols('reprice')}
          saveLabel={tCols('savePrices')}
          priceTypes={priceTypesData?.items ?? []}
          onReprice={repricePositions}
          onSavePrices={saveProductPrices}
        />
      ),
    });
    // moysklad shows «НДС» / «Сумма НДС» columns only while НДС is on — keeps /new
    // identical to /[id] (and drops them entirely with VAT off).
    if (vatEnabled) {
      cols.push({ key: 'vat', label: tCols('vat') });
      if (colVisible.vatAmount) cols.push({ key: 'vatAmount', label: tCols('vatAmount') });
    }
    cols.push({
      key: 'discount',
      label: (
        <PositionDiscountMenu
          label={tCols('discount')}
          title={tCols('discountMarkupTitle')}
          selectedText={tCols('selectedPositions', { count: selectedRowIds.size })}
          discountLabel={tCols('discount')}
          markupLabel={tCols('markup')}
          applyDiscountLabel={tCols('applyDiscount')}
          applyMarkupLabel={tCols('applyMarkup')}
          cancelLabel={tCols('cancel')}
          onApply={applyDiscountMarkup}
        />
      ),
    });
    if (colVisible.weight) cols.push({ key: 'weight', label: tCols('weight') });
    if (colVisible.volume) cols.push({ key: 'volume', label: tCols('volume') });
    cols.push(
      {
        key: 'amount',
        label: (
          <span className="inline-flex items-center gap-1">
            {tCols('amount')}
            <PositionColumnCustomizer
              options={OPTIONAL_POSITION_COLUMNS.map((c) => ({
                key: c.key,
                label: tCols(c.labelKey),
              }))}
              visible={colVisible}
              onToggle={(key, next) => setColVisible((v) => ({ ...v, [key]: next }))}
              ariaLabel={tCols('configure')}
            />
          </span>
        ),
      },
      { key: 'menu' },
    );
    return cols;
  }, [
    colVisible,
    vatEnabled,
    tCols,
    tPos,
    priceTypesData,
    repricePositions,
    saveProductPrices,
    applyDiscountMarkup,
    selectedRowIds,
  ]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error(tForm('select_supplier'));
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!storeId) throw new Error(tForm('select_store'));
      if (positions.length === 0) throw new Error(tForm('add_at_least_one_position'));
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tForm('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tForm('position_quantity_positive', { n: i + 1 }));
      }
      const payload = {
        agentId,
        organizationId,
        storeId,
        ...(bankAccountId ? { organizationAccountId: bankAccountId } : {}),
        // «Владелец» — owner employee / department / shared (else BE stamps creator).
        ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
        ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
        ...(ownerAccess.shared ? { shared: true } : {}),
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(docNumber ? { name: docNumber } : {}),
        ...(deliveryDate ? { deliveryPlannedMoment: deliveryDate } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        waiting,
        currency,
        // rateValue stored as BigInt minor (× 100000000) — moysklad's
        // convention. UZS stays at 1.0, other currencies carry the
        // effective rate (overridden or auto-fetched).
        rateValue:
          currency === 'UZS'
            ? '100000000'
            : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
        description: description || undefined,
        externalCode: externalCode || undefined,
        vatEnabled,
        vatIncluded,
        positions: positions.map((p) => ({
          assortmentKind: 'product' as const,
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          priceMinor: p.priceMinor,
          discount: p.discount || '0',
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
        })),
      };
      return api.post<{ id: string }>('/purchase-orders', payload);
    },
    onSuccess: (created) => router.push(`/purchase-orders/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  // Catalog picker fetchers — moysklad parity: inline search +
  // selection from a sliding panel.
  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
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
  const contractFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!agentId) return [];
    // Contracts are scoped to the selected counterparty; if no agent
    // chosen yet, the picker stays empty and the field is greyed.
    const d = await api.get<{ items: RefItem[] }>(
      `/contracts?counterpartyId=${agentId}&search=${encodeURIComponent(s)}`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/projects?search=${encodeURIComponent(s)}`);
    return d.items.map((p) => ({ id: p.id, primary: p.name }));
  };

  // Bank account picker — scoped to the currently-selected org and
  // currency. Without orgId chosen yet the picker stays empty.
  const bankAccountFetcher = async (s: string): Promise<PickerItem[]> => {
    if (!organizationId) return [];
    const d = await api.get<{
      items: Array<{
        id: string;
        name: string;
        bankName: string | null;
        accountNumber: string | null;
        currency: string;
      }>;
    }>(`/bank-accounts?organizationId=${organizationId}&search=${encodeURIComponent(s)}`);
    return d.items
      .filter((a) => a.currency === currency)
      .map((a) => ({
        // moysklad shows the account NAME («Сум»), not the bare number.
        id: a.id,
        primary: a.name || a.accountNumber || a.currency,
        secondary: a.bankName ?? a.accountNumber ?? undefined,
      }));
  };

  // Position table needs a custom name-cell renderer that opens the
  // CatalogPicker for the row in question.
  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    return (
      <CatalogPickerField
        value={p.assortmentId ? { id: p.assortmentId, label: p.productLabel } : null}
        placeholder={tForm('select_product')}
        onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
        onClear={() =>
          updatePosition(p.id, {
            assortmentId: null,
            productLabel: '',
            productUom: null,
          })
        }
      />
    );
  };

  // Tabs — main content + related documents (placeholder for now).
  // moysklad-parity: the metadata grid sits ABOVE the «Главная»/«Связанные
  // документы» tabs and stays visible across tab switches — the tabs only swap the
  // positions ↔ related-docs area below. So render it as a sibling, not inside «main».
  const metaPanel = (
    // moysklad b-operation-form-top — a ROW-PAIRED table: each row aligns the LEFT
    // field with its RIGHT counterpart (Организация↔Склад · Контрагент↔Договор ·
    // План.дата↔Проект). The org's «Сум» account is a subRow UNDER Организация, so
    // its right slot stays EMPTY and Договор lines up with Контрагент (NOT the
    // account). Fixed-width fields grouped from the left (not stretched).
    <div className="max-w-[860px] space-y-2 bg-[var(--ms-bg-surface)] px-4 py-3">
      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tFields('organization')}
          required
          // moysklad: the org's settlement account («Сум») is a sub-row directly
          // under Организация — the right column has NO counterpart at this line.
          subRow={
            organizationId ? (
              <CatalogPickerField
                value={bankAccountId ? { id: bankAccountId, label: bankAccountLabel } : null}
                placeholder=""
                onPick={() => setOpenPicker('bankAccount')}
                inlineFetcher={bankAccountFetcher}
                onInlineSelect={(item) => {
                  setBankAccountId(item.id);
                  setBankAccountLabel(String(item.primary));
                }}
                onClear={() => {
                  setBankAccountId(null);
                  setBankAccountLabel('');
                }}
              />
            ) : undefined
          }
        >
          <CatalogPickerField
            value={organizationId ? { id: organizationId, label: organizationLabel } : null}
            placeholder=""
            onPick={() => setOpenPicker('org')}
            inlineFetcher={orgFetcher}
            onInlineSelect={(item) => {
              setOrganizationId(item.id);
              setOrganizationLabel(String(item.primary));
            }}
            onEdit={
              organizationId
                ? () => window.open(`/organizations/${organizationId}`, '_blank', 'noopener')
                : undefined
            }
            editLabel={tCommon('edit')}
            onClear={() => {
              setOrganizationId(null);
              setOrganizationLabel('');
              // Bank accounts are org-scoped — clearing the org invalidates the account.
              setBankAccountId(null);
              setBankAccountLabel('');
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('store')}>
          <CatalogPickerField
            value={storeId ? { id: storeId, label: storeLabel } : null}
            placeholder=""
            onPick={() => setOpenPicker('store')}
            inlineFetcher={storeFetcher}
            onInlineSelect={(item) => {
              setStoreId(item.id);
              setStoreLabel(String(item.primary));
            }}
            onEdit={
              storeId ? () => window.open(`/stores/${storeId}`, '_blank', 'noopener') : undefined
            }
            editLabel={tCommon('edit')}
            onClear={() => {
              setStoreId(null);
              setStoreLabel('');
            }}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('agent')} required>
          <CatalogPickerField
            value={agentId ? { id: agentId, label: agentLabel } : null}
            placeholder=""
            onPick={() => setOpenPicker('agent')}
            inlineFetcher={agentFetcher}
            onInlineSelect={(item) => {
              setAgentId(item.id);
              setAgentLabel(String(item.primary));
            }}
            onEdit={
              agentId
                ? () => window.open(`/counterparties/${agentId}`, '_blank', 'noopener')
                : undefined
            }
            editLabel={tCommon('edit')}
            onClear={() => {
              setAgentId(null);
              setAgentLabel('');
              // Clearing the agent invalidates any chosen contract.
              setContractId(null);
              setContractLabel('');
            }}
            onCreate={() => router.push('/counterparties/new')}
            createLabel={tForm('create_new_counterparty')}
          />
          <CounterpartyBalanceInline counterpartyId={agentId} />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('contract')}>
          <CatalogPickerField
            value={contractId ? { id: contractId, label: contractLabel } : null}
            placeholder=""
            onPick={() => agentId && setOpenPicker('contract')}
            inlineFetcher={contractFetcher}
            onInlineSelect={(item) => {
              setContractId(item.id);
              setContractLabel(String(item.primary));
            }}
            disabled={!agentId}
            disabledHint={tForm('select_supplier_first')}
            onClear={() => {
              setContractId(null);
              setContractLabel('');
            }}
            onCreate={() => router.push('/contracts/new')}
            createLabel={tForm('create_new_contract')}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        {/* moysklad PO = «План. дата приёмки» (receipt), NOT «отгрузки» (CO term).
            dd.mm.yyyy via DatePicker (not the browser «mm/dd/yyyy»). */}
        <DocumentMetaField label={tDetailForm('delivery_planned_receipt')}>
          <DatePicker
            value={deliveryDate || null}
            onChange={(d) => setDeliveryDate(d ?? '')}
            locale="ru-RU"
            testId="field-delivery-date"
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('project')}>
          <CatalogPickerField
            value={projectId ? { id: projectId, label: projectLabel } : null}
            placeholder=""
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
            onCreate={() => router.push('/projects/new')}
            createLabel={tForm('create_new_project')}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField
          label={tDetailForm('currency')}
          required
          helper={
            currency !== 'UZS' ? (
              <span className="inline-flex items-center gap-2">
                <span>1 {currency} =</span>
                {rateEditing ? (
                  <>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rateOverride ?? effectiveRate}
                      onChange={(e) => setRateOverride(e.target.value)}
                      onBlur={() => setRateEditing(false)}
                      className="h-6 w-24 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ms-text-brand)]"
                      data-test-id="rate-input"
                    />
                    <span>UZS</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium tabular-nums">
                      {Number(effectiveRate).toLocaleString('ru-RU')}
                    </span>
                    <span>UZS</span>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setRateEditing(true)}
                      className="h-auto px-0 font-normal text-xs"
                      aria-label={tForm('rate_edit')}
                    >
                      ✎
                    </Button>
                    {rateOverride && (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setRateOverride(null)}
                        className="h-auto px-0 font-normal text-[var(--ms-text-muted)] text-xs"
                        title={tForm('rate_auto_reset')}
                      >
                        ↺
                      </Button>
                    )}
                  </>
                )}
              </span>
            ) : undefined
          }
        >
          <NativeSelect
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setRateOverride(null);
            }}
            data-test-id="field-currency"
          >
            <option value="UZS">{tForm('currency_uzs')}</option>
            <option value="USD">{tForm('currency_usd')}</option>
            <option value="EUR">{tForm('currency_eur')}</option>
            <option value="RUB">{tForm('currency_rub')}</option>
          </NativeSelect>
        </DocumentMetaField>
      </DocumentMetaRow>
    </div>
  );

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
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
            // moysklad-parity: drag handle in the leftmost column
            // moves the source row to the dropped slot. arrayMove
            // is BigInt-safe because positions carry stable ids.
            onReorder={(from, to) => {
              setPositions((ps) => {
                const next = ps.slice();
                const [moved] = next.splice(from, 1);
                if (moved) next.splice(to, 0, moved);
                return next;
              });
            }}
            // moysklad «Наименование ▾» — sort the document's lines by name / code,
            // grouping by product folder first when «С учётом групп» is checked.
            onSortPositions={(by) =>
              setPositions((ps) => {
                const key = (p: NewPositionRow) =>
                  by === 'name' ? (p.productLabel ?? '') : (p.productCode ?? '');
                return [...ps].sort((a, b) => {
                  if (withGroups) {
                    const g = (a.folderPath ?? '').localeCompare(b.folderPath ?? '', 'ru');
                    if (g !== 0) return g;
                  }
                  return key(a).localeCompare(key(b), 'ru');
                });
              })
            }
            sortByNameLabel={tPos('sort_by_name')}
            sortByCodeLabel={tPos('sort_by_code')}
            withGroups={withGroups}
            onWithGroupsChange={setWithGroups}
            withGroupsLabel={tPos('sort_with_groups')}
            renderNameCell={renderPositionNameCell}
            vatIncluded={vatIncluded}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            // moysklad-parity: inline «Добавить позицию» bar with
            // typeahead. The user types a product name / code /
            // barcode and picks from suggestions; chosen item lands
            // as a new position row with that product pre-filled.
            footerToolbar={
              <PositionInlineAdd
                placeholder={tPos('addPositionPlaceholder')}
                addFromCatalogLabel={tPos('addFromCatalog')}
                checkCompletenessLabel={tPos('checkCompleteness')}
                importCsvLabel={tPos('importCsv')}
                // moysklad rich product dropdown: each hit shows thumbnail · code ·
                // highlighted name · «Доступно» badge; return {items,total} so the
                // «Ещё N товаров» footer can show the remainder beyond the page.
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
                      raw: p,
                    })),
                    total: r.total ?? r.items.length,
                  };
                }}
                sortAvailableLabel={tPos('sortByAvailable')}
                moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                createProductLabel={(qq) => tPos('createProductNamed', { query: qq })}
                onCreateProduct={() => router.push('/products/new')}
                onPick={(item) => {
                  const raw = item.raw as ProductItem | undefined;
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: uid(),
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productCode: raw?.code ?? undefined,
                      productUom: raw?.uom ?? null,
                      quantity: '1',
                      priceMinor: raw?.buyPrice ?? '0',
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '0',
                      vatEnabled: true,
                      // moysklad «Доступно»/«Остаток» cluster — read-only stock at
                      // the store; «Принято» stays blank until linked receipts post.
                      available: raw?.stock?.available,
                      stock: raw?.stock?.onHand,
                      reserve: raw?.stock?.reserved,
                      waiting: raw?.stock?.inTransit,
                      // carried for «Цена ▾ → Расценить» (re-price from a price type).
                      salePrices: raw?.salePrices ?? null,
                      // carried for «Наименование ▾ → С учётом групп» (folder sort).
                      folderPath: raw?.productFolder?.pathName ?? undefined,
                    },
                  ]);
                }}
                onAddFromCatalog={addPosition}
                // moysklad-parity: «Проверить комплектацию» runs a
                // stock-availability sanity check across all position
                // rows. For brand-new PO it's a UX placeholder — the
                // real check makes sense after positions are filled
                // and we have agentId/storeId, so we surface a hint
                // when prerequisites aren't ready yet.
                onCheckCompleteness={() => {
                  if (!storeId) {
                    setError(t('select_store_first'));
                    return;
                  }
                  if (positions.length === 0) {
                    setError(t('add_position_first'));
                    return;
                  }
                  // Real implementation would POST to /purchase-orders/
                  // dry-run-check. For new doc we just clear errors.
                  setError(null);
                }}
                onImportPositions={(rows) => {
                  setPositions((ps) => [
                    ...ps,
                    ...rows.map(({ item, quantity }) => {
                      const raw = item.raw as ProductItem | undefined;
                      return {
                        id: uid(),
                        assortmentId: item.id,
                        productLabel: item.primary,
                        productCode: raw?.code ?? undefined,
                        productUom: raw?.uom ?? null,
                        quantity: Number(quantity) > 0 ? quantity : '1',
                        priceMinor: raw?.buyPrice ?? '0',
                        discount: '0',
                        vat: raw?.vat != null ? String(raw.vat) : '0',
                        vatEnabled: true,
                        available: raw?.stock?.available,
                        stock: raw?.stock?.onHand,
                        reserve: raw?.stock?.reserved,
                        waiting: raw?.stock?.inTransit,
                        salePrices: raw?.salePrices ?? null,
                        folderPath: raw?.productFolder?.pathName ?? undefined,
                      };
                    }),
                  ]);
                }}
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
                  className="h-auto px-0 text-xs"
                  data-test-id="show-external-code"
                >
                  {tDetailForm('external_code')}
                </Button>
              )}
            </div>
            <DocumentTotalsPanel
              subtotalMinor={totals.net}
              vatMinor={totals.vat}
              totalMinor={totals.gross}
              currency={currency}
              vatEnabled={vatEnabled}
              onVatEnabledChange={setVatEnabled}
              vatIncluded={vatIncluded}
              onVatIncludedChange={setVatIncluded}
              // moysklad shows total quantity + (when available) weight +
              // volume aggregated across positions. For PO/new we only
              // have quantity client-side (weight/volume would require a
              // product join on every row — deferred to /[id] where the
              // detail already pulls product.weightG / volumeML).
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
      // moysklad «Связанные документы» = a relations DIAGRAM, not a centered notice.
      // The current document is the anchor card; «Привязать документ» links others.
      // On a brand-new doc there are no links yet — the linking flow needs a saved
      // doc, so the button stays disabled until after the first save (mirrors the
      // grounded customer-order RelatedDocsTab, capture d-tab-svyazannye-dokumenty).
      content: (
        <div className="bg-[var(--ms-bg-surface)] px-4 py-3">
          <RelatedDocsTab
            current={{
              id: 'new',
              name: docNumber,
              moment: docDate ? new Date(docDate).toISOString() : new Date().toISOString(),
              sumMinor: String(totals.gross),
              kind: 'purchase-order',
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="purchase-order-new-page"
        documentTypeLabel={tDetailTitles('purchase_order')}
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
        waiting={waiting}
        onWaitingChange={setWaiting}
        waitingHelp={t('waiting_help')}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/purchase-orders')}
        // For a brand-new doc most dropdowns are intentionally empty —
        // the framework auto-renders them disabled so the toolbar
        // shape is identical to the post-save one (just greyed).
        modifyMenu={[]}
        createDocMenu={[]}
        printMenu={[]}
        sendMenu={[]}
        // moysklad-parity: right side of toolbar = «Владелец» (owner/access)
        // popover — click «Файзуллоев Ф. / Основной» to set Сотрудник (employee) /
        // Отдел (department) / «Общий доступ» (shared). Saved on create.
        rightSlot={<OwnerAccessPopover value={ownerAccess} onChange={setOwnerAccess} />}
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        {metaPanel}
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tForm('supplier_picker_title')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          setAgentId(item.id);
          setAgentLabel(String(item.primary));
        }}
        createLabel={tForm('create_new_counterparty')}
        onCreate={() => router.push('/counterparties/new')}
      />
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
        open={openPicker === 'contract'}
        onClose={() => setOpenPicker(null)}
        title={tForm('contract_picker_title')}
        fetcher={contractFetcher}
        onSelect={(item) => {
          setContractId(item.id);
          setContractLabel(String(item.primary));
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
        open={openPicker === 'bankAccount'}
        onClose={() => setOpenPicker(null)}
        title={tForm('bank_account_picker_title')}
        fetcher={bankAccountFetcher}
        onSelect={(item) => {
          setBankAccountId(item.id);
          setBankAccountLabel(String(item.primary));
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
            vat: raw?.vat != null ? String(raw.vat) : '0',
            available: raw?.stock?.available,
            stock: raw?.stock?.onHand,
            reserve: raw?.stock?.reserved,
            waiting: raw?.stock?.inTransit,
            salePrices: raw?.salePrices ?? null,
            folderPath: raw?.productFolder?.pathName ?? undefined,
          });
        }}
      />
    </>
  );
}
