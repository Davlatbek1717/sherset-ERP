import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';

/**
 * Processing (Техоперация / Texnik operatsiya) — shop-floor execution record.
 *
 * Consumes materials FROM materialsStoreId (negative stock delta) and produces
 * output product INTO productsStoreId (positive stock delta), using quantities
 * derived from the linked BOM (processingPlanId — REQUIRED in v1).
 *
 * Auto-numbering: TP-YYYY-NNNNN (per-account, per-year sequence).
 *
 * State machine:
 *   draft → posted   (applicable=true; runs stock cascade)
 *   posted → draft   (unpost; reverses all stock deltas)
 *   posted → cancelled (same reversal as unpost; state=cancelled)
 *   draft → cancelled
 */

export const ProcessingStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type ProcessingState = z.infer<typeof ProcessingStateSchema>;

export const ProcessingTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type ProcessingTransitionTarget = z.infer<typeof ProcessingTransitionSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/**
 * Explicit per-operation material line (§88, moysklad Техоперация
 * `materials`). `qty` is the ACTUAL absolute consumed quantity (NOT
 * scaled by recipe runs — the operator records what was really used:
 * substitutions, wastage, qty ≠ BOM standard). When ≥1 line is given
 * the post() cascade consumes THESE instead of exploding the BOM; the
 * cost / snapshot / exact-reversal engine is unchanged.
 */
export const ProcessingMaterialInputSchema = z.object({
  productId: z.string().uuid(),
  qty: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v.toString() : v))
    .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'qty must be > 0'),
});
export type ProcessingMaterialInput = z.infer<typeof ProcessingMaterialInputSchema>;

/**
 * Explicit per-operation OUTPUT line (§89, moysklad Техоперация
 * `products`). When ≥1 line is given the post() cascade produces
 * THESE (multi-output / by-products) instead of the single BOM
 * product; the total consumed cost is distributed across them by
 * qty-proportion (largest-remainder, exact). Same shape as a material.
 */
export const ProcessingProductInputSchema = ProcessingMaterialInputSchema;
export type ProcessingProductInput = z.infer<typeof ProcessingProductInputSchema>;

export const CreateProcessingSchema = z.object({
  organizationId: z.string().uuid(),
  /** §88 — explicit actual materials; absent ⇒ BOM-explode (v1 path). */
  materials: z.array(ProcessingMaterialInputSchema).optional(),
  /** §89 — explicit outputs (multi/by-product); absent ⇒ single BOM
   *  product. Cost split across them by qty-proportion (exact). */
  products: z.array(ProcessingProductInputSchema).optional(),
  // moysklad «Счёт организации» on the Техоперация (§85, processing.json).
  organizationAccountId: z.string().uuid().nullish(),
  materialsStoreId: z.string().uuid(),
  productsStoreId: z.string().uuid(),
  // moysklad parity — Проект (production doc: no counterparty → no Договор).
  projectId: z.string().uuid().nullish(),
  /**
   * §90 — optional. The BOM provides whichever side has no explicit
   * list. Required UNLESS BOTH explicit materials[] AND products[]
   * are given (then the operation is fully self-described and no
   * техкарта is needed). Enforced by the object-level refine below.
   */
  processingPlanId: z.string().uuid().nullish(),
  processingOrderId: z.string().uuid().optional().nullable(),
  moment: z.string().optional(),
  /** Quantity of the finished good produced. User types whole units; stored ×1000. */
  quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v.toString() : v))
    .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'Quantity must be > 0')
    .default('1'),
  // §117 / round-4 unit 3 — moysklad «Выполнение этапа производства»
  // extensions. Money in tiyin (string ^\d+$ → BigInt at the service);
  // standardHourUnit a Decimal(≤6dp) string. All optional ⇒ a
  // stage-less Техоперация behaves byte-identically (pre-§117).
  processingStageId: z.string().uuid().optional().nullable(),
  performerId: z.string().uuid().optional().nullable(),
  defect: boolFromString.optional(),
  enableHourAccounting: boolFromString.optional(),
  labourUnitCostMinor: z
    .union([z.number(), z.string()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+$/, 'labourUnitCostMinor must be non-negative tiyin'))
    .optional(),
  standardHourCostMinor: z
    .union([z.number(), z.string()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+$/, 'standardHourCostMinor must be non-negative tiyin'))
    .optional(),
  standardHourUnit: z
    .union([z.number(), z.string()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+(\.\d{1,6})?$/, 'standardHourUnit must be a non-negative decimal'))
    .optional(),
  description: z.string().max(4096).optional().nullable(),
  externalCode: z.string().max(255).optional().nullable(),
});
export type CreateProcessingInput = z.infer<typeof CreateProcessingSchema>;

