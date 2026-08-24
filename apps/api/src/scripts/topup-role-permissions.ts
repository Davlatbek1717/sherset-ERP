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
 * 2026-08-10 (`storecell` — omborchi yacheyka amallari): the loop below only
 * heals roles that are `isSystem:true` AND named Administrator/Manager/
 * Employee/ReadOnly. MK29 template roles (`templateSlug` — Omborchi, Ombor
 * menejeri, Kassir…) are created by `seed-role-templates.ts`, which does NOT
 * update an existing role's matrix without `--rewrite`. So a newly added
 * entity reached NOBODY: the feature shipped, the role 403'd. PASS 2 below
 * closes that gap — see `../modules/permissions/template-topup.ts`, whose
 * contract is ONE structural guard (the `TOPUP_ENTITIES` allow-list: anything
 * outside it is invisible, so a revoked entity can never be resurrected) plus
 * ONE behavioural rule («entity already touched ⇒ skip it entirely», which
 * gives both hand-tweak safety and idempotency).
 *
 * Run: `npx tsx src/scripts/topup-role-permissions.ts` (from apps/api).
 * After running on a live server, restart the api process (perm cache).
 */
import { PrismaClient } from '@moysklad/db';
import {
  ROLE_TEMPLATE_SLUGS,
  type RoleTemplateSlug,
} from '../modules/permissions/role-templates.js';
import { TOPUP_ENTITIES, missingTemplateCells } from '../modules/permissions/template-topup.js';
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
  'branch',
  'store',
  'storecell',
  'warehousenumbering',
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
  'retailcontrol',
  'returnacceptance',
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
  // HR ruxsatlari (MK27 — TZ §3.2). Eski DB'lar shu skript bilan davolanadi,
  // shuning uchun ro'yxat union bilan to'liq mos bo'lishi shart.
  'hrdashboard',
  'hrmessage',
  'hrmessagedemand',
  'hrmessageorder',
  'hrmessagepaymentin',
  'hrmessagesupply',
  'hrmessagereturn',
  'hrreport',
  'hremployee',
  'hrtask',
  'hrsalary',
  'hractivity',
  'hrsettings',
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
console.log(`PASS 1 (eski system rollar) — roles: ${roles.length}, rows ensured: ${created}`);

// ── PASS 2: MK29 shablon rollari (`templateSlug`) ──────────────────────────
// Faqat `TOPUP_ENTITIES` allow-listidagi entity'lar ko'riladi va faqat rolda
// UMUMAN ko'rilmagan entity'ga qator qo'shiladi — shartnoma va uning sababi
// `template-topup.ts` docblock'ida (tiriltirish xavfi).
const TEMPLATE_SLUGS = new Set<string>(ROLE_TEMPLATE_SLUGS);
const templateRoles = await prisma.role.findMany({
  where: { templateSlug: { not: null } },
  select: { id: true, name: true, templateSlug: true, permissions: true },
});
let tplCreated = 0;
let tplTouched = 0;
for (const role of templateRoles) {
  const slug = role.templateSlug;
  if (!slug || !TEMPLATE_SLUGS.has(slug)) continue;
  const missing = missingTemplateCells(slug as RoleTemplateSlug, TOPUP_ENTITIES, role.permissions);
  if (missing.length === 0) continue;
  // `count` — CHINAKAM yozilgan qatorlar soni. `missing.length` ni sanash
  // `skipDuplicates` tashlagan qatorlarni ham qo'shib yuborardi (log yolg'oni).
  const { count } = await prisma.rolePermission.createMany({
    data: missing.map((c) => ({
      roleId: role.id,
      entity: c.entity,
      action: c.action,
      scope: c.scope,
    })),
    skipDuplicates: true,
  });
  if (count === 0) continue;
  tplTouched++;
  tplCreated += count;
  console.log(
    `   + ${role.name} (${slug}): ${count} qator — ${[...new Set(missing.map((c) => c.entity))].join(', ')}`,
  );
}
console.log(
  `PASS 2 (MK29 shablon rollari) — roles: ${templateRoles.length}, touched: ${tplTouched}, rows created: ${tplCreated}`,
);
const check = await prisma.$queryRaw`
  SELECT r.name, rp.entity, rp.action, rp.scope FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  WHERE (rp.entity = 'currency' AND rp.action = 'view')
     OR (rp.entity = 'label' AND rp.action = 'create')
     OR (rp.entity = 'storecell' AND rp.action = 'update')
  ORDER BY rp.entity, r.name`;
console.log('spot-check (currency.view + label.create + storecell.update):', JSON.stringify(check));
await prisma.$disconnect();
