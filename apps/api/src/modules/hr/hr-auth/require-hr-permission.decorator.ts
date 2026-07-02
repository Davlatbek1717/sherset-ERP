import { SetMetadata } from '@nestjs/common';
import {
  HR_PERMISSION_METADATA_KEY,
  type HrAccessLevel,
  type HrPageKey,
  type HrPermissionRequirement,
} from './hr-permission.types.js';

/**
 * Attaches an HR permission requirement to a controller method. Enforced by
 * HrPermissionGuard (registered at HrModule level — see hr.module.ts).
 *
 * Admins (`hrRoles` contains 'admin') bypass the check.
 */
export const RequireHrPermission = (page: HrPageKey, access: HrAccessLevel, section?: string) =>
  SetMetadata(HR_PERMISSION_METADATA_KEY, {
    page,
    access,
    section,
  } satisfies HrPermissionRequirement);