/**
 * §90 — a Техоперация needs a source for BOTH its materials and its
 * outputs. The BOM (processingPlanId) covers both; an explicit list
 * covers its own side. So it's valid iff:
 *   (processingPlanId || materials.length>0)   // material source
 *   AND (processingPlanId || products.length>0) // output source
 * i.e. without a plan, BOTH explicit lists are required.
 */
function hasValidProcessingSource(v: {
  processingPlanId?: string | null;
  materials?: unknown[];
  products?: unknown[];
}): boolean {
  const plan = !!v.processingPlanId;
  const mat = plan || (v.materials?.length ?? 0) > 0;
  const out = plan || (v.products?.length ?? 0) > 0;
  return mat && out;
}

export const CreateProcessingSchemaChecked = CreateProcessingSchema.refine(
  hasValidProcessingSource,
  {
    message: 'processingPlanId majburiy — yoki materials[] va products[] ikkalasini ham kiriting',
    path: ['processingPlanId'],
  },
);

export const UpdateProcessingSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    organizationAccountId: z.string().uuid().nullish(),
    materialsStoreId: z.string().uuid().optional(),
    productsStoreId: z.string().uuid().optional(),
    projectId: z.string().uuid().nullish(),
    processingPlanId: z.string().uuid().optional().nullable(),
    processingOrderId: z.string().uuid().optional().nullable(),
    moment: z.string().optional(),
    /** §88 — replace the explicit materials list (draft only). */
    materials: z.array(ProcessingMaterialInputSchema).optional(),
    /** §89 — replace the explicit outputs list (draft only). */
    products: z.array(ProcessingProductInputSchema).optional(),
    quantity: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === 'number' ? v.toString() : v))
      .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'Quantity must be > 0')
      .optional(),
    // §117 — stage-completion editable extensions. `defect` is
    // intentionally ABSENT: moysklad "+После создания изменить нельзя"
    // (immutable after create) — the service rejects any attempt.
    processingStageId: z.string().uuid().optional().nullable(),
    performerId: z.string().uuid().optional().nullable(),
    enableHourAccounting: boolFromString.optional(),
    labourUnitCostMinor: z
      .union([z.number(), z.string()])
      .transform((v) => String(v))
      .pipe(z.string().regex(/^\d+$/, 'labourUnitCostMinor must be non-negative tiyin'))
      .optional(),
    standardHourCostMinor: z
      .union([z.number(), z.string()])
      .transform((v) => String(v))
      .pipe(z.string().regex(/^\d+$/, 'standardHourCostMinor must be non-negative tiyin'))
      .optional(),
    standardHourUnit: z
      .union([z.number(), z.string()])
      .transform((v) => String(v))
      .pipe(
        z.string().regex(/^\d+(\.\d{1,6})?$/, 'standardHourUnit must be a non-negative decimal'),
      )
      .optional(),
    description: z.string().max(4096).optional().nullable(),
    externalCode: z.string().max(255).optional().nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateProcessingInput = z.infer<typeof UpdateProcessingSchema>;

export const ProcessingFilterSchema = z.object({
  state: ProcessingStateSchema.optional(),
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  /** «Склад материалов» — Processing.materialsStoreId (consumption side). */
  materialsStoreId: z.string().uuid().optional(),
  /** «Склад продукции» — Processing.productsStoreId (output side). */
  productsStoreId: z.string().uuid().optional(),
  /** «Тех. карта» — Processing.processingPlanId (BOM FK). */
  processingPlanId: z.string().uuid().optional(),
  /** «Заказ на переработку» — Processing.processingOrderId (linked planning header). */
  processingOrderId: z.string().uuid().optional(),
  /** «Проект» — Processing.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — Processing.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-отдел» — Processing.groupId. */
  groupId: z.string().uuid().optional(),
  /** «Проведено» — Processing.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — Processing.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — Processing.published flag. */
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To). Mirrors InternalOrderFilterSchema.
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  /** «Сумма» range — Processing.costSumMinor (BigInt tiyin). */
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the Processing
  // model has no `updatedById` column (only `ownerId` / `groupId` /
  // `performerId`), so there is no backed way to filter "last modified
  // by". Surfacing it would require a schema migration outside this
  // panel-parity task. Processing also has NO agentId / contractId /
  // agentAccountId / salesChannelId — internal production execution
  // doc (no counterparty), so those filters are intentionally absent.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad parity — relational sort for organization / both stores
  // exposed by the list-view column headers (handled by
  // ProcessingService.buildListWhere's orderBy special-case).
  sortBy: z
    .enum([
      'moment',
      'name',
      'costSumMinor',
      'createdAt',
      'updatedAt',
      'organization',
      'materialsStore',
      'productsStore',
    ])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type ProcessingFilter = z.infer<typeof ProcessingFilterSchema>;
