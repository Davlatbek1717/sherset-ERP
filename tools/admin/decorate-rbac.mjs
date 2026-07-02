#!/usr/bin/env node
/**
 * Sprint 17.3 — bulk-decorate controllers with @RequirePermission.
 *
 * For each controller without RequirePermission, walks through each route
 * handler and inserts the decorator with the right (entity, action) pair.
 * Action is inferred from HTTP verb + method name.
 *
 * Idempotent: re-running on already-decorated handlers is a no-op (the
 * import-detection guard skips them).
 *
 * Usage: node tools/admin/decorate-rbac.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Map controller file path → permission entity slug (from PermissionEntity).
// Controllers that should NOT be auto-decorated (auth public, compat, raw
// reference data) are absent from this map.
const ENTITY_MAP = {
  'app-install/app-install.controller.ts': 'settings',
  'attachment/attachment.controller.ts': 'attachment',
  'attribute-metadata/attribute-metadata.controller.ts': 'settings',
  'audit-log/audit-log.controller.ts': 'auditlog',
  'bank-import/bank-import.controller.ts': 'bankimport',
  'bom/bom.controller.ts': 'bom',
  'bundle/bundle.controller.ts': 'bundle',
  'call/call.controller.ts': 'call',
  'cash-desk/cash-desk.controller.ts': 'cashdesk',
  'cash-in/cash-in.controller.ts': 'cashin',
  'cash-out/cash-out.controller.ts': 'cashout',
  'cashier-session/cashier-session.controller.ts': 'cashiersession',
  'contact-person/contact-person.controller.ts': 'contactperson',
  'email/email.controller.ts': 'settings',
  'enter/enter.controller.ts': 'enter',
  'exchange-rate/exchange-rate.controller.ts': 'exchangerate',
  'image/image.controller.ts': 'attachment',
  'inventory/inventory.controller.ts': 'inventory',
  'invoice-in/invoice-in.controller.ts': 'invoicein',
  'loss/loss.controller.ts': 'loss',
  'move/move.controller.ts': 'move',
  'mxik/mxik.controller.ts': 'mxik',
  'notification/notification.controller.ts': 'settings',
  'online-order/online-order.controller.ts': 'onlineorder',
  'opportunity/opportunity.controller.ts': 'opportunity',
  'organization-account/organization-account.controller.ts': 'bankaccount',
  'organization/organization.controller.ts': 'organization',
  'pipeline/pipeline.controller.ts': 'pipeline',
  'price-type/price-type.controller.ts': 'pricetype',
  'product-folder/product-folder.controller.ts': 'productfolder',
  'product/product.controller.ts': 'product',
  'purchase-order/purchase-order.controller.ts': 'purchaseorder',
  'purchase-return/purchase-return.controller.ts': 'purchasereturn',
  'report/report.controller.ts': 'report',
  'sales-channel/sales-channel.controller.ts': 'saleschannel',
  'store/store.controller.ts': 'store',
  'supply/supply.controller.ts': 'supply',
  'task/task.controller.ts': 'task',
  'variant/variant.controller.ts': 'variant',
  'webhook/webhook-stock.controller.ts': 'settings',
  'webhook/webhook.controller.ts': 'settings',
  'work-order/work-order.controller.ts': 'workorder',
};

// Skipped (left unprotected on purpose):
//   auth/auth.controller.ts — public endpoints (login/register/refresh)
//   moysklad-compat/moysklad-compat.controller.ts — separate api-token auth
//   permissions/permissions.controller.ts — admin-only, special-cased manually
//   reference/reference.controller.ts — generic shared dropdowns, view by all
//   stock/stock.controller.ts — read-only, derived data

/** Classify an HTTP route handler into a permission action. */
function classifyAction(httpVerb, methodName, routePath) {
  const m = methodName.toLowerCase();
  const path = (routePath ?? '').toLowerCase();
  if (path.includes('transition') || m.includes('transition') || m.includes('post(')) {
    return 'approve';
  }
  if (httpVerb === 'Get') return 'view';
  if (httpVerb === 'Patch' || httpVerb === 'Put') return 'update';
  if (httpVerb === 'Delete' || m.includes('bulkdelete')) return 'delete';
  if (httpVerb === 'Post') {
    if (m.includes('bulktransition')) return 'approve';
    if (m.includes('bulkdelete')) return 'delete';
    return 'create';
  }
  return 'view';
}

const HTTP_DECORATOR_RE = /^(\s*)@(Get|Post|Patch|Put|Delete)\((?:'([^']*)'|"([^"]*)"|([^)]*))?\)$/;

function decorate(filePath, entity) {
  const src = readFileSync(filePath, 'utf8');
  if (src.includes('RequirePermission')) {
    return { skipped: true, reason: 'already decorated' };
  }

  const lines = src.split('\n');
  const out = [];
  let added = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    const match = line.match(HTTP_DECORATOR_RE);
    if (!match) continue;
    const [, indent, verb, q1, q2, raw] = match;
    const routePath = q1 ?? q2 ?? raw ?? '';
    // Look ahead to the method name (next non-decorator line containing `(`)
    let methodName = '';
    for (let j = i + 1; j < lines.length && j < i + 5; j++) {
      const next = lines[j];
      if (next.trim().startsWith('@')) continue;
      const nameMatch = next.match(/(?:async\s+)?(\w+)\s*\(/);
      if (nameMatch) {
        methodName = nameMatch[1];
        break;
      }
    }
    const action = classifyAction(verb, methodName, routePath);
    out.push(`${indent}@RequirePermission({ entity: '${entity}', action: '${action}' })`);
    added++;
  }

  // Insert RequirePermission import after JwtAuthGuard import.
  const importLine =
    "import { RequirePermission } from '../permissions/require-permission.decorator.js';";
  const updated = out.join('\n');
  const finalSrc = updated.replace(
    /(import \{ JwtAuthGuard \} from '\.\.\/auth\/jwt-auth\.guard\.js';\n)/,
    `$1${importLine}\n`,
  );

  writeFileSync(filePath, finalSrc, 'utf8');
  return { skipped: false, added };
}

const root = resolve(process.cwd(), 'apps/api/src/modules');
let totalDecorated = 0;
let totalSkipped = 0;
for (const [rel, entity] of Object.entries(ENTITY_MAP)) {
  const path = resolve(root, rel);
  const result = decorate(path, entity);
  if (result.skipped) {
    console.log(`[skip] ${rel} (${result.reason})`);
    totalSkipped++;
  } else {
    console.log(`[ok]   ${rel} (entity=${entity}, +${result.added} decorators)`);
    totalDecorated += result.added;
  }
}
console.log(
  `\nDone — decorated ${totalDecorated} endpoints across ${Object.keys(ENTITY_MAP).length - totalSkipped} files.`,
);
