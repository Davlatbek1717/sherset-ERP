import { z } from 'zod';
import { HR_ACCESS_LEVELS, HR_PAGE_KEYS } from '../hr-auth/hr-permission.types.js';

export const PermissionRowSchema = z.object({
  pageKey: z.enum(HR_PAGE_KEYS),
  section: z.string().nullable(),
  accessLevel: z.enum(HR_ACCESS_LEVELS),
});

export const PutPermissionsSchema = z.object({
  permissions: z.array(PermissionRowSchema),
});

export type PermissionRow = z.infer<typeof PermissionRowSchema>;
export type PutPermissionsInput = z.infer<typeof PutPermissionsSchema>;
