import { SetMetadata } from '@nestjs/common';
import type { PermissionAction, PermissionEntity, PermissionScope } from './permissions.types.js';

export const PERMISSION_META = 'moysklad:permission';

export interface RequiredPermission {
  entity: PermissionEntity;
  action: PermissionAction;
  /** Minimum scope required (default: OWN — any non-NO access) */
  minScope?: PermissionScope;
}

/**
 * Attach required permission metadata to a controller method.
 * Enforced by PermissionsGuard. Example:
 *
 *   @RequirePermission({ entity: 'product', action: 'update' })
 *   @Patch(':id') async update(...) { ... }
 */
export const RequirePermission = (req: RequiredPermission) => SetMetadata(PERMISSION_META, req);
