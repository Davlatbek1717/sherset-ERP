import { z } from 'zod';

/**
 * Project (Проект) catalog schemas. moysklad Настройки → Справочники →
 * Проекты — entity code `project`. The create form's only required field
 * is `name`; `code` / `externalCode` / `description` are optional (see
 * docs/moysklad-reference/api-docs-official/dictionaries/_project.md).
 * Field caps mirror the Prisma column types: name VarChar(255),
 * code/externalCode VarChar(50), description text (capped at 4096 per the
 * moysklad API contract).
 */
export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(50).optional(),
  externalCode: z.string().max(50).optional(),
  description: z.string().max(4096).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

/**
 * Update accepts `null` (not just `undefined`) for the optional string
 * fields so the edit form can CLEAR them — the form sends `code.trim() ||
 * null`, and clearing a code/description is valid moysklad behaviour. The
 * service's `if (x !== undefined) data.x = x` guard then writes `null` to
 * the (nullable) column. Decoupled from `CreateProjectSchema.partial()`
 * because create only ever omits empty optionals (never sends null).
 */
export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().max(50).nullable().optional(),
  externalCode: z.string().max(50).nullable().optional(),
  description: z.string().max(4096).nullable().optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const ProjectFilterSchema = z.object({
  // Undefined → service defaults to non-archived (the document picker
  // only ever wants active projects, so it omits the param).
  archived: boolFromString.optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['name', 'code', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  cursor: z.string().uuid().optional(),
  // The 30+ document «Проект» pickers hit this endpoint on every debounced
  // keystroke and only read `items` — they omit `withTotal`, so the extra
  // COUNT runs only for the Settings catalog page that shows a total.
  withTotal: boolFromString.optional(),
});
export type ProjectFilterInput = z.infer<typeof ProjectFilterSchema>;
