'use client';

/**
 * useProductForm — the single source of truth for the moysklad-parity product
 * editor, shared by BOTH /products/new (create) and /products/[id] (edit).
 *
 * moysklad has ONE product form (same fields, same cards, same layout) whether
 * you create or edit; only the save verb differs (POST vs PATCH+version) and the
 * right-column tabs are inert pre-create. Keeping the form here — instead of
 * duplicating ~900 lines of JSX + ~30 state vars in each page — guarantees the
 * two pages can never drift apart again (the exact bug that kept the edit page
 * stuck on the old single-column layout while /new moved ahead).
 *
 * The hook owns: the RHF form (+ localized Zod schema), every auxiliary piece of
 * state (folder/supplier/owner/group pickers, typed barcodes, «Особенности учёта»
 * combos, per-row price currencies/rates, staged images), the reference-data
 * queries (countries, uoms, currencies, price types), `buildPayload(mode)` (the
 * create/edit-aware request body, minus packs+version), and `hydrate(data)` (edit
 * → fills the form + all aux state from a loaded product).
 */

import { api } from '@/lib/api-client';
import { COUNTRIES } from '@/lib/countries';
import { usePriceTypeIds } from '@/lib/sale-price';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ComboboxItem, PickerItem } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

// Barcode GTIN types (moysklad parity). Stored lowercase; displayed as the
// standard barcode-standard names. EAN13 grounded as the default/used type on
// moysklad.uz; the rest are the standard moysklad set.
export const BARCODE_TYPES = ['ean13', 'ean8', 'code128', 'gtin'] as const;
export const barcodeTypeLabel = (v: string): string =>
  ({ ean13: 'EAN13', ean8: 'EAN8', code128: 'Code128', gtin: 'GTIN' })[v] ?? v;

// «Маркировка» → «Тип продукции» combo key → Product.trackingType code (BE enum,
// live-grounded .uz regime). 'none' ⇒ not marked (trackingType left unset = null).
export const MARKING_TO_TRACKING: Record<string, string> = {
  none: 'NOT_TRACKED',
  tobacco: 'TOBACCO',
  water: 'WATER',
  appliances: 'APPLIANCES',
  alcohol: 'ALCOHOL',
  beer: 'BEER',
};
// Reverse map (edit hydration): Product.trackingType code → marking combo key.
const TRACKING_TO_MARKING: Record<string, string> = Object.fromEntries(
  Object.entries(MARKING_TO_TRACKING).map(([k, v]) => [v, k]),
);

/** Schema factory so Zod validation messages localize via next-intl (t). */
export const makeProductFormSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t('name_required')).max(255),
    code: z.string().max(50).optional(),
    externalCode: z.string().max(50).optional(),
    article: z.string().max(50).optional(),
    description: z.string().optional(),
    country: z
      .string()
      .regex(/^$|^[A-Z]{2}$/, t('country_invalid'))
      .optional(),
    productFolderId: z.string().uuid().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    buyPrice: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    minPrice: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    discountProhibited: z.boolean().optional(),
    vat: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    uom: z.string().max(20),
    weightG: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    volumeML: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    // Warehouse home location (Sherset custom) — 4 numeric bin segments.
    locSklad: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    locPolka: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    locQavat: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    locYacheyka: z.string().regex(/^\d*$/, t('number_invalid')).optional(),
    // Per-cell qty at the primary bin (Phase 2) — fractional allowed (kg/m).
    locQty: z
      .string()
      .regex(/^\d*(\.\d{1,6})?$/, t('number_invalid'))
      .optional(),
    minimumBalance: z
      .string()
      .regex(/^\d*(\.\d{1,3})?$/, t('min_balance_invalid'))
      .optional(),
    mxikCode: z
      .string()
      .regex(/^$|^\d{17}$/, t('mxik_invalid'))
      .optional(),
    // GTIN for a marked product («Маркировка» → Тип продукции ≠ Не маркируется).
    gtin: z
      .string()
      .regex(/^$|^\d{13,14}$/, t('gtin_invalid'))
      .optional(),
    paymentItemType: z
      .enum(['', 'GOOD', 'EXCISABLE_GOOD', 'COMPOUND_PAYMENT_ITEM', 'ANOTHER_PAYMENT_ITEM'])
      .optional(),
    // «Доступ» — Владелец-сотрудник (owner) · Отдел (owning group) · Общий доступ.
    ownerId: z.string().uuid().nullable().optional(),
    groupId: z.string().uuid().nullable().optional(),
    shared: z.boolean().optional(),
  });

