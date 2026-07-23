'use client';

/**
 * ProductFormLeftCards — the LEFT column of moysklad's product form: the 7
 * collapsible cards (Изображения · Общие данные · Неснижаемый остаток ·
 * Место хранения · Особенности учёта · Штрихкоды · Доступ). Shared by
 * /products/new and /products/[id] so the create and edit forms are guaranteed
 * identical. Deliberate divergences from moysklad: the marketplace-AI «Контент»
 * card is removed (user-directed 2026-07-04) and «Место хранения» is added
 * (user-directed storage-cell pins).
 *
 * All state comes from `useProductForm` (the `pf` object). Persisted non-RHF
 * fields (marking, ТАСНИф codes, barcodes) call `pf.markAuxDirty()` so the edit
 * page's Save button lights up; the structural combos (Фасовка / Тип учёта /
 * Неснижаемый-остаток mode) are not persisted, so they don't flip dirty.
 */

import { ProductFormCard } from '@/components/product-form-layout';
import { CellMoveModal, type CellMoveSource } from '@/components/products/cell-move-modal';
import { ProductCutCard } from '@/components/products/product-cut-card';
import {
  BARCODE_TYPES,
  type ProductFormApi,
  barcodeTypeLabel,
} from '@/components/products/use-product-form';
import { useImagePaste } from '@/hooks/use-image-paste';
import { api } from '@/lib/api-client';
import {
  ACCEPTED_IMAGE_ATTR,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  capImagesToLimit,
  classifyImageFile,
  readClipboardImageFiles,
} from '@/lib/product-image';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  Combobox,
  FormField,
  Icons,
  Input,
  NativeSelect,
  Textarea,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState } from 'react';
import { Controller } from 'react-hook-form';

