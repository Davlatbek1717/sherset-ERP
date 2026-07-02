import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsService } from './permissions.service.js';
import type { PermissionAction, PermissionEntity, PermissionScope } from './permissions.types.js';

const ENTITIES: PermissionEntity[] = [
  'product',
  'productfolder',
  'counterparty',
  'organization',
  'store',
  'employee',
  'role',
];
const ACTIONS: PermissionAction[] = ['view', 'create', 'update', 'delete', 'approve', 'print'];

@Controller('permissions')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(@Inject(PermissionsService) private readonly permissions: PermissionsService) {}

  /** Returns full permission map for the current user — used by Web to gate UI. */
  @Get('me')
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    const matrix: Record<string, Record<string, PermissionScope>> = {};
    for (const entity of ENTITIES) {
      matrix[entity] = {};
      for (const action of ACTIONS) {
        matrix[entity][action] = await this.permissions.resolveScope(user.sub, entity, action);
      }
    }
    return { matrix };
  }
}
