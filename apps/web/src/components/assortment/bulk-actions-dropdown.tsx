'use client';

/**
 * Assortment list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Shared across the three assortment views that our app splits into separate
 * pages (Товары / Услуги / Комплекты). In moysklad these live in ONE unified
 * assortment list (route `#good`): «Услуги»/«Комплекты» are NOT separate list
 * routes — `#service` is a sector onboarding page, not a list (verified
 * 2026-05-30 via `pnpm capture-moysklad services`, which landed on the
 * "МойСклад для сферы услуг" splash). So the authoritative «Изменить» menu for
 * services and bundles is the SAME assortment menu captured for products.
 *
 * Source-of-truth: docs/moysklad-reference/products/states/metadata.json
 * (re-captured 2026-05-30 once the harness was fixed to select a row before
 * opening the menu — see scripts/capture-moysklad-references.ts).
 *
 * Authoritative moysklad item set — 7 items in 3 separator-grouped sections
 * (grounded live on online.moysklad.uz 2026-06-17), no «soon» hints (CATALOG
 * pattern — archive/restore, not post/unpost; assortment isn't FSM-backed):
 *   1. Удалить                  (bulk-delete   — POST /products/bulk-delete)
 *   2. Копировать               (bulk-clone    — POST /products/bulk-clone)
 *   ── separator ──
 *   3. Массовое редактирование  (mass-edit     — page-owned modal via onMassEdit)
 *   4. Переместить              (move-to-folder — folder picker → POST /products/bulk-move)
 *   5. Поместить в архив        (bulk-archive  — POST /products/bulk-archive)
 *   6. Извлечь из архива        (bulk-restore  — POST /products/bulk-restore)
 *   ── separator ──
 *   7. Цены...                  (price dialog  — POST /products/bulk-set-prices)
 *
 * Backend note: services and bundles are products (kind=service / kind=bundle)
 * in our schema — they are served by the products controller and the
 * `/products/bulk-*` endpoints apply to them unchanged, so this component is
 * genuinely assortment-level rather than product-specific.
 *
 * Functionality: all actions except «Массовое редактирование» are wired to real
 * endpoints — Удалить/Архив/Извлечь (bulk-delete/archive/restore), Переместить
 * (folder picker → bulk-move), Копировать (bulk-clone full-fidelity duplicate),
 * Цены... (price modal → bulk-set-prices). «Массовое редактирование» opens a
 * page-owned modal via the optional `onMassEdit` prop (disabled until a page
 * wires it).
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { usePriceTypeIds } from '@/lib/sale-price';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Checkbox,
  Drawer,
  DropdownMenu,
  Icons,
  Input,
  MoneyInput,
  NativeSelect,
  type PickerItem,
  RadioGroup,
  SegmentedControl,
  useConfirm,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

/** «Массовое редактирование» field labels (Подтверждение step + parity with moysklad). */
const ME_FIELD_LABELS: Record<string, string> = {
  archived: 'Архивный',
  folder: 'Группа',
  country: 'Страна',
  uom: 'Единица измерения',
  weightG: 'Вес',
  volumeML: 'Объем',
  vat: 'НДС',
  minBalance: 'Неснижаемый остаток',
  supplier: 'Поставщик',
  mxik: 'ИКПУ (MXIK)',
  tasnifCode: 'Код упаковки ТАСНИФ',
  tasnifBarcode: 'Штрихкод ТАСНИФ',
  tracking: 'Маркированная продукция',
  weighed: 'Фасовка',
  discount: 'Запретить скидки при продаже в розницу',
  owner: 'Владелец-сотрудник',
  dept: 'Владелец-отдел',
  shared: 'Общий доступ',
};

// «Страна» combo options — common countries of origin for an UZ business,
// value = ISO-3166-1 alpha-2 (matches Product.country's stored 2-letter code).
const COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: '', name: '' },
  { code: 'UZ', name: 'Узбекистан' },
  { code: 'RU', name: 'Россия' },
  { code: 'KZ', name: 'Казахстан' },
  { code: 'KG', name: 'Киргизия' },
  { code: 'TJ', name: 'Таджикистан' },
  { code: 'CN', name: 'Китай' },
  { code: 'TR', name: 'Турция' },
  { code: 'DE', name: 'Германия' },
  { code: 'KR', name: 'Республика Корея' },
  { code: 'US', name: 'США' },
];

// Russian plural for the «Выбран(о) N товар(а/ов)» pill (moysklad: «Выбран 1 товар»).
function selectedCountLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `Выбран ${n} товар`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `Выбрано ${n} товара`;
  return `Выбрано ${n} товаров`;
}

// moysklad-style circled «?» field-help marker.
function HelpMark({ title }: { title: string }) {
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--ms-border-default)] text-[10px] text-[var(--ms-text-muted)]"
      title={title}
    >
      ?
    </span>
  );
}

