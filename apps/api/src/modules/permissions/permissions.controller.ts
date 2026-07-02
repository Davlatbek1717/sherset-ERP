import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsService } from './permissions.service.js';
import type { PermissionAction, PermissionEntity, PermissionScope } from './permissions.types.js';

// Full nav-relevant entity set so Web can gate BOTH the UI actions and the
// top-level navbar modules (a module is hidden when the user cannot view any
// of its entities). Keep in sync with the module→entity map in the web layout.
const ENTITIES: PermissionEntity[] = [
  'product',
  'productfolder',
  'pricelist',
  'counterparty',
  'contract',
  'call',
  'organization',
  'store',
  'employee',
  'role',
  // purchases
  'purchaseorder',
  'invoicein',
  'supply',
  'purchasereturn',
  'facturein',
  // sales
  'customerorder',
  'invoiceout',
  'demand',
  'salesreturn',
  'factureout',
  'commissionreport',
  // stock
  'move',
  'enter',
  'loss',
  'inventory',
  'internalorder',
  // money
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'prepayment',
  // retail / production / crm / other
  'retailsale',
  'cashiersession',
  'processing',
  'processingorder',
  'bom',
  'task',
  'analitika',
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
