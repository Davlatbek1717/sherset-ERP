'use client';
import { AttributeInput, type AttributeMetaRow } from '@/components/attributes-editor';
import {
  type DeliveryAddressFull,
  DeliveryAddressGroup,
} from '@/components/customer-orders/delivery-address-group';
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { NewDocRelatedTab } from '@/components/documents/new-doc-related-tab';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionDiscountMenu } from '@/components/documents/position-discount-menu';
import { PositionPriceMenu } from '@/components/documents/position-price-menu';
import { PositionReserveMenu } from '@/components/documents/position-reserve-menu';
import { useNewDocStaging } from '@/components/documents/use-new-doc-staging';
import {
  type CustomerReceiptData,
  CustomerReceiptPortal,
} from '@/components/pick-list/customer-receipt-portal';
import {
  type ReceiptData,
  ReceiptPrintPortal,
  receiptDate,
} from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { ProductSelectModal } from '@/components/products/product-select-modal';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useTotalsLabels } from '@/hooks/use-totals-labels';
import { type UserDefaults, defaultDocStore } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { computeLineTotalSafe } from '@/lib/doc-totals';
import { imageRawUrl } from '@/lib/image-url';
import { distributeAgreementDelta } from '@/lib/position-agreement';
import { resolveDefaultSalePriceOrZero, usePriceTypeIds } from '@/lib/sale-price';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  DatePicker,
  type DocPositionRow,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentTabs,
  DocumentTotalsPanel,
  Icons,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  formatMoney,
  isRowOversold,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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
  article: string | null;
  uom: string | null;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
  // moysklad position table shows the product's live stock cluster (Остаток /
  // Резерв) per row; /products returns it, we carry it onto the position.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  // Per-unit weight (g) / volume (ml) — /products returns them; carried onto the
  // position so the «Вес»/«Объём» columns can show the line total (× Кол-во).
  weightG?: number | null;
  volumeML?: number | null;
  // Main image id — /products returns it; builds the «Изображение» thumbnail URL.
  mainImageId?: string | null;
  // Product folder (denormalised pathName, e.g. «Tovarlar/Elektronika») — used by
  // the «Наименование ▾ → С учётом групп» sort. /products `include`s it.
  productFolder?: { id: string; name: string; pathName: string } | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  // The product's full price list, carried so «Расценить» can re-price the row
  // by a chosen price-type without re-fetching.
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  // Product folder path («Tovarlar/Elektronika») — drives «С учётом групп» sort.
  folderPath?: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// «События» on the CREATE form — hidden 2026-07-09 (moysklad's old-design /new has
// no События tab). Flip to true to re-enable; the tab's code is kept below.
const SHOW_NEW_EVENTS_TAB = false;

/** Compose the denormalised single-line address from the structured parts. */
function composeAddress(a: DeliveryAddressFull): string | null {
  const parts: string[] = [];
  if (a.country) parts.push(a.country);
  if (a.index) parts.push(a.index);
  if (a.city) parts.push(a.city);
  if (a.street || a.building) parts.push([a.street, a.building].filter(Boolean).join(' '));
  if (a.apartment) parts.push(a.apartment);
  if (a.other) parts.push(a.other);
  const composed = parts.filter(Boolean).join(', ').trim();
  return composed || null;
}

