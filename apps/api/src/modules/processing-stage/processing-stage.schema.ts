import { z } from 'zod';

/**
 * §126 — moysklad `processingstage` (Этап производства): a STANDALONE,
 * reusable catalog entity. CRUD mirrors the proven bom module.
 *
 * performers semantics (moysklad): allPerformers=true ⇒ any active
 * employee; allPerformers=false + performers[] ⇒ only those; passing
 * only performers[] flips allPerformers→false (handled in service).
 */
const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'));

const minorString = z
  .union([z.number(), z.string()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+$/, 'must be a non-negative integer (tiyin)'));

export const CreateProcessingStageSchema = z.object({
  name: z.string().min(1).max(255),
  // .nullish() (not .optional()): the edit form sends null to clear these
  // optional fields; the service writes null on null and skips undefined.
  code: z.string().max(50).nullish(),
  externalCode: z.string().max(255).nullish(),
  description: z.string().max(4096).nullish(),
  laborCostMinor: minorString.default('0'),
  materialMarkup: z.coerce.number().int().min(0).max(1000).default(0),
  allPerformers: boolFromString.default(true),
  distributionRequired: boolFromString.default(false),
  standardHourCostMinor: minorString.default('0'),
  materialStoreId: z.string().uuid().nullish(),
  shared: boolFromString.default(false),
  /** moysklad performers MetaArray — employee ids that may be assigned. */
  performers: z.array(z.string().uuid()).default([]),
});
export type CreateProcessingStageInput = z.infer<typeof CreateProcessingStageSchema>;

export const UpdateProcessingStageSchema = CreateProcessingStageSchema.partial().extend({
  // Optimistic-lock guard (lost-update): the edit form returns the version it
  // loaded; the service runs the header update WHERE version = parsed.version and
  // increments it. REQUIRED on Update (absent on Create — a new row starts at 1).
  version: z.number().int().nonnegative(),
});
export type UpdateProcessingStageInput = z.infer<typeof UpdateProcessingStageSchema>;

export const ProcessingStageFilterSchema = z.object({
  search: z.string().optional(),
  archived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(25),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type ProcessingStageFilter = z.infer<typeof ProcessingStageFilterSchema>;
