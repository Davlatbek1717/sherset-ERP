import { z } from 'zod';
import { SCOPE_ORDER } from './permissions.types.js';

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

/** Re-export the scope order for the UI to sort dropdowns consistently. */
export const SCOPE_KEYS = Object.keys(SCOPE_ORDER) as Array<keyof typeof SCOPE_ORDER>;
