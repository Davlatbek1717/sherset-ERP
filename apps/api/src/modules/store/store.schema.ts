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
  // «Владелец-сотрудник» / «Владелец-отдел» (moysklad card owner cluster).
  ownerId: uuid.nullish(),
  groupId: uuid.nullish(),
  // «Проводить инвентаризацию по ячейкам» (Адресное хранение). Persisted inside
  // the attributes JSON under a reserved key (no schema migration on this box);
  // the service lifts it back to a top-level field on reads.
  cellInventory: z.coerce.boolean().optional(),
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
  // moysklad «Показывать»: 'active' (Только обычные, default) | 'all' (Все).
  // Wins over `archived` when both are sent.
  show: z.enum(['active', 'all']).optional(),
  search: z.string().max(100).optional(),
  // moysklad filter-panel fields (all contains/insensitive for texts).
  name: z.string().max(255).optional(),
  code: z.string().max(50).optional(),
  address: z.string().max(255).optional(),
  ownerId: uuid.optional(),
  groupId: uuid.optional(),
  shared: boolFromString.optional(),
  // Tree node filter: uuid = children of that store; 'root' = top-level only.
  parentId: z.union([uuid, z.literal('root')]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'code', 'address', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type StoreFilterInput = z.infer<typeof StoreFilterSchema>;

/** «Переместить» — bulk re-parent (list Изменить ▾ menu). parentId null = to root. */
export const BulkMoveSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  parentId: uuid.nullable(),
});
export type BulkMoveInput = z.infer<typeof BulkMoveSchema>;

/**
 * «Массовое редактирование» — opt-in field patch applied to every selected store.
 * Only the keys present are touched; explicit null clears (group/owner).
 */
export const BulkUpdateSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  set: z
    .object({
      archived: z.boolean().optional(),
      groupId: uuid.nullable().optional(),
      ownerId: uuid.nullable().optional(),
      shared: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'set must not be empty' }),
});
export type BulkUpdateInput = z.infer<typeof BulkUpdateSchema>;
