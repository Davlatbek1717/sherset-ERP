import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SCOPE_ORDER } from './permissions.types.js';
import { RequirePermission } from './require-permission.decorator.js';
import { SetEmployeeRolesSchema } from './roles.schema.js';
import { RolesService } from './roles.service.js';

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(@Inject(RolesService) private readonly svc: RolesService) {}

  @Get()
  @RequirePermission({ entity: 'role', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  /**
   * Vocabulary endpoint — returns the list of permission entities the
   * frontend matrix should render rows for, plus the canonical action set
   * and scope order. Kept stable across the API so the matrix UI doesn't
   * need to hard-code the universe.
   */
  @Get('meta')
  @RequirePermission({ entity: 'role', action: 'view' })
  meta() {
    return {
      entities: KNOWN_ENTITIES.map((key) => ({
        key,
        category: CATEGORY_BY_ENTITY[key] ?? 'Other',
      })),
      categories: CATEGORIES,
      actions: ['view', 'create', 'update', 'delete', 'approve', 'print'] as const,
      scopes: Object.keys(SCOPE_ORDER),
    };
  }

  // ─── Employee ↔ role assignment (Settings → Users access rights) ──────────
  // 2-segment routes — declared before @Get(':id') so 'employee' is never
  // matched as a role :id. Gated on employee/update: changing an employee's
  // roles changes that employee's access, not the role definition.

  @Get('employee/:employeeId')
  @RequirePermission({ entity: 'employee', action: 'update' })
  async employeeRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.svc.getEmployeeRoles(user.accountId, employeeId);
  }

  @Put('employee/:employeeId')
  @RequirePermission({ entity: 'employee', action: 'update' })
  async setEmployeeRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() body: unknown,
  ) {
    const { roleIds } = SetEmployeeRolesSchema.parse(body);
    return this.svc.setEmployeeRoles(user.accountId, employeeId, roleIds);
  }

  @Get(':id')
  @RequirePermission({ entity: 'role', action: 'view' })
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findOne(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'role', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'role', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'role', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}

/**
 * Curated set of entities that show up in the matrix. Mirrors the union
 * in `permissions.types.ts` — kept here as a runtime value because the TS
 * union isn't available at runtime. Grouped logically for the UI to
 * render section headers in a stable order.
 */
const KNOWN_ENTITIES = [
  // Master data
  'product',
  'productfolder',
  'variant',
  'bundle',
  'service',
  'pricetype',
  'counterparty',
  'contactperson',
  'organization',
  'store',
  'cashdesk',
  'bankaccount',
  'employee',
  'role',
  'mxik',
  'exchangerate',
  'currency',
  'project',
  'contract',
  'uom',
  'taxrate',
  'expenseitem',
  'customentity',
  'region',
  'country',
  'trackingcode',
  'discount',
  // Sales documents
  'customerorder',
  'demand',
  'invoiceout',
  'salesreturn',
  'factureout',
  'commissionreport',
  'consignment',
  // Purchase documents
  'purchaseorder',
  'supply',
  'invoicein',
  'purchasereturn',
  'facturein',
  // Money documents
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'bankimport',
  'counterpartyadjustment',
  'prepayment',
  'prepaymentreturn',
  // Warehouse documents
  'move',
  'loss',
  'enter',
  'inventory',
  'internalorder',
  'pricelist',
  // Production
  'bom',
  'workorder',
  'processingorder',
  'processing',
  'processingprocess',
  'processingstage',
  'payroll',
  // Retail / E-commerce
  'cashiersession',
  'retailsale',
  'saleschannel',
  'onlineorder',
  // CRM
  'pipeline',
  'opportunity',
  'call',
  'task',
  'tasktype',
  // Cross-cutting
  'attachment',
  'auditlog',
  'report',
  'publication',
  'label',
  'settings',
  // Analitika
  'analitika',
] as const;

/** Stable display order for category sections in the matrix UI. */
const CATEGORIES = [
  'Master data',
  'Sales documents',
  'Purchase documents',
  'Money documents',
  'Warehouse documents',
  'Production',
  'Retail / E-commerce',
  'CRM',
  'Cross-cutting',
  'Analitika',
] as const;

const CATEGORY_BY_ENTITY: Record<(typeof KNOWN_ENTITIES)[number], (typeof CATEGORIES)[number]> = {
  product: 'Master data',
  productfolder: 'Master data',
  variant: 'Master data',
  bundle: 'Master data',
  service: 'Master data',
  pricetype: 'Master data',
  counterparty: 'Master data',
  contactperson: 'Master data',
  organization: 'Master data',
  store: 'Master data',
  cashdesk: 'Master data',
  bankaccount: 'Master data',
  employee: 'Master data',
  role: 'Master data',
  mxik: 'Master data',
  exchangerate: 'Master data',
  currency: 'Master data',
  project: 'Master data',
  contract: 'Master data',
  uom: 'Master data',
  taxrate: 'Master data',
  expenseitem: 'Master data',
  customentity: 'Master data',
  region: 'Master data',
  country: 'Master data',
  trackingcode: 'Master data',
  discount: 'Master data',
  customerorder: 'Sales documents',
  demand: 'Sales documents',
  invoiceout: 'Sales documents',
  salesreturn: 'Sales documents',
  factureout: 'Sales documents',
  commissionreport: 'Sales documents',
  consignment: 'Sales documents',
  purchaseorder: 'Purchase documents',
  supply: 'Purchase documents',
  invoicein: 'Purchase documents',
  purchasereturn: 'Purchase documents',
  facturein: 'Purchase documents',
  paymentin: 'Money documents',
  paymentout: 'Money documents',
  cashin: 'Money documents',
  cashout: 'Money documents',
  bankimport: 'Money documents',
  counterpartyadjustment: 'Money documents',
  prepayment: 'Money documents',
  prepaymentreturn: 'Money documents',
  move: 'Warehouse documents',
  loss: 'Warehouse documents',
  enter: 'Warehouse documents',
  inventory: 'Warehouse documents',
  internalorder: 'Warehouse documents',
  pricelist: 'Warehouse documents',
  bom: 'Production',
  workorder: 'Production',
  processingorder: 'Production',
  processing: 'Production',
  processingprocess: 'Production',
  processingstage: 'Production',
  payroll: 'Production',
  cashiersession: 'Retail / E-commerce',
  retailsale: 'Retail / E-commerce',
  saleschannel: 'Retail / E-commerce',
  onlineorder: 'Retail / E-commerce',
  pipeline: 'CRM',
  opportunity: 'CRM',
  call: 'CRM',
  task: 'CRM',
  tasktype: 'CRM',
  attachment: 'Cross-cutting',
  auditlog: 'Cross-cutting',
  report: 'Cross-cutting',
  publication: 'Cross-cutting',
  label: 'Cross-cutting',
  settings: 'Cross-cutting',
  analitika: 'Analitika',
};
