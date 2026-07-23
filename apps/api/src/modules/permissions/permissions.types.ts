/**
 * Permission model — maps directly to docs/moysklad-reference/business-rules/permissions.md.
 *
 * Scope hierarchy (implicit): NO < OWN < OWN_GROUP < OWN_AND_GROUP < ALL
 * Effective permission across multiple roles = MAX(scopes).
 */

export type PermissionScope = 'NO' | 'OWN' | 'OWN_GROUP' | 'OWN_AND_GROUP' | 'ALL';

export const SCOPE_ORDER: Record<PermissionScope, number> = {
  NO: 0,
  OWN: 1,
  OWN_GROUP: 2,
  OWN_AND_GROUP: 3,
  ALL: 4,
};

/**
 * Entity slugs (50 chars max in DB). Every controller that exposes a
 * write endpoint declares the entity it owns; PermissionsGuard then
 * checks the actor's effective scope before letting the call through.
 *
 * Adding a new entity? Append it here, add a row to the seed
 * permission matrix in PermissionsService, and decorate the relevant
 * controllers with `@RequirePermission({ entity, action })`.
 */
export type PermissionEntity =
  // Master data
  | 'product'
  | 'productfolder'
  | 'variant'
  | 'bundle'
  | 'service'
  | 'pricetype'
  | 'counterparty'
  | 'contactperson'
  | 'organization'
  | 'store'
  | 'cashdesk'
  | 'bankaccount'
  | 'employee'
  | 'role'
  | 'mxik'
  | 'exchangerate'
  | 'currency'
  | 'project'
  | 'contract'
  | 'uom'
  | 'taxrate'
  | 'expenseitem'
  | 'customentity'
  | 'region'
  | 'country'
  | 'trackingcode'
  | 'discount'
  // Sales documents
  | 'customerorder'
  | 'demand'
  | 'invoiceout'
  | 'salesreturn'
  | 'factureout'
  | 'commissionreport'
  | 'consignment'
  // Purchase documents
  | 'purchaseorder'
  | 'supply'
  | 'invoicein'
  | 'purchasereturn'
  | 'facturein'
  // Money documents
  | 'paymentin'
  | 'paymentout'
  | 'cashin'
  | 'cashout'
  | 'bankimport'
  | 'counterpartyadjustment'
  | 'prepayment'
  | 'prepaymentreturn'
  // Warehouse documents
  | 'move'
  | 'loss'
  | 'enter'
  | 'inventory'
  | 'internalorder'
  | 'pricelist'
  // Production
  | 'bom'
  | 'workorder'
  | 'processingorder'
  | 'processing'
  | 'processingprocess'
  | 'processingstage'
  | 'payroll'
  // Retail / E-commerce
  | 'cashiersession'
  | 'retailsale'
  | 'saleschannel'
  | 'onlineorder'
  // CRM
  | 'pipeline'
  | 'opportunity'
  | 'call'
  | 'task'
  | 'tasktype'
  // Cross-cutting
  | 'attachment'
  | 'auditlog'
  | 'report'
  | 'publication'
  | 'label'
  | 'settings'
  // Analitika module
  | 'analitika'
  // Debts (Sherset KEEP — B3)
  | 'debt'
  | 'debtpayment'
  | 'debtcardpayment'
  | 'debtreport';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'approve' // for documents
  | 'print';

export function maxScope(a: PermissionScope, b: PermissionScope): PermissionScope {
  return SCOPE_ORDER[a] >= SCOPE_ORDER[b] ? a : b;
}

export function isAtLeast(actual: PermissionScope, required: PermissionScope): boolean {
  return SCOPE_ORDER[actual] >= SCOPE_ORDER[required];
}

/** For a record's ownership metadata — do permissions apply? */
export interface RecordContext {
  ownerId?: string | null;
  groupId?: string | null;
  shared?: boolean;
}

export interface ActorContext {
  employeeId: string;
  groupId: string | null;
}

/**
 * Decide if actor with given scope can access a specific record.
 * For list queries, use this to filter; for single-record access, this is the gate.
 */
export function canAccessRecord(
  scope: PermissionScope,
  actor: ActorContext,
  record: RecordContext,
): boolean {
  switch (scope) {
    case 'NO':
      return false;
    case 'ALL':
      return true;
    case 'OWN':
      return record.ownerId === actor.employeeId || record.shared === true;
    case 'OWN_GROUP':
      return (
        (record.groupId != null && actor.groupId != null && record.groupId === actor.groupId) ||
        record.shared === true
      );
    case 'OWN_AND_GROUP':
      return (
        record.ownerId === actor.employeeId ||
        (record.groupId != null && actor.groupId != null && record.groupId === actor.groupId) ||
        record.shared === true
      );
  }
}

/** Default permission matrix for system roles (seeded at tenant provisioning). */
export const SYSTEM_ROLE_TEMPLATES = {
  Administrator: {
    description: "To'liq kirish — hamma narsa",
    defaults: {
      view: 'ALL',
      create: 'ALL',
      update: 'ALL',
      delete: 'ALL',
      approve: 'ALL',
      print: 'ALL',
    } as Record<PermissionAction, PermissionScope>,
  },
  Manager: {
    description: "Menejer — o'z guruhi kesimida",
    defaults: {
      view: 'ALL',
      create: 'ALL',
      update: 'OWN_GROUP',
      delete: 'OWN_GROUP',
      approve: 'OWN_GROUP',
      print: 'ALL',
    } as Record<PermissionAction, PermissionScope>,
  },
  Employee: {
    description: "Xodim — faqat o'z yozuvlari",
    defaults: {
      view: 'OWN_GROUP',
      create: 'ALL',
      update: 'OWN',
      delete: 'NO',
      approve: 'OWN',
      print: 'OWN_GROUP',
    } as Record<PermissionAction, PermissionScope>,
  },
  ReadOnly: {
    description: "Faqat ko'rish",
    defaults: {
      view: 'ALL',
      create: 'NO',
      update: 'NO',
      delete: 'NO',
      approve: 'NO',
      print: 'ALL',
    } as Record<PermissionAction, PermissionScope>,
  },
} as const;

export type SystemRoleName = keyof typeof SYSTEM_ROLE_TEMPLATES;
