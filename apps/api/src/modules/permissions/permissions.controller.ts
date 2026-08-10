import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsService } from './permissions.service.js';
import type { PermissionAction, PermissionEntity, PermissionScope } from './permissions.types.js';

// The web app gates its top-nav MODULES on this matrix (settings → Сотрудники
// «Настроить права»): a module hides when every mapped entity's view scope is
// NO. So the exported universe must cover every module's document types, not
// just the original 7 master-data entities. resolveScope() reads the cached
// per-employee permission map (5-min TTL) — widening this list is in-memory
// work per request, not extra queries.
const ENTITIES: PermissionEntity[] = [
  // master data
  'product',
  'productfolder',
  'counterparty',
  'contactperson',
  'organization',
  'store',
  'storecell',
  'employee',
  'role',
  // sales
  'customerorder',
  'demand',
  'invoiceout',
  'salesreturn',
  'factureout',
  'commissionreport',
  // purchases
  'purchaseorder',
  'supply',
  'invoicein',
  'purchasereturn',
  'facturein',
  // money
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'counterpartyadjustment',
  'prepayment',
  'prepaymentreturn',
  // warehouse
  'move',
  'loss',
  'enter',
  'inventory',
  'internalorder',
  'pricelist',
  // production
  'bom',
  'workorder',
  'processingorder',
  'processing',
  // retail
  'retailsale',
  'cashiersession',
  // crm / tasks
  'call',
  'opportunity',
  'task',
  // cross-cutting
  'report',
  'analitika',
  'settings',
  'auditlog',
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
