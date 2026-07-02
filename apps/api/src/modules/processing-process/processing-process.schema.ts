import { z } from 'zod';

/**
 * ProcessingProcess (Техпроцесс) schemas — §126/round-6 full moysklad
 * parity (no V1/V2 split; the legacy linear-children model is gone).
 *
 * Faithful model (moysklad `processingprocess`):
 *   - A Техпроцесс owns 1–100 POSITIONS.
 *   - Each position references a STANDALONE `processingstage`
 *     (Этап производства) catalog entity — moysklad's
 *     `position.processingstage` (required at creation).
 *   - Each position carries `nextPositions` — a MetaArray of
 *     successor positions: a real multi-successor branching DAG.
 *
 * Wire shape (`stages[]` — the project's established field name; each
 * element is a *position input*):
 *   - `processingStageId` — reference an existing standalone Этап
 *     (the moysklad-faithful primary path), OR
 *   - inline stage fields (`name` + cost/markup/…) — create a NEW
 *     standalone Этап on the fly; it persists in the Этап catalog
 *     (a superset of moysklad's picker "+ create" affordance).
 *   - `nextPositionIndexes` — 0-based indexes into this array naming
 *     the successor positions (the `nextPositions` DAG). Empty ⇒ the
 *     server defaults to a linear chain (pos[i] → pos[i+1]).
 *
 * Money-engine guard (§85-93/§117): a referenced Этап is a standalone
 * catalog row; replacing a process's positions NEVER deletes a
 * ProcessingStage (FK Restrict + the §117 cost cascade still reads
 * stage.materialMarkup / laborCostMinor untouched).
 */

const uuid = z.string().uuid();

const boolFromString = (def: boolean) =>
  z
    .preprocess((v) => {
      if (typeof v === 'string') return v === 'true' || v === '1';
      return v;
    }, z.boolean())
    .default(def);

// ---- Position input --------------------------------------------------------
// One element = one Техпроцесс position. It either references an existing
// standalone Этап (`processingStageId`) or defines a new one inline.

export const ProcessingStageInputSchema = z
  .object({
    /** Reference an existing standalone Этап (moysklad-faithful path). */
    processingStageId: uuid.optional(),
    /** Inline new-Этап name (required only when no `processingStageId`). */
    name: z.string().min(1).max(255).optional(),
    code: z.string().max(50).optional(),
    externalCode: z.string().max(50).optional(),
    description: z.string().optional(),
    position: z.coerce.number().int().min(0).default(0),
    /** Standard / built-in stage (true) vs custom user-defined (false). */
    default: boolFromString(true),
    /** Per-stage labour cost in minor units (tiyin) — BigInt-as-string. */
    laborCostMinor: z
      .union([z.string(), z.number()])
      .transform((v) => String(v))
      .pipe(z.string().regex(/^\d+$/, 'laborCostMinor must be a non-negative integer (tiyin)'))
      .default('0'),
    /** Material cost markup (percent) applied at this stage. */
    materialMarkup: z.coerce.number().int().min(0).max(1000).default(0),
    /** moysklad processingstage `allPerformers` (any employee assignable). */
    allPerformers: boolFromString(true),
    shared: boolFromString(false),
    /**
     * Successor positions — 0-based indexes into the positions array.
     * Multi-successor branching DAG (moysklad `nextPositions`). Empty ⇒
     * the server links a linear chain (pos[i] → pos[i+1]).
     */
    nextPositionIndexes: z.array(z.coerce.number().int().min(0)).default([]),
  })
  .superRefine((d, ctx) => {
    if (!d.processingStageId && !d.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Position must reference an existing Этап (processingStageId) or define a new one (name)',
        path: ['name'],
      });
    }
  });
export type ProcessingStageInput = z.infer<typeof ProcessingStageInputSchema>;

// moysklad: «У Техпроцесса может быть от 1 до 100 позиций».
const PositionsArray = z
  .array(ProcessingStageInputSchema)
  .min(1, 'Kamida bitta etap kerak')
  .max(100, 'Техпроцесс 100 tadan ortiq pozitsiyaga ega bo‘la olmaydi');

export const SetProcessingStagesSchema = z.object({ stages: PositionsArray });
export type SetProcessingStagesInput = z.infer<typeof SetProcessingStagesSchema>;

// ---- Create / Update -------------------------------------------------------

export const CreateProcessingProcessSchema = z.object({
  name: z.string().min(1).max(255),
  // .nullish() (not .optional()): the edit form sends null to clear these
  // header fields; the service writes null on null and skips undefined.
  code: z.string().max(50).nullish(),
  externalCode: z.string().max(50).nullish(),
  description: z.string().nullish(),
  shared: boolFromString(false),
  // moysklad: `positions` is required at creation (1–100).
  stages: PositionsArray,
});
export type CreateProcessingProcessInput = z.infer<typeof CreateProcessingProcessSchema>;

export const UpdateProcessingProcessSchema = CreateProcessingProcessSchema.partial().extend({
  // Optimistic-lock (lost-update guard): the loaded `version` is REQUIRED on
  // every Update (absent on Create). The service runs the header update as
  // WHERE id=? AND version=? SET …, version=version+1 — a stale copy matches
  // zero rows → P2025 → 409 OPTIMISTIC_LOCK. See shared/optimistic-lock.ts.
  version: z.number().int().nonnegative(),
});
export type UpdateProcessingProcessInput = z.infer<typeof UpdateProcessingProcessSchema>;

// ---- Filter ----------------------------------------------------------------

export const ProcessingProcessFilterSchema = z.object({
  search: z.string().optional(),
  archived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(25),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type ProcessingProcessFilter = z.infer<typeof ProcessingProcessFilterSchema>;
