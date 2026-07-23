import { z } from 'zod';

/**
 * Zod schema for Product entity.
 * Derived from docs/moysklad-reference/data-model/entity-schemas/product.json
 * (live API verified 2026-04-19).
 */

const bigIntString = z
  .union([z.string(), z.number()])
  .transform((v) => BigInt(String(v)))
  .or(z.bigint());

const uuid = z.string().uuid();
// Comma-separated list of uuids → string[] (moysklad multi-select filter fields,
// e.g. «Владелец-сотрудник» / «Владелец-отдел»). Empty → undefined so the repo
// omits the predicate; each id is still uuid-validated. A single id parses too.
const uuidCsv = z
  .string()
  .optional()
  .transform((s) => {
    const arr = s
      ? s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
    return arr.length ? arr : undefined;
  })
  .pipe(z.array(z.string().uuid()).optional());

export const ProductKindSchema = z.enum(['product', 'service', 'bundle', 'consignment']);

export const TrackingTypeSchema = z.enum([
  'NOT_TRACKED',
  'SHOES',
  'TOBACCO',
  'MEDICINES',
  'PERFUME',
  'TIRES',
  'DAIRY',
  'BEVERAGES',
  'LP_CLOTHES',
  // moysklad.uz «Тип продукции» (Маркировка) regime — live-grounded 2026-06-20:
  // Вода и прохладительные напитки / Бытовая техника / Алкогольная / Пивная.
  // ADDITIVE (existing values kept → no backfill, the ASL/tracking-code module's
  // type list stays valid). The /products/new Маркировка combo maps its .uz labels
  // to these codes; «Не маркируется» → NOT_TRACKED, «Табачная» → TOBACCO.
  'WATER',
  'APPLIANCES',
  'ALCOHOL',
  'BEER',
]);

export const SalePriceSchema = z.object({
  priceTypeId: z.string().min(1),
  value: bigIntString,
  currencyCode: z.string().length(3).default('UZS'),
});

// «Признак предмета расчёта» — moysklad's exact enum codes (official reference:
// docs/moysklad-reference/.../dictionaries/_product.md). Was COMMODITY/EXCISABLE_GOODS
// (invented) → aligned to GOOD/EXCISABLE_GOOD; the other two already matched. Existing
// rows are renamed by migration 20260620110000_align_payment_item_type.
export const PaymentItemTypeSchema = z.enum([
  'GOOD',
  'EXCISABLE_GOOD',
  'COMPOUND_PAYMENT_ITEM',
  'ANOTHER_PAYMENT_ITEM',
]);

export const ProductPackSchema = z.object({
  name: z.string().min(1).max(255),
  uomCode: z.string().max(20),
  // Multiplier in fractional units (×1000 — matches Position.quantity convention).
  multiplier: bigIntString,
  barcode: z.string().max(50).optional(),
  // «Тип кода» — barcode symbology of this pack's `barcode` (ean13/ean8/code128/
  // gtin), moysklad's pack-row column. Null/absent → treated as ean13 in the UI.
  codeType: z.string().max(20).nullish(),
  // «Код упаковки ТАСНИФ» — UZ TASNIF package classification code (optional).
  tasnifCode: z.string().max(50).nullish(),
  position: z.number().int().nonnegative().default(0),
});

