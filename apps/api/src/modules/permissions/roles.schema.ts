import { z } from 'zod';
import { SCOPE_ORDER } from './permissions.types.js';
import { ROLE_TEMPLATE_SLUGS, type RoleTemplateSlug } from './role-templates.js';

/** One cell of the role permission matrix. */
export const RolePermissionCellSchema = z.object({
  entity: z.string().min(1).max(50),
  action: z.enum(['view', 'create', 'update', 'delete', 'approve', 'print']),
  scope: z.enum(['NO', 'OWN', 'OWN_GROUP', 'OWN_AND_GROUP', 'ALL']),
});
export type RolePermissionCellInput = z.infer<typeof RolePermissionCellSchema>;

export const CreateRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(RolePermissionCellSchema).default([]),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  /**
   * Full matrix replacement. Cells with scope='NO' may be omitted (server
   * normalises). Caller is expected to send the entire intended state, not
   * a diff.
   */
  permissions: z.array(RolePermissionCellSchema).optional(),
  // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
  // caller cannot silently bypass the lost-update guard. Absent on Create.
  // Guards the FULL permission-matrix rewrite from a concurrent clobber.
  version: z.number().int().nonnegative(),
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

/**
 * Replace-set of RBAC roles assigned to one employee (Settings → Users access
 * rights). The caller sends the FULL intended set of role ids, not a diff — the
 * server deletes the employee's existing EmployeeRole rows and recreates these.
 * Empty array clears all roles.
 */
export const SetEmployeeRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).max(50),
});
export type SetEmployeeRolesInput = z.infer<typeof SetEmployeeRolesSchema>;

/** «Сделать владельцем» (moysklad employee card) — target of the hand-over. */
export const TransferOwnerSchema = z.object({
  employeeId: z.string().uuid(),
});
export type TransferOwnerInput = z.infer<typeof TransferOwnerSchema>;

/** Re-export the scope order for the UI to sort dropdowns consistently. */
export const SCOPE_KEYS = Object.keys(SCOPE_ORDER) as Array<keyof typeof SCOPE_ORDER>;

// ── MK26 — xodim override qatlami (TZ §3.1) ─────────────────────────────────

/**
 * Bitta override katakchasi.
 *
 * ⚠️ `scope: null` ≠ `scope: 'NO'` — `nullable()` ATAYLAB `optional()` EMAS:
 *   - `null`  → override'ni O'CHIR (xodim rol qatlamiga qaytadi)
 *   - `'NO'`  → ATAYLAB TAQIQ yoz (rol `ALL` bersa ham yopiq qoladi)
 * `optional()` bo'lsa «maydonni yubormaslik» ham «o'chirish» ma'nosini olardi
 * va UI dagi jimgina xato butun cheklovni bekor qilardi.
 */
export const EmployeePermissionCellSchema = z.object({
  entity: z.string().min(1).max(50),
  action: z.enum(['view', 'create', 'update', 'delete', 'approve', 'print']),
  scope: z.enum(['NO', 'OWN', 'OWN_GROUP', 'OWN_AND_GROUP', 'ALL']).nullable(),
  note: z.string().max(255).nullable().optional(),
});
export type EmployeePermissionCellInput = z.infer<typeof EmployeePermissionCellSchema>;

export const SetEmployeePermissionsSchema = z.object({
  /** Faqat O'ZGARADIGAN katakchalar yuboriladi (to'liq matritsa emas). */
  cells: z.array(EmployeePermissionCellSchema).min(1).max(500),
});
export type SetEmployeePermissionsInput = z.infer<typeof SetEmployeePermissionsSchema>;

/** G2 o'qish so'rovi — qaysi uch-liklarni izohlash kerak. */
export const ExplainPermissionsSchema = z.object({
  cells: z
    .array(
      z.object({
        entity: z.string().min(1).max(50),
        action: z.enum(['view', 'create', 'update', 'delete', 'approve', 'print']),
      }),
    )
    .min(1)
    .max(1000),
});
export type ExplainPermissionsInput = z.infer<typeof ExplainPermissionsSchema>;

/**
 * MK29 — rol shablonini qo'llash so'rovi (TZ §3.4).
 *
 * `version` MAJBURIY: shablon rol matritsasini TO'LIQ qayta yozadi, ya'ni
 * eskirgan sahifadan yuborilgan so'rov boshqa sessiyaning tahririni jimgina
 * bosib ketardi (mavjud `UpdateRoleSchema` bilan bir xil intizom).
 */
export const ApplyRoleTemplateSchema = z.object({
  slug: z.enum(ROLE_TEMPLATE_SLUGS as [RoleTemplateSlug, ...RoleTemplateSlug[]]),
  version: z.number().int().min(1),
});
export type ApplyRoleTemplateInput = z.infer<typeof ApplyRoleTemplateSchema>;
