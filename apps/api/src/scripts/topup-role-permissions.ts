#!/usr/bin/env tsx
/**
 * Top-up system-role permission rows for entities missing from an existing DB.
 *
 * WHY (2026-07-03): packages/db/prisma/seed.ts is the ONLY live seeder of role
 * permissions (PermissionsService.seedSystemRoles has no caller), and its
 * `entities` list had drifted from PermissionEntity — 'currency',
 * 'processingprocess', 'processingstage', 'analitika' were absent. Any DB
 * seeded with that list 403s on those modules for EVERY user; most visible:
 * GET /currencies → «Валюта документа» pickers on 9 doc editors got 403.
 *
 * 2026-07-04 (label.create «sizda: NO» from another laptop against a DB
 * seeded before `label` existed): patching one-off NEW_ENTITIES lists is the
 * same drift-class all over again, so the script now ensures the FULL
 * canonical entity list — one run heals ANY historically-seeded DB, whatever
 * it happens to be missing. Keep this list in sync with seed.ts (guarded by
 * apps/api/src/modules/permissions/permissions-seed-sync.test.ts).
 *
 * Deterministic + idempotent + re-runnable: mirrors the seed's system-role
 * defaults for ALL accounts' system roles; only CREATES missing rows
 * (update:{} keeps any tenant scope override untouched).
 *
 * Run: `npx tsx src/scripts/topup-role-permissions.ts` (from apps/api).
 * After running on a live server, restart the api process (perm cache).
 */
import { PrismaClient } from '@moysklad/db';
const prisma = new PrismaClient();
const NEW_ENTITIES = [
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
  'customerorder',
  'demand',
  'invoiceout',
  'salesreturn',
  'factureout',
  'commissionreport',
  'consignment',
  'purchaseorder',
  'supply',
  'invoicein',
  'purchasereturn',
  'facturein',
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'bankimport',
  'counterpartyadjustment',
  'prepayment',
  'prepaymentreturn',
  'move',
  'loss',
  'enter',
  'inventory',
  'internalorder',
  'pricelist',
  'bom',
  'workorder',
  'processingorder',
  'processing',
  'processingprocess',
  'processingstage',
  'payroll',
  'cashiersession',
  'retailsale',
  'saleschannel',
  'onlineorder',
  'pipeline',
  'opportunity',
  'call',
  'task',
  'tasktype',
  'attachment',
  'auditlog',
  'report',
  'analitika',
  'publication',
  'label',
  'settings',
  // Debts (Sherset KEEP — B3). MASTER-TODO #19 — bu skript ESKI DB'larni
  // davolaydi, shuning uchun ro'yxat union bilan to'liq mos bo'lishi shart.
  'debt',
  'debtpayment',
  'debtcardpayment',
  'debtreport',
];
const ACTIONS = ['view', 'create', 'update', 'delete', 'approve', 'print'];
const TEMPLATES: Record<string, Record<string, string>> = {
  Administrator: {
    view: 'ALL',
    create: 'ALL',
    update: 'ALL',
    delete: 'ALL',
    approve: 'ALL',
    print: 'ALL',
  },
  Manager: {
    view: 'ALL',
    create: 'ALL',
    update: 'OWN_GROUP',
    delete: 'OWN_GROUP',
    approve: 'OWN_GROUP',
    print: 'ALL',
  },
  Employee: {
    view: 'OWN_GROUP',
    create: 'ALL',
    update: 'OWN',
    delete: 'NO',
    approve: 'OWN',
    print: 'OWN_GROUP',
  },
  ReadOnly: { view: 'ALL', create: 'NO', update: 'NO', delete: 'NO', approve: 'NO', print: 'ALL' },
};
const roles = await prisma.role.findMany({
  where: { isSystem: true, name: { in: Object.keys(TEMPLATES) } },
  select: { id: true, name: true, accountId: true },
});
let created = 0;
for (const role of roles) {
  const defaults = TEMPLATES[role.name];
  if (!defaults) continue;
  for (const entity of NEW_ENTITIES) {
    for (const action of ACTIONS) {
      const scope = defaults[action] ?? 'NO';
      const res = await prisma.rolePermission.upsert({
        where: { roleId_entity_action: { roleId: role.id, entity, action } },
        update: {},
        create: { roleId: role.id, entity, action, scope },
      });
      if (res) created++;
    }
  }
}
console.log(`roles: ${roles.length}, rows ensured: ${created}`);
const check = await prisma.$queryRaw`
  SELECT r.name, rp.entity, rp.action, rp.scope FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  WHERE (rp.entity = 'currency' AND rp.action = 'view')
     OR (rp.entity = 'label' AND rp.action = 'create')
  ORDER BY rp.entity, r.name`;
console.log('spot-check (currency.view + label.create):', JSON.stringify(check));
await prisma.$disconnect();
