import { z } from 'zod';

const uuid = z.string().uuid();

const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

/**
 * Structured address — moysklad's "По компонентам" form lets the user
 * fill region/district/street/postal code separately on top of the free
 * `address` text. All fields optional; we just store the bag as JSON.
 */
export const StoreAddressFullSchema = z.object({
  postalCode: optionalEmpty(20),
  country: optionalEmpty(100),
  region: optionalEmpty(100),
  district: optionalEmpty(100),
  city: optionalEmpty(100),
  street: optionalEmpty(255),
  house: optionalEmpty(50),
  apartment: optionalEmpty(50),
  comment: optionalEmpty(500),
});
export type StoreAddressFull = z.infer<typeof StoreAddressFullSchema>;

/**
 * Store admin schema. Mirrors moysklad's "Склад" admin form.
 *
 * Hierarchy: parentId nullable self-FK. pathName is server-computed
 * ("Main warehouse / Section A / Shelf 1") — included in API responses
 * but not accepted on writes.
 *
 * Zones / slots: free-form string lists for warehouse organisation.
 * Allocation logic (which zone gets which incoming supply) is later;
 * for now they're metadata + dropdown choices in the picking UI.
 *
 * `attributes`: validated against AttributeMetadata at service layer.
 */
export const CreateStoreSchema = z.object({
  name: z.string().min(1).max(255),
  code: optionalEmpty(50),
  externalCode: optionalEmpty(50),
  description: optionalEmpty(5000),
  address: optionalEmpty(2000),
  addressFull: StoreAddressFullSchema.nullish(),
  allowNegativeStock: z.coerce.boolean().default(false),
  shared: z.coerce.boolean().default(false),
  parentId: uuid.nullish(),
  ownerId: uuid.nullish(),
  zones: z.array(z.string().min(1).max(100)).max(50).default([]),
  slots: z.array(z.string().min(1).max(100)).max(100).default([]),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateStoreInput = z.infer<typeof CreateStoreSchema>;

export const UpdateStoreSchema = CreateStoreSchema.partial().extend({
  // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
  // caller cannot silently bypass the lost-update guard. Absent on Create.
  version: z.number().int().nonnegative(),
});
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const StoreFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  parentId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'code', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type StoreFilterInput = z.infer<typeof StoreFilterSchema>;

// =========================================================================
// Adresli saqlash — yacheykalar registri (StoreCell)
// =========================================================================

// «NN-NN-NN» — generatsiya prefiksi (sklad-polka-qator), har segment 0–99
// (label CODE128C shtrix formati 2 xonali segment talab qiladi).
const CELL_PREFIX_RE = /^\d{1,2}-\d{1,2}-\d{1,2}$/;
// To'liq yacheyka kodi «NN-NN-NN-NN» (unpadded segmentlar ham qabul qilinadi,
// service kanonik padded ko'rinishga keltiradi).
const CELL_CODE_RE = /^\d{1,2}(-\d{1,2}){3}$/;

/**
 * «Polka qo'shish» — 3 input (2026-07-16 talab, barchasi MAJBURIY):
 *   1) shelf  — polka kodi (yacheyka qatorida «Polka» ustunida ko'rinadi)
 *   2) prefix — yacheyka kodining dastlabki 3 segmenti (masalan «04-03-01»)
 *   3) count  — shu qatordagi o'rinlar soni; Enter → prefix-01…prefix-NN
 *      ketma-ket yacheykalar avtomatik yaratiladi (oxirgi segment 2 xona,
 *      shuning uchun maksimum 99).
 */
export const GenerateCellsSchema = z.object({
  shelf: z.string().trim().min(1, 'Polka kodi majburiy').max(50),
  prefix: z
    .string()
    .trim()
    .regex(CELL_PREFIX_RE, "Yacheyka kodi «NN-NN-NN» ko'rinishida bo'lsin (masalan 04-03-01)"),
  count: z.coerce.number().int().min(1, 'Miqdor majburiy').max(99, 'Maksimum 99 ta o‘rin'),
});
export type GenerateCellsInput = z.infer<typeof GenerateCellsSchema>;

/** «+ Yacheyka» — bitta yacheykani to'liq kod bilan qo'lda qo'shish. */
export const CreateCellSchema = z.object({
  code: z.string().trim().regex(CELL_CODE_RE, "Yacheyka kodi «NN-NN-NN-NN» ko'rinishida bo'lsin"),
  shelf: optionalEmpty(50),
});
export type CreateCellInput = z.infer<typeof CreateCellSchema>;

/** Yacheykaga tovar biriktirish («+» amal — tanlangan tovarlarning asosiy
 *  loc* manzili shu yacheyka kodiga o'rnatiladi). */
export const AssignCellSchema = z.object({
  productIds: z.array(uuid).min(1).max(100),
});
export type AssignCellInput = z.infer<typeof AssignCellSchema>;

/** Butun akkaunt bo'ylab yacheyka qidiruvi (tovar kartochkasidagi dropdown). */
export const CellSearchSchema = z.object({
  search: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CellSearchInput = z.infer<typeof CellSearchSchema>;