export type ProductFormValues = z.infer<ReturnType<typeof makeProductFormSchema>>;

interface FolderTreeItem {
  id: string;
  name: string;
  pathName: string | null;
  parentId: string | null;
}

/** Loaded product shape consumed by `hydrate` (edit). Loose by design — only the
 *  fields the form reads are listed; the GET returns the full row (include, not
 *  select) so every one of these is present. */
export interface ProductHydrateInput {
  name: string;
  code: string | null;
  externalCode: string | null;
  article: string | null;
  description: string | null;
  country: string | null;
  buyPrice: string | null;
  minPrice: string | null;
  salePrices: Array<{ priceTypeId: string; value: string; currencyCode?: string | null }> | null;
  discountProhibited: boolean;
  barcodes: string[];
  barcodeTypes?: string[] | null;
  vat: number | null;
  uom: string | null;
  weightG: number | null;
  volumeML: number | null;
  locSklad: number | null;
  locPolka: number | null;
  locQavat: number | null;
  locYacheyka: number | null;
  // Decimal column — the API serializes it as a string (e.g. "30").
  locQty?: string | number | null;
  mxikCode: string | null;
  trackingType: string | null;
  gtin?: string | null;
  paymentItemType: string | null;
  minimumBalanceMinor: string;
  shared?: boolean | null;
  productFolder: { id: string; name: string; pathName: string | null } | null;
  owner: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  packs?: Array<{ tasnifCode: string | null; barcode: string | null; position: number }>;
}

export type ProductFormMode = 'create' | 'edit';

/** Decimal "5.5" → minor "5500" (×1000), BigInt-exact. undefined when blank. */
function decimalToMinor(decimal: string | undefined): string | undefined {
  if (!decimal) return undefined;
  const [whole = '0', frac = ''] = decimal.split('.');
  const fracPadded = `${frac}000`.slice(0, 3);
  return (BigInt(whole) * 1000n + BigInt(fracPadded)).toString();
}

