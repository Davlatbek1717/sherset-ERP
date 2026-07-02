import { z } from 'zod';

/**
 * Variant (Модификация) — SKU-level subdivision of a Product. Inherits
 * parent fields (UoM, VAT) and overrides sale/buy prices. Characteristics
 * define what distinguishes this variant from siblings — typically
 * { Color, Size, ... } name/value pairs.
 */

const uuid = z.string().uuid();

const bigIntString = z
  .union([z.string(), z.number()])
  .transform((v) => BigInt(String(v)))
  .or(z.bigint());

export const SalePriceSchema = z.object({
  priceTypeId: z.string().min(1),
  value: bigIntString,
  currencyCode: z.string().length(3).default('UZS'),
});

export const CharacteristicSchema = z.object({
  name: z.string().min(1).max(50),
  value: z.string().min(1).max(100),
});
export type Characteristic = z.infer<typeof CharacteristicSchema>;

export const CreateVariantSchema = z.object({
  productId: uuid,
  // `.nullish()` (null OR undefined): the edit form PATCHes the full object and
  // sends `null` to clear an optional field; columns are nullable and the
  // service writes null → clears. `.optional()` alone 400s on cleared fields.
  // NON-nullable column (auto-generated from characteristics when absent) →
  // `.optional()` only; the edit form never sends name: null.
  name: z.string().min(1).max(255).optional(),
  code: z.string().max(50).nullish(),
  externalCode: z.string().max(50).nullish(),
  barcode: z.string().max(50).nullish(),
  characteristics: z.array(CharacteristicSchema).min(1, 'Kamida bitta xarakteristika kerak'),
  salePrices: z.array(SalePriceSchema).optional(),
  buyPrice: bigIntString.nullish(),
  minPrice: bigIntString.nullish(),
  weightG: z.coerce.number().int().min(0).nullish(),
  volumeML: z.coerce.number().int().min(0).nullish(),
});
export type CreateVariantInput = z.infer<typeof CreateVariantSchema>;

/**
 * «Создание модификаций» — generate the Cartesian product of variants from a
 * set of characteristics, each with one or more values (moysklad: pick a
 * characteristic «Цвет» with values красный, синий → 2 variants; add «Размер» S,
 * M → 2×2 = 4). Each generated variant stores its own [{ name, value }] combo.
 */
export const GenerateVariantsSchema = z.object({
  productId: uuid,
  characteristics: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Xarakteristika nomi majburiy').max(255),
        values: z
          .array(z.string().trim().min(1).max(255))
          .min(1, 'Har bir xarakteristika uchun kamida bitta qiymat kerak'),
      }),
    )
    .min(1, 'Kamida bitta xarakteristika kerak'),
});
export type GenerateVariantsInput = z.infer<typeof GenerateVariantsSchema>;

export const UpdateVariantSchema = CreateVariantSchema.partial().extend({
  productId: uuid.optional(),
  // Optimistic-lock token: the `version` the edit form loaded. Required on
  // every field-edit save so a stale copy can't silently overwrite a newer one.
  version: z.number().int().nonnegative(),
});
export type UpdateVariantInput = z.infer<typeof UpdateVariantSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const VariantFilterSchema = z.object({
  productId: uuid.optional(),
  archived: boolFromString.optional(),
  // No `belowMinimum` filter: Variant has no denormalized stock column, so the
  // comparison cannot be expressed here (see VariantService.list). A re-order
  // view would require a Stock-ledger aggregation (future feature).
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'code', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type VariantFilterInput = z.infer<typeof VariantFilterSchema>;