export function ProductFormLeftCards({
  pf,
  imagesSlot,
  productId,
}: {
  pf: ProductFormApi;
  /**
   * Изображения card body. Omitted (create form) ⇒ the client-side staging UI
   * (images upload after the product is created). Provided (edit form) ⇒ the live
   * ImageGallery (immediate upload/list/delete against the existing product).
   */
  imagesSlot?: ReactNode;
  /**
   * The existing product's id (edit form only) — feeds the «Место хранения»
   * per-cell stock table. Absent on /new (a new product has no stock yet).
   */
  productId?: string;
}) {
  const router = useRouter();
  const {
    t,
    tCommon,
    form,
    countryItems,
    uomItems,
    // folder
    pickerOpen,
    setPickerOpen,
    folderLabel,
    setFolderLabel,
    folderFetcher,
    // supplier
    supplierPickerOpen,
    setSupplierPickerOpen,
    supplierLabel,
    setSupplierLabel,
    supplierFetcher,
    // owner / group
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
    // features
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
    // barcodes
    barcodes,
    barcodeTypes,
    addBarcode,
    removeBarcode,
    setBarcodeAt,
    setBarcodeTypeAt,
    markAuxDirty,
  } = pf;

  // «Штрихкоды товара» local UI: the dismissable GTIN banner + the open per-row ⋯ menu.
  const [barcodeBannerOpen, setBarcodeBannerOpen] = useState(true);
  const [barcodeMenu, setBarcodeMenu] = useState<number | null>(null);
  // moysklad shows a dismissable blue info-banner inside «Неснижаемый остаток».
  const [minBalanceBannerOpen, setMinBalanceBannerOpen] = useState(true);
  // «Страна» trailing «+» opens the country picker (our list is the full ISO reference).
  const [countryOpen, setCountryOpen] = useState(false);
  // «Место хранения» — where the product sits. Two row kinds (LABEL model): REAL
  // per-cell stock rows (`isBinding:false`, from the StockByCell engine, document-
  // driven) + the assigned HOME-CELL binding row (`isBinding:true`, from the
  // «Полка»/«Ячейка» pickers — a location label with the product's total on-hand).
  interface CellStockRow {
    storeId: string | null;
    storeName: string | null;
    cellId: string | null;
    cellName: string;
    zoneName: string | null;
    qty: string;
    isBinding?: boolean;
  }
  const cellStockQuery = useQuery<{ items: CellStockRow[] }>({
    queryKey: ['product-cell-stock', productId],
    queryFn: () => api.get<{ items: CellStockRow[] }>(`/products/${productId}/cell-stock`),
    enabled: !!productId,
  });
  const cellStock = cellStockQuery.data?.items ?? [];
  const cellStockTotal = cellStock.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
  const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
  // «Переместить» — the cell-stock row currently being moved to another cell.
  const queryClient = useQueryClient();
  const [moveSource, setMoveSource] = useState<CellMoveSource | null>(null);

  // «Полка» + «Ячейка» pickers (user 2026-07-05): searchable dropdowns fed by
  // EVERY warehouse's real zones/cells. Picking a полка narrows the ячейка list;
  // picking a ячейка auto-fills its полка. The selected NAMES persist into
  // Product.attributes.__polka / __yacheyka (see use-product-form buildPayload).
  interface StorageCellOpt {
    id: string;
    name: string;
    barcode: string | null;
    zoneId: string | null;
    zoneName: string | null;
    storeId: string;
    storeName: string;
  }
  interface StorageOptions {
    polkas: Array<{ id: string; name: string; storeId: string; storeName: string }>;
    cells: StorageCellOpt[];
  }
  const storageOptionsQuery = useQuery<StorageOptions>({
    queryKey: ['product-storage-options'],
    queryFn: () => api.get<StorageOptions>('/products/storage-options'),
  });
  const storageOptions = storageOptionsQuery.data;
  const polkaValue = form.watch('polka');
  const yacheykaValue = form.watch('yacheyka');
  // «Полка» options — distinct zone names across warehouses. Seed the saved value
  // even if the list hasn't loaded / the zone was deleted, so an edit form never
  // renders a blank trigger for a real saved polka.
  const polkaItems = useMemo(() => {
    const names = new Set<string>();
    for (const z of storageOptions?.polkas ?? []) names.add(z.name);
    if (polkaValue) names.add(polkaValue);
    return [...names].sort().map((n) => ({ value: n, label: n }));
  }, [storageOptions, polkaValue]);
  // «Ячейка» options — cells filtered to the chosen полка (cell.zoneName === polka)
  // when set; the saved value is always kept selectable (see above).
  const cellItems = useMemo(() => {
    const all = storageOptions?.cells ?? [];
    const filtered = polkaValue ? all.filter((c) => c.zoneName === polkaValue) : all;
    const items = filtered.map((c) => ({ value: c.name, label: c.name }));
    if (yacheykaValue && !items.some((i) => i.value === yacheykaValue)) {
      items.unshift({ value: yacheykaValue, label: yacheykaValue });
    }
    return items;
  }, [storageOptions, polkaValue, yacheykaValue]);

  // «Изображения» create-side staging: file picker + clipboard paste share ONE
  // gate (same size/format limits as the edit-side ImageGallery), user 2026-07-06.
  const [imgError, setImgError] = useState<string | null>(null);
  const addStagedFiles = (files: File[]) => {
    if (files.length === 0) return;
    setImgError(null);
    const ok: File[] = [];
    for (const f of files) {
      const bad = classifyImageFile(f);
      if (bad) {
        setImgError(
          bad === 'too_large'
            ? tCommon('image_too_large', { size: (MAX_IMAGE_BYTES / 1_000_000).toFixed(0) })
            : tCommon('image_bad_format'),
        );
        continue;
      }
      ok.push(f);
    }
    // Cap to MAX_IMAGES per product across what's already staged (user 2026-07-07).
    const { accepted, overflow } = capImagesToLimit(stagedImages.length, ok);
    if (overflow) setImgError(tCommon('image_max', { max: MAX_IMAGES }));
    if (accepted.length > 0) onPickImages(accepted);
  };
  const pasteStagedFromClipboard = async () => {
    setImgError(null);
    try {
      const files = await readClipboardImageFiles();
      if (files.length === 0) {
        setImgError(tCommon('image_no_clipboard'));
        return;
      }
      addStagedFiles(files);
    } catch {
      setImgError(tCommon('image_no_clipboard'));
    }
  };
  // Ctrl+V paste — only while the create-staging body is shown (on the edit page
  // `imagesSlot` = ImageGallery owns its own paste, so this stays disabled to
  // avoid a double-add from two document listeners).
  useImagePaste(addStagedFiles, !imagesSlot);

  return (
    <>
      {/* «Контент для разных торговых площадок» (moysklad's marketplace-AI upsell
        card) is deliberately NOT rendered — USER-DIRECTED removal 2026-07-04
        («shuni olib tashla»): it was structural-only here (no marketplace
        integration), pure noise on every product open. */}

      {/* Изображения — live gallery (edit) or client-side staging (create). */}
      <ProductFormCard title={t('section_images')} testId="card-images">
        {imagesSlot ?? (
          <div className="flex flex-col items-start gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_ATTR}
              multiple
              hidden
              data-test-id="image-input"
              onChange={(e) => {
                addStagedFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => imageInputRef.current?.click()}
                className="inline-flex items-center gap-1.5"
                data-test-id="image-add"
              >
                <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
                {t('images_add')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={pasteStagedFromClipboard}
                className="inline-flex items-center gap-1.5"
                data-test-id="image-paste"
              >
                {tCommon('image_paste')}
              </Button>
              <span className="text-[var(--ms-text-muted)] text-xs">
                {tCommon('image_paste_hint')}
              </span>
            </div>
            {imgError && (
              <div className="text-[var(--ms-text-destructive)] text-xs" role="alert">
                {imgError}
              </div>
            )}
            {stagedImages.length > 0 && (
              <div className="flex flex-wrap gap-2" data-test-id="image-previews">
                {stagedImages.map((img, i) => (
                  <div
                    key={`${img.name}-${i}`}
                    className="relative h-16 w-16 overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
                  >
                    <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setStagedImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-0 right-0 bg-[var(--ms-bg-surface)] px-1 text-[var(--ms-text-muted)] text-xs leading-none hover:text-[var(--ms-text-destructive)]"
                      aria-label={t('image_remove_aria')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ProductFormCard>

      {/* Общие данные */}
      <ProductFormCard title={t('section_main')} testId="card-general">
        <FormField inline id="description" label={t('description_label')}>
          <Textarea
            id="description"
            data-test-id="field-description"
            className="min-h-[80px] w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2 text-sm placeholder:text-[var(--ms-text-placeholder)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1"
            {...form.register('description')}
          />
        </FormField>

        <FormField inline id="productFolderId" label={t('folder_label')}>
          <Controller
            control={form.control}
            name="productFolderId"
            render={({ field }) => (
              <>
                <CatalogPickerField
                  value={field.value ? { id: field.value, label: folderLabel ?? '...' } : null}
                  placeholder=""
                  onPick={() => setPickerOpen(true)}
                  onClear={() => {
                    field.onChange(null);
                    setFolderLabel(null);
                  }}
                  inlineFetcher={folderFetcher}
                  onInlineSelect={(item) => {
                    field.onChange(item.id);
                    setFolderLabel(String(item.primary));
                  }}
                  testId="field-productFolderId"
                />
                <CatalogPicker
                  open={pickerOpen}
                  onClose={() => setPickerOpen(false)}
                  title={t('folder_pick_title')}
                  fetcher={folderFetcher}
                  onSelect={(item) => {
                    field.onChange(item.id);
                    setFolderLabel(String(item.primary));
                  }}
                  searchPlaceholder={t('folder_search')}
                  createLabel={t('folder_create')}
                  onCreate={() => router.push('/product-folders')}
                  testId="folder-picker"
                />
              </>
            )}
          />
        </FormField>

        {/* moysklad parity: «Страна» has NO «?» help icon (only Артикул/Код do) but
          DOES carry a trailing blue «+». moysklad opens an add-country form; our list
          is the full ISO reference, so «+» opens the picker to choose (not create). */}
        <FormField
          inline
          id="country"
          label={t('country_label')}
          error={form.formState.errors.country?.message}
        >
          <Controller
            control={form.control}
            name="country"
            render={({ field }) => (
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <Combobox
                    id="country"
                    testId="field-country"
                    items={countryItems}
                    value={field.value || undefined}
                    onChange={(next) => field.onChange(next ?? '')}
                    placeholder=""
                    searchPlaceholder={tCommon('search')}
                    emptyText={tCommon('no_results')}
                    ariaLabel={t('country_label')}
                    open={countryOpen}
                    onOpenChange={setCountryOpen}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCountryOpen(true)}
                  aria-label={t('country_label')}
                  className="shrink-0 px-1 text-[var(--ms-text-brand)] hover:opacity-80"
                  data-test-id="country-add"
                >
                  <Icons.create className="size-4" aria-hidden />
                </button>
              </div>
            )}
          />
        </FormField>

        <FormField inline id="supplierId" label={t('supplier_label')}>
          <Controller
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <>
                {/* moysklad parity: a trailing blue «+» opens the supplier picker
                  (which offers search + «Создать»). */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <CatalogPickerField
                      value={
                        field.value ? { id: field.value, label: supplierLabel ?? '...' } : null
                      }
                      placeholder=""
                      onPick={() => setSupplierPickerOpen(true)}
                      onClear={() => {
                        field.onChange(null);
                        setSupplierLabel(null);
                      }}
                      inlineFetcher={supplierFetcher}
                      onInlineSelect={(item) => {
                        field.onChange(item.id);
                        setSupplierLabel(String(item.primary));
                      }}
                      testId="field-supplierId"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSupplierPickerOpen(true)}
                    aria-label={t('supplier_create')}
                    className="shrink-0 px-1 text-[var(--ms-text-brand)] hover:opacity-80"
                    data-test-id="supplier-add"
                  >
                    <Icons.create className="size-4" aria-hidden />
                  </button>
                </div>
                <CatalogPicker
                  open={supplierPickerOpen}
                  onClose={() => setSupplierPickerOpen(false)}
                  title={t('supplier_pick_title')}
                  fetcher={supplierFetcher}
                  onSelect={(item) => {
                    field.onChange(item.id);
                    setSupplierLabel(String(item.primary));
                  }}
                  searchPlaceholder={t('supplier_search')}
                  createLabel={t('supplier_create')}
                  onCreate={() => router.push('/counterparties/new')}
                  testId="supplier-picker"
                />
              </>
            )}
          />
        </FormField>

        <FormField inline id="article" label={t('article_label')} hint={t('article_hint')}>
          <Input id="article" data-test-id="field-article" {...form.register('article')} />
        </FormField>

        {/* «Полка» + «Ячейка» (user 2026-07-05, v3): two searchable dropdowns,
          right above «Код», fed by the warehouses' real zones/cells. Picking a
          полка filters the ячейка list; picking a ячейка auto-fills its полка.
          Saved into Product.attributes.__polka / __yacheyka. */}
        <Controller
          control={form.control}
          name="polka"
          render={({ field }) => (
            <FormField inline id="polka" label={t('storage_polka_label')}>
              <Combobox
                id="polka"
                value={field.value || undefined}
                onChange={(v) => {
                  const next = v ?? '';
                  field.onChange(next);
                  // Drop the picked ячейка if it no longer belongs to the new полка.
                  if (next) {
                    const cur = form.getValues('yacheyka');
                    const cell = storageOptions?.cells.find((c) => c.name === cur);
                    if (cell && cell.zoneName !== next)
                      form.setValue('yacheyka', '', { shouldDirty: true });
                  }
                }}
                items={polkaItems}
                placeholder={t('storage_polka_ph')}
                searchPlaceholder={tCommon('search')}
                emptyText={tCommon('no_results')}
                testId="field-storage-polka"
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="yacheyka"
          render={({ field }) => (
            <FormField inline id="yacheyka" label={t('storage_cell_label')}>
              <Combobox
                id="yacheyka"
                value={field.value || undefined}
                onChange={(v) => {
                  const next = v ?? '';
                  field.onChange(next);
                  // Auto-fill полка from the picked ячейка's zone.
                  const cell = storageOptions?.cells.find((c) => c.name === next);
                  if (cell?.zoneName) form.setValue('polka', cell.zoneName, { shouldDirty: true });
                }}
                items={cellItems}
                placeholder={t('storage_cell_ph')}
                searchPlaceholder={tCommon('search')}
                emptyText={tCommon('no_results')}
                testId="field-storage-cell"
              />
            </FormField>
          )}
        />

        <FormField
          inline
          id="code"
          label={t('code_label')}
          hint={t('code_hint')}
          error={form.formState.errors.code?.message}
        >
          <Input id="code" data-test-id="field-code" {...form.register('code')} />
        </FormField>

        {/* moysklad parity: «Внешний код» has NO «?» help icon (unlike Артикул/Код). */}
        <FormField inline id="externalCode" label={t('external_code_label')}>
          <Input
            id="externalCode"
            data-test-id="field-externalCode"
            {...form.register('externalCode')}
          />
        </FormField>

        <FormField inline id="uom" label={t('uom_label')}>
          <div className="flex min-w-0 items-center gap-1.5">
            <Controller
              control={form.control}
              name="uom"
              render={({ field }) => {
                // Show the current value even if it isn't in the reference
                // (legacy/custom string) so the combo never blanks it out.
                const items =
                  field.value && !uomItems.some((it) => it.value === field.value)
                    ? [{ value: field.value, label: field.value }, ...uomItems]
                    : uomItems;
                return (
                  <Combobox
                    id="uom"
                    testId="field-uom"
                    items={items}
                    value={field.value || undefined}
                    onChange={(next) => field.onChange(next ?? '')}
                    placeholder=""
                    searchPlaceholder={tCommon('search')}
                    emptyText={tCommon('no_results')}
                    ariaLabel={t('uom_label')}
                  />
                );
              }}
            />
            <button
              type="button"
              onClick={() => router.push('/settings/uoms')}
              className="shrink-0 px-1 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
              aria-label={t('uom_settings_aria')}
              data-test-id="uom-settings"
            >
              <Icons.edit className="size-3.5" aria-hidden />
            </button>
          </div>
        </FormField>

        {/* Вес · Объём · НДС live in Общие данные in moysklad. */}
        <FormField
          inline
          id="weightG"
          label={t('weight_label')}
          error={form.formState.errors.weightG?.message}
        >
          <Input
            id="weightG"
            data-test-id="field-weightG"
            inputMode="numeric"
            className="text-right tabular-nums"
            {...form.register('weightG')}
          />
        </FormField>
        <FormField
          inline
          id="volumeML"
          label={t('volume_label')}
          error={form.formState.errors.volumeML?.message}
        >
          <Input
            id="volumeML"
            data-test-id="field-volumeML"
            inputMode="numeric"
            className="text-right tabular-nums"
            {...form.register('volumeML')}
          />
        </FormField>

        {/* НДС — moysklad combo (live-grounded options: без НДС · 0% · 12%). Stored
          as the existing numeric string ('' = без НДС, '0', '12') — no schema change.
          A legacy/out-of-list rate is preserved as an extra option. */}
        <FormField inline id="vat" label={t('vat_label')}>
          <Controller
            control={form.control}
            name="vat"
            render={({ field }) => {
              const known = ['', '0', '12'];
              const v = field.value ?? '';
              return (
                <NativeSelect
                  id="vat"
                  data-test-id="field-vat"
                  className="w-40"
                  value={v}
                  onChange={field.onChange}
                >
                  <option value="">{t('vat_none_label')}</option>
                  <option value="0">0%</option>
                  <option value="12">12%</option>
                  {v && !known.includes(v) && <option value={v}>{v}%</option>}
                </NativeSelect>
              );
            }}
          />
        </FormField>
      </ProductFormCard>

      {/* Неснижаемый остаток — «?» title icon + dismissable blue info-banner, then
        the 3 modes (only «sum» maps to our field). moysklad puts the «sum» input
        on the SAME row as its radio, right-aligned with a «Не указан» placeholder. */}
      <ProductFormCard
        title={
          <span className="inline-flex items-center gap-1.5">
            {t('section_min_balance')}
            <Icons.help className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
          </span>
        }
        testId="card-min-balance"
      >
        {minBalanceBannerOpen && (
          <div
            className="relative mb-2 flex gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-info-100)] bg-[var(--ms-info-50)] py-2 pr-7 pl-2.5 text-[var(--ms-info-700)] text-xs"
            data-test-id="min-balance-banner"
          >
            <Icons.info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <p>{t('min_balance_hint')}</p>
            <button
              type="button"
              onClick={() => setMinBalanceBannerOpen(false)}
              aria-label={tCommon('close')}
              className="absolute top-1.5 right-1.5 leading-none hover:opacity-70"
            >
              ✕
            </button>
          </div>
        )}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="minBalanceMode"
                checked={minBalanceMode === 'sum'}
                onChange={() => setMinBalanceMode('sum')}
                data-test-id="minbal-mode-sum"
              />
              <span>{t('min_balance_mode_sum')}</span>
            </label>
            {minBalanceMode === 'sum' && (
              <Input
                id="minimumBalance"
                data-test-id="field-minimumBalance"
                placeholder={t('min_balance_placeholder')}
                className="ml-auto max-w-[150px] text-right"
                {...form.register('minimumBalance')}
              />
            )}
          </div>
          {minBalanceMode === 'sum' && form.formState.errors.minimumBalance && (
            <p className="text-[var(--ms-text-destructive)] text-xs">
              {form.formState.errors.minimumBalance.message}
            </p>
          )}
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="minBalanceMode"
              checked={minBalanceMode === 'same'}
              onChange={() => setMinBalanceMode('same')}
              data-test-id="minbal-mode-same"
            />
            <span>{t('min_balance_mode_same')}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="minBalanceMode"
              checked={minBalanceMode === 'perStore'}
              onChange={() => setMinBalanceMode('perStore')}
              data-test-id="minbal-mode-perstore"
            />
            <span>{t('min_balance_mode_perstore')}</span>
          </label>
        </div>
      </ProductFormCard>

      {/* Место хранения — USER-DIRECTED (2026-07-04, NOT moysklad parity;
        final shape per the user's clarification: one product can sit in
        SEVERAL cells with a quantity in each — e.g. 01-01-01-01 → 30,
        02-03-04-17 → 70). A READ-ONLY table of the product's real per-cell
        stock (GET /products/:id/cell-stock ← StockByCell); quantities enter
        via receiving/move/return document rows with a «Ячейка», so this can
        never drift from the actual balance. */}
      <ProductFormCard title={t('section_storage_cells')} testId="card-storage-cells">
        {cellStock.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="storage-stock-empty">
            {t('storage_stock_empty')}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm" data-test-id="storage-stock-table">
            <thead>
              <tr className="border-[var(--ms-text-brand)] border-b-2">
                <th className="px-2 pb-1.5 text-left align-bottom font-normal text-[var(--ms-text-brand)] text-xs">
                  {t('storage_col_cell')}
                </th>
                <th className="px-2 pb-1.5 text-left align-bottom font-normal text-[var(--ms-text-brand)] text-xs">
                  {t('storage_col_store')}
                </th>
                <th className="px-2 pb-1.5 text-right align-bottom font-normal text-[var(--ms-text-brand)] text-xs">
                  {t('storage_col_qty')}
                </th>
                <th className="px-2 pb-1.5" aria-label={t('cell_move_action')} />
              </tr>
            </thead>
            <tbody>
              {cellStock.map((r) => (
                <tr
                  key={`${r.storeId ?? 'bind'}-${r.cellId ?? r.cellName}`}
                  className="border-[var(--ms-border-default)] border-b last:border-0"
                  data-test-id="storage-stock-row"
                >
                  <td className="px-2 py-1.5">
                    {r.zoneName ? `${r.zoneName} / ${r.cellName}` : r.cellName}
                  </td>
                  <td className="px-2 py-1.5 text-[var(--ms-text-muted)]">{r.storeName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtQty(Number(r.qty) || 0)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      className="text-[var(--ms-text-brand)] text-xs hover:underline"
                      onClick={() => setMoveSource(r)}
                      data-test-id="storage-stock-move"
                    >
                      {t('cell_move_action')}
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-2 py-1.5" />
                <td className="px-2 py-1.5" />
                <td
                  className="px-2 py-1.5 text-right font-semibold tabular-nums"
                  data-test-id="storage-stock-total"
                >
                  {fmtQty(cellStockTotal)}
                </td>
                <td className="px-2 py-1.5" />
              </tr>
            </tbody>
          </table>
        )}
      </ProductFormCard>

      {/* «Переместить» — move a product between two cells of the same store
        (pure per-cell redistribution; store total unchanged). Opens from the
        «Место хранения» row action; refetches the cell-stock table on success. */}
      {productId && moveSource && (
        <CellMoveModal
          productId={productId}
          source={moveSource}
          onClose={() => setMoveSource(null)}
          onDone={() => {
            setMoveSource(null);
            void queryClient.invalidateQueries({ queryKey: ['product-cell-stock', productId] });
            // A binding re-bind changes attributes.__polka/__yacheyka — refetch the
            // product so the «Полка»/«Ячейка» pickers in «Общие данные» refresh too.
            void queryClient.invalidateQueries({ queryKey: ['product', productId] });
          }}
        />
      )}

      {/* Отрезы — USER-DIRECTED meter-goods cutting (2026-07-04, NOT moysklad
        parity): the product's remnant family («Труба 4м — отрез 2м», …) with
        live stock, plus the «Раскрой…» action. Edit form only — a new product
        has no stock to cut yet. */}
      {productId && <ProductCutCard productId={productId} />}

      {/* Особенности учёта — Фасовка / Тип учёта (structural) · ИКПУ · ТАСНИф ·
        Маркировка → Тип продукции. */}
      <ProductFormCard title={t('section_features')} testId="card-features">
        <FormField inline id="packaging" label={t('packaging_label')}>
          <NativeSelect
            id="packaging"
            data-test-id="field-packaging"
            value={packaging}
            onChange={(e) => setPackaging(e.target.value)}
          >
            <option value="piece">{t('packaging_piece')}</option>
            <option value="weight">{t('packaging_weight')}</option>
            <option value="bulk">{t('packaging_bulk')}</option>
          </NativeSelect>
        </FormField>

        <FormField inline id="accountingType" label={t('accounting_label')}>
          <NativeSelect
            id="accountingType"
            data-test-id="field-accountingType"
            value={accountingType}
            onChange={(e) => setAccountingType(e.target.value)}
          >
            <option value="none">{t('accounting_none')}</option>
            <option value="serial">{t('accounting_serial')}</option>
          </NativeSelect>
        </FormField>

        <FormField
          inline
          id="mxikCode"
          label={t('mxik_label')}
          hint={t('mxik_hint')}
          error={form.formState.errors.mxikCode?.message}
        >
          <Input
            id="mxikCode"
            data-test-id="field-mxik"
            inputMode="numeric"
            invalid={!!form.formState.errors.mxikCode}
            {...form.register('mxikCode')}
          />
        </FormField>

        <FormField inline id="packTasnif" label={t('pack_tasnif_label')}>
          <Input
            id="packTasnif"
            data-test-id="field-packTasnif"
            maxLength={50}
            value={packTasnif}
            onChange={(e) => {
              setPackTasnif(e.target.value);
              markAuxDirty();
            }}
          />
        </FormField>

        <FormField inline id="barcodeTasnif" label={t('barcode_tasnif_label')}>
          <Input
            id="barcodeTasnif"
            data-test-id="field-barcodeTasnif"
            maxLength={50}
            value={barcodeTasnif}
            onChange={(e) => {
              setBarcodeTasnif(e.target.value);
              markAuxDirty();
            }}
          />
        </FormField>

        {/* Маркировка — sub-heading + Тип продукции. */}
        <h4 className="mt-2 mb-1 font-semibold text-[var(--ms-text-primary)] text-sm">
          {t('marking_heading')}
        </h4>
        <FormField inline id="markingType" label={t('marking_type_label')}>
          <NativeSelect
            id="markingType"
            data-test-id="field-markingType"
            value={markingType}
            onChange={(e) => {
              setMarkingType(e.target.value);
              markAuxDirty();
            }}
          >
            <option value="none">{t('marking_none')}</option>
            <option value="tobacco">{t('marking_tobacco')}</option>
            <option value="water">{t('marking_water')}</option>
            <option value="appliances">{t('marking_appliances')}</option>
            <option value="alcohol">{t('marking_alcohol')}</option>
            <option value="beer">{t('marking_beer')}</option>
          </NativeSelect>
        </FormField>

        {/* GTIN — required for a marked product. */}
        {markingType !== 'none' && (
          <FormField
            inline
            id="gtin"
            label={t('gtin_label')}
            error={form.formState.errors.gtin?.message}
          >
            <Input
              id="gtin"
              data-test-id="field-gtin"
              inputMode="numeric"
              maxLength={14}
              invalid={!!form.formState.errors.gtin}
              {...form.register('gtin')}
            />
          </FormField>
        )}

        <FormField
          inline
          id="paymentItemType"
          label={t('payment_item_label')}
          hint={t('payment_item_hint')}
        >
          <NativeSelect
            id="paymentItemType"
            data-test-id="field-paymentItemType"
            {...form.register('paymentItemType')}
          >
            <option value="">{t('payment_item_default')}</option>
            <option value="GOOD">{t('payment_item_commodity')}</option>
            <option value="EXCISABLE_GOOD">{t('payment_item_excisable')}</option>
            <option value="COMPOUND_PAYMENT_ITEM">{t('payment_item_compound')}</option>
            <option value="ANOTHER_PAYMENT_ITEM">{t('payment_item_another')}</option>
          </NativeSelect>
        </FormField>
      </ProductFormCard>

      {/* Штрихкоды товара — moysklad parity: ⓘ title + dismissable GTIN banner +
        EDITABLE typed rows (type ▾ · value input · ⋯ menu) + «➕ Штрихкод» that
        appends a row with an auto-generated internal EAN13. */}
      <ProductFormCard
        title={
          <span className="inline-flex items-center gap-1.5">
            {t('section_barcodes')}
            <Icons.info className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
          </span>
        }
        testId="card-barcodes"
      >
        {barcodeBannerOpen && (
          <div
            className="relative flex gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-info-100)] bg-[var(--ms-info-50)] py-2 pr-7 pl-2.5 text-[var(--ms-info-700)] text-xs"
            data-test-id="barcode-gtin-banner"
          >
            <Icons.info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <p>{t('barcodes_gtin_hint')}</p>
            <button
              type="button"
              onClick={() => setBarcodeBannerOpen(false)}
              aria-label={tCommon('close')}
              className="absolute top-1.5 right-1.5 leading-none hover:opacity-70"
            >
              ✕
            </button>
          </div>
        )}

        {barcodes.length > 0 && (
          <div className="space-y-1.5" data-test-id="barcode-list">
            {barcodes.map((bc, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: positional rows edited in place — the index is the stable identity (value/type as key would drop input focus on each keystroke)
                key={i}
                className="flex items-center gap-1.5"
              >
                <NativeSelect
                  aria-label={t('barcode_type_label')}
                  value={barcodeTypes[i] ?? 'ean13'}
                  onChange={(e) => setBarcodeTypeAt(i, e.target.value)}
                  data-test-id={`barcode-type-${i}`}
                  className="w-32 shrink-0"
                >
                  {BARCODE_TYPES.map((bt) => (
                    <option key={bt} value={bt}>
                      {barcodeTypeLabel(bt)}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  className="flex-1 font-mono tabular-nums"
                  inputMode="numeric"
                  value={bc}
                  onChange={(e) => setBarcodeAt(i, e.target.value)}
                  aria-label={t('barcode_type_label')}
                  data-test-id={`barcode-value-${i}`}
                />
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setBarcodeMenu(barcodeMenu === i ? null : i)}
                    aria-label={tCommon('actions')}
                    className="flex h-7 w-7 items-center justify-center rounded text-[var(--ms-text-muted)] leading-none hover:bg-[var(--ms-bg-muted)]"
                    data-test-id={`barcode-menu-${i}`}
                  >
                    ⋯
                  </button>
                  {barcodeMenu === i && (
                    <>
                      <button
                        type="button"
                        aria-hidden
                        tabIndex={-1}
                        className="fixed inset-0 z-[var(--ms-z-popover)] cursor-default"
                        onClick={() => setBarcodeMenu(null)}
                      />
                      <div className="absolute right-0 z-[calc(var(--ms-z-popover)+1)] mt-1 min-w-[140px] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] py-1 shadow-[var(--ms-shadow-md)]">
                        <button
                          type="button"
                          onClick={() => {
                            removeBarcode(i);
                            setBarcodeMenu(null);
                          }}
                          className="block w-full px-3 py-1.5 text-left text-[var(--ms-text-destructive)] text-sm hover:bg-[var(--ms-bg-muted)]"
                          data-test-id={`barcode-remove-${i}`}
                        >
                          {tCommon('delete')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={addBarcode}
          className="inline-flex items-center gap-1.5"
          data-test-id="barcode-add"
        >
          <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
          {t('barcode_add')}
        </Button>
      </ProductFormCard>

      {/* Доступ — Сотрудник (owner) · Отдел (owning group) · Общий доступ. */}
      <ProductFormCard title={t('section_access')} testId="card-access">
        <div className="space-y-3">
          <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-3">
            <span className="text-[var(--ms-text-muted)] text-sm">{t('owner_label')}</span>
            <div>
              <Controller
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <>
                    <CatalogPickerField
                      value={field.value ? { id: field.value, label: ownerLabel ?? '...' } : null}
                      placeholder=""
                      onPick={() => setOwnerPickerOpen(true)}
                      onClear={() => {
                        field.onChange(null);
                        setOwnerLabel(null);
                      }}
                      inlineFetcher={ownerFetcher}
                      onInlineSelect={(item) => {
                        field.onChange(item.id);
                        setOwnerLabel(String(item.primary));
                      }}
                      testId="field-ownerId"
                    />
                    <CatalogPicker
                      open={ownerPickerOpen}
                      onClose={() => setOwnerPickerOpen(false)}
                      title={t('owner_pick_title')}
                      fetcher={ownerFetcher}
                      onSelect={(item) => {
                        field.onChange(item.id);
                        setOwnerLabel(String(item.primary));
                      }}
                      searchPlaceholder={t('owner_search')}
                      testId="owner-picker"
                    />
                  </>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-3">
            <span className="text-[var(--ms-text-muted)] text-sm">{t('department_label')}</span>
            <div>
              <Controller
                control={form.control}
                name="groupId"
                render={({ field }) => (
                  <>
                    <CatalogPickerField
                      value={field.value ? { id: field.value, label: groupLabel ?? '...' } : null}
                      placeholder=""
                      onPick={() => setGroupPickerOpen(true)}
                      onClear={() => {
                        field.onChange(null);
                        setGroupLabel(null);
                      }}
                      inlineFetcher={groupFetcher}
                      onInlineSelect={(item) => {
                        field.onChange(item.id);
                        setGroupLabel(String(item.primary));
                      }}
                      testId="field-groupId"
                    />
                    <CatalogPicker
                      open={groupPickerOpen}
                      onClose={() => setGroupPickerOpen(false)}
                      title={t('department_pick_title')}
                      fetcher={groupFetcher}
                      onSelect={(item) => {
                        field.onChange(item.id);
                        setGroupLabel(String(item.primary));
                      }}
                      searchPlaceholder={t('department_search')}
                      testId="group-picker"
                    />
                  </>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-3">
            <label htmlFor="shared" className="text-[var(--ms-text-muted)] text-sm">
              {t('shared_label')}
            </label>
            <Controller
              control={form.control}
              name="shared"
              render={({ field }) => (
                <Checkbox
                  id="shared"
                  checked={!!field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  data-test-id="field-shared"
                />
              )}
            />
          </div>
        </div>
      </ProductFormCard>
    </>
  );
}