export interface AssortmentBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /** Opens the page-owned MassEditModal (Массовое редактирование). */
  onMassEdit?: () => void;
  /** Current «Показывать» view — moysklad greys «Извлечь из архива» when the
   *  selection isn't archived (active view) and «Поместить в архив» when it is
   *  (archived view). 'all'/undefined → both enabled. */
  archivedView?: 'active' | 'archived' | 'all';
  /** Override the «Изменить» trigger button styling — e.g. to join it into the
   *  toolbar's segmented [count | Изменить | Печать] group (moysklad parity). */
  triggerClassName?: string;
}

export function AssortmentBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  onMassEdit,
  archivedView,
  triggerClassName,
}: AssortmentBulkActionsDropdownProps) {
  // moysklad greys the inapplicable archive action for the current view.
  const archiveDisabled = archivedView === 'archived';
  const restoreDisabled = archivedView === 'active';
  const t = useTranslations('bulk_actions');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;
  const [moveOpen, setMoveOpen] = useState(false);
  // «Изменить цены» drawer — moysklad's bulk price-change form.
  const { priceTypes } = usePriceTypeIds();
  const [pricesOpen, setPricesOpen] = useState(false);
  // moysklad parity: target/base price types start UNSELECTED (greyed «Выберите
  // тип цены» placeholder); the default mode is «На основании другой цены».
  const [targetPt, setTargetPt] = useState('');
  const [changeCurrency, setChangeCurrency] = useState(false);
  const [currencyCode, setCurrencyCode] = useState('UZS');
  // «Изменить валюту» offers the account's configured currencies (moysklad
  // parity — not a hardcoded list). Lazily fetched; falls back to UZS-only.
  const { data: currencyData } = useQuery<{ items: { code: string; name: string }[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies?limit=50'),
    enabled: pricesOpen,
  });
  const currencies = currencyData?.items?.length
    ? currencyData.items
    : [{ code: 'UZS', name: 'сум' }];
  const [priceMode, setPriceMode] = useState<'fixed' | 'cost' | 'other'>('other');
  const [fixedValue, setFixedValue] = useState(''); // minor (MoneyInput)
  const [basePt, setBasePt] = useState('');
  const [adjustSign, setAdjustSign] = useState<'+' | '-'>('+');
  const [adjustValue, setAdjustValue] = useState(''); // minor (currency) | percent number
  const [adjustUnit, setAdjustUnit] = useState<'currency' | 'percent'>('currency');
  const [rounding, setRounding] = useState<'none' | 'integer'>('none');
  // «Массовое редактирование» — 2-step wizard (Настройка параметров → Подтверждение).
  // Each field is opt-in via `meEnabled`; only enabled fields land in the patch.
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [meStep, setMeStep] = useState<'config' | 'confirm'>('config');
  const [meEnabled, setMeEnabled] = useState<Set<string>>(new Set());
  // The blue intro box is dismissable (moysklad's ✕), like its real counterpart.
  const [meInfoOpen, setMeInfoOpen] = useState(true);
  // Which picker is open (one at a time): supplier / catalog folder / owner / dept.
  const [mePicker, setMePicker] = useState<null | 'supplier' | 'folder' | 'owner' | 'dept'>(null);
  // Yes/No radios default to «Да» (moysklad's initial radio position for all three).
  const [meArchived, setMeArchived] = useState<'true' | 'false'>('true');
  const [meFolder, setMeFolder] = useState<{ id?: string; label?: string }>({});
  const [meCountry, setMeCountry] = useState('');
  const [meUom, setMeUom] = useState('');
  // Вес/Объём prefill «0» — moysklad shows 0 in these numeric fields.
  const [meWeight, setMeWeight] = useState('0');
  const [meVolume, setMeVolume] = useState('0');
  const [meVat, setMeVat] = useState('');
  // «Неснижаемый остаток» mode: sum across all / same on each / per-warehouse.
  // Only «sum» maps to our single minimumBalanceMinor; the other two need a
  // per-warehouse model (not yet built) and are shown disabled («Tez orada»).
  const [meMinMode, setMeMinMode] = useState<'sum' | 'same' | 'each'>('sum');
  const [meMinBalance, setMeMinBalance] = useState('');
  const [meSupplier, setMeSupplier] = useState<{ id?: string; label?: string }>({});
  const [meMxik, setMeMxik] = useState('');
  const [meTasnifCode, setMeTasnifCode] = useState('');
  const [meTasnifBarcode, setMeTasnifBarcode] = useState('');
  const [meTracking, setMeTracking] = useState(''); // trackingType ('' = Не отслеживается)
  const [meWeighed, setMeWeighed] = useState<'true' | 'false'>('false');
  const [meDiscount, setMeDiscount] = useState<'true' | 'false'>('true');
  const [meOwner, setMeOwner] = useState<{ id?: string; label?: string }>({});
  const [meDept, setMeDept] = useState<{ id?: string; label?: string }>({});
  const [meShared, setMeShared] = useState<'true' | 'false'>('true');
  const meToggle = (key: string) =>
    setMeEnabled((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  // Auto-include a field the moment its control is touched, so a filled-in value
  // is never silently dropped just because the user forgot the leading checkbox.
  const meEnable = (key: string) =>
    setMeEnabled((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  // «Единица измерения» combo options come from the account's UoM reference.
  const { data: uomData } = useQuery<{ items: { id: string; name: string }[] }>({
    queryKey: ['uoms', 'massedit'],
    queryFn: () => api.get('/uoms?limit=100'),
    enabled: massEditOpen,
  });
  const uomOptions = uomData?.items ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: listQueryKey });
    onClearSelection();
  };

  const bulkDelete = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/products/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkArchive = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/products/bulk-archive', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkRestore = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/products/bulk-restore', { ids: rowIds }),
    onSuccess: invalidate,
  });

  // «Переместить» — move selected assortment to a folder (POST /products/bulk-move).
  const bulkMove = useApiMutation({
    mutationFn: async (vars: { ids: string[]; productFolderId: string | null }) =>
      api.post<{ moved: number }>('/products/bulk-move', vars),
    onSuccess: () => {
      setMoveOpen(false);
      invalidate();
    },
  });

  // «Копировать» — duplicate the selected assortment (POST /products/bulk-clone).
  const bulkClone = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/products/bulk-clone', { ids: rowIds }),
    onSuccess: invalidate,
  });

  // «Изменить цены» — bulk price change (POST /products/bulk-set-prices).
  interface SetPricesVars {
    ids: string[];
    targetPriceTypeId: string;
    mode: 'fixed' | 'cost' | 'other';
    valueMinor?: string;
    basePriceTypeId?: string;
    adjustSign?: '+' | '-';
    adjustValue?: string;
    adjustUnit?: 'currency' | 'percent';
    rounding?: 'none' | 'integer';
    currencyCode?: string;
  }
  const bulkSetPrices = useApiMutation({
    mutationFn: async (vars: SetPricesVars) =>
      api.post<BulkResult>('/products/bulk-set-prices', vars),
    onSuccess: () => {
      setPricesOpen(false);
      setFixedValue('');
      setAdjustValue('');
      invalidate();
    },
  });

  // Whether the «Сохранить новые цены» button is enabled for the current form.
  const pricesValid =
    !!targetPt &&
    (priceMode === 'fixed'
      ? !!fixedValue
      : priceMode === 'other'
        ? !!basePt && !!adjustValue
        : !!adjustValue);

  const applySetPrices = () => {
    const base: SetPricesVars = {
      ids,
      targetPriceTypeId: targetPt,
      mode: priceMode,
      rounding,
      ...(changeCurrency ? { currencyCode } : {}),
    };
    if (priceMode === 'fixed') {
      bulkSetPrices.mutate({ ...base, valueMinor: fixedValue });
    } else {
      bulkSetPrices.mutate({
        ...base,
        ...(priceMode === 'other' ? { basePriceTypeId: basePt } : {}),
        adjustSign,
        adjustValue,
        adjustUnit,
      });
    }
  };

  // «Массовое редактирование» — bulk-edit common fields (POST /products/bulk-update).
  interface BulkUpdateVars {
    ids: string[];
    archived?: boolean;
    productFolderId?: string | null;
    country?: string | null;
    uom?: string | null;
    weightG?: number | null;
    volumeML?: number | null;
    vat?: number | null;
    minimumBalanceMinor?: string | null;
    supplierId?: string | null;
    mxikCode?: string | null;
    tasnifCode?: string | null;
    tasnifBarcode?: string | null;
    weighed?: boolean;
    discountProhibited?: boolean;
    ownerId?: string | null;
    groupId?: string | null;
    shared?: boolean;
  }
  const bulkUpdate = useApiMutation({
    mutationFn: async (vars: BulkUpdateVars) =>
      api.post<{ updated: number }>('/products/bulk-update', vars),
    onSuccess: () => {
      setMassEditOpen(false);
      setMeStep('config');
      setMeEnabled(new Set());
      setMeSupplier({});
      setMeVat('');
      invalidate();
    },
  });

  // A text field empty → null (clear); otherwise its value. Only enabled fields ship.
  const applyMassEdit = () => {
    const on = (k: string) => meEnabled.has(k);
    const numOrNull = (s: string) => (s.trim() ? Number(s) : null);
    bulkUpdate.mutate({
      ids,
      ...(on('archived') ? { archived: meArchived === 'true' } : {}),
      ...(on('folder') ? { productFolderId: meFolder.id ?? null } : {}),
      ...(on('country') ? { country: meCountry.trim() || null } : {}),
      ...(on('uom') ? { uom: meUom.trim() || null } : {}),
      ...(on('weightG') ? { weightG: numOrNull(meWeight) } : {}),
      ...(on('volumeML') ? { volumeML: numOrNull(meVolume) } : {}),
      ...(on('vat') ? { vat: numOrNull(meVat) } : {}),
      ...(on('minBalance') ? { minimumBalanceMinor: meMinBalance.trim() || null } : {}),
      ...(on('supplier') ? { supplierId: meSupplier.id ?? null } : {}),
      ...(on('mxik') ? { mxikCode: meMxik.trim() || null } : {}),
      ...(on('tasnifCode') ? { tasnifCode: meTasnifCode.trim() || null } : {}),
      ...(on('tasnifBarcode') ? { tasnifBarcode: meTasnifBarcode.trim() || null } : {}),
      ...(on('tracking') ? { trackingType: meTracking || null } : {}),
      ...(on('weighed') ? { weighed: meWeighed === 'true' } : {}),
      ...(on('discount') ? { discountProhibited: meDiscount === 'true' } : {}),
      ...(on('owner') ? { ownerId: meOwner.id ?? null } : {}),
      ...(on('dept') ? { groupId: meDept.id ?? null } : {}),
      ...(on('shared') ? { shared: meShared === 'true' } : {}),
    });
  };
  const massEditEmpty = meEnabled.size === 0;
  // One opt-in field row, moysklad #bulkEdit layout: a leading checkbox + label
  // in the left column, the control always visible in the right column. Touching
  // the control auto-ticks the checkbox (meEnable) so the value is never dropped.
  // `required` renders moysklad's red asterisk before the label.
  const meRow = (key: string, label: string, control: ReactNode, required = false) => (
    <div className="grid grid-cols-[200px_minmax(0,300px)] items-start gap-3">
      <label className="flex items-start gap-2 pt-1.5 text-[13px]">
        <Checkbox
          className="mt-0.5"
          checked={meEnabled.has(key)}
          onCheckedChange={() => meToggle(key)}
          data-test-id={`bulk-massedit-toggle-${key}`}
        />
        <span>
          {required && <span className="text-[var(--ms-danger)]">* </span>}
          {label}
        </span>
      </label>
      <div onFocusCapture={() => meEnable(key)}>{control}</div>
    </div>
  );
  const yesNo = [
    { value: 'true', label: 'Да' },
    { value: 'false', label: 'Нет' },
  ];
  // moysklad's blue «+» next to the Страна/Единица combos opens a reference-create
  // form. We don't yet have inline reference creation here, so the affordance is
  // shown disabled («скоро») rather than as a dead button.
  const mePlusButton = (
    <button
      type="button"
      disabled
      title="Создание справочника — скоро"
      aria-label="Создать"
      className="shrink-0 cursor-not-allowed text-[var(--ms-text-disabled,#bbb)]"
    >
      <Icons.create className="h-4 w-4" />
    </button>
  );

  const handleDelete = async () => {
    const ok = await confirm({
      title: tBulk('delete_confirm', { count: ids.length }),
      confirmLabel: tBulk('delete'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'destructive',
    });
    if (ok) bulkDelete.mutate(ids);
  };

  const handleArchive = async () => {
    const ok = await confirm({
      title: tBulk('archive_confirm', { count: ids.length }),
      confirmLabel: tBulk('archive'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkArchive.mutate(ids);
  };

  const handleRestore = async () => {
    const ok = await confirm({
      title: tBulk('restore_confirm', { count: ids.length }),
      confirmLabel: tBulk('restore'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkRestore.mutate(ids);
  };

  const isPending =
    bulkDelete.isPending ||
    bulkArchive.isPending ||
    bulkRestore.isPending ||
    bulkMove.isPending ||
    bulkClone.isPending ||
    bulkSetPrices.isPending ||
    bulkUpdate.isPending;

  return (
    <>
      <DropdownMenu
        trigger={
          // moysklad parity: «Изменить» trigger is ENABLED even at 0 selection
          // (not greyed) — clicking opens the menu with every item disabled until
          // rows are picked. Only a pending mutation disables the trigger itself.
          <Button variant="secondary" disabled={isPending} className={triggerClassName}>
            {t('trigger')}
            <Icons.down className="h-4 w-4" />
          </Button>
        }
        testId="assortment-bulk-actions-dropdown"
      >
        <DropdownMenu.Item
          onSelect={handleDelete}
          destructive
          disabled={!hasSelection || isPending}
          testId="assortment-bulk-action-delete"
        >
          {t('delete')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => bulkClone.mutate(ids)}
          disabled={!hasSelection || isPending}
          testId="assortment-bulk-action-copy"
        >
          {t('copy')}
        </DropdownMenu.Item>
        {/* moysklad groups «Изменить» with separators: {Удалить · Копировать} |
            {Массовое · Переместить · Архив · Извлечь} | {Цены…} (grounded live). */}
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onSelect={onMassEdit ?? (() => setMassEditOpen(true))}
          disabled={!hasSelection || isPending}
          testId="assortment-bulk-action-mass-edit"
        >
          {t('mass_edit')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => setMoveOpen(true)}
          disabled={!hasSelection || isPending}
          testId="assortment-bulk-action-move"
        >
          {t('move')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={handleArchive}
          disabled={!hasSelection || isPending || archiveDisabled}
          testId="assortment-bulk-action-archive"
        >
          {tBulk('archive')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={handleRestore}
          disabled={!hasSelection || isPending || restoreDisabled}
          testId="assortment-bulk-action-restore"
        >
          {tBulk('restore')}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onSelect={() => setPricesOpen(true)}
          disabled={!hasSelection || isPending}
          testId="assortment-bulk-action-prices"
        >
          {t('prices')}
        </DropdownMenu.Item>
      </DropdownMenu>
      {/* «Переместить» folder picker — moves the selected assortment to the chosen
        group via POST /products/bulk-move. */}
      <CatalogPicker
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={t('move')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/product-folders?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => bulkMove.mutate({ ids, productFolderId: String(item.id) })}
      />
      {/* «Изменить цены» — moysklad's bulk price-change drawer: pick the target
          price type, optionally change currency, set the price by one of three
          modes (fixed / cost-based / other-price ± adjustment), and round. The
          money engine runs server-side (POST /products/bulk-set-prices). Labels
          mirror moysklad.uz exactly (Russian); this component isn't i18n-scanned. */}
      <Drawer
        open={pricesOpen}
        onOpenChange={setPricesOpen}
        title="Изменить цены"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPricesOpen(false)}>
              Не сейчас
            </Button>
            <Button
              onClick={applySetPrices}
              disabled={!pricesValid || bulkSetPrices.isPending}
              data-test-id="bulk-prices-apply"
            >
              Сохранить новые цены
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm" data-test-id="bulk-prices-drawer">
          <p className="text-[var(--ms-text-muted)]">
            <span className="text-[var(--ms-text-link,#186999)]">Обновленные цены</span> будут
            отображаться в карточках товаров.
          </p>
          <div className="inline-block rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] px-2 py-1 text-[var(--ms-text-primary)]">
            {selectedCountLabel(ids.length)}
          </div>

          {/* «Цена, которую будем менять *» — which price type gets the new value. */}
          <div>
            <span className="mb-1 block font-medium">Цена, которую будем менять *</span>
            <NativeSelect
              value={targetPt}
              onChange={(e) => setTargetPt(e.target.value)}
              data-test-id="bulk-prices-target"
            >
              <option value="">Выберите тип цены</option>
              {priceTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </NativeSelect>
            <span className="mt-1 block text-[11px] text-[var(--ms-text-muted)]">
              В карточках выбранных товаров цены этого типа поменяют значение
            </span>
          </div>

          {/* «Валюту не менять» / «Изменить валюту» — when «Изменить валюту» is
              chosen, a currency select appears inline to its right (grounded
              live 2026-06-17), with a «?» field-help marker. */}
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={changeCurrency ? 'change' : 'keep'}
              onChange={(v) => setChangeCurrency(v === 'change')}
              options={[
                { value: 'keep', label: 'Валюту не менять' },
                { value: 'change', label: 'Изменить валюту' },
              ]}
            />
            {changeCurrency && (
              <NativeSelect
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className="w-28"
                data-test-id="bulk-prices-currency"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            <HelpMark title="Цены будут пересчитаны в выбранную валюту" />
          </div>

          {/* Mode: задать конкретную / на основании себестоимости / другой цены */}
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="price-mode"
                checked={priceMode === 'fixed'}
                onChange={() => setPriceMode('fixed')}
                data-test-id="bulk-prices-mode-fixed"
              />
              Задать конкретную цену
            </label>
            {priceMode === 'fixed' && (
              <MoneyInput
                valueMinor={fixedValue}
                onChangeMinor={setFixedValue}
                placeholder="0,00"
                data-test-id="bulk-prices-fixed-value"
              />
            )}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="price-mode"
                checked={priceMode === 'cost'}
                onChange={() => setPriceMode('cost')}
                data-test-id="bulk-prices-mode-cost"
              />
              На основании себестоимости
              <HelpMark title="Цена рассчитывается от себестоимости товара" />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="price-mode"
                checked={priceMode === 'other'}
                onChange={() => setPriceMode('other')}
                data-test-id="bulk-prices-mode-other"
              />
              На основании другой цены
            </label>
            {priceMode === 'other' && (
              <NativeSelect
                value={basePt}
                onChange={(e) => setBasePt(e.target.value)}
                data-test-id="bulk-prices-base"
              >
                <option value="">Выберите тип цены</option>
                {priceTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            {priceMode !== 'fixed' && (
              <div className="flex items-center gap-2">
                <SegmentedControl
                  value={adjustSign}
                  onChange={(v) => setAdjustSign(v as '+' | '-')}
                  options={[
                    { value: '+', label: '+' },
                    { value: '-', label: '−' },
                  ]}
                />
                {adjustUnit === 'currency' ? (
                  <MoneyInput
                    valueMinor={adjustValue}
                    onChangeMinor={setAdjustValue}
                    placeholder="0,00"
                    data-test-id="bulk-prices-adjust"
                  />
                ) : (
                  <Input
                    value={adjustValue}
                    onChange={(e) => setAdjustValue(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    data-test-id="bulk-prices-adjust"
                  />
                )}
                <SegmentedControl
                  value={adjustUnit}
                  onChange={(v) => {
                    setAdjustUnit(v as 'currency' | 'percent');
                    setAdjustValue('');
                  }}
                  options={[
                    { value: 'currency', label: 'ед.' },
                    { value: 'percent', label: '%' },
                  ]}
                />
              </div>
            )}
          </div>

          {/* «Не округлять цены» / «Округлить» + «?» help marker */}
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={rounding}
              onChange={(v) => setRounding(v as 'none' | 'integer')}
              options={[
                { value: 'none', label: 'Не округлять цены' },
                { value: 'integer', label: 'Округлить' },
              ]}
            />
            <HelpMark title="Округление новых цен до целого значения" />
          </div>
        </div>
      </Drawer>
      {/* «Массовое редактирование» — moysklad's full-page bulk editor as a 2-step
          wizard (Настройка параметров → Подтверждение). Each field is opt-in via a
          leading checkbox; only ticked fields are written (empty text = clear).
          POST /products/bulk-update. Labels mirror moysklad.uz (Russian). */}
      {massEditOpen && (
        <div
          // Starts below the 42px sticky global header (z-200) so the nav stays
          // visible with «Закрыть» beneath it, and covers the module sub-nav —
          // exactly how moysklad's #bulkEdit full page sits.
          className="fixed top-[42px] right-0 bottom-0 left-0 z-[100] overflow-auto bg-[var(--ms-bg-base,#fff)] text-sm"
          data-test-id="bulk-massedit-page"
        >
          <div className="mx-auto max-w-4xl px-6 py-5" data-test-id="bulk-massedit-wizard">
            <Button
              variant="secondary"
              onClick={() => setMassEditOpen(false)}
              data-test-id="bulk-massedit-close"
            >
              Закрыть
            </Button>

            {/* Title with the leading help-circle (moysklad «ⓘ Массовое …»). */}
            <h1 className="mt-4 flex items-center gap-2 font-semibold text-[20px] text-[var(--ms-text-primary)]">
              <Icons.help className="h-5 w-5 text-[var(--ms-text-muted)]" />
              Массовое редактирование: Товары
            </h1>

            {/* Dismissable intro box + «Читать инструкцию» link. */}
            {meInfoOpen && (
              <div className="relative mt-3 max-w-xl rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-info,#eef6fb)] p-3 pr-9 text-[13px] text-[var(--ms-text-primary)]">
                Массовое редактирование позволяет заполнять, изменять и очищать поля сразу в
                нескольких записях справочников или документах.
                <div className="mt-1.5">
                  Читать инструкцию:{' '}
                  <a
                    className="text-[var(--ms-text-link)] hover:underline"
                    href="https://support.moysklad.ru/hc/ru/articles/360051291074"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Массовое редактирование
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => setMeInfoOpen(false)}
                  className="absolute top-2 right-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                  aria-label="Закрыть"
                >
                  <Icons.close className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Vertical wizard steps + «Выбран N товар» pill. */}
            <div className="mt-4 flex items-center gap-4">
              <div className="space-y-1 text-[13px]">
                <div
                  className={
                    meStep === 'config'
                      ? 'font-semibold text-[var(--ms-text-brand)]'
                      : 'text-[var(--ms-text-muted)]'
                  }
                >
                  ▸ Настройка параметров
                </div>
                <div
                  className={
                    meStep === 'confirm'
                      ? 'font-semibold text-[var(--ms-text-brand)]'
                      : 'text-[var(--ms-text-muted)]'
                  }
                >
                  Подтверждение
                </div>
              </div>
              <span
                className="inline-block rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] px-3 py-1.5 text-[13px]"
                data-test-id="bulk-massedit-count"
              >
                {selectedCountLabel(ids.length)}
              </span>
            </div>

            {/* Red section header above the field list. */}
            <div className="mt-4 mb-3 text-[var(--ms-text-brand)]">
              {meStep === 'config' ? 'Настройка параметров' : 'Подтверждение'}
            </div>

            {meStep === 'config' ? (
              <div className="space-y-2.5" data-test-id="bulk-massedit-config">
                {/* Each row: opt-in checkbox + label + (input when enabled). Sections
                  mirror moysklad's #bulkEdit «Настройка параметров». */}
                {meRow(
                  'archived',
                  'Архивный',
                  <RadioGroup
                    value={meArchived}
                    onChange={(v) => setMeArchived(v as 'true' | 'false')}
                    options={yesNo}
                    name="me-archived"
                    ariaLabel="Архивный"
                  />,
                )}
                {meRow(
                  'folder',
                  'Группа',
                  <CatalogPickerField
                    value={
                      meFolder.id ? { id: meFolder.id, label: meFolder.label ?? meFolder.id } : null
                    }
                    placeholder=""
                    onPick={() => setMePicker('folder')}
                    onClear={() => setMeFolder({})}
                    testId="bulk-massedit-folder"
                  />,
                )}
                {meRow(
                  'country',
                  'Страна',
                  <div className="flex items-center gap-1.5">
                    <NativeSelect
                      value={meCountry}
                      onChange={(e) => setMeCountry(e.target.value)}
                      className="flex-1"
                      data-test-id="bulk-massedit-country"
                    >
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                    {mePlusButton}
                  </div>,
                )}
                {meRow(
                  'uom',
                  'Единица измерения',
                  <div className="flex items-center gap-1.5">
                    <NativeSelect
                      value={meUom}
                      onChange={(e) => setMeUom(e.target.value)}
                      className="flex-1"
                      data-test-id="bulk-massedit-uom"
                    >
                      <option value="" />
                      {uomOptions.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                    </NativeSelect>
                    {mePlusButton}
                  </div>,
                )}
                {meRow(
                  'weightG',
                  'Вес',
                  <Input
                    value={meWeight}
                    onChange={(e) => setMeWeight(e.target.value)}
                    inputMode="numeric"
                    data-test-id="bulk-massedit-weight"
                  />,
                )}
                {meRow(
                  'volumeML',
                  'Объем',
                  <Input
                    value={meVolume}
                    onChange={(e) => setMeVolume(e.target.value)}
                    inputMode="numeric"
                    data-test-id="bulk-massedit-volume"
                  />,
                )}
                {meRow(
                  'vat',
                  'НДС',
                  <Input
                    value={meVat}
                    onChange={(e) => setMeVat(e.target.value)}
                    inputMode="numeric"
                    data-test-id="bulk-massedit-vat"
                  />,
                )}
                {meRow(
                  'minBalance',
                  'Неснижаемый остаток',
                  <div className="space-y-1.5 text-[13px]">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="me-minmode"
                        checked={meMinMode === 'sum'}
                        onChange={() => setMeMinMode('sum')}
                      />
                      В сумме на всех складах
                    </label>
                    {meMinMode === 'sum' && (
                      <Input
                        value={meMinBalance}
                        onChange={(e) => setMeMinBalance(e.target.value)}
                        inputMode="numeric"
                        placeholder="Не указан"
                        data-test-id="bulk-massedit-minbalance"
                      />
                    )}
                    {/* Per-warehouse modes need a stock-level model we don't have
                      yet — shown disabled so the structure matches moysklad without
                      pretending to support them. */}
                    <label
                      className="flex cursor-not-allowed items-center gap-2 text-[var(--ms-text-muted)]"
                      title="Доступно в ближайшее время"
                    >
                      <input type="radio" name="me-minmode" disabled />
                      Одинаковый на всех складах
                    </label>
                    <label
                      className="flex cursor-not-allowed items-center gap-2 text-[var(--ms-text-muted)]"
                      title="Доступно в ближайшее время"
                    >
                      <input type="radio" name="me-minmode" disabled />
                      Задать для каждого склада
                    </label>
                  </div>,
                )}
                {meRow(
                  'supplier',
                  'Поставщик',
                  <CatalogPickerField
                    value={
                      meSupplier.id
                        ? { id: meSupplier.id, label: meSupplier.label ?? meSupplier.id }
                        : null
                    }
                    placeholder=""
                    onPick={() => setMePicker('supplier')}
                    onClear={() => setMeSupplier({})}
                    testId="bulk-massedit-supplier"
                  />,
                )}

                <div className="pt-1.5 font-semibold text-[var(--ms-text-primary)]">
                  Особенности учета
                </div>
                {meRow(
                  'mxik',
                  'ИКПУ (MXIK)',
                  <Input
                    value={meMxik}
                    onChange={(e) => setMeMxik(e.target.value)}
                    inputMode="numeric"
                    data-test-id="bulk-massedit-mxik"
                  />,
                )}
                {meRow(
                  'tasnifCode',
                  'Код упаковки ТАСНИФ',
                  <Input
                    value={meTasnifCode}
                    onChange={(e) => setMeTasnifCode(e.target.value)}
                    data-test-id="bulk-massedit-tasnif-code"
                  />,
                )}
                {meRow(
                  'tasnifBarcode',
                  'Штрихкод ТАСНИФ',
                  <Input
                    value={meTasnifBarcode}
                    onChange={(e) => setMeTasnifBarcode(e.target.value)}
                    data-test-id="bulk-massedit-tasnif-barcode"
                  />,
                )}
                {meRow(
                  'weighed',
                  'Фасовка',
                  <NativeSelect
                    value={meWeighed}
                    onChange={(e) => setMeWeighed(e.target.value as 'true' | 'false')}
                    data-test-id="bulk-massedit-weighed"
                  >
                    <option value="false">Штучная</option>
                    <option value="true">Весовая</option>
                  </NativeSelect>,
                  true,
                )}
                {/* Маркированная продукция → Product.trackingType. moysklad's combo
                  options are GWT-automation-blocked (could not be extracted live),
                  so we use our own established marking vocabulary — the same
                  categories the «Маркировка (ASL)» list uses — as the parity
                  baseline rather than guessing moysklad's exact labels. */}
                {meRow(
                  'tracking',
                  'Маркированная продукция',
                  <NativeSelect
                    value={meTracking}
                    onChange={(e) => setMeTracking(e.target.value)}
                    data-test-id="bulk-massedit-tracking"
                  >
                    <option value="">Не отслеживается</option>
                    <option value="SHOES">Обувь</option>
                    <option value="TOBACCO">Табак</option>
                    <option value="MEDICINES">Лекарства</option>
                    <option value="PERFUME">Парфюмерия</option>
                    <option value="TIRES">Шины</option>
                    <option value="DAIRY">Молочная продукция</option>
                    <option value="WATER">Вода</option>
                    <option value="BEER">Пиво</option>
                  </NativeSelect>,
                  true,
                )}

                <div className="pt-1.5 font-semibold text-[var(--ms-text-primary)]">Цены</div>
                {meRow(
                  'discount',
                  'Запретить скидки при продаже в розницу',
                  <RadioGroup
                    value={meDiscount}
                    onChange={(v) => setMeDiscount(v as 'true' | 'false')}
                    options={yesNo}
                    name="me-discount"
                    ariaLabel="Запретить скидки при продаже в розницу"
                  />,
                )}
                <a
                  className="ml-7 block text-[13px] text-[var(--ms-text-link)] hover:underline"
                  href="https://support.moysklad.ru/hc/ru/articles/360051291074"
                  target="_blank"
                  rel="noreferrer"
                >
                  Как изменить цены?
                </a>

                <div className="pt-1.5 font-semibold text-[var(--ms-text-primary)]">Доступ</div>
                {meRow(
                  'owner',
                  'Владелец-сотрудник',
                  <CatalogPickerField
                    value={
                      meOwner.id ? { id: meOwner.id, label: meOwner.label ?? meOwner.id } : null
                    }
                    placeholder=""
                    onPick={() => setMePicker('owner')}
                    onClear={() => setMeOwner({})}
                    testId="bulk-massedit-owner"
                  />,
                )}
                {meRow(
                  'dept',
                  'Владелец-отдел',
                  <CatalogPickerField
                    value={meDept.id ? { id: meDept.id, label: meDept.label ?? meDept.id } : null}
                    placeholder=""
                    onPick={() => setMePicker('dept')}
                    onClear={() => setMeDept({})}
                    testId="bulk-massedit-dept"
                  />,
                  true,
                )}
                {meRow(
                  'shared',
                  'Общий доступ',
                  <RadioGroup
                    value={meShared}
                    onChange={(v) => setMeShared(v as 'true' | 'false')}
                    options={yesNo}
                    name="me-shared"
                    ariaLabel="Общий доступ"
                  />,
                )}
              </div>
            ) : (
              <div className="space-y-1" data-test-id="bulk-massedit-confirm">
                <p className="text-[var(--ms-text-muted)]">
                  Будут изменены поля ({meEnabled.size}) у {ids.length} товаров:
                </p>
                <ul className="list-inside list-disc">
                  {[...meEnabled].map((k) => (
                    <li key={k}>{ME_FIELD_LABELS[k] ?? k}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Footer: divider + «Далее» (step 1) / «Назад»+«Применить» (step 2). */}
            <div className="mt-6 max-w-2xl border-[var(--ms-border-default)] border-t pt-4">
              {meStep === 'config' ? (
                <Button
                  onClick={() => setMeStep('confirm')}
                  disabled={massEditEmpty}
                  data-test-id="bulk-massedit-next"
                >
                  Далее
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setMeStep('config')}>
                    Назад
                  </Button>
                  <Button
                    onClick={applyMassEdit}
                    disabled={massEditEmpty || bulkUpdate.isPending}
                    data-test-id="bulk-massedit-apply"
                  >
                    Применить
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Mass-edit reference pickers (one open at a time via mePicker). */}
      <CatalogPicker
        open={mePicker === 'supplier'}
        onClose={() => setMePicker(null)}
        title="Поставщик"
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMeSupplier({ id: String(item.id), label: String(item.primary) });
          setMePicker(null);
        }}
      />
      <CatalogPicker
        open={mePicker === 'folder'}
        onClose={() => setMePicker(null)}
        title="Группа"
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{
            items: { id: string; name: string; pathName?: string | null }[];
          }>(`/product-folders?search=${encodeURIComponent(q)}&limit=50`);
          return r.items.map((x) => ({
            id: x.id,
            primary: x.name,
            secondary: x.pathName && x.pathName !== x.name ? x.pathName : undefined,
          }));
        }}
        onSelect={(item) => {
          setMeFolder({ id: String(item.id), label: String(item.primary) });
          setMePicker(null);
        }}
      />
      <CatalogPicker
        open={mePicker === 'owner'}
        onClose={() => setMePicker(null)}
        title="Владелец-сотрудник"
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMeOwner({ id: String(item.id), label: String(item.primary) });
          setMePicker(null);
        }}
      />
      <CatalogPicker
        open={mePicker === 'dept'}
        onClose={() => setMePicker(null)}
        title="Владелец-отдел"
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMeDept({ id: String(item.id), label: String(item.primary) });
          setMePicker(null);
        }}
      />
    </>
  );
}
