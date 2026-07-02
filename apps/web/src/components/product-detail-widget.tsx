'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { CreateModificationsModal } from '@/components/products/create-modifications-modal';
import { PackNameCell } from '@/components/products/pack-name-cell';
import {
  ProductSelectModal,
  type ProductSelectRow,
} from '@/components/products/product-select-modal';
import { BARCODE_TYPES, barcodeTypeLabel, genEan13 } from '@/components/products/use-product-form';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import {
  Button,
  Combobox,
  type ComboboxItem,
  Icons,
  Input,
  Modal,
  MultiCombobox,
  NativeSelect,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  currencyDisplayName,
  formatDate,
  formatMoney,
  useToast,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type DragEvent, type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';

/**
 * products/[id] RIGHT tabbed widget (B5 S?) — moysklad parity.
 *
 * DOM-grounded tab set (docs/audits/_B5-B6-DESIGN-GROUNDING-2026-06-13.md:24,
 * captured from the live product card): Цены · Модификации · Аналоги · Упаковка ·
 * Остатки · История · Файлы. Replaces the prior flat AttachmentsSection + 2-tab
 * audit DocumentTabs with moysklad's tabbed widget.
 *
 * Each tab wired against an EXISTING endpoint (grounded 2026-06-13):
 *   - Цены       → product entity buyPrice/minPrice/salePrices (already loaded)
 *   - Модификации → GET /variants?productId=<id>
 *   - Остатки     → GET /reports/stock-balance?productId=<id> (per-store rows)
 *   - История     → GET /reports/product-movement?productId=<id> — two live-grounded
 *                   (2026-06-25) paginated sub-sections (Закупки = SupplyPosition,
 *                   Продажи = DemandPosition), each a borderless table № · Тип
 *                   документа · Время · Контрагент · Количество · Цена · Валюта with
 *                   «№»→document and «Контрагент»→counterparty links and a moysklad
 *                   «« ‹ N-M из T › »» pager (MovementSection). See 51b/hist captures.
 *   - Упаковка     → product entity `packs[]` (already loaded). EDITABLE inline-row
 *                   table, 1:1 with moysklad's pack tab columns: Наименование ·
 *                   Количество · Ед. измерения (Combobox) · Тип кода (barcode
 *                   symbology ▾, default EAN13 — ProductPack.codeType) · Штрихкод
 *                   упаковки. Persisted through the product card's existing PATCH
 *                   /products/:id `packs[]` + optimistic-lock `version` path (the
 *                   page owns the form/save — packs are lifted into it like the
 *                   barcode chips, so one Save button writes everything). Quantity
 *                   is `multiplier ÷ 1000` for display and `× 1000` on save, done as
 *                   BigInt string math (NO float — multiplier is an integer minor
 *                   scale, same convention as Position.quantity). NB «Код упаковки
 *                   ТАСНИФ» is NOT a pack-row column — moysklad keeps it as the
 *                   product-level «Особенности учёта» field (left form); it
 *                   round-trips here via the base pack only.
 *   - Файлы       → AttachmentsSection (entity='Product')
 * Аналоги has no backend module yet → honest empty placeholder (named, not hidden);
 * it's a later backend slice.
 */

interface SalePrice {
  priceTypeId: string;
  value: string;
}

interface VariantRow {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  buyPrice: string | null;
  // moysklad's Модификации grid shows one column per characteristic (Цвет/Размер/…)
  // and the retail sale price; both ride along on the variant list response.
  characteristics?: { name: string; value: string }[];
  salePrices?: { priceTypeId: string; value: string }[];
}

/** One «Аналоги» row — GET /products/:id/analogs. `freeStock` = the analog's
 *  «Свободный остаток» (on-hand − reserved) as a whole-unit string; `salePrice`
 *  = its default-tier «Розничная цена» in minor units. `isSelf` marks the bold
 *  reference row = the route product itself (no link, no remove «×»). */
interface AnalogRow {
  analogId: string;
  name: string;
  code: string | null;
  article: string | null;
  archived: boolean;
  freeStock: string;
  salePrice?: string;
  isSelf?: boolean;
}

interface StockRow {
  storeId: string | null;
  storeName: string | null;
  qty: string;
  reservedQty: string;
  inTransitQty: string;
  available: string;
}

interface MovementRow {
  docId: string;
  docType: 'supply' | 'demand';
  docRoute: 'supplies' | 'demands';
  name: string;
  moment: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  quantityMilli: string;
  priceMinor: string;
  currency: string;
}

interface ProductMovement {
  purchases: MovementRow[];
  sales: MovementRow[];
}

/**
 * Editable pack row held by the parent page (lifted out of this widget, like the
 * barcode chips, so the card's single Save button persists everything in one
 * PATCH). `multiplier` stays in the on-the-wire ×1000 minor scale; `barcode` is
 * '' when empty (mapped to undefined on save). `id` may be a temporary client id
 * for newly-added rows — the backend wholesale-replaces packs so it's ignored on
 * write and only used as a stable React key.
 */
export interface PackDraft {
  id: string;
  name: string;
  uomCode: string;
  multiplier: string;
  barcode: string;
  // «Тип кода» — barcode symbology for this pack's `barcode` (ean13/ean8/code128/
  // gtin), moysklad's pack-row column. Defaults to 'ean13'.
  codeType: string;
  // «Код упаковки ТАСНИФ» — UZ TASNIF package classification code (optional).
  // NOT shown as a pack-table column (moysklad keeps it as the product-level
  // «Особенности учёта» field); carried here only for the base-pack round-trip.
  tasnifCode: string;
}

export interface ProductDetailWidgetProps {
  productId: string;
  buyPrice: string | null;
  minPrice: string | null;
  salePrices: SalePrice[] | null;
  /** Editable packs (lifted into the page form). */
  packs: PackDraft[];
  /** Mutate the packs list — flips the page's dirty flag so Save lights up. */
  onPacksChange: (next: PackDraft[]) => void;
  /**
   * «Ед. измерения» options for the pack rows — the same uom reference the main
   * form uses (a searchable Combobox, moysklad parity). Optional so read-only
   * callers that don't edit packs can omit it (falls back to a plain input).
   */
  uomItems?: ComboboxItem[];
  /** Tab to show first — moysklad continuity when arriving from /new's ➕ buttons. */
  initialTab?: string;
  /** Open «Создание модификаций» on mount (arriving via «+ Модификация» on /new). */
  autoOpenModifications?: boolean;
  /**
   * Editable «Цены» content (the shared ProductPriceEditor). When provided — the
   * edit form (/products/[id]) — it replaces the read-only price table so prices
   * are edited inline, exactly like the create form. Omitted on read-only callers.
   */
  pricesEditor?: ReactNode;
}

/**
 * Pack «Количество» ↔ stored multiplier (×1000) conversions. BigInt-only — the
 * multiplier is an integer minor scale, so we never touch float (12.345 × 1000
 * must be exactly 12345, not 12344.999…). Mirrors the page's minorToDecimal /
 * decimalToMinor money helpers, but tuned for a pack qty (keeps a "0" rather than
 * blanking it, and tolerates an in-progress empty draft).
 */
function multiplierToQty(multiplier: string): string {
  if (!multiplier) return '';
  const big = BigInt(multiplier);
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const whole = abs / 1000n;
  const frac = (abs % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  const body = frac ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

/** Display qty "12.5" → stored multiplier "12500" (×1000), BigInt-exact. */
function qtyToMultiplier(qty: string): string {
  const trimmed = qty.trim().replace(',', '.');
  if (!trimmed) return '0';
  const [whole = '0', frac = ''] = trimmed.split('.');
  const fracPadded = `${frac}000`.slice(0, 3);
  const wholeBig = BigInt(whole || '0');
  return (wholeBig * 1000n + BigInt(fracPadded)).toString();
}

// moysklad shows 5 movement rows per «История» sub-section page (live-grounded:
// the pager reads «1-5 из 29» on a product with 29 sales).
const MOVEMENT_PAGE_SIZE = 5;

/**
 * One «История» sub-section (Закупки / Продажи) — 1:1 with moysklad: a BORDERLESS
 * grey-header table (№ · Тип документа · Время · Контрагент · Количество · Цена ·
 * Валюта) where «№» links to the document and «Контрагент» to the counterparty,
 * plus a moysklad «« ‹ N-M из T › »» pager shown ALWAYS — even with 0 rows the
 * header + pager render (moysklad parity, NOT an empty-text placeholder). Client-
 * paginates the already-loaded rows (the report returns up to 200 per section).
 * Top-level (not a closure) so each section keeps its own `page` state across the
 * parent's re-renders.
 */
function MovementSection({
  heading,
  rows,
  testId,
}: {
  heading: string;
  rows: MovementRow[];
  testId: string;
}) {
  const t = useTranslations('product_detail_widget');
  const tDocType = useTranslations('detail_titles');
  const tPager = useTranslations('pagination');
  const router = useRouter();
  const [page, setPage] = useState(0);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / MOVEMENT_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * MOVEMENT_PAGE_SIZE;
  const pageRows = rows.slice(start, start + MOVEMENT_PAGE_SIZE);
  const th = 'px-2 pb-1.5 text-left align-bottom font-normal text-[var(--ms-text-muted)] text-xs';
  // moysklad parity (live-grounded 2026-06-25): «№» / «Контрагент» links are blue
  // and UNDERLINED AT REST (not hover-only), the «Время» date is NORMAL text (not
  // muted) — same darkness as «Тип документа».
  const link = 'text-[var(--ms-text-brand)] underline';
  // moysklad embedded-table pager (live-grounded 2026-06-25): «[‹‹][‹] N-M из T
  // [›][››]» — the page count is CENTERED between two SQUARE bordered arrow-button
  // pairs, NOT the count-left / plain-chevron shared DS list-footer pager. A
  // dedicated local pager so the shared DS one (lists) is untouched. Empty section
  // reads «1-1 из 0» (moysklad parity).
  const isFirst = safePage === 0;
  const isLast = safePage >= pageCount - 1;
  const pagerFrom = total === 0 ? 1 : start + 1;
  const pagerTo = total === 0 ? 1 : start + pageRows.length;
  const pagerBtn =
    'flex h-[22px] w-[22px] items-center justify-center rounded-[3px] border border-[var(--ms-border-default)] text-[var(--ms-text-muted)] transition-colors hover:bg-[var(--ms-bg-muted)] disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <section data-test-id={testId}>
      <h3 className="mb-2 font-semibold text-[var(--ms-text-default)] text-sm">{heading}</h3>
      <table className="w-full border-collapse text-sm">
        <thead>
          {/* moysklad parity: the column-header row sits on a thick BRAND-BLUE
            underline (live-grounded), not a thin grey rule. */}
          <tr className="border-[var(--ms-text-brand)] border-b-2">
            <th className={th}>{t('hist_col_number')}</th>
            <th className={th}>{t('hist_col_type')}</th>
            <th className={th}>{t('hist_col_date')}</th>
            <th className={th}>{t('hist_col_counterparty')}</th>
            <th className={`${th} text-right`}>{t('hist_col_qty')}</th>
            <th className={`${th} text-right`}>{t('hist_col_price')}</th>
            <th className={`${th} w-20`}>{t('hist_col_currency')}</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => (
            <tr
              key={`${row.docType}-${row.docId}`}
              className="border-[var(--ms-border-default)] border-b last:border-0"
              data-test-id="movement-row"
            >
              <td className="px-2 py-1.5">
                <button
                  type="button"
                  className={link}
                  onClick={() => router.push(`/${row.docRoute}/${row.docId}`)}
                >
                  {row.name}
                </button>
              </td>
              <td className="px-2 py-1.5">{tDocType(row.docType)}</td>
              <td className="px-2 py-1.5">{formatDate(row.moment)}</td>
              <td className="px-2 py-1.5">
                {row.counterpartyName ? (
                  row.counterpartyId ? (
                    <button
                      type="button"
                      className={link}
                      onClick={() => router.push(`/counterparties/${row.counterpartyId}`)}
                    >
                      {row.counterpartyName}
                    </button>
                  ) : (
                    row.counterpartyName
                  )
                ) : (
                  '—'
                )}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {Number(row.quantityMilli) / 1000}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoney(BigInt(row.priceMinor), row.currency, { displayAs: 'none' })}
              </td>
              <td className="px-2 py-1.5 text-[var(--ms-text-muted)]">
                {currencyDisplayName(row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-1 text-xs" data-test-id={`${testId}-pager`}>
        <button
          type="button"
          className={pagerBtn}
          disabled={isFirst}
          onClick={() => setPage(0)}
          aria-label={tPager('first')}
          data-test-id="movement-pager-first"
        >
          <Icons.pageFirst className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className={pagerBtn}
          disabled={isFirst}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          aria-label={tPager('previous')}
        >
          <Icons.left className="size-3.5" aria-hidden />
        </button>
        <span
          className="mx-3 min-w-[64px] text-center font-medium text-[var(--ms-text-default)] tabular-nums"
          data-test-id="pagination-range"
        >
          {pagerFrom}-{pagerTo} {tPager('of')} {total}
        </span>
        <button
          type="button"
          className={pagerBtn}
          disabled={isLast}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          aria-label={tPager('next')}
        >
          <Icons.right className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className={pagerBtn}
          disabled={isLast}
          onClick={() => setPage(pageCount - 1)}
          aria-label={tPager('last')}
          data-test-id="movement-pager-last"
        >
          <Icons.pageLast className="size-3.5" aria-hidden />
        </button>
      </div>
    </section>
  );
}

export function ProductDetailWidget({
  productId,
  buyPrice,
  minPrice,
  salePrices,
  packs,
  onPacksChange,
  uomItems,
  initialTab,
  autoOpenModifications,
  pricesEditor,
}: ProductDetailWidgetProps) {
  const t = useTranslations('product_detail_widget');
  const tProduct = useTranslations('pages.product_new');
  const tCommon = useTranslations('common');
  const tProductSelect = useTranslations('product_select');
  const tFilters = useTranslations('filters');
  const router = useRouter();
  const [modModalOpen, setModModalOpen] = useState(false);
  // Open «Создание модификаций» when arriving with ?open=variants (from /new's
  // «+ Модификация»). A useEffect — NOT a useState initializer — so it fires
  // reliably once the searchParams-derived prop resolves on the client (a
  // useState initializer can latch a stale `false` during hydration / a soft
  // navigation and then never reopen).
  useEffect(() => {
    if (autoOpenModifications) setModModalOpen(true);
  }, [autoOpenModifications]);

  const movementQuery = useQuery<ProductMovement>({
    queryKey: ['product-movement', productId],
    queryFn: () =>
      api.get<ProductMovement>(`/reports/product-movement?productId=${productId}&limit=200`),
  });
  const purchases = movementQuery.data?.purchases ?? [];
  const sales = movementQuery.data?.sales ?? [];

  const variantsQuery = useQuery<{ items: VariantRow[] }>({
    queryKey: ['variants', 'by-product', productId],
    queryFn: () => api.get<{ items: VariantRow[] }>(`/variants?productId=${productId}&limit=100`),
  });
  const variants = variantsQuery.data?.items ?? [];

  // «Аналоги» — substitute products for this one. Load + add/remove against
  // /products/:id/analogs; the «Аналог» button opens the rich «Выбор товара»
  // modal (ProductSelectModal) in selection mode — folder tree + filter +
  // stock/code/article/country/weight columns, exactly like moysklad.
  const qc = useQueryClient();
  const { toast } = useToast();
  const { runDestructive } = useDestructiveMutation();
  const [analogPickerOpen, setAnalogPickerOpen] = useState(false);
  // «Модификации» grid: «Фильтр» toggles moysklad's panel — a «Код» text field +
  // one MultiCombobox per characteristic (filter variants by code + chosen values).
  const [variantFilterOpen, setVariantFilterOpen] = useState(false);
  const [variantCodeFilter, setVariantCodeFilter] = useState('');
  const [variantCharFilters, setVariantCharFilters] = useState<Record<string, string[]>>({});
  const analogsQuery = useQuery<{ items: AnalogRow[] }>({
    queryKey: ['product-analogs', productId],
    queryFn: () => api.get<{ items: AnalogRow[] }>(`/products/${productId}/analogs`),
  });
  const analogs = analogsQuery.data?.items ?? [];

  // Add every product the user checked in the picker. The modal already
  // checks+disables the linked ones (disabledIds), so duplicates are unlikely;
  // any 409 race surfaces moysklad's «Такой аналог уже добавлен» once.
  const addAnalogs = async (products: ProductSelectRow[]) => {
    const results = await Promise.allSettled(
      products
        .filter((p) => p.id !== productId)
        .map((p) => api.post(`/products/${productId}/analogs`, { analogId: p.id })),
    );
    await qc.invalidateQueries({ queryKey: ['product-analogs', productId] });
    const dup = results.some(
      (r) => r.status === 'rejected' && (r.reason as { status?: number })?.status === 409,
    );
    const failed = results.some(
      (r) => r.status === 'rejected' && (r.reason as { status?: number })?.status !== 409,
    );
    if (dup) toast.warning(t('analog_already_added'));
    if (failed) toast.error(tCommon('save_failed'));
  };

  const removeAnalog = async (analogId: string) => {
    try {
      await api.delete(`/products/${productId}/analogs/${analogId}`);
      await qc.invalidateQueries({ queryKey: ['product-analogs', productId] });
    } catch {
      toast.error(tCommon('save_failed'));
    }
  };

  const stockQuery = useQuery<{ items: StockRow[] }>({
    queryKey: ['product-stock', productId],
    queryFn: () =>
      api.get<{ items: StockRow[] }>(`/reports/stock-balance?productId=${productId}&groupBy=none`),
  });
  const stock = stockQuery.data?.items ?? [];

  // moysklad shows «Файлы (N)» on the tab — count via the SAME key AttachmentsSection
  // uses, so React Query dedupes (no extra fetch when the tab opens).
  const filesQuery = useQuery<{ items: unknown[] }>({
    queryKey: ['attachments', 'Product', productId],
    queryFn: () =>
      api.get<{ items: unknown[] }>(`/attachments?entity=Product&entityId=${productId}`),
    enabled: !!productId,
  });
  const filesCount = filesQuery.data?.items?.length ?? 0;

  const priceTypesQuery = useQuery<{ items: { id: string; name: string; isDefault?: boolean }[] }>({
    queryKey: ['price-types', 'all'],
    queryFn: () =>
      api.get<{ items: { id: string; name: string; isDefault?: boolean }[] }>(
        '/price-types?limit=100',
      ),
    staleTime: 5 * 60 * 1000,
  });
  const priceTypeName = (id: string) =>
    priceTypesQuery.data?.items.find((p) => p.id === id)?.name ?? id;
  // «Розничная цена» column header — the account's DEFAULT price-type name
  // (first tier as a fallback, then the i18n label when none are configured).
  const defaultPriceType =
    priceTypesQuery.data?.items.find((p) => p.isDefault) ?? priceTypesQuery.data?.items[0];

  // ── «Модификации» grid (moysklad: Код · Артикул · <characteristic…> · Розничная цена) ──
  // One column per distinct characteristic name across the variants.
  const variantCharNames: string[] = [];
  for (const v of variants) {
    for (const c of v.characteristics ?? []) {
      if (!variantCharNames.includes(c.name)) variantCharNames.push(c.name);
    }
  }
  const charValue = (v: VariantRow, name: string) =>
    v.characteristics?.find((c) => c.name === name)?.value ?? '';
  // Distinct values of one characteristic across the variants — the filter options.
  const charValuesFor = (name: string): ComboboxItem[] => {
    const seen: string[] = [];
    for (const v of variants) {
      const val = charValue(v, name);
      if (val && !seen.includes(val)) seen.push(val);
    }
    return seen.map((val) => ({ value: val, label: val }));
  };
  // Retail = first price type; a variant inherits the parent's retail when it has no own.
  const retailTypeId = priceTypesQuery.data?.items[0]?.id;
  const parentRetail = salePrices?.[0]?.value ?? null;
  const variantRetail = (v: VariantRow): string | null =>
    v.salePrices?.find((sp) => sp.priceTypeId === retailTypeId)?.value ?? parentRetail;
  const filteredVariants = variants.filter((v) => {
    if (
      variantCodeFilter.trim() &&
      !(v.code ?? '').toLowerCase().includes(variantCodeFilter.trim().toLowerCase())
    )
      return false;
    for (const [name, vals] of Object.entries(variantCharFilters)) {
      if (vals.length > 0 && !vals.includes(charValue(v, name))) return false;
    }
    return true;
  });
  const clearVariantFilter = () => {
    setVariantCodeFilter('');
    setVariantCharFilters({});
  };
  const removeVariant = (v: VariantRow) =>
    runDestructive({
      title: tCommon('delete_confirm', { name: v.name }),
      run: async () => {
        await api.delete(`/variants/${v.id}`);
        await qc.invalidateQueries({ queryKey: ['variants', 'by-product', productId] });
      },
    });
  // moysklad grid header: blue, borderless, thin blue rule (same as Файлы/Остатки).
  const varTh =
    'px-3 pb-1.5 text-left align-bottom font-normal text-[var(--ms-text-brand)] text-xs whitespace-nowrap';

  const rowNav = (href: string) => ({
    onClick: () => router.push(href),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') router.push(href);
    },
    tabIndex: 0,
  });

  const th =
    'h-8 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide';
  // moysklad's «Упаковка» header row: plain grey, NORMAL case, no fill — distinct
  // from the uppercase `th` used by the price/history/stock tables.
  const packTh =
    'px-2 pb-1.5 text-left align-bottom font-normal text-[var(--ms-text-muted)] text-xs';
  const money = (v: string | null) => (v ? formatMoney(BigInt(v)) : '—');
  // Остатки — moysklad 1:1: BLUE non-uppercase headers; the inline totals-row pager
  // reuses the embedded square-button style (static here — stock isn't paginated).
  const tPager = useTranslations('pagination');
  const tPagerOf = tPager('of');
  const stockTh =
    'px-2 pb-1.5 text-left align-bottom font-normal text-[var(--ms-text-brand)] text-xs';
  const stockPagerBtn =
    'flex h-[22px] w-[22px] items-center justify-center rounded-[3px] border border-[var(--ms-border-default)] text-[var(--ms-text-muted)] opacity-40';
  const stockSum = (get: (s: StockRow) => string) => {
    const n = stock.reduce((acc, s) => acc + (Number(get(s)) || 0), 0);
    return Number.isInteger(n) ? n : Number(n.toFixed(3));
  };

  // Упаковка edit handlers — immutable updates so React/RHF dirty tracking fires.
  const addPack = () => {
    onPacksChange([
      ...packs,
      {
        id: `new-${packs.length}-${Date.now()}`,
        name: '',
        uomCode: 'шт',
        multiplier: '1000',
        barcode: '',
        codeType: 'ean13',
        tasnifCode: '',
      },
    ]);
  };
  const updatePack = (id: string, patch: Partial<PackDraft>) => {
    onPacksChange(packs.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePack = (id: string) => {
    onPacksChange(packs.filter((p) => p.id !== id));
  };
  // «↻» — fill the pack's Штрихкод with a fresh internal EAN13, mirroring
  // moysklad's per-row generate button (same helper the main barcode list uses).
  const regenPackBarcode = (id: string) => {
    updatePack(id, { barcode: genEan13() });
  };
  // ⣿ drag-to-reorder — HTML5 DnD, mirroring the DS PositionTable pattern
  // (packages/.../PositionTable.tsx:392-430). `position` persists on save.
  const [packDragFrom, setPackDragFrom] = useState<number | null>(null);
  const [packDropAt, setPackDropAt] = useState<number | null>(null);
  const onPackDragStart = (e: DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setPackDragFrom(index);
  };
  const onPackDragOver = (e: DragEvent, index: number) => {
    if (packDragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isTopHalf = e.clientY - rect.top < rect.height / 2;
    setPackDropAt(isTopHalf ? index : index + 1);
  };
  const onPackDrop = (e: DragEvent) => {
    e.preventDefault();
    if (packDragFrom === null || packDropAt === null) {
      setPackDragFrom(null);
      setPackDropAt(null);
      return;
    }
    const to = packDropAt > packDragFrom ? packDropAt - 1 : packDropAt;
    if (to !== packDragFrom) {
      const next = [...packs];
      const [moved] = next.splice(packDragFrom, 1);
      if (moved) next.splice(to, 0, moved);
      onPacksChange(next);
    }
    setPackDragFrom(null);
    setPackDropAt(null);
  };
  const onPackDragEnd = () => {
    setPackDragFrom(null);
    setPackDropAt(null);
  };
  // «+» create-unit (moysklad parity): the green plus next to a pack name creates
  // a NEW unit of measure. Opens a one-field modal prefilled with the typed text →
  // POST /uoms → refetch the uom reference → set the pack's name to the new unit.
  const [unitModal, setUnitModal] = useState<{ packId: string; name: string } | null>(null);
  const [unitSaving, setUnitSaving] = useState(false);
  const createUnit = async () => {
    if (!unitModal) return;
    const name = unitModal.name.trim();
    if (!name) {
      toast.warning(t('pack_unit_name_required'));
      return;
    }
    setUnitSaving(true);
    try {
      await api.post('/uoms', { name });
      // refetch the units reference so the new unit shows in the suggest list
      await qc.invalidateQueries({ queryKey: ['uoms', 'all'] });
      updatePack(unitModal.packId, { name });
      setUnitModal(null);
    } catch {
      toast.error(tCommon('save_failed'));
    } finally {
      setUnitSaving(false);
    }
  };
  // moysklad parity: pack-row cells are BORDERLESS at rest (the value reads as
  // plain text on the row), a white box + grey border appears on hover and a
  // brand-blue border on focus — exactly like the app-wide position-grid cells.
  // Border WIDTH stays 1px (transparent→coloured) so there's no layout shift.
  const packBorderless =
    'border-transparent bg-transparent hover:border-[var(--ms-border-default)] hover:bg-[var(--ms-bg-surface)] focus:border-[var(--ms-border-focus)] focus:bg-[var(--ms-bg-surface)] focus-visible:border-[var(--ms-border-focus)]';
  const packInput = `h-8 px-2 ${packBorderless}`;
  // Dropdown chevron reveal: hidden at rest (the value reads as plain text, exactly
  // like moysklad), shown when the row is hovered or any cell in it is focused —
  // same reveal as the row-delete «×». Relies on the `group` class on each <tr>.
  const packChevron =
    'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

  // Цены rows: buy + min specials, then each sale price by type name.
  const priceRows: Array<{ label: string; value: string | null }> = [
    { label: tProduct('buy_price_label'), value: buyPrice },
    { label: tProduct('min_price_label'), value: minPrice },
    ...(salePrices ?? []).map((p) => ({ label: priceTypeName(p.priceTypeId), value: p.value })),
  ];

  // История — one of the two stacked movement tables (Закупки / Продажи).

  return (
    <>
      <Tabs
        defaultValue={initialTab ?? 'prices'}
        className="w-full"
        data-test-id="product-detail-widget"
      >
        {/* moysklad product-card tabs = equal-width grey segmented pills, active
          filled brand-blue (the DS `boxed` variant — same as the counterparty card). */}
        <TabsList variant="boxed">
          <TabsTrigger value="prices" data-test-id="tab-prices">
            {t('tab_prices')}
          </TabsTrigger>
          <TabsTrigger value="variants" data-test-id="tab-variants">
            {t('tab_variants')} ({variants.length})
          </TabsTrigger>
          <TabsTrigger value="analogs" data-test-id="tab-analogs">
            {t('tab_analogs')}
          </TabsTrigger>
          <TabsTrigger value="packaging" data-test-id="tab-packaging">
            {t('tab_packaging')} ({packs.length})
          </TabsTrigger>
          <TabsTrigger value="stock" data-test-id="tab-stock">
            {t('tab_stock')}
          </TabsTrigger>
          <TabsTrigger value="history" data-test-id="tab-history">
            {t('tab_history')}
          </TabsTrigger>
          <TabsTrigger value="files" data-test-id="tab-files">
            {t('tab_files')} ({filesCount})
          </TabsTrigger>
        </TabsList>

        {/* Цены — editable editor (edit form, via `pricesEditor`) OR a read-only
          buy/min + sale-prices-by-type table (read-only callers). */}
        <TabsContent value="prices">
          {pricesEditor ?? (
            <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--ms-bg-muted)]">
                  <tr>
                    <th className={th}>{t('price_col_type')}</th>
                    <th className={`${th} w-48 text-right`}>{t('price_col_value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {priceRows.map((row) => (
                    <tr key={row.label} className="border-[var(--ms-border-default)] border-t">
                      <td className="px-3 py-2">{row.label}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {money(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Модификации — variants of this product + «Создать модификации» modal */}
        <TabsContent value="variants">
          {variantsQuery.isLoading ? (
            <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
          ) : (
            <>
              {/* «Фильтр» appears once there are variants (moysklad). It toggles a
                search over code + characteristic values. */}
              {variants.length > 0 && (
                <div className="mb-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => setVariantFilterOpen((o) => !o)}
                    className="w-fit"
                    data-test-id="variant-filter-toggle"
                  >
                    {tFilters('trigger')}
                  </Button>
                  {variantFilterOpen && (
                    <div
                      className="mt-2 rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] p-3"
                      data-test-id="variant-filter-panel"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <Button type="button" variant="success" size="sm">
                          {tFilters('find')}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={clearVariantFilter}
                          data-test-id="variant-filter-clear"
                        >
                          {tFilters('clear')}
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">
                        <div>
                          <label
                            htmlFor="variant-filter-code"
                            className="mb-1 block text-[var(--ms-text-muted)] text-xs"
                          >
                            {t('var_col_code')}
                          </label>
                          <Input
                            id="variant-filter-code"
                            value={variantCodeFilter}
                            onChange={(e) => setVariantCodeFilter(e.target.value)}
                            data-test-id="variant-filter-code"
                          />
                        </div>
                        {variantCharNames.map((name) => (
                          <div key={name}>
                            <label
                              htmlFor={`variant-filter-char-${name}`}
                              className="mb-1 block text-[var(--ms-text-muted)] text-xs"
                            >
                              {name}
                            </label>
                            <MultiCombobox
                              id={`variant-filter-char-${name}`}
                              value={variantCharFilters[name] ?? []}
                              items={charValuesFor(name)}
                              onChange={(next) =>
                                setVariantCharFilters((prev) => ({ ...prev, [name]: next }))
                              }
                              searchPlaceholder={tCommon('search')}
                              emptyText={tCommon('no_results')}
                              testId={`variant-filter-char-${name}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* moysklad grid: Код · Артикул · <one col per characteristic> · Розничная
                цена (borderless, blue headers + rule, ⊗ remove on row hover). Empty
                state is BLANK — only the «⊕ Модификация» button shows. */}
              {variants.length > 0 && (
                <table className="w-full border-collapse text-sm" data-test-id="variants-table">
                  <thead>
                    <tr className="border-[var(--ms-text-brand)] border-b-2">
                      <th className={varTh}>{t('var_col_code')}</th>
                      <th className={varTh}>{t('var_col_article')}</th>
                      {variantCharNames.map((name) => (
                        <th key={name} className={varTh}>
                          {name}
                        </th>
                      ))}
                      <th className={`${varTh} text-right`}>
                        {retailTypeId ? priceTypeName(retailTypeId) : t('var_col_retail')}
                      </th>
                      <th className={`${varTh} w-8`} aria-label={tCommon('actions')} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVariants.map((v) => (
                      <tr
                        key={v.id}
                        className="group cursor-pointer border-[var(--ms-border-default)] border-b hover:bg-[var(--ms-bg-muted)]"
                        {...rowNav(`/variants/${v.id}`)}
                      >
                        <td className="px-3 py-1.5">{v.code ?? '—'}</td>
                        <td className="px-3 py-1.5 text-[var(--ms-text-muted)]" />
                        {variantCharNames.map((name) => (
                          <td key={name} className="px-3 py-1.5">
                            {charValue(v, name)}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {money(variantRetail(v))}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeVariant(v);
                            }}
                            aria-label={tCommon('delete')}
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                            data-test-id={`variant-remove-${v.id}`}
                          >
                            <Icons.rowDelete className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setModModalOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5"
                data-test-id="variant-add"
              >
                <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
                {t('var_add')}
              </Button>
            </>
          )}
        </TabsContent>

        {/* Аналоги — substitute products (GET/POST/DELETE /products/:id/analogs).
          Empty state shows moysklad's hint; the «Аналог» button opens a catalog
          picker (self + already-linked filtered out). Columns mirror the live
          card: Наименование · Артикул · Код товара · Свободный остаток. */}
        <TabsContent value="analogs">
          {analogsQuery.isLoading ? (
            <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
          ) : (
            <>
              {analogs.length === 0 ? (
                // moysklad parity: the hint is LEFT-aligned + tight under the tabs.
                <div
                  className="py-2 text-[var(--ms-text-muted)] text-sm"
                  data-test-id="analogs-empty"
                >
                  {tProduct('analogs_hint')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--ms-bg-muted)]">
                      <tr>
                        <th className={th}>{t('analog_col_name')}</th>
                        <th className={`${th} w-32`}>{t('analog_col_article')}</th>
                        <th className={`${th} w-28`}>{t('analog_col_code')}</th>
                        <th className={`${th} w-36 text-right`}>{t('analog_col_stock')}</th>
                        <th className={`${th} w-36 text-right`}>
                          {defaultPriceType?.name ?? t('analog_col_price')}
                        </th>
                        <th className={`${th} w-10`} aria-label={t('analog_remove')} />
                      </tr>
                    </thead>
                    <tbody>
                      {analogs.map((a) => (
                        <tr
                          key={a.analogId}
                          className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-muted)]"
                          data-test-id="analog-row"
                        >
                          <td className="px-3 py-2">
                            {a.isSelf ? (
                              // moysklad reference row = THIS product: bold, not a
                              // link, no remove (stock/price comparison anchor).
                              <span className="font-bold" data-test-id="analog-self-name">
                                {a.name}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => router.push(`/products/${a.analogId}`)}
                                className="text-left font-medium text-[var(--ms-text-brand)] hover:underline"
                                data-test-id="analog-name"
                              >
                                {a.name}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                            {a.article ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">{a.code ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.freeStock}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {money(a.salePrice ?? null)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {a.isSelf ? null : (
                              <button
                                type="button"
                                onClick={() => removeAnalog(a.analogId)}
                                className="text-[var(--ms-text-muted)] text-lg leading-none hover:text-[var(--ms-text-destructive)]"
                                aria-label={t('analog_remove')}
                                data-test-id="analog-remove"
                              >
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setAnalogPickerOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5"
                data-test-id="analog-add"
              >
                <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
                {tProduct('add_analog')}
              </Button>
            </>
          )}
        </TabsContent>

        {/* Упаковка — editable pack rows, 1:1 with moysklad's pack tab:
          Наименование · Количество · Ед. измерения (Combobox) · Тип кода (barcode
          symbology ▾) · Штрихкод упаковки. The «Код упаковки ТАСНИФ» is NOT a row
          column here — moysklad keeps it as the product-level «Особенности учёта»
          field (left form); it round-trips via the base pack. Empty state shows
          ONLY the «⊕ Упаковка» button (moysklad parity — no headers, no text).
          Saved through the page's PATCH /products/:id packs[] + version path. */}
        <TabsContent value="packaging">
          {packs.length > 0 && (
            <table className="w-full border-collapse text-sm" data-test-id="pack-table">
              <thead>
                <tr className="border-[var(--ms-border-default)] border-b">
                  {/* ⣿ grip column — narrow, headerless (moysklad parity) */}
                  <th className={`${packTh} w-5`} aria-hidden />
                  <th className={packTh}>{t('pack_col_name')}</th>
                  <th className={`${packTh} w-28 text-right`}>{t('pack_col_qty')}</th>
                  <th className={`${packTh} w-36`}>{t('pack_col_uom')}</th>
                  <th className={`${packTh} w-32`}>{t('pack_col_codetype')}</th>
                  <th className={`${packTh} w-48`}>{t('pack_col_barcode')}</th>
                  <th className={`${packTh} w-8`} aria-label={t('pack_remove')} />
                </tr>
              </thead>
              <tbody>
                {packs.map((p, index) => {
                  // uom items: keep the current value selectable even if it isn't
                  // in the reference (legacy/custom code), like the main form does.
                  const uomOptions = uomItems
                    ? uomItems.some((it) => it.value === p.uomCode)
                      ? uomItems
                      : [{ value: p.uomCode, label: p.uomCode }, ...uomItems]
                    : [];
                  // moysklad parity (focused state): the whole row turns pale YELLOW
                  // while any cell in it is focused; the dragged row dims; a 2px brand
                  // line marks the drop target (mirrors DS PositionTable:578-592).
                  const rowCls = [
                    'group align-middle transition-colors focus-within:bg-[#fffde7]',
                    packDragFrom === index && 'opacity-40',
                    packDropAt === index && 'border-t-2 border-t-[var(--ms-text-brand)]',
                    packDropAt === packs.length &&
                      index === packs.length - 1 &&
                      'border-b-2 border-b-[var(--ms-text-brand)]',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <tr
                      key={p.id}
                      className={rowCls}
                      data-test-id="pack-row"
                      onDragOver={(e) => onPackDragOver(e, index)}
                      onDrop={onPackDrop}
                      onDragEnd={onPackDragEnd}
                    >
                      {/* ⣿ drag handle — drag starts here only (so cell text stays
                          selectable); revealed on row hover/focus like the «×». */}
                      <td className="w-5 py-1.5 align-middle">
                        <span
                          draggable
                          onDragStart={(e) => onPackDragStart(e, index)}
                          className="flex cursor-grab justify-center text-[var(--ms-text-muted)] opacity-0 transition-opacity active:cursor-grabbing group-focus-within:opacity-100 group-hover:opacity-100"
                          aria-label={t('pack_reorder')}
                          data-test-id="pack-grip"
                        >
                          <Icons.grip className="size-4" aria-hidden />
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">
                        {uomItems ? (
                          // moysklad parity: a units-suggest SuggestBox (free typing
                          // kept) + a green «+» to create a new unit of measure.
                          <PackNameCell
                            value={p.name}
                            onChange={(name) => updatePack(p.id, { name })}
                            uomItems={uomItems}
                            onCreateUnit={(prefill) =>
                              setUnitModal({ packId: p.id, name: prefill })
                            }
                            createLabel={t('pack_create_unit')}
                            // moysklad peach highlight while the required name is empty.
                            inputClassName={`${packInput} ${p.name.trim() ? '' : 'bg-[#fbe7d3]'}`}
                            chevronClassName={packChevron}
                          />
                        ) : (
                          <Input
                            className={`${packInput} ${p.name.trim() ? '' : 'bg-[#fbe7d3]'}`}
                            value={p.name}
                            onChange={(e) => updatePack(p.id, { name: e.target.value })}
                            data-test-id="pack-name"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className={`${packInput} text-right tabular-nums`}
                          inputMode="decimal"
                          value={multiplierToQty(p.multiplier)}
                          onChange={(e) =>
                            updatePack(p.id, { multiplier: qtyToMultiplier(e.target.value) })
                          }
                          placeholder="1"
                          data-test-id="pack-qty"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {uomItems ? (
                          <Combobox
                            items={uomOptions}
                            value={p.uomCode || undefined}
                            onChange={(next) => updatePack(p.id, { uomCode: next ?? '' })}
                            placeholder=""
                            searchPlaceholder={tCommon('search')}
                            emptyText={tCommon('no_results')}
                            ariaLabel={t('pack_col_uom')}
                            testId="pack-uom"
                            // moysklad parity: borderless at rest (plain «шт»), box on
                            // hover/focus; no clear «×» (the uom is never blank here);
                            // the chevron appears only on row hover/focus (plain text at rest).
                            clearable={false}
                            className={`h-8 ${packBorderless}`}
                            chevronClassName={packChevron}
                          />
                        ) : (
                          <Input
                            className={packInput}
                            value={p.uomCode}
                            onChange={(e) => updatePack(p.id, { uomCode: e.target.value })}
                            data-test-id="pack-uom"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <NativeSelect
                          value={p.codeType || 'ean13'}
                          onChange={(e) => updatePack(p.id, { codeType: e.target.value })}
                          aria-label={t('pack_col_codetype')}
                          data-test-id="pack-codetype"
                          // moysklad parity: borderless «EAN13» at rest, box on hover/focus;
                          // the chevron appears only on row hover/focus (plain text at rest).
                          selectClassName={`h-8 ${packBorderless}`}
                          chevronClassName={packChevron}
                        >
                          {BARCODE_TYPES.map((bt) => (
                            <option key={bt} value={bt}>
                              {barcodeTypeLabel(bt)}
                            </option>
                          ))}
                        </NativeSelect>
                      </td>
                      <td className="px-2 py-1.5">
                        {/* Штрихкод + «↻» generate (moysklad parity): the refresh
                            glyph sits in the cell's trailing edge, revealed on row
                            hover/focus; clicking fills a fresh internal EAN13. */}
                        <div className="relative">
                          <Input
                            className={`${packInput} pr-7 font-mono`}
                            value={p.barcode}
                            onChange={(e) => updatePack(p.id, { barcode: e.target.value })}
                            data-test-id="pack-barcode"
                          />
                          <button
                            type="button"
                            onClick={() => regenPackBarcode(p.id)}
                            className="-translate-y-1/2 absolute top-1/2 right-1.5 text-[var(--ms-text-muted)] opacity-0 transition-opacity hover:text-[var(--ms-text-brand)] focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                            aria-label={t('pack_generate_barcode')}
                            data-test-id="pack-gen-barcode"
                          >
                            <Icons.refresh className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </td>
                      <td className="py-1.5 pl-2 text-center">
                        <button
                          type="button"
                          onClick={() => removePack(p.id)}
                          // moysklad parity: the row-delete «⊗» (filled grey disc +
                          // white cross) appears on row hover (or keyboard focus).
                          className="inline-flex text-[var(--ms-text-muted)] leading-none opacity-0 transition-opacity hover:text-[var(--ms-text-destructive)] focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                          aria-label={t('pack_remove')}
                          data-test-id="pack-remove"
                        >
                          <Icons.rowDelete className="size-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={addPack}
            className="mt-3 inline-flex items-center gap-1.5"
            data-test-id="pack-add"
          >
            <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
            {t('pack_add')}
          </Button>
        </TabsContent>

        {/* Остатки — per-store stock balance (moysklad 1:1, live-grounded
          2026-06-25): BORDERLESS table, BLUE non-uppercase headers on a thin blue
          rule, a totals/pager footer row (pager under «Склад» + column sums), and
          a «Показать по модификациям» link. The totals row + pager show even with
          0 stores («1-1 из 0», «0 0 0 0») — moysklad parity. */}
        <TabsContent value="stock">
          {stockQuery.isLoading ? (
            <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
          ) : (
            <div data-test-id="stock-table">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-[var(--ms-text-brand)] border-b-2">
                    <th className={stockTh}>{t('stock_col_store')}</th>
                    <th className={`${stockTh} text-right`}>{t('stock_col_qty')}</th>
                    <th className={`${stockTh} text-right`}>{t('stock_col_reserved')}</th>
                    <th className={`${stockTh} text-right`}>{t('stock_col_intransit')}</th>
                    <th className={`${stockTh} text-right`}>{t('stock_col_available')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr
                      key={s.storeId ?? 'no-store'}
                      className="border-[var(--ms-border-default)] border-b last:border-0"
                      data-test-id="stock-row"
                    >
                      <td className="px-2 py-1.5">{s.storeName ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.qty}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.reservedQty}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.inTransitQty}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.available}</td>
                    </tr>
                  ))}
                  {/* totals + inline pager (moysklad shows it on the same row) */}
                  <tr className="align-middle">
                    <td className="px-2 py-1.5">
                      <span
                        className="flex w-fit items-center gap-1 text-xs"
                        data-test-id="stock-pager"
                      >
                        <span className={stockPagerBtn} aria-disabled>
                          <Icons.pageFirst className="size-3.5" aria-hidden />
                        </span>
                        <span className={stockPagerBtn} aria-disabled>
                          <Icons.left className="size-3.5" aria-hidden />
                        </span>
                        <span className="mx-2 text-[var(--ms-text-default)] tabular-nums">
                          {stock.length === 0 ? '1-1' : `1-${stock.length}`} {tPagerOf}{' '}
                          {stock.length}
                        </span>
                        <span className={stockPagerBtn} aria-disabled>
                          <Icons.right className="size-3.5" aria-hidden />
                        </span>
                        <span className={stockPagerBtn} aria-disabled>
                          <Icons.pageLast className="size-3.5" aria-hidden />
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {stockSum((s) => s.qty)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {stockSum((s) => s.reservedQty)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {stockSum((s) => s.inTransitQty)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {stockSum((s) => s.available)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <button
                type="button"
                className="mt-2 text-[var(--ms-text-brand)] text-sm hover:underline"
                data-test-id="stock-show-by-variants"
              >
                {t('stock_show_by_variants')}
              </button>
            </div>
          )}
        </TabsContent>

        {/* История — purchases (Закупки) + sales (Продажи) for this product */}
        <TabsContent value="history">
          {movementQuery.isLoading ? (
            <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
          ) : (
            <div className="space-y-8">
              <MovementSection
                heading={t('hist_purchases')}
                rows={purchases}
                testId="hist-purchases"
              />
              <MovementSection heading={t('hist_sales')} rows={sales} testId="hist-sales" />
            </div>
          )}
        </TabsContent>

        {/* Файлы — attachments */}
        <TabsContent value="files">
          {/* moysklad parity: the file table sits directly under the tab strip —
            no card wrapper, no bold «Файлы» heading. */}
          <AttachmentsSection entity="Product" entityId={productId} hideTitle />
        </TabsContent>
      </Tabs>
      <CreateModificationsModal
        productId={productId}
        open={modModalOpen}
        onClose={() => setModModalOpen(false)}
        onCreated={() => {
          void variantsQuery.refetch();
        }}
      />
      {/* «Аналог» → moysklad's rich «Выбор товара» modal in SELECTION mode:
        folder tree + Фильтр + Остаток/Резерв/Ожидание/Доступно/Код/Артикул/
        Ед.изм/Страна/Вес columns, check rows → Выбрать. Linked analogs + this
        product are pre-checked & disabled so they can't be re-added. */}
      <ProductSelectModal
        open={analogPickerOpen}
        onClose={() => setAnalogPickerOpen(false)}
        currency="UZS"
        selectionMode
        disabledIds={[productId, ...analogs.filter((a) => !a.isSelf).map((a) => a.analogId)]}
        onConfirm={() => undefined}
        onConfirmSelection={(products) => {
          void addAnalogs(products);
        }}
        labels={{
          title: t('analog_picker_title'),
          searchPlaceholder: tProductSelect('searchPlaceholder'),
          refresh: tProductSelect('refresh'),
          priceColumns: tProductSelect('priceColumns'),
          colName: tProductSelect('colName'),
          colQty: tProductSelect('colQty'),
          colOnHand: tProductSelect('colOnHand'),
          colReserved: tProductSelect('colReserved'),
          colInTransit: tProductSelect('colInTransit'),
          colAvailable: tProductSelect('colAvailable'),
          colCode: tProductSelect('colCode'),
          colArticle: tProductSelect('colArticle'),
          colUom: tProductSelect('colUom'),
          colCountry: tProductSelect('colCountry'),
          colWeight: tProductSelect('colWeight'),
          colImage: tProductSelect('colImage'),
          colKind: tProductSelect('colKind'),
          colDescription: tProductSelect('colDescription'),
          colMinPrice: tProductSelect('colMinPrice'),
          colRetailPrice: tProductSelect('colRetailPrice'),
          colPrice: tProductSelect('colPrice'),
          select: tProductSelect('select'),
          cancel: tProductSelect('cancel'),
          close: tProductSelect('close'),
          empty: tProductSelect('empty'),
          loading: tProductSelect('loading'),
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
            // Full Tovary-list-parity filters.
            mxik: tFilters('mxik'),
            tasnif: tFilters('tasnif'),
            ownerEmployee: tFilters('owner_employee'),
            ownerGroup: tFilters('owner_group'),
            modifiedBy: tFilters('modified_by'),
            shared: tFilters('shared'),
            sharedOptions: [
              { value: '', label: tCommon('all') },
              { value: 'true', label: tCommon('yes') },
              { value: 'false', label: tCommon('no') },
            ],
            updatedPeriod: tFilters('updated_period'),
          },
        }}
      />
      {/* «+» create-unit — one-field modal (moysklad parity: the green plus next
          to a pack name creates a new unit of measure, prefilled with the typed
          text). POST /uoms → refetch reference → set the pack name. */}
      <Modal
        open={!!unitModal}
        onOpenChange={(o) => {
          if (!o) setUnitModal(null);
        }}
        title={t('pack_create_unit')}
        widthClass="w-[420px]"
        closeLabel={tCommon('close')}
        testId="pack-unit-modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setUnitModal(null)}
              data-test-id="pack-unit-cancel"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void createUnit()}
              disabled={unitSaving || !unitModal?.name.trim()}
              data-test-id="pack-unit-create"
            >
              {tCommon('create')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5 px-4 py-4">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('pack_col_name')}</span>
          <Input
            autoFocus
            value={unitModal?.name ?? ''}
            onChange={(e) => setUnitModal((m) => (m ? { ...m, name: e.target.value } : m))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void createUnit();
              }
            }}
            data-test-id="pack-unit-name"
          />
        </div>
      </Modal>
    </>
  );
}
