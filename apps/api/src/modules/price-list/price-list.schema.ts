import { z } from 'zod';

/**
 * PriceList — dated snapshot of prices per product / variant / bundle.
 *
 * Distinct from PriceType. PriceType is the catalogue ("Wholesale", "VIP",
 * "Retail") — it gets updated continuously as prices change. PriceList is
 * a point-in-time artefact: "the wholesale catalogue as of 2026-04-01"
 * frozen for export / publication / customer reference.
 *
 * Snapshot shape (pricesJson):
 *   {
 *     "<productId>": { "<priceTypeId>": <minorAmount>, ... },
 *     ...
 *   }
 *
 * Once a price list is `posted`, the snapshot is locked. Editing requires
 * unposting (which is allowed — you might tweak before publishing).
 *
 * Cancelled price lists stay in the journal but no longer act as the
 * "current" published list.
 */

export const PriceListStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PriceListState = z.infer<typeof PriceListStateSchema>;

export const PriceListTransitionSchema = z.enum(['post', 'unpost', 'cancel']);

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const bigintMinor = z.string().regex(/^\d+$/, 'BigInt minor (faqat raqam)');

/**
 * Prices snapshot map. Outer key = productId (UUID), inner key =
 * priceTypeId (UUID), value = minor amount as a string-of-digits.
 *
 * Stored as JSON so we don't have to scale the position table with
 * (catalog × price-type) cardinality — a 5000-SKU catalog with 5 price
 * types is 25k rows otherwise. JSON is fine since we only read/write the
 * whole snapshot at a time.
 */
export const PricesSnapshotSchema = z.record(
  z.string().uuid(),
  z.record(z.string().uuid(), bigintMinor),
);
export type PricesSnapshot = z.infer<typeof PricesSnapshotSchema>;

export const CreatePriceListSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(50).optional(),
  externalCode: z.string().max(50).optional(),
  organizationId: z.string().uuid(),
  /** Default price type whose column is highlighted on detail. */
  priceTypeId: z.string().uuid().nullish(),
  moment: z.string().optional(),
  pricesJson: PricesSnapshotSchema.default({}),
  currency: z.string().length(3).default('UZS'),
  rateValue: bigintMinor.default('100000000'),
  description: z.string().max(4096).optional(),
  applicable: z.boolean().optional(),
});
export type CreatePriceListInput = z.infer<typeof CreatePriceListSchema>;

export const UpdatePriceListSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    code: z.string().max(50).nullable().optional(),
    externalCode: z.string().max(50).nullable().optional(),
    organizationId: z.string().uuid().optional(),
    priceTypeId: z.string().uuid().nullish(),
    moment: z.string().optional(),
    pricesJson: PricesSnapshotSchema.optional(),
    currency: z.string().length(3).optional(),
    rateValue: bigintMinor.optional(),
    description: z.string().max(4096).nullable().optional(),
    // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
    // caller cannot silently bypass the lost-update guard. Absent on Create.
    version: z.number().int().nonnegative(),
  })
  .strict();

export const PriceListFilterSchema = z.object({
  state: PriceListStateSchema.optional(),
  organizationId: z.string().uuid().optional(),
  /** «Тип цены» — PriceList.priceTypeId (default price type column). */
  priceTypeId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — PriceList.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-отдел» — PriceList.groupId. */
  groupId: z.string().uuid().optional(),
  /** «Проведено» — PriceList.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — PriceList.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — PriceList.published flag. */
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To). Mirrors MoveFilterSchema.
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  /** «Валюта документа» — PriceList.currency (UZS / USD / RUB / ...). */
  currency: z.string().length(3).optional(),
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the PriceList model
  // has no `updatedById` column (only `ownerId` / `groupId`).
  // PriceList also has NO Контрагент / Договор / Канал продаж / Склад /
  // Проект / Сумма — it's a snapshot publication artifact (no
  // counterparty, no stock, no money-bearing total), so those filters
  // are intentionally absent. The «Сумма» column itself does not exist
  // on PriceList (`pricesJson` is a per-product/per-price-type map, not
  // an aggregate sum), so the sum-range filter is also absent.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad parity — relational sort for organization exposed by the
  // list-view column header (handled by
  // PriceListService.buildListWhere's orderBy special-case).
  sortBy: z.enum(['moment', 'name', 'createdAt', 'updatedAt', 'organization']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PriceListFilterInput = z.infer<typeof PriceListFilterSchema>;