// moysklad position table = fixed columns (Наименование/Кол-во/Цена/НДС/Скидка/
// Сумма) + optional columns toggled by the «Сумма ⚙» customizer. The default-
// Re-grounded 2026-07-31 on the LIVE #customerorder editor (elektro_sentr): the
// moysklad position grid is
//   № · Наименование · Кол-во · Отгруж. · Доступно · Цена · НДС · Скидка · Сумма
// — i.e. «Отгруж.» (shipped) + «Доступно» (available) are default-VISIBLE. Both
// were OFF here (parity deltas #39/#40); flipped ON, same as the detail page.
// The earlier note claimed the opposite; it predates this capture.
// reserve / stock / vatAmount stay ON as deliberate extras (product decision
// 2026-07-31) and remain toggleable via the customizer. The i18n label
// (position_cols namespace) is resolved in the component (no-hardcoded gate
// forbids Cyrillic literals in the page).
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; on: boolean }[] = [
  { key: 'image', on: false },
  // «Единица измерения» — the base unit (e.g. «шт»). PositionTable renders it
  // INLINE in «Кол-во» («1 шт») rather than as a standalone column (moysklad
  // parity); default ON like the purchase-order grid.
  { key: 'unit', on: true },
  { key: 'code', on: false },
  { key: 'article', on: false },
  { key: 'reserve', on: true },
  { key: 'stock', on: true },
  { key: 'available', on: true },
  { key: 'waiting', on: false },
  { key: 'shipped', on: true },
  { key: 'weight', on: false },
  { key: 'volume', on: false },
  { key: 'vatAmount', on: true },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

export default function NewCustomerOrderPage() {
  const router = useRouter();
  const { openTemplates } = usePrintTemplatesManager();
  const { user } = useAuth();
  const t = useTranslations('pages.customer_orders');
  const totalsLabels = useTotalsLabels();
  const tForm = useTranslations('form');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailHeader = useTranslations('detail_header');
  // position_editor: shared PositionTable/PositionInlineAdd default to
  // Latin-uz strings — without these the position area leaked Uzbek into
  // the RU UI (the same class as c2c51a31, which fixed purchase-orders only).
  const tPos = useTranslations('position_editor');
  const tProductSelect = useTranslations('product_select');
  const tCols = useTranslations('position_cols');
  const tCommon = useTranslations('common');
  const tFilters = useTranslations('filters');
  // Toolbar dropdown menus — live-grounded against moysklad (customerorder):
  // Печать=[Заказ, Комплект…, Настроить…] · Отправить=[Заказ, Комплект…] (the
  // print template sent by email) · Изменить=[Удалить, Копировать]. On /new
  // these are post-save actions, so they save first (like «Создать документ»).
  const tPrint = useTranslations('print_menu');
  const tSpiska = useTranslations('pages.pickLists');
  const tBulk = useTranslations('bulk_actions');
  const docEditorLabels = useDocumentEditorLabels();
  const { defaultId } = usePriceTypeIds();
  // moysklad «Статус» = account-defined custom statuses (State rows,
  // entityType="customerorder") with colours — NOT the internal `state` FSM.
  // Fetched live and rendered as the header status dropdown (mirrors the real
  // account: Текширилмаган / Карз колди / Туланди Накт / Туланди Клик). The FSM
  // `state` stays server-side (payment/shipment lifecycle + «Не оплачено» pill).
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    queryKey: ['states', 'customerorder'],
    queryFn: () => api.get('/states?entityType=customerorder'),
    staleTime: 60_000,
  });
  const statusOptions = (statusData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color ?? undefined,
  }));

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });
  // moysklad «Настройки пользователя → Значения по умолчанию»: a NEW document
  // pre-fills Организация / Склад / Контрагент / Проект from the current user's
  // defaults. The GET resolves the reference names so we can show labels.
  const userSettingsQuery = useQuery<UserDefaults>({
    queryKey: ['user-settings'],
    queryFn: () => api.get<UserDefaults>('/user-settings'),
  });
  // Account-defined custom fields (moysklad доп. поля, e.g. «Уста»/«Санаси»).
  // Backend validates required-ness on create (validateAndNormalize), so no
  // client-side required check is needed — empty required → 400 in the banner.
  const { data: attrMetaData } = useQuery<{ items: AttributeMetaRow[] }>({
    queryKey: ['attribute-metadata-entity', 'CustomerOrder'],
    queryFn: () => api.get('/attribute-metadata/entity/CustomerOrder'),
    staleTime: 60_000,
  });
  // Price types for the «Цена ▾» → «Расценить» (re-price by type) menu.
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
  });

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [statusId, setStatusId] = useState<string | null>(null);
  const [applicable, setApplicable] = useState(true);

  // Meta state
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractLabel, setContractLabel] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [currency, setCurrency] = useState<string>('UZS');
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  // moysklad «Курс валюты документа» modal (opened by the «✎» in the rate helper).
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [bankAccountLabel, setBankAccountLabel] = useState('');
  const [description, setDescription] = useState('');
  // moysklad «Внешний код» — a collapsed brand-blue link at the bottom-left
  // that expands to an input when clicked (rarely-used optional field).
  const [externalCode, setExternalCode] = useState('');
  const [showExternalCode, setShowExternalCode] = useState(false);
  const [customAttrs, setCustomAttrs] = useState<Record<string, unknown>>({});
  // moysklad standard fields (create schema accepts salesChannelId + shipmentAddress).
  const [salesChannelId, setSalesChannelId] = useState<string | null>(null);
  const [salesChannelLabel, setSalesChannelLabel] = useState('');
  // moysklad «Владелец»: a new document defaults to the current user as owner;
  // department (groupId) + shared are editable via the header owner popover.
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>(() => ({
    ownerId: user?.id ?? null,
    ownerLabel: user?.name ?? '',
    groupId: null,
    groupLabel: '',
    shared: false,
  }));
  // Positions state — declared before the price handlers + column memo below.
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  // moysklad parity: the last single-added line — its «Кол-во» auto-focuses so
  // the user types the quantity straight after picking a product.
  const [lastAddedId, setLastAddedId] = useState<string | undefined>(undefined);
  const [productModalOpen, setProductModalOpen] = useState(false);

  // «Расценить» — re-price every row by the chosen price-type (from the
  // product's carried salePrices). «Сохранить цены» — push each row's price
  // back onto its product (fetch for the lock version, then PATCH).
  const repricePositions = useCallback((priceTypeId: string) => {
    setPositions((ps) =>
      ps.map((p) => {
        const sp = p.salePrices?.find((x) => x.priceTypeId === priceTypeId);
        return sp ? { ...p, priceMinor: sp.value } : p;
      }),
    );
  }, []);
  const saveProductPrices = useCallback(async () => {
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId || seen.has(p.assortmentId)) continue;
      seen.add(p.assortmentId);
      try {
        const prod = await api.get<{
          version: number;
          salePrices?: Array<{ priceTypeId: string; value: string }>;
        }>(`/products/${p.assortmentId}`);
        const existing = prod.salePrices ?? [];
        // Update the default-tier entry in place — matched by the real price-type
        // id OR the legacy 'default' sentinel. When neither matches but the product
        // already has prices (e.g. defaultId not loaded yet and the data is already
        // on real ids), the default tier IS the first entry (resolver convention) —
        // update that, NOT append a duplicate 'default' row that read-resolution
        // would then shadow (silently losing this price push).
        const matchIdx = existing.findIndex(
          (x) => (defaultId && x.priceTypeId === defaultId) || x.priceTypeId === 'default',
        );
        const idx = matchIdx < 0 && existing.length > 0 ? 0 : matchIdx;
        const salePrices =
          idx >= 0
            ? existing.map((x, i) => (i === idx ? { ...x, value: p.priceMinor } : x))
            : [{ priceTypeId: defaultId ?? 'default', value: p.priceMinor }];
        await api.patch(`/products/${p.assortmentId}`, { version: prod.version, salePrices });
      } catch {
        // skip products that can't be updated (e.g. concurrent edit); others proceed
      }
    }
  }, [positions, defaultId]);
  // moysklad position selection — used by the «Скидка» bulk modal + select-all.
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  // moysklad «Скидка» bulk modal — a discount % sets each line's `discount`; a
  // markup % raises the unit price instead (the API caps discount at 0..100, so a
  // markup can't be a negative discount). Targets the selected rows, or ALL rows
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
  // moysklad «Сумма ⚙» column customizer — toggles the optional position columns.
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  // moysklad «Наименование ▾ → С учётом групп» — group lines by product folder when sorting.
  const [withGroups, setWithGroups] = useState(false);
  // moysklad «Зарезерв.» — an editable per-line reserve column. The «Зарезерв ▾»
  // header menu is a shortcut: «Поставить резерв» fills every line with its full
  // qty, «Снять резерв» zeroes them; the user can also type any per-line amount.
  // Whatever's in the column is sent as each position's reservedQty on save and
  // the backend reserves exactly that much stock (no separate bulk-reserve call).
  const setAllReserve = useCallback(() => {
    setPositions((ps) => ps.map((p) => ({ ...p, reserve: p.quantity })));
  }, []);
  const clearAllReserve = useCallback(() => {
    // moysklad parity: cleared reserve shows «0», not a blank cell.
    setPositions((ps) => ps.map((p) => ({ ...p, reserve: '0' })));
  }, []);
  // Header «☑ Резерв» (moysklad document-level flag, grounded 2026-07-31) — derived
  // from the per-line reserves, same rule as the detail page. A draft with no lines
  // yet reads as unchecked.
  const allLinesReserved = useMemo(
    () =>
      positions.length > 0 &&
      positions.every((p) => Number(p.reserve ?? 0) >= Number(p.quantity ?? 0)),
    [positions],
  );
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    // moysklad parity (user 2026-06-20 «# kerak emas»): no row-number column —
    // moysklad's position grid starts at the select checkbox, then Наименование.
    const cols: PositionTableColumnConfig[] = [{ key: 'dragarea' }, { key: 'select' }];
    // Every column carries an explicit i18n label — without it PositionTable
    // falls back to its Russian DEFAULT_LABELS, which leaked Russian headers in
    // UZ mode. (RU values are identical, so RU parity is unchanged; `shipped`
    // «Отгружено» / `volume` «Объём» also correct the generic defaults.)
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    // «Единица измерения» — PositionTable renders it inline in «Кол-во» (drops the
    // standalone column); pushing the key drives that inline unit.
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.code) cols.push({ key: 'code', label: tCols('code') });
    if (colVisible.article) cols.push({ key: 'article', label: tCols('article') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.reserve)
      cols.push({
        key: 'reserve',
        label: (
          <PositionReserveMenu
            label={tCols('reserve')}
            setReserveLabel={tCols('set_reserve')}
            clearReserveLabel={tCols('clear_reserve')}
            onSetReserve={setAllReserve}
            onClearReserve={clearAllReserve}
          />
        ),
      });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.available) cols.push({ key: 'available', label: tCols('available') });
    if (colVisible.waiting) cols.push({ key: 'waiting', label: tCols('waiting') });
    if (colVisible.shipped) cols.push({ key: 'shipped', label: tCols('shipped') });
    cols.push(
      {
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
      },
      { key: 'vat', label: tCols('vat') },
    );
    if (colVisible.vatAmount) cols.push({ key: 'vatAmount', label: tCols('vatAmount') });
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
              options={OPTIONAL_POSITION_COLUMNS.map((c) => ({ key: c.key, label: tCols(c.key) }))}
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
    tPos,
    tCols,
    priceTypesData,
    repricePositions,
    saveProductPrices,
    selectedRowIds,
    applyDiscountMarkup,
    setAllReserve,
    clearAllReserve,
  ]);
  const [deliveryAddressFull, setDeliveryAddressFull] = useState<DeliveryAddressFull>({});
  // Free-form delivery-address text — moysklad's main «Адрес доставки» textarea
  // (the structured group below it recomposes this when used).
  const [deliveryAddressText, setDeliveryAddressText] = useState('');

  // «Курс валюты документа» — the rate is the account's currency-справочник rate
  // (Настройки → Валюты), the SAME admin-set value moysklad books documents at.
  // NOT a live CB feed: that drifts from the admin rate (e.g. 11 990 vs 12 200),
  // so USD docs were stored at the wrong base-currency value. One source of
  // truth → GET /currencies (mirror enters / losses / payments-in).
  const { data: currenciesData } = useQuery<{
    items: Array<{ id: string; isoCode: string; name: string; rate: string }>;
  }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  // «Валюта документа» options — the account's REAL currencies (Настройки → Валюты),
  // never a hardcoded list (a phantom EUR/RUB the account doesn't have must not appear).
  const currencies = currenciesData?.items ?? [];
  const adminRate = currencies.find((c) => c.isoCode === currency)?.rate;
  const effectiveRate = rateOverride ?? adminRate ?? '1';

  // moysklad parity: «Баланс : <amount>» caption under Контрагент — the
  // counterparty's balance ledger (GET /counterparty-balances/:id) for the
  // document currency. Empty/no-row ⇒ 0,00. Shown only once an agent is picked.
  const { data: agentBalanceData } = useQuery<{
    items: Array<{ currency: string; balanceMinor: string }>;
  }>({
    queryKey: ['counterparty-balance', agentId],
    queryFn: () => api.get(`/counterparty-balances/${agentId}`),
    enabled: !!agentId,
  });
  const agentBalanceMinor =
    agentBalanceData?.items.find((b) => b.currency === currency)?.balanceMinor ?? '0';

  // VAT toggles (totals panel)
  const [vatEnabled, setVatEnabled] = useState(true);
  // «Цена включает НДС» — CHECKED by default (owner decision 2026-07-31, grounded
  // on the live #customerorder editor where both /new and a saved order show it
  // ticked). NEW customer orders only: the value is stored per document, so every
  // existing order keeps whatever it was saved with — nothing is recomputed.
  // Scope is deliberately customer-orders ONLY. The DB column defaults to false
  // across 8+ document models; flipping those too is a separate decision, since
  // it changes what a typed price MEANS on each of those documents.
  const [vatIncluded, setVatIncluded] = useState(true);
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

  // Pickers
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'contract'
    | 'project'
    | 'salesChannel'
    | 'bankAccount'
    | { kind: 'product'; rowUid: string }
  >(null);
  // Validation / save errors surface as a moysklad-style top-right toast
  // (Toast = "Mirrors moysklad's top-right notification style"). moysklad never
  // shows a giant centered error block pushing the form down — it just notifies.
  const { toast } = useToast();
  // moysklad «Запросить оплату» on a NEW order: there is no order id yet, so
  // the button saves first, then (on success) opens the payment-in form for
  // the freshly-created order — the same flow the detail [id] page uses. A ref
  // (not state) so the value is read synchronously inside the shared mutation's
  // onSuccess regardless of React batching.
  const afterSaveRef = useRef<
    | 'view'
    | 'payment'
    | 'demand'
    | 'invoice'
    | 'print'
    // moysklad «Создать документ»: the order saves first, then the chosen related
    // doc opens at its /new pre-filled from this order (?fromOrder=…).
    | 'move'
    | 'cash-in'
    | 'prepayment'
    | 'purchase-order'
    | 'po-available'
  >('view');
  // «＋ Задача» saves the order as a draft (skips the post rule).
  const draftSaveRef = useRef(false);
  // moysklad marks a required-but-empty «Контрагент» RED on a failed «＋ Задача».
  const [agentInvalid, setAgentInvalid] = useState(false);
  // moysklad-style short save-error line (under the toolbar) — owner 2026-07-11.
  const [saveError, setSaveError] = useState<string | null>(null);
  // «Печать» — which form the save-first print should open once the order exists:
  // {view} = the standalone print page (new tab), {form,templateId} = an account
  // custom form PDF (rendered by /customer-orders/bulk-print, opened in a new tab).
  const printTargetRef = useRef<{ kind: 'view' | 'form'; templateId?: string }>({
    kind: 'view',
  });
  // The account's own custom «Заказ покупателя» print forms (moysklad «Печать»
  // lists them ABOVE the standard form + pins each as its own toolbar button).
  // Empty on accounts with none configured.
  // Doc-scoped endpoint (/customer-orders/print-forms) — gated on the DOC view permission, not
  // settings, so a cashier sees the pinned check buttons too (the shared
  // /print-templates listing is admin-only). Bare array, PO/new shape.
  const { data: printFormsData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['customerorder-print-forms'],
    queryFn: () => api.get('/customer-orders/print-forms'),
    staleTime: 60_000,
  });
  const printForms = printFormsData ?? [];
  // «Печать → Лист сборки» (climart port 2026-07-28): joriy forma pozitsiyalarini
  // ombor yig'ish-varag'i sifatida chiqaradi (/pick-lists bilan bir xil 72mm chek);
  // yacheyka mahsulotdan JONLI hal qilinadi — saqlash shart emas.
  const [spiska, setSpiska] = useState<ReceiptData | null>(null);
  const openSpiska = useCallback(async () => {
    const rows = positions.filter((p) => p.assortmentId && Number(p.quantity) > 0);
    const ids = [...new Set(rows.map((r) => r.assortmentId as string))];
    const res = ids.length
      ? await api
          .get<{ cells: Record<string, string | null> }>(
            `/pick-lists/cells-by-products?productIds=${ids.join(',')}`,
          )
          .catch(() => ({ cells: {} as Record<string, string | null> }))
      : { cells: {} as Record<string, string | null> };
    setSpiska({
      title: tSpiska('receipt_title'),
      number: docNumber || '—',
      dateStr: receiptDate(new Date()),
      agentName: agentLabel || null,
      agentPhone: null,
      ownerName: user?.name ?? null,
      description: description || null,
      positions: rows.map((r) => ({
        name: r.productLabel,
        qty: r.quantity,
        uom: r.productUom ?? null,
        cell: res.cells[r.assortmentId as string] ?? null,
      })),
    });
  }, [positions, docNumber, agentLabel, description, user?.name, tSpiska]);
  // «Печать → Товарный чек» (climart port 2026-07-29): mijoz cheki — narx, per-satr
  // summa (hujjatning o'z computeLineTotal.gross'i bilan), jami, so'z bilan.
  const [creceipt, setCreceipt] = useState<CustomerReceiptData | null>(null);
  const openCustomerReceipt = useCallback(() => {
    const rows = positions.filter((p) => p.assortmentId && Number(p.quantity) > 0);
    setCreceipt({
      number: docNumber || '—',
      dateStr: receiptDate(new Date()),
      orgName: organizationLabel || null,
      sellerName: user?.name ?? null,
      buyerName: agentLabel || null,
      phone: null,
      comment: description || null,
      positions: rows.map((r) => ({
        name: r.productLabel,
        uom: r.productUom ?? null,
        qty: r.quantity,
        priceMinor: r.priceMinor || '0',
        sumMinor: computeLineTotalSafe(r, vatIncluded).gross.toString(),
      })),
    });
  }, [positions, docNumber, organizationLabel, agentLabel, description, user?.name, vatIncluded]);
  // «Связанные документы» tab — staged links / tasks / files (moysklad's create
  // form works fully in place; everything persists in flush() right after save).
  const staging = useNewDocStaging({ entityType: 'CustomerOrder', route: 'customer-orders' });

  // Pre-fill from the user's «Значения по умолчанию» once the reference lists
  // AND the settings have settled (runs once). Organization/Склад fall back to
  // the first list item when no default is set; Контрагент/Проект come only from
  // an explicit default (moysklad parity — this is why a new order can open with
  // Контрагент already filled, making an "empty" save succeed).
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || !storesData) return;
    if (userSettingsQuery.isLoading) return;
    defaultsAppliedRef.current = true;
    const us = userSettingsQuery.data;
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
      const store = defaultDocStore(us, storesData.items);
      if (store) {
        setStoreId(store.id);
        setStoreLabel(store.name);
      }
    }
    if (!agentId && us?.defaultCustomer) {
      setAgentId(us.defaultCustomer.id);
      setAgentLabel(us.defaultCustomer.name);
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    orgsData,
    storesData,
    userSettingsQuery.data,
    userSettingsQuery.isLoading,
    organizationId,
    storeId,
    agentId,
    projectId,
  ]);
  // moysklad parity: a new order opens with the first status preselected
  // (the live account shows «Текширилмаган», position 0).
  useEffect(() => {
    if (statusData?.items[0] && !statusId) setStatusId(statusData.items[0].id);
  }, [statusData, statusId]);
  // moysklad parity: choosing (or changing) the organization auto-fills its
  // default account for the document currency. Keyed on org/currency only, so a
  // manual account pick is not clobbered by unrelated re-renders.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void (async () => {
      const d = await api.get<{
        items: Array<{
          id: string;
          name: string;
          accountNumber: string | null;
          currency: string;
          isDefault: boolean;
        }>;
      }>(`/bank-accounts?organizationId=${organizationId}`);
      if (cancelled) return;
      // Prefer the organization's DEFAULT account for the document currency —
      // that is the one moysklad pre-fills; "first row wins" only as a fallback.
      const inCurrency = d.items.filter((a) => a.currency === currency);
      const acct = inCurrency.find((a) => a.isDefault) ?? inCurrency[0] ?? d.items[0];
      setBankAccountId(acct?.id ?? null);
      // Default accounts have accountNumber=null. Labelling from accountNumber
      // alone left the caption EMPTY, so the sub-row rendered as a blank combobox
      // even though an account WAS selected — the «пустой» field in the parity
      // audit. Fall back to the account name (same rule as the detail form).
      setBankAccountLabel(acct ? acct.accountNumber || acct.name : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, currency]);

  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };

  // Totals — BigInt-safe reduce.
  const totals = useMemo(
    () =>
      positions.reduce(
        (acc, p) => {
          const t = computeLineTotalSafe(p, vatIncluded);
          return { net: acc.net + t.net, vat: acc.vat + t.vat, gross: acc.gross + t.gross };
        },
        { net: 0n, vat: 0n, gross: 0n },
      ),
    [positions, vatIncluded],
  );

  // moysklad hard-block (owner rule 2026-07-07): a line ordering MORE than the
  // stock shown in «Остаток» must not be saveable. Mirrors the red-row test.
  const hasOversold = useMemo(
    () => positions.some((p) => isRowOversold(p, positionColumns)),
    [positions, positionColumns],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      // «＋ Задача» saves the order as a DRAFT so a task can attach to it.
      const asDraft = draftSaveRef.current;
      draftSaveRef.current = false;
      const effApplicable = asDraft ? false : applicable;
      if (!agentId) throw new Error(tForm('select_counterparty'));
      if (!organizationId) throw new Error(tForm('select_organization'));
      if (!storeId) throw new Error(tForm('select_store'));
      // No ≥1-position requirement: moysklad saves an order with zero
      // positions (live-confirmed — a saved order can have "Нет позиций").
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
        ...(contractId ? { contractId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(salesChannelId ? { salesChannelId } : {}),
        ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
        ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
        ...(ownerAccess.shared ? { shared: true } : {}),
        ...(statusId ? { statusId } : {}),
        // Free-form textarea wins; fall back to the structured compose.
        ...(deliveryAddressText.trim() || composeAddress(deliveryAddressFull)
          ? {
              shipmentAddress: deliveryAddressText.trim() || composeAddress(deliveryAddressFull),
            }
          : {}),
        shipmentAddressFull: deliveryAddressFull,
        ...(externalCode ? { externalCode } : {}),
        ...(docNumber ? { name: docNumber } : {}),
        ...(deliveryDate ? { deliveryPlannedMoment: deliveryDate } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable: effApplicable,
        currency,
        rateValue:
          currency === 'UZS'
            ? '100000000'
            : BigInt(Math.round(Number(effectiveRate) * 100000000)).toString(),
        description: description || undefined,
        // Custom-field values (доп. поля). Sent even when {} so the backend's
        // validateAndNormalize enforces any required custom fields server-side.
        attributes: customAttrs,
        vatEnabled,
        vatIncluded,
        positions: positions.map((p) => ({
          assortmentKind: 'product' as const,
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          quantity: Number(p.quantity),
          priceMinor: p.priceMinor,
          discount: Number(p.discount || '0'),
          vat: p.vat ? Number(p.vat) : undefined,
          vatEnabled: p.vatEnabled,
          // moysklad «Зарезерв.» per line — the backend reserves exactly this much
          // stock atomically right after create (no separate bulk-reserve call).
          reservedQty: Number(p.reserve || '0'),
        })),
      };
      const created = await api.post<{ id: string }>('/customer-orders', payload);
      return created;
    },
    // moysklad «Создать документ» on /new: save the order, then create the
    // chosen related document from it (or open its /new pre-linked) and go there.
    // If the related-doc creation fails, the order is already saved — fall back
    // to its detail page so no work is lost.
    onSuccess: async (created) => {
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      // Staged files / links / tasks (the related tab works in place before save) —
      // persist them all onto the freshly-created order.
      await staging.flush(created.id);
      try {
        if (intent === 'demand') {
          const d = await api.post<{ id: string }>(
            `/demands/from-customer-order/${created.id}`,
            {},
          );
          router.push(`/demands/${d.id}`);
          return;
        }
        if (intent === 'invoice') {
          const inv = await api.post<{ id: string }>(
            `/invoices-out/from-customer-order/${created.id}`,
            {},
          );
          router.push(`/invoices-out/${inv.id}`);
          return;
        }
        if (intent === 'print') {
          const target = printTargetRef.current;
          printTargetRef.current = { kind: 'view' };
          if (target.kind === 'form' && target.templateId) {
            // An account custom form → render its PDF and OPEN IT IN A NEW TAB
            // (moysklad «Открыть в браузере» — the user presses «Печать» there;
            // NOT a save-to-disk download).
            void api.postOpenInBrowser('/customer-orders/bulk-print', {
              ids: [created.id],
              templateId: target.templateId,
            });
          } else {
            // moysklad «Печать → Заказ»: open the standalone print view for the
            // freshly-saved order, then land on its detail page.
            window.open(
              `/print/customer-order/${created.id}?auto=1`,
              '_blank',
              'width=820,height=1100',
            );
          }
          router.push(`/customer-orders/${created.id}`);
          return;
        }
      } catch {
        router.push(`/customer-orders/${created.id}`);
        return;
      }
      // moysklad «Создать документ» targets — open the related doc's /new
      // pre-linked to this order (?fromOrder=…). In-domain targets read the order
      // and pre-fill (built this session); «Заказ поставщику» is another session's
      // page so it just navigates with the param (its /new owns the pre-fill).
      const fromOrder = `fromOrder=${created.id}`;
      const route: Partial<Record<typeof intent, string>> = {
        payment: `/payments-in/new?${fromOrder}`,
        move: `/moves/new?${fromOrder}`,
        'cash-in': `/cash-in/new?${fromOrder}`,
        prepayment: `/prepayments/new?${fromOrder}`,
        'purchase-order': `/purchase-orders/new?${fromOrder}`,
        'po-available': `/purchase-orders/new?${fromOrder}&availability=1`,
      };
      router.push(route[intent] ?? `/customer-orders/${created.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const agentFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null; phone: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    // moysklad shows phone (fallback legalTitle) as the second line of each
    // counterparty suggestion row.
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.phone ?? c.legalTitle ?? undefined,
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
    const d = await api.get<{ items: RefItem[] }>(
      `/contracts?counterpartyId=${agentId}&search=${encodeURIComponent(s)}`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/projects?search=${encodeURIComponent(s)}`);
    return d.items.map((p) => ({ id: p.id, primary: p.name }));
  };
  const salesChannelFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(
      `/sales-channels?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name }));
  };

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
        id: a.id,
        // Default accounts carry accountNumber=null, so the headline fell back to
        // an EMPTY string and the picker rendered a blank row (and a blank
        // selected value). Mirror the detail form + list filter: number, else name.
        primary: a.accountNumber || a.name,
        secondary: a.bankName ?? undefined,
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

  // Account custom fields (доп. поля). Rendered in their OWN aligned row
  // BELOW the standard meta columns (moysklad blueprint: Уста x91 / Санаси
  // x459, both at y317), distributed round-robin by `position` (1st→left,
  // 2nd→middle, 3rd→right …) so a 2-field account gets «Уста» left + «Санаси»
  // middle, like the live account — and aligned horizontally regardless of how
  // many standard fields each column has.
  const customFields = [...(attrMetaData?.items ?? [])].sort((a, b) => a.position - b.position);
  // Render custom account fields (Уста / Санаси …) into the SAME row-aligned grid
  // as the standard fields so their columns line up. Even index = LEFT column
  // (starts a new row), odd index = MIDDLE column (pl-8 gutter), mirroring the
  // standard «Организация‖Склад» pairing.
  const renderCustomField = (m: AttributeMetaRow, i: number) => (
    <DocumentMetaField
      key={m.id}
      label={m.name}
      required={m.required}
      startRow={i % 2 === 0}
      className={i % 2 === 1 ? 'pl-8' : undefined}
    >
      <AttributeInput
        meta={m}
        value={customAttrs[m.code]}
        onChange={(v) =>
          setCustomAttrs((prev) => {
            if (v === '' || v == null) {
              const next = { ...prev };
              delete next[m.code];
              return next;
            }
            return { ...prev, [m.code]: v };
          })
        }
        testId={`field-attr-${m.code}`}
      />
    </DocumentMetaField>
  );

  // moysklad layout: the meta panel (Организация…Валюта + Уста/Санаси) sits
  // ABOVE the «Главная / Связанные документы» tabs and is ALWAYS visible — the
  // tabs switch only the lower content (positions/totals ↔ related docs). Live
  // customerorder/edit?new: tabs y≈437 sit between meta-bottom≈360 and
  // positions≈477.
  const metaPanel = (
    // moysklad parity: main-meta + custom-fields flow as ONE continuous block
    // (no gap), since DocumentMetaColumns is now borderless — the user flagged the
    // split into separate boxes.
    <div className="space-y-0">
      {/* moysklad b-operation-form-top — ROW-ALIGNED meta (measured
          ms-co-new-empty.jpeg, 2026-06-20): «Организация‖Склад»,
          «Контрагент‖Договор», «План.дата‖Проект» line up per row. A LEFT
          field's sub-row (account / Баланс) extends DOWN inside its own row
          (via `startRow`) instead of pulling the right field up beside it —
          the user flagged «Договор» creeping up across from «Организация» that
          the old independent DocumentMetaColumns produced. The wide
          Адрес/Комментарий column flows beside the pair, top-aligned. */}
      <div className="bg-[var(--ms-bg-surface)] px-4 py-3" data-test-id="doc-meta-panel">
        <div className="flex flex-col gap-x-12 gap-y-4 lg:flex-row lg:items-start">
          {/* LEFT + MIDDLE field columns, paired per row */}
          {/* Mobile: the fixed 4-col pair grid (~405px) drove page overflow —
              phones get the 2-col [label][field] stack, desktop unchanged. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,190px)_auto_minmax(0,190px)] items-baseline gap-x-2.5 gap-y-2.5">
            {/* Row 1 — Организация ‖ Склад */}
            <DocumentMetaField
              label={tFields('organization')}
              required
              startRow
              subRow={
                organizationId ? (
                  <CatalogPickerField
                    value={bankAccountId ? { id: bankAccountId, label: bankAccountLabel } : null}
                    placeholder={tForm('select_bank_account', { currency })}
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
                placeholder={tForm('select_organization')}
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
                  setBankAccountId(null);
                  setBankAccountLabel('');
                }}
              />
            </DocumentMetaField>
            {/* «Склад» IS required here: the save handler throws on an empty
                storeId and CreateCustomerOrderSchema types it as a plain uuid
                (not optional). It was rendered WITHOUT the asterisk, so the user
                only learned it was mandatory after pressing «Сохранить» — while
                the detail page marked it required. Marked here too (parity delta
                #37, internal-consistency half).
                NOTE: moysklad itself does NOT mark «Склад» required on a customer
                order. Making it genuinely optional is a BE + reservation-logic
                change (positions reserve against a store), so that half stays
                deferred rather than being faked by hiding the asterisk. */}
            <DocumentMetaField label={tFields('store')} required className="pl-8">
              <CatalogPickerField
                value={storeId ? { id: storeId, label: storeLabel } : null}
                placeholder={tForm('select_store')}
                onPick={() => setOpenPicker('store')}
                inlineFetcher={storeFetcher}
                onInlineSelect={(item) => {
                  setStoreId(item.id);
                  setStoreLabel(String(item.primary));
                }}
                onEdit={
                  storeId
                    ? () => window.open(`/stores/${storeId}`, '_blank', 'noopener')
                    : undefined
                }
                editLabel={tCommon('edit')}
                onClear={() => {
                  setStoreId(null);
                  setStoreLabel('');
                }}
              />
            </DocumentMetaField>

            {/* Row 2 — Контрагент ‖ Договор */}
            <DocumentMetaField
              label={tFields('agent')}
              required
              startRow
              error={agentInvalid ? tCommon('must_fill') : undefined}
              helper={
                agentId ? (
                  <span data-test-id="agent-balance" className="text-[var(--ms-text-primary)]">
                    {tDetailHeader('balance')} : {formatMoney(agentBalanceMinor, currency)}
                  </span>
                ) : undefined
              }
            >
              <CatalogPickerField
                value={agentId ? { id: agentId, label: agentLabel } : null}
                placeholder={tForm('select_customer')}
                invalid={agentInvalid}
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
                  setContractId(null);
                  setContractLabel('');
                }}
                onCreate={() => router.push('/counterparties/new')}
                createLabel={tForm('create_new_counterparty')}
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('contract')} className="pl-8">
              <CatalogPickerField
                value={contractId ? { id: contractId, label: contractLabel } : null}
                placeholder={agentId ? tForm('select_contract') : tForm('select_customer_first')}
                // moysklad greys «Договор» OUT until a counterparty is chosen —
                // contracts are agent-scoped, so the field is inert before then
                // (grounded 2026-07-31: the live /new form renders it disabled,
                // the live detail with an agent renders it active). We already
                // gated onPick, but the control still LOOKED editable and the
                // inline fetcher was reachable — parity delta #38.
                disabled={!agentId}
                onPick={() => agentId && setOpenPicker('contract')}
                inlineFetcher={contractFetcher}
                onInlineSelect={(item) => {
                  setContractId(item.id);
                  setContractLabel(String(item.primary));
                }}
                onClear={() => {
                  setContractId(null);
                  setContractLabel('');
                }}
              />
            </DocumentMetaField>

            {/* Row 3 — План. дата отгрузки ‖ Проект */}
            <DocumentMetaField label={tFields('delivery_planned')} startRow>
              <DatePicker
                value={deliveryDate || null}
                onChange={(d) => setDeliveryDate(d ?? '')}
                locale="ru-RU"
                testId="field-delivery-date"
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('project')} className="pl-8">
              <CatalogPickerField
                value={projectId ? { id: projectId, label: projectLabel } : null}
                placeholder={tForm('select_project')}
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
                onCreate={() => router.push('/settings/projects/new')}
                createLabel={tForm('create_new_project')}
              />
            </DocumentMetaField>

            {/* Row 4 — Канал продаж (alone on the left). moysklad's customer order
                has NO «Счёт контрагента» field — removed per user 2026-06-20
                «Kontragent hisobi kerak emas». */}
            <DocumentMetaField label={tFields('sales_channel')} startRow>
              <CatalogPickerField
                value={salesChannelId ? { id: salesChannelId, label: salesChannelLabel } : null}
                placeholder={tFields('sales_channel')}
                onPick={() => setOpenPicker('salesChannel')}
                inlineFetcher={salesChannelFetcher}
                onInlineSelect={(item) => {
                  setSalesChannelId(item.id);
                  setSalesChannelLabel(String(item.primary));
                }}
                onClear={() => {
                  setSalesChannelId(null);
                  setSalesChannelLabel('');
                }}
              />
            </DocumentMetaField>

            {/* Row 5 — Валюта документа (alone on the left) */}
            <DocumentMetaField
              label={tFields('currency_document')}
              required
              startRow
              helper={
                currency !== 'UZS' ? (
                  // moysklad: «1 {cur} = N UZS» with a «✎» that opens the rate modal.
                  <span className="inline-flex items-center gap-1.5">
                    <span className="tabular-nums">
                      1 {currency} ={' '}
                      {Number(effectiveRate).toLocaleString('ru-RU', { maximumFractionDigits: 4 })}{' '}
                      UZS
                    </span>
                    <button
                      type="button"
                      onClick={() => setRateModalOpen(true)}
                      className="shrink-0 text-[var(--ms-text-brand)] text-xs"
                      aria-label={tForm('rate_edit')}
                      data-test-id="rate-edit"
                    >
                      ✎
                    </button>
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
                {currencies.length === 0 && <option value={currency}>{currency}</option>}
                {currencies.map((c) => (
                  <option key={c.id} value={c.isoCode}>
                    {c.name} ({c.isoCode})
                  </option>
                ))}
              </NativeSelect>
            </DocumentMetaField>

            {/* Custom account fields (Уста ‖ Санаси …) — SAME grid so their
                columns line up with the standard fields above. */}
            {customFields.map((m, i) => renderCustomField(m, i))}
          </div>

          {/* RIGHT — Адрес доставки + Комментарий (wide column, top-aligned).
              moysklad shows NO placeholder here — the left label names the field. */}
          <div className="grid grid-cols-[auto_minmax(0,280px)] content-start items-start gap-x-2.5 gap-y-2.5">
            <DocumentMetaField label={tFields('delivery_address')}>
              <DeliveryAddressGroup
                value={deliveryAddressFull}
                onChange={setDeliveryAddressFull}
                text={deliveryAddressText}
                onTextChange={setDeliveryAddressText}
              />
            </DocumentMetaField>
            <DocumentMetaField label={tFields('description')}>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-label={tFields('description')}
                className="min-h-[34px] text-[12px]"
                data-test-id="field-description-meta"
              />
            </DocumentMetaField>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs = [
    {
      key: 'main',
      // moysklad old-design create form: the first tab is «Главная» (2026-07-09).
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
              top-right corner (same spot in every section). */}
          <div className="-mb-2.5 flex justify-end">
            <PositionAgreementButton
              totalMinor={totals.gross}
              currency={currency}
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
            autoFocusRowId={lastAddedId}
            editableReserve
            // moysklad sales-grid parity: «Остаток»/«Доступно» ≤ 0 shows red.
            warnStock
            // moysklad parity (user 2026-06-20 «Нет позиций kerak emas»): no empty
            // placeholder row — the add-line sits directly under the header.
            emptyText=""
            rows={positions}
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
            // moysklad «Наименование ▾» — sort the document's lines by name/code,
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
                      available: p.stock?.available != null ? Number(p.stock.available) : 0,
                      priceMinor: resolveDefaultSalePriceOrZero(p.salePrices),
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
                pickModal={{
                  currency,
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
                  if (entry?.permanent) {
                    // «Doimiy narx» — persist to the product card (owner 2026-07-17).
                    api
                      .post(`/products/${item.id}/sale-price`, { priceMinor: entry.priceMinor })
                      .then(() => toast.success(tPos('pick_modal_price_saved')))
                      .catch(() => toast.error(tPos('pick_modal_price_save_failed')));
                  }
                  const raw = item.raw as ProductItem | undefined;
                  const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
                  const newId = uid();
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: newId,
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productCode: raw?.code ?? undefined,
                      productArticle: raw?.article ?? undefined,
                      productUom: raw?.uom ?? null,
                      quantity: entry?.quantity ?? '1',
                      priceMinor: entry?.priceMinor ?? defaultPrice,
                      discount: '0',
                      vat: raw?.vat != null ? String(raw.vat) : '12',
                      vatEnabled: true,
                      stock: raw?.stock?.onHand,
                      reserve: '0',
                      available: raw?.stock?.available,
                      waiting: raw?.stock?.inTransit,
                      weightG: raw?.weightG ?? undefined,
                      volumeML: raw?.volumeML ?? undefined,
                      imageUrl: raw?.mainImageId ? imageRawUrl(raw.mainImageId) : undefined,
                      salePrices: raw?.salePrices ?? null,
                      folderPath: raw?.productFolder?.pathName ?? undefined,
                    },
                  ]);
                  // moysklad parity: focus the new line's «Кол-во» right away.
                  setLastAddedId(newId);
                  // owner 2026-07-18: returning the id hands focus to the new
                  // row's «Кол-во» (modal → table entry chain).
                  return newId;
                }}
                onAddFromCatalog={() => setProductModalOpen(true)}
                onCheckCompleteness={() => {
                  if (!storeId) {
                    toast.error(t('select_store_first'));
                    return;
                  }
                  if (positions.length === 0) {
                    toast.error(t('add_position_first'));
                    return;
                  }
                }}
              />
            }
          />

          {/* Bottom band (moysklad parity): the document Комментарий is a big
              textarea below the positions (NOT in the meta right column — that
              slot is the address-widget comment), with the «Внешний код» link
              beneath it; totals panel on the right. */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex w-[520px] max-w-full flex-col gap-3 text-sm">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={tFields('description')}
                aria-label={tFields('description')}
                data-test-id="field-description"
              />
              {showExternalCode ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{tFields('external_code')}</span>
                  <input
                    type="text"
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                    className="h-[var(--ms-control-h)] w-56 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
                    data-test-id="field-external-code"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowExternalCode(true)}
                  className="text-[var(--ms-text-brand)] hover:underline"
                  data-test-id="external-code-toggle"
                >
                  {tFields('external_code')}
                </button>
              )}
            </div>
            <DocumentTotalsPanel
              labels={totalsLabels}
              subtotalMinor={totals.net}
              vatMinor={totals.vat}
              totalMinor={totals.gross}
              currency={currency}
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
      // moysklad OLD-design create form (re-grounded 2026-07-09, user screenshots):
      // /new has TWO tabs only — Главная + «Связанные документы»; Задачи and Файлы
      // are bottom sections INSIDE this tab. Everything works IN PLACE (no save,
      // no navigation) — picks are staged and persisted by staging.flush() after save.
      content: (
        <NewDocRelatedTab
          current={{
            id: 'new',
            name: docNumber,
            moment: docDate ? new Date(docDate).toISOString() : new Date().toISOString(),
            sumMinor: String(totals.gross),
            state: applicable ? 'posted' : 'draft',
            kind: 'customer-order',
          }}
          entityType="CustomerOrder"
          staging={staging}
          linkDefaults={{
            agent: agentId ? { id: agentId, name: agentLabel } : null,
            organization: organizationId ? { id: organizationId, name: organizationLabel } : null,
            storeTo: storeId ? { id: storeId, name: storeLabel } : null,
          }}
        />
      ),
    },
    // «Файлы»/«Задачи» moved INTO the related tab (moysklad old-design, 2026-07-09).
    // «События» HIDDEN behind SHOW_NEW_EVENTS_TAB — code kept for re-enabling.
    ...(SHOW_NEW_EVENTS_TAB
      ? [
          {
            key: 'events',
            label: tDetailTabs('events'),
            content: (
              <div className="space-y-3 bg-[var(--ms-bg-surface)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-[var(--ms-text-primary)] text-base">
                    {tDetailTabs('events_title')}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled
                    data-test-id="events-watch-button"
                  >
                    <Icons.visible className="h-4 w-4" />
                    {tDetailTabs('events_watch')}
                  </Button>
                </div>
                <Textarea
                  value=""
                  readOnly
                  disabled
                  rows={3}
                  placeholder={tDetailTabs('events_comment_placeholder')}
                  data-test-id="events-comment-input"
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="primary" size="sm" disabled>
                    {tDetailTabs('events_post')}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" disabled>
                    {tDetailTabs('events_cancel')}
                  </Button>
                </div>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="customer-order-new-page"
        documentTypeLabel={tDetailTitles('customer_order')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={statusId ?? ''}
        statusOptions={statusOptions}
        onStatusChange={setStatusId}
        paymentLabel={tDetailHeader('not_paid')}
        requestPaymentLabel={tDetailHeader('request_payment')}
        onRequestPayment={() => {
          if (hasOversold) return;
          afterSaveRef.current = 'payment';
          createMut.mutate();
        }}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        // «Резерв» — mirrors the detail header; drives the same bulk helpers the
        // «Зарезерв. ▾» column menu uses, so both surfaces agree.
        reserve={allLinesReserved}
        onReserveChange={(next) => (next ? setAllReserve() : clearAllReserve())}
        reserveLabel={tDetailHeader('reserve')}
        reserveHelp={tDetailHeader('reserve_help')}
        waiting={undefined}
        onSave={() => {
          if (hasOversold) return;
          if (!agentId) {
            setAgentInvalid(true);
            setSaveError(tCommon('must_fill'));
            return;
          }
          setSaveError(null);
          afterSaveRef.current = 'view';
          createMut.mutate();
        }}
        error={saveError}
        saving={createMut.isPending}
        saveDisabled={hasOversold}
        // Oversold feedback is the RED ROW in the position grid only (owner
        // request 2026-07-07): the big top banner was too loud — moysklad just
        // tints the offending line. Save stays disabled (saveDisabled) and the
        // row highlight (isRowOversold) marks exactly where; genuine API/validation
        // errors still surface via the top-right toast (createMut.onError).
        onClose={() => router.push('/customer-orders')}
        modifyMenu={[
          // moysklad «Изменить» on the order = [Удалить, Копировать]. On /new
          // (nothing saved yet): Удалить discards back to the list; Копировать
          // saves first, then lands on the order's detail (where the clone
          // action lives).
          {
            label: tBulk('copy'),
            onClick: () => {
              afterSaveRef.current = 'view';
              createMut.mutate();
            },
          },
          {
            label: tBulk('delete'),
            onClick: () => router.push('/customer-orders'),
            destructive: true,
          },
        ]}
        createDocMenu={[
          // moysklad «Создать документ» — the full 11-item list in live order
          // (screenshot co-live-2026-06-18/03). Each saves the order first, then
          // opens the target /new pre-filled (?fromOrder). Three items are
          // disabled: we have no Волна отбора / Розничная продажа / Снабжение
          // document subsystem yet (separate modules — future scope).
          {
            label: tDetailTitles('move'),
            onClick: () => {
              afterSaveRef.current = 'move';
              createMut.mutate();
            },
          },
          {
            label: tDetailTitles('invoice_out'),
            onClick: () => {
              afterSaveRef.current = 'invoice';
              createMut.mutate();
            },
          },
          { label: tDetailTitles('picking_wave'), disabled: true },
          {
            label: tDetailTitles('demand'),
            onClick: () => {
              afterSaveRef.current = 'demand';
              createMut.mutate();
            },
          },
          {
            label: tDetailTitles('payment_in'),
            onClick: () => {
              afterSaveRef.current = 'payment';
              createMut.mutate();
            },
          },
          {
            label: tDetailTitles('cash_in'),
            onClick: () => {
              afterSaveRef.current = 'cash-in';
              createMut.mutate();
            },
          },
          {
            label: tDetailTitles('prepayment'),
            onClick: () => {
              afterSaveRef.current = 'prepayment';
              createMut.mutate();
            },
          },
          {
            label: tDetailTitles('purchase_order'),
            onClick: () => {
              afterSaveRef.current = 'purchase-order';
              createMut.mutate();
            },
          },
          {
            label: tDetailTitles('po_with_available'),
            onClick: () => {
              afterSaveRef.current = 'po-available';
              createMut.mutate();
            },
          },
          { label: tDetailTitles('retail_sale'), disabled: true },
          { label: tDetailTitles('supply_planning'), disabled: true },
        ]}
        printMenu={[
          // moysklad «Печать» = [Заказ, Комплект…, Настроить…]. «Заказ» saves
          // then opens the standalone print view; «Настроить…» opens the
          // right-side «Настройка шаблонов» slide-over (no settings page).
          // The account's own custom forms come FIRST (above the standard form) —
          // each saves the order (it can't print before it exists), then renders
          // that form's PDF via bulk-print.
          ...printForms.map((f) => ({
            label: f.name,
            onClick: () => {
              printTargetRef.current = { kind: 'form' as const, templateId: f.id };
              afterSaveRef.current = 'print' as const;
              createMut.mutate();
            },
          })),
          {
            label: tPrint('order_form'),
            onClick: () => {
              printTargetRef.current = { kind: 'view' };
              afterSaveRef.current = 'print';
              createMut.mutate();
            },
          },
          {
            // «Лист сборки» — joriy formadagi pozitsiyalarning yacheykali yig'ish
            // varag'i (climart 2026-07-28); saqlash shart emas.
            label: tSpiska('spiska_form'),
            onClick: () => void openSpiska(),
          },
          {
            // «Товарный чек» — mijoz cheki (narx/summa/jami/so'z bilan; climart 2026-07-29).
            label: tSpiska('receipt_title_customer'),
            onClick: () => openCustomerReceipt(),
          },
          { divider: true, label: '' },
          {
            label: tPrint('configure'),
            onClick: () => openTemplates('customerorder'),
          },
        ]}
        sendMenu={[
          // moysklad «Отправить» sends a print template by email. On /new: save
          // first, then land on the order's detail (the email composer lives
          // there).
          {
            label: tPrint('order_form'),
            onClick: () => {
              afterSaveRef.current = 'view';
              createMut.mutate();
            },
          },
        ]}
        // moysklad pins each configured print form as its OWN button right after
        // «Отправить». Each saves the order first, then renders that form's PDF.
        trailingSlot={printForms.map((f) => (
          <Button
            key={f.id}
            type="button"
            variant="secondary"
            size="sm"
            // «Past ko'k» — check-print type buttons stand out in a soft blue
            // (brand-100 fill · brand-600 text · brand-300 border), matching
            // purchase-orders/new + supplies/new. Owner request 2026-07-15/16.
            className="border-[var(--ms-brand-300)] bg-[var(--ms-brand-100)] text-[var(--ms-brand-600)] hover:bg-[var(--ms-brand-200)] hover:text-[var(--ms-brand-700)]"
            onClick={() => {
              printTargetRef.current = { kind: 'form', templateId: f.id };
              afterSaveRef.current = 'print';
              createMut.mutate();
            }}
            data-test-id={`toolbar-print-form-${f.id}`}
          >
            <Icons.print className="h-4 w-4" />
            {f.name}
          </Button>
        ))}
        rightSlot={<OwnerAccessPopover value={ownerAccess} onChange={setOwnerAccess} />}
      >
        <>
          {metaPanel}
          <DocumentTabs tabs={tabs} defaultActiveKey="main" />
        </>
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'agent'}
        onClose={() => setOpenPicker(null)}
        title={tForm('customer_picker_title')}
        fetcher={agentFetcher}
        onSelect={(item) => {
          setAgentInvalid(false);
          setSaveError(null);
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
        open={openPicker === 'salesChannel'}
        onClose={() => setOpenPicker(null)}
        title={tFields('sales_channel')}
        fetcher={salesChannelFetcher}
        onSelect={(item) => {
          setSalesChannelId(item.id);
          setSalesChannelLabel(String(item.primary));
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
          const defaultPrice = resolveDefaultSalePriceOrZero(raw?.salePrices);
          updatePosition(openPicker.rowUid, {
            assortmentId: item.id,
            productLabel: String(item.primary),
            productCode: raw?.code ?? undefined,
            productArticle: raw?.article ?? undefined,
            productUom: raw?.uom ?? null,
            priceMinor: defaultPrice,
            vat: raw?.vat != null ? String(raw.vat) : '12',
            stock: raw?.stock?.onHand,
            reserve: '0',
            available: raw?.stock?.available,
            waiting: raw?.stock?.inTransit,
            weightG: raw?.weightG ?? undefined,
            volumeML: raw?.volumeML ?? undefined,
            imageUrl: raw?.mainImageId ? imageRawUrl(raw.mainImageId) : undefined,
            salePrices: raw?.salePrices ?? null,
            folderPath: raw?.productFolder?.pathName ?? undefined,
          });
        }}
      />
      {currency !== 'UZS' && (
        <CurrencyRateModal
          open={rateModalOpen}
          onOpenChange={setRateModalOpen}
          currency={currency}
          referenceRate={adminRate ?? '1'}
          currentOverride={rateOverride}
          onApply={setRateOverride}
        />
      )}

      <ProductSelectModal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        currency={currency}
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
            // moysklad «Фильтр» discrete fields (live-grounded 2026-06-20) — wired
            // to /products params the list endpoint already accepts.
            description: tFilters('description'),
            article: tFilters('article'),
            code: tFilters('code'),
            externalCode: tFilters('external_code'),
            supplier: tFilters('supplier'),
            supplierPlaceholder: tFilters('supplier'),
            // Stock-based filters (live-grounded 2026-06-20) — wired to the
            // stockFilter / availableFilter / hasReserve / hasIncoming params.
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
            ...rows.map(({ product, quantity }) => ({
              id: uid(),
              assortmentId: product.id,
              productLabel: product.name,
              productCode: product.code ?? undefined,
              productArticle: product.article ?? undefined,
              productUom: product.uom,
              quantity: Number(quantity) > 0 ? quantity : '1',
              priceMinor: resolveDefaultSalePriceOrZero(product.salePrices),
              discount: '0',
              vat: product.vat != null ? String(product.vat) : '12',
              vatEnabled: true,
              stock: product.stock?.onHand,
              reserve: '0',
              available: product.stock?.available,
              waiting: product.stock?.inTransit,
              weightG: (product as { weightG?: number | null }).weightG ?? undefined,
              volumeML: (product as { volumeML?: number | null }).volumeML ?? undefined,
              imageUrl: product.mainImageId ? imageRawUrl(product.mainImageId) : undefined,
              salePrices: product.salePrices ?? null,
              folderPath:
                (product as { productFolder?: { pathName?: string | null } }).productFolder
                  ?.pathName ?? undefined,
            })),
          ]);
        }}
        onCreate={() => {
          setProductModalOpen(false);
          router.push('/products/new');
        }}
      />
      {spiska && <ReceiptPrintPortal data={spiska} onClose={() => setSpiska(null)} />}
      {creceipt && <CustomerReceiptPortal data={creceipt} onClose={() => setCreceipt(null)} />}
    </>
  );
}