/** Minor "5500" (×1000) → trimmed decimal "5.5". '' when zero/empty. */
function minorToDecimal(minor: string | null | undefined): string {
  if (!minor) return '';
  const big = BigInt(minor);
  if (big === 0n) return '';
  const whole = big / 1000n;
  const frac = (big % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Generate an internal "in-store" EAN13 (prefix 20) with a valid check digit —
 * matches moysklad's auto-filled barcode on «➕ Штрихкод» (e.g. 2000000082516),
 * which the user can then edit or overwrite by scanning. 12 data digits (20 +
 * 10) + 1 mod-10 check digit. Math.random uniqueness is ample (value is editable).
 */
export function genEan13(): string {
  let body = '20';
  for (let i = 0; i < 10; i += 1) body += Math.floor(Math.random() * 10);
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + ((10 - (sum % 10)) % 10);
}

export function useProductForm() {
  const t = useTranslations('pages.product_new');
  const tCommon = useTranslations('common');
  const { priceTypes } = usePriceTypeIds();

  const schema = useMemo(() => makeProductFormSchema(t), [t]);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', uom: 'шт', productFolderId: null },
  });

  // «Страна» — searchable combo over ISO 3166-1; stores the alpha-2 code.
  const countryItems = useMemo<ComboboxItem[]>(
    () =>
      COUNTRIES.map((c) => ({ value: c.code, label: c.name, searchText: `${c.name} ${c.code}` })),
    [],
  );

  // «Единица измерения» — combo over the account's uom reference (stores the NAME).
  const { data: uomData } = useQuery({
    queryKey: ['uoms', 'all'],
    queryFn: () =>
      api.get<{ items: Array<{ id: string; name: string; description?: string | null }> }>('/uoms'),
    staleTime: 5 * 60_000,
  });
  const uomItems = useMemo<ComboboxItem[]>(
    () =>
      (uomData?.items ?? []).map((u) => ({
        value: u.name,
        label: u.name,
        sublabel: u.description || undefined,
        searchText: `${u.name} ${u.description ?? ''}`,
      })),
    [uomData],
  );

  // «Валюта» per price row — moysklad lets each price be in its own currency.
  const { data: currencyData } = useQuery({
    queryKey: ['currencies', 'all'],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          code: string;
          isoCode: string;
          name: string;
          rate: string;
          default: boolean;
        }>;
      }>('/currencies'),
    staleTime: 5 * 60_000,
  });
  const currencies = currencyData?.items ?? [];
  const baseCurrencyCode = currencies.find((c) => c.default)?.code ?? 'UZS';
  const rateForCode = (code: string): string =>
    currencies.find((c) => c.code === code)?.rate ?? '1';

  const [salePriceCurrencies, setSalePriceCurrencies] = useState<Record<string, string>>({});
  const [salePriceRates, setSalePriceRates] = useState<Record<string, string>>({});
  const [minPriceCurrency, setMinPriceCurrency] = useState('');
  const [buyPriceCurrency, setBuyPriceCurrency] = useState('');
  const [rateDialogFor, setRateDialogFor] = useState<string | null>(null);
  // moysklad parity: a sale price defaults to the BASE currency «сум (UZS)». The
  // stored currencyCode can be a NUMERIC ISO code ("860"/"840" — matches the combo)
  // OR a legacy ALPHA code ("UZS"/"USD" — never matches the numeric options → would
  // render a «—» placeholder). Resolve to a code that EXISTS in the reference:
  // numeric match → keep; alpha match by isoCode → its numeric code; else base.
  const saleCurrencyOf = (pt: { id: string; currency: string }): string => {
    const stored = salePriceCurrencies[pt.id];
    if (!stored) return baseCurrencyCode;
    if (currencies.some((c) => c.code === stored)) return stored;
    const byIso = currencies.find((c) => c.isoCode === stored);
    return byIso?.code ?? baseCurrencyCode;
  };
  // moysklad shows each currency as «<name> (<isoCode>)» — «сум (UZS)», «доллар
  // (USD)». The dropdown VALUE stays the currency `code` (moysklad's numeric ISO
  // code, 840/860) so already-saved currencyCodes keep matching their option.
  const currencyItems: ComboboxItem[] =
    currencies.length > 0
      ? currencies.map((c) => ({
          value: c.code,
          label: `${c.name} (${c.isoCode})`,
          searchText: `${c.isoCode} ${c.name} ${c.code}`,
        }))
      : [{ value: baseCurrencyCode, label: t('currency_uzs'), searchText: 'UZS' }];
  const rateDialogCode =
    rateDialogFor === 'buy'
      ? buyPriceCurrency || baseCurrencyCode
      : rateDialogFor === 'min'
        ? minPriceCurrency || baseCurrencyCode
        : rateDialogFor
          ? saleCurrencyOf(
              priceTypes.find((p) => p.id === rateDialogFor) ?? {
                id: rateDialogFor,
                currency: baseCurrencyCode,
              },
            )
          : baseCurrencyCode;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [folderLabel, setFolderLabel] = useState<string | null>(null);
  const folderFetcher = async (search: string): Promise<PickerItem[]> => {
    const data = await api.get<{ items: FolderTreeItem[] }>(
      `/product-folders?search=${encodeURIComponent(search)}&limit=50`,
    );
    return data.items.map((f) => ({
      id: f.id,
      primary: f.name,
      secondary: f.pathName && f.pathName !== f.name ? f.pathName : undefined,
    }));
  };

  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [supplierLabel, setSupplierLabel] = useState<string | null>(null);
  const supplierFetcher = async (search: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(search)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };

  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const ownerFetcher = async (search: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/employees?search=${encodeURIComponent(search)}&limit=20`,
    );
    return d.items.map((e) => ({ id: e.id, primary: e.name }));
  };
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [groupLabel, setGroupLabel] = useState<string | null>(null);
  const groupFetcher = async (search: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/groups?search=${encodeURIComponent(search)}&limit=20`,
    );
    return d.items.map((g) => ({ id: g.id, primary: g.name }));
  };

  // «Особенности учёта» combos — structural look-alikes (moysklad's own REST API
  // does not persist Фасовка / Тип учёта). 'piece'/'none' defaults on both pages.
  const [packaging, setPackaging] = useState('piece');
  const [accountingType, setAccountingType] = useState('none');
  const [markingType, setMarkingType] = useState('none');
  const [packTasnif, setPackTasnif] = useState('');
  const [barcodeTasnif, setBarcodeTasnif] = useState('');
  const [minBalanceMode, setMinBalanceMode] = useState<'sum' | 'same' | 'perStore'>('sum');

  // Изображения — staged client-side, uploaded after create (create page only).
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [stagedImages, setStagedImages] = useState<
    { name: string; mime: string; dataUrl: string }[]
  >([]);
  const onPickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const read = (file: File) =>
      new Promise<{ name: string; mime: string; dataUrl: string }>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () =>
          resolve({ name: file.name, mime: file.type || 'image/png', dataUrl: String(r.result) });
        r.onerror = () => reject(r.error ?? new Error('read'));
        r.readAsDataURL(file);
      });
    const added = await Promise.all(Array.from(files).map(read));
    setStagedImages((prev) => [...prev, ...added]);
  };

  // Sale prices per account price type (keyed by real PriceType id).
  const [salePrices, setSalePrices] = useState<Record<string, string>>({});

  // Barcodes (Штрихкоды) + per-barcode GTIN type, index-aligned. moysklad renders
  // each as an EDITABLE inline row (type ▾ + value input + ⋯ menu); «➕ Штрихкод»
  // appends a row with an auto-generated internal EAN13 you can then edit/scan.
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [barcodeTypes, setBarcodeTypes] = useState<string[]>([]);
  // Edits to barcodes live outside RHF — track a dirty flag so the edit page's
  // Save button lights up on a barcode-only change.
  const [auxDirty, setAuxDirty] = useState(false);
  const addBarcode = () => {
    setBarcodes((prev) => [...prev, genEan13()]);
    setBarcodeTypes((prev) => [...prev, 'ean13']);
    setAuxDirty(true);
  };
  const removeBarcode = (i: number) => {
    setBarcodes((prev) => prev.filter((_, j) => j !== i));
    setBarcodeTypes((prev) => prev.filter((_, j) => j !== i));
    setAuxDirty(true);
  };
  const setBarcodeAt = (i: number, value: string) => {
    setBarcodes((prev) => prev.map((x, j) => (j === i ? value : x)));
    setAuxDirty(true);
  };
  const setBarcodeTypeAt = (i: number, ty: string) => {
    setBarcodeTypes((prev) => prev.map((x, j) => (j === i ? ty : x)));
    setAuxDirty(true);
  };

  // The non-RHF combos/inputs also flip the dirty flag (edit page Save button).
  const markAuxDirty = () => setAuxDirty(true);

  /**
   * Build the request body shared by create + edit (minus `packs` and `version`,
   * which each page assembles). `mode` controls empty handling: create OMITS empty
   * optional fields (undefined ⇒ server default); edit sends NULL to actively clear
   * a previously-set value (a PATCH that omits a field would leave it unchanged).
   */
  const buildPayload = (mode: ProductFormMode) => {
    const v = form.getValues();
    const blank = mode === 'create' ? undefined : null;
    const salePricesPayload = (() => {
      // Price types not loaded yet → DON'T touch salePrices (omit), so an early
      // save can't blank existing prices. Otherwise: send the filled rows; [] on
      // edit so clearing the last price persists; undefined on create when none.
      if (priceTypes.length === 0) return undefined;
      const rows = priceTypes
        .map((pt) => ({ pt, val: salePrices[pt.id] ?? '' }))
        .filter(({ val }) => val.length > 0)
        .map(({ pt, val }) => ({
          priceTypeId: pt.id,
          value: BigInt(val).toString(),
          currencyCode: saleCurrencyOf(pt),
        }));
      return rows.length > 0 ? rows : mode === 'create' ? undefined : [];
    })();
    return {
      name: v.name,
      code: v.code || blank,
      externalCode: v.externalCode || blank,
      article: v.article || blank,
      description: v.description || blank,
      country: v.country || blank,
      productFolderId: v.productFolderId || blank,
      supplierId: v.supplierId || blank,
      buyPrice: v.buyPrice ? BigInt(v.buyPrice).toString() : blank,
      minPrice: v.minPrice ? BigInt(v.minPrice).toString() : blank,
      buyPriceCurrency:
        v.buyPrice && buyPriceCurrency && buyPriceCurrency !== baseCurrencyCode
          ? buyPriceCurrency
          : blank,
      minPriceCurrency:
        v.minPrice && minPriceCurrency && minPriceCurrency !== baseCurrencyCode
          ? minPriceCurrency
          : blank,
      salePrices: salePricesPayload,
      discountProhibited: v.discountProhibited ?? false,
      barcodes,
      barcodeTypes,
      vat: v.vat ? Number(v.vat) : blank,
      uom: v.uom || 'шт',
      weightG: v.weightG ? Number(v.weightG) : blank,
      volumeML: v.volumeML ? Number(v.volumeML) : blank,
      // Warehouse home location (Sherset custom) — empty segment clears (null on edit).
      locSklad: v.locSklad ? Number(v.locSklad) : blank,
      locPolka: v.locPolka ? Number(v.locPolka) : blank,
      locQavat: v.locQavat ? Number(v.locQavat) : blank,
      locYacheyka: v.locYacheyka ? Number(v.locYacheyka) : blank,
      locQty: v.locQty ? Number(v.locQty) : blank,
      // NON-nullable column (`bigIntString.optional()` — rejects null) → OMIT when
      // empty (both modes), mirroring the proven create/edit forms. (Emptying the
      // field therefore leaves the stored threshold unchanged, not cleared to 0.)
      minimumBalanceMinor: decimalToMinor(v.minimumBalance),
      mxikCode: v.mxikCode || blank,
      // «Маркировка» → Тип продукции. Marked ⇒ trackingType + GTIN; else clear.
      trackingType: markingType !== 'none' ? MARKING_TO_TRACKING[markingType] : blank,
      gtin: markingType !== 'none' && v.gtin ? v.gtin : blank,
      paymentItemType: v.paymentItemType || blank,
      ownerId: v.ownerId || blank,
      groupId: v.groupId || blank,
      shared: v.shared ?? false,
    };
  };

  /** Base pack from «Код упаковки ТАСНИф» / «Штрихкод ТАСНИф» (create page). */
  const baseTasnifPack = (uom: string) =>
    packTasnif.trim() || barcodeTasnif.trim()
      ? [
          {
            name: (uom || 'шт').slice(0, 255),
            uomCode: (uom || 'шт').slice(0, 20),
            multiplier: '1000',
            tasnifCode: packTasnif.trim() || undefined,
            barcode: barcodeTasnif.trim() || undefined,
            position: 0,
          },
        ]
      : undefined;

  /** Edit hydration — fill the form + every aux state from a loaded product. */
  const hydrate = (data: ProductHydrateInput) => {
    form.reset({
      name: data.name,
      code: data.code ?? '',
      externalCode: data.externalCode ?? '',
      article: data.article ?? '',
      description: data.description ?? '',
      country: data.country ?? '',
      productFolderId: data.productFolder?.id ?? null,
      supplierId: data.supplier?.id ?? null,
      buyPrice: data.buyPrice ?? '',
      minPrice: data.minPrice ?? '',
      discountProhibited: data.discountProhibited,
      vat: data.vat != null ? String(data.vat) : '',
      uom: data.uom ?? 'шт',
      weightG: data.weightG != null ? String(data.weightG) : '',
      volumeML: data.volumeML != null ? String(data.volumeML) : '',
      locSklad: data.locSklad != null ? String(data.locSklad) : '',
      locPolka: data.locPolka != null ? String(data.locPolka) : '',
      locQavat: data.locQavat != null ? String(data.locQavat) : '',
      locYacheyka: data.locYacheyka != null ? String(data.locYacheyka) : '',
      locQty: data.locQty != null ? String(data.locQty) : '',
      minimumBalance: minorToDecimal(data.minimumBalanceMinor),
      mxikCode: data.mxikCode ?? '',
      gtin: data.gtin ?? '',
      paymentItemType: (data.paymentItemType as ProductFormValues['paymentItemType']) ?? '',
      ownerId: data.owner?.id ?? null,
      groupId: data.group?.id ?? null,
      shared: data.shared ?? false,
    });
    setFolderLabel(
      data.productFolder?.pathName && data.productFolder.pathName !== data.productFolder.name
        ? data.productFolder.pathName
        : (data.productFolder?.name ?? null),
    );
    setSupplierLabel(data.supplier?.name ?? null);
    setOwnerLabel(data.owner?.name ?? null);
    setGroupLabel(data.group?.name ?? null);
    setBarcodes(data.barcodes ?? []);
    // Per-type fallback to EAN13 when the stored array is shorter/missing.
    setBarcodeTypes((data.barcodes ?? []).map((_, i) => data.barcodeTypes?.[i] ?? 'ean13'));
    setMarkingType(data.trackingType ? (TRACKING_TO_MARKING[data.trackingType] ?? 'none') : 'none');
    // Sale prices by type id (+ per-row currency when stored).
    const priceMap: Record<string, string> = {};
    const currMap: Record<string, string> = {};
    for (const p of data.salePrices ?? []) {
      priceMap[p.priceTypeId] = p.value;
      if (p.currencyCode) currMap[p.priceTypeId] = p.currencyCode;
    }
    setSalePrices(priceMap);
    setSalePriceCurrencies(currMap);
    // «Код упаковки ТАСНИф» / «Штрихкод ТАСНИф» from the base pack (position 0).
    const basePack = (data.packs ?? []).find((p) => p.position === 0) ?? data.packs?.[0];
    setPackTasnif(basePack?.tasnifCode ?? '');
    setBarcodeTasnif(basePack?.barcode ?? '');
    setAuxDirty(false);
  };

  return {
    // form + schema
    t,
    tCommon,
    form,
    schema,
    // reference data
    priceTypes,
    countryItems,
    uomItems,
    currencyItems,
    baseCurrencyCode,
    rateForCode,
    // folder picker
    pickerOpen,
    setPickerOpen,
    folderLabel,
    setFolderLabel,
    folderFetcher,
    // supplier picker
    supplierPickerOpen,
    setSupplierPickerOpen,
    supplierLabel,
    setSupplierLabel,
    supplierFetcher,
    // owner / group pickers
    ownerPickerOpen,
    setOwnerPickerOpen,
    ownerLabel,
    setOwnerLabel,
    ownerFetcher,
    groupPickerOpen,
    setGroupPickerOpen,
    groupLabel,
    setGroupLabel,
    groupFetcher,
    // «Особенности учёта»
    packaging,
    setPackaging,
    accountingType,
    setAccountingType,
    markingType,
    setMarkingType,
    packTasnif,
    setPackTasnif,
    barcodeTasnif,
    setBarcodeTasnif,
    minBalanceMode,
    setMinBalanceMode,
    // images
    imageInputRef,
    stagedImages,
    setStagedImages,
    onPickImages,
    // prices
    salePrices,
    setSalePrices,
    salePriceCurrencies,
    setSalePriceCurrencies,
    salePriceRates,
    setSalePriceRates,
    minPriceCurrency,
    setMinPriceCurrency,
    buyPriceCurrency,
    setBuyPriceCurrency,
    rateDialogFor,
    setRateDialogFor,
    rateDialogCode,
    saleCurrencyOf,
    // barcodes
    barcodes,
    barcodeTypes,
    addBarcode,
    removeBarcode,
    setBarcodeAt,
    setBarcodeTypeAt,
    // dirty (edit Save gate) + payload + hydrate
    auxDirty,
    markAuxDirty,
    setAuxDirty,
    buildPayload,
    baseTasnifPack,
    hydrate,
  };
}

export type ProductFormApi = ReturnType<typeof useProductForm>;