export const CreateProductSchema = z.object({
  // Optional scalar/relation/enum fields use `.nullish()` (accept null AND
  // undefined): edit forms PATCH the full object and send `null` to CLEAR a
  // value, while create forms omit empties (undefined). All these map to
  // nullable Prisma columns and the repository writes null → clears the field
  // (scalars) / disconnects (relations). `.optional()` alone rejects null
  // ("Expected string, received null") and 400s every product edit that has an
  // empty optional field — a runtime-only bug invisible to typecheck/lint.
  name: z.string().min(1).max(255),
  code: z.string().max(50).nullish(),
  externalCode: z.string().max(50).nullish(),
  article: z.string().max(50).nullish(),
  description: z.string().nullish(),
  // ISO 3166-1 alpha-2 country of origin.
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Mamlakat kodi 2 harf (ISO 3166-1 alpha-2)')
    .nullish(),

  kind: ProductKindSchema.default('product'),

  productFolderId: uuid.nullish(),
  groupId: uuid.nullish(),
  supplierId: uuid.nullish(),
  // «Владелец-сотрудник» (Доступ card) — the owning Employee. moysklad defaults
  // this to the creating user but the create/edit form lets you pick another;
  // omit on create ⇒ the repository stamps the request actor (back-compat: the
  // pre-existing forms never sent it, so they keep getting the actor as owner).
  // null on edit clears it. A cross-tenant id is rejected by the service guard
  // (the FK references only [id], so Prisma alone would silently accept it).
  ownerId: uuid.nullish(),

  minPrice: bigIntString.nullish(),
  buyPrice: bigIntString.nullish(),
  // Per-price currency (ISO code) — moysklad parity (NULL = account base).
  // The stored amount is as-entered in this currency; downstream cost math
  // assumes base (account is UZS-only) — see schema.prisma note.
  buyPriceCurrency: z.string().length(3).nullish(),
  minPriceCurrency: z.string().length(3).nullish(),
  salePrices: z.array(SalePriceSchema).optional(),

  weightG: z.number().int().nonnegative().nullish(),
  volumeML: z.number().int().nonnegative().nullish(),
  weighed: z.boolean().default(false),
  uom: z.string().max(20).nullish(),

  vat: z.number().int().min(0).max(100).nullable().optional(),
  vatEnabled: z.boolean().default(true),
  useParentVat: z.boolean().default(true),
  taxSystem: z.string().max(30).nullish(),
  // Fiscal receipt classification.
  paymentItemType: PaymentItemTypeSchema.nullish(),

  mxikCode: z
    .string()
    .regex(/^\d{17}$/, 'MXIK must be 17 digits')
    .nullish(),

  trackingType: TrackingTypeSchema.nullish(),
  gtin: z
    .string()
    .regex(/^\d{13,14}$/, 'GTIN must be 13 or 14 digits')
    .nullish(),
  partialDisposal: z.boolean().default(false),

  isSerialTrackable: z.boolean().default(false),
  discountProhibited: z.boolean().default(false),

  // Lower stock threshold — when live on-hand stock < minimumBalanceMinor the
  // product surfaces in the «Ниже минимума» re-order view (see
  // product.repository.list, which aggregates Stock live). 0 disables. Stored
  // in the ×1000 milliunit scale (user units × 1000). NON-nullable column
  // (defaults to 0) → `.optional()` only (the FE form sends a number or omits,
  // never null).
  minimumBalanceMinor: bigIntString.optional(),

  shared: z.boolean().default(false),
  barcodes: z.array(z.string()).default([]),
  // Per-barcode GTIN type, index-aligned with `barcodes` (barcodeTypes[i] is the type
  // of barcodes[i]). moysklad stores barcodes typed; kept as a parallel array so the
  // list/search `has` filters over raw barcode values are untouched. Defaults [].
  barcodeTypes: z.array(z.string()).default([]),
  attributes: z.record(z.unknown()).optional(),
  // Alternative pack / unit definitions. Up to 20 packs per product.
  packs: z.array(ProductPackSchema).max(20).optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial().extend({
  // Optimistic-lock token: the `version` the edit form loaded. Required on
  // every field-edit save so a stale copy can't silently overwrite a newer
  // one — the repository checks it and the write 409s on mismatch. (Single-
  // purpose actions — archive/restore/delete — don't carry it.)
  version: z.number().int().nonnegative(),
});

/** Coerces query-string "true"/"false" into proper boolean. */
const boolFromString = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const ProductFilterSchema = z.object({
  search: z.string().optional(),
  kind: ProductKindSchema.optional(),
  // «Группа товаров (без подгрупп)» — exact folder (products directly in it).
  productFolderId: uuid.nullable().optional(),
  // «Группа товаров» (с подгруппами) — the folder AND every descendant. The repo
  // resolves the folder's hierarchical pathName and matches self + the subtree.
  productFolderIdDeep: uuid.nullable().optional(),
  trackingType: TrackingTypeSchema.optional(),
  // «Показывать» — moysklad's tri-state visibility filter. Param absent → false
  // (only non-archived, the default list view); 'false' → only non-archived;
  // 'true' → only archived; 'all' → undefined → NO archive predicate (show
  // both). Kept as its own schema (not the shared boolFromString the other
  // booleans use) so only this field accepts the 'all' sentinel. The repo
  // applies `archived: filter.archived` — undefined means Prisma omits it.
  archived: z
    .union([z.boolean(), z.enum(['true', 'false', 'all'])])
    .transform((v) => (v === 'all' ? undefined : typeof v === 'boolean' ? v : v === 'true'))
    .optional()
    .default(false),
  // «Владелец-сотрудник» — multi-select (moysklad renders a checkbox dropdown,
  // grounded live 2026-06-18). Comma-separated employee ids → repo `in`.
  ownerId: uuidCsv,
  // «Кто изменил» — last-modifier equality (Employee picker). Mirrors the
  // PurchaseOrder.modifiedById filter; single-pick parity with the moysklad
  // products Фильтр panel (no multi-select variant there).
  modifiedById: uuid.optional(),
  // «Владелец-отдел» — the owning Group (отдел), multi-select (checkbox dropdown,
  // grounded live 2026-06-18). Comma-separated group ids → repo `in`.
  groupId: uuidCsv,
  supplierId: uuidCsv,
  // moysklad-parity discrete filter fields (Фильтр panel — captured from
  // products/states/02-filter-applied.png, §4 DOM-rendered grounding). The
  // combined top search box still ORs name/code/article/externalCode/barcode;
  // these add the panel's discrete single-column filters.
  //   Наименование→ name        (contains, insensitive)
  //   Артикул    → article      (contains, insensitive)
  //   Код        → code         (contains, insensitive)
  //   Внешний код→ externalCode (contains, insensitive)
  //   Описание   → description  (contains, insensitive)
  //   ИКПУ (MXIK)→ mxikCode     (contains — partial code lookup)
  //   Штрихкод   → barcode      (exact token in the barcodes[] array)
  //   Весовой товар→ weighed    (boolean)
  //   Общий доступ→ shared      (boolean)
  // NB the top search box still ORs name/code/article/externalCode/barcode; these
  // discrete single-column fields mirror moysklad's panel (where Наименование,
  // Артикул, Код, Внешний код each have their own input above the list).
  name: z.string().optional(),
  article: z.string().optional(),
  code: z.string().optional(),
  externalCode: z.string().optional(),
  description: z.string().optional(),
  mxikCode: z.string().optional(),
  // «Код упаковки ТАСНИФ» — matches products having a pack with this TASNIF code.
  packTasnifCode: z.string().optional(),
  barcode: z.string().optional(),
  weighed: boolFromString.optional(),
  shared: boolFromString.optional(),
  // «Когда изменен» period — half-open day range over updatedAt (ISO date
  // strings, mirrors the cash-in/payment-in gold-standard updatedFrom/To).
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  // Country of origin filter — ISO 3166-1 alpha-2. Normalised to upper
  // case by the schema so query-string "uz" matches stored "UZ".
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'Mamlakat kodi 2 harf (ISO 3166-1 alpha-2)')
    .transform((v) => v.toUpperCase())
    .optional(),
  belowMinimum: boolFromString.optional(),
  // moysklad «Выбор товара» Фильтр — stock-based filters (live-grounded 2026-06-20,
  // the CO edit product picker). «Остаток» (on-hand sign: any/positive/non-zero/
  // zero/negative); «Доступно» (display available = Σqty−Σreserved+in-transit;
  // no zero option in moysklad); «Только с резервом» / «Только с ожиданием» (only
  // products that have a reservation / expected-incoming).
  stockFilter: z.enum(['any', 'positive', 'nonzero', 'zero', 'negative']).optional(),
  availableFilter: z.enum(['any', 'positive', 'nonzero', 'negative']).optional(),
  hasReserve: boolFromString.optional(),
  hasIncoming: boolFromString.optional(),
  // «Характеристики» — moysklad shows one filter field per characteristic at the
  // bottom of the products Фильтр panel. Sent as a JSON map {charName: [values]};
  // a product matches when it has a VARIANT whose `characteristics` contain
  // {name, value} for EVERY selected characteristic (OR within each name's values).
  charFilter: z
    .string()
    .optional()
    .transform((s): Record<string, string[]> | undefined => {
      if (!s) return undefined;
      try {
        const obj = JSON.parse(s) as Record<string, unknown>;
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (Array.isArray(v)) {
            const vals = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
            if (vals.length) out[k] = vals;
          }
        }
        return Object.keys(out).length ? out : undefined;
      } catch {
        return undefined;
      }
    }),
  // Pagination — the /products list sends `page` (1-based) for moysklad-style
  // offset paging (jump to any page, «101-200 из N», real first/last). The
  // «Выбор товара» modal + other callers omit it and keep the legacy `cursor`.
  cursor: uuid.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(25),
  // moysklad sorts on every column header. These are the scalar Product fields
  // Prisma can orderBy directly (the dynamic price columns aren't sortable — they
  // come from the salePrices relation). Each maps 1:1 to a grid column.
  sortBy: z
    .enum([
      'name',
      'code',
      'article',
      'uom',
      'country',
      'weightG',
      'volumeML',
      'vat',
      'kind',
      'mxikCode',
      'minimumBalanceMinor',
      'shared',
      'createdAt',
      'updatedAt',
    ])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

// «Переместить» — bulk move selected products to a folder (null = root «Товары
// и услуги»). The folder is shared across products/services/bundles (all kind=*
// products), so one endpoint covers the whole assortment.
export const BulkMoveSchema = z.object({
  ids: z.array(uuid).min(1).max(1000),
  productFolderId: uuid.nullable(),
});
export type BulkMoveInput = z.infer<typeof BulkMoveSchema>;

// «Изменить цены» — moysklad's bulk price-change drawer. Sets ONE target price
// type on the selected products by one of three modes, with an optional ±
// adjustment (currency units or %) and optional rounding to whole units. Other
// price types on each product are preserved. Money is minor (tiyin) strings.
//   mode='fixed' → valueMinor (explicit new price)
//   mode='cost'  → base = product buyPrice, then ± adjustment
//   mode='other' → base = product's basePriceTypeId price, then ± adjustment
export const BulkSetPricesSchema = z
  .object({
    ids: z.array(uuid).min(1).max(1000),
    targetPriceTypeId: z.string().min(1),
    mode: z.enum(['fixed', 'cost', 'other']),
    valueMinor: bigIntString.nullish(),
    basePriceTypeId: z.string().min(1).nullish(),
    adjustSign: z.enum(['+', '-']).default('+'),
    adjustValue: z
      .string()
      .regex(/^\d*\.?\d*$/)
      .nullish(),
    adjustUnit: z.enum(['currency', 'percent']).default('currency'),
    rounding: z.enum(['none', 'integer']).default('none'),
    // «Изменить валюту» — store the new price under this currency (the entered
    // value is already in it; no rate conversion, matching moysklad). Omit =
    // «Валюту не менять» (keep the price type's existing/UZS currency).
    currencyCode: z.string().length(3).nullish(),
  })
  .refine((v) => v.mode !== 'fixed' || v.valueMinor != null, {
    message: 'valueMinor is required for the fixed mode',
  })
  .refine((v) => v.mode !== 'other' || v.basePriceTypeId != null, {
    message: 'basePriceTypeId is required for the other-price mode',
  });
export type BulkSetPricesInput = z.infer<typeof BulkSetPricesSchema>;

// «Сохранить цены» — write a document grid's per-line prices to the products' DEFAULT
// sale price type (moysklad position-grid «Цена ▾ → Сохранить цены»). Each item is a
// {productId, priceMinor}; the server resolves the default PriceType and merges.
export const SaveLinePricesSchema = z.object({
  items: z
    .array(z.object({ productId: uuid, priceMinor: z.string().regex(/^\d+$/) }))
    .min(1)
    .max(1000),
});
export type SaveLinePricesInput = z.infer<typeof SaveLinePricesSchema>;

// Pick-modal «Doimiy narx» — set ONE product's default sale price (the negotiated
// price becomes permanent). Body of POST /products/:id/sale-price. Capped at 15
// digits (≈ 10 trillion som in tiyin) so a runaway value can never overflow the
// int8 math of later document saves that read this price.
export const SetSalePriceSchema = z.object({
  priceMinor: z.string().regex(/^\d{1,15}$/),
});
export type SetSalePriceInput = z.infer<typeof SetSalePriceSchema>;
/** Route-param guard for /products/:id/sale-price (400 on non-uuid, not P2023 500). */
export const ProductIdSchema = z.string().uuid();

// «Массовое редактирование» — bulk-edit common assortment fields on the selection.
// Mirrors moysklad's «Настройка параметров» field set (grounded live 2026-06-17):
// each field is OPTIONAL — only provided keys are written; a null value CLEARS the
// field (set-vs-clear semantics). ≥1 field required. (Группа/Цены have their own
// dedicated actions «Переместить»/«Цены…».)
export const BulkUpdateSchema = z
  .object({
    ids: z.array(uuid).min(1).max(1000),
    // main section
    archived: z.boolean().optional(), // Архивный
    productFolderId: uuid.nullable().optional(), // Группа (catalog folder)
    country: z
      .string()
      .regex(/^$|^[A-Za-z]{2}$/)
      .nullable()
      .optional(), // Страна (ISO2)
    uom: z.string().max(20).nullable().optional(), // Единица измерения
    weightG: z.number().int().nonnegative().nullable().optional(), // Вес
    volumeML: z.number().int().nonnegative().nullable().optional(), // Объем
    vat: z.number().int().min(0).max(100).nullable().optional(), // НДС
    minimumBalanceMinor: bigIntString.nullable().optional(), // Неснижаемый остаток
    supplierId: uuid.nullable().optional(), // Поставщик
    // Особенности учета
    mxikCode: z.string().max(20).nullable().optional(), // ИКПУ (MXIK)
    tasnifCode: z.string().max(50).nullable().optional(), // Код упаковки ТАСНИФ (base pack)
    tasnifBarcode: z.string().max(50).nullable().optional(), // Штрихкод ТАСНИФ (base pack)
    weighed: z.boolean().optional(), // Фасовка (штучный/весовой)
    trackingType: z.string().max(30).nullable().optional(), // Маркированная продукция
    // Цены
    discountProhibited: z.boolean().optional(), // Запретить скидки при продаже в розницу
    // Доступ
    ownerId: uuid.nullable().optional(), // Владелец-сотрудник
    groupId: uuid.nullable().optional(), // Владелец-отдел (owning department)
    shared: z.boolean().optional(), // Общий доступ
  })
  .refine(
    (v) =>
      [
        v.archived,
        v.productFolderId,
        v.country,
        v.uom,
        v.weightG,
        v.volumeML,
        v.vat,
        v.minimumBalanceMinor,
        v.supplierId,
        v.mxikCode,
        v.tasnifCode,
        v.tasnifBarcode,
        v.weighed,
        v.trackingType,
        v.discountProhibited,
        v.ownerId,
        v.groupId,
        v.shared,
      ].some((x) => x !== undefined),
    { message: 'At least one field to edit is required' },
  );
export type BulkUpdateInput = z.infer<typeof BulkUpdateSchema>;

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type ProductFilter = z.infer<typeof ProductFilterSchema>;
export type ProductPackInput = z.infer<typeof ProductPackSchema>;
