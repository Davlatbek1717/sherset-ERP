#!/usr/bin/env node
// Field-level diff between the **real moysklad API** sample responses
// (fetched by api-fetch-real.mjs) and our Prisma schema.
//
// Why this beats the gap-report-against-docs:
//   - dev.moysklad.ru SPA scrape misses fields conditionally returned
//   - dev docs sometimes describe deprecated names; live API is canonical
//   - API metadata reveals what custom attributes the tenant has
//
// Output: docs/moysklad-reference/_api-vs-prisma.md

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const API_DIR = path.join(ROOT, 'docs/moysklad-reference/_api-real');
const PRISMA_PATH = path.join(ROOT, 'packages/db/prisma/schema.prisma');
const OUT_MD = path.join(ROOT, 'docs/moysklad-reference/_api-vs-prisma.md');

// Slug → Prisma model. Mirrors the gap-report SLUG_TO_PRISMA, kept in
// sync deliberately — duplicating saves a require dance.
const SLUG_TO_PRISMA = {
  product: 'Product', service: 'Product', bundle: 'Product', variant: 'Variant',
  productfolder: 'ProductFolder', consignment: 'Consignment',
  counterparty: 'Counterparty', contactperson: 'ContactPerson',
  contract: 'Contract', organization: 'Organization', employee: 'Employee',
  group: 'Group', role: 'Role', project: 'Project',
  saleschannel: 'SalesChannel', pricetype: 'PriceType',
  currency: 'Currency', country: 'Country', region: 'Region',
  taxrate: 'TaxRate', uom: 'Uom', expenseitem: 'ExpenseItem',
  discount: 'Discount', customentity: 'CustomEntity',
  store: 'Store', retailstore: 'RetailStore', cashier: 'Employee',
  task: 'Task', webhook: 'Webhook', webhookstock: 'WebhookStock',
  companysettings: 'CompanySettings', usersettings: 'UserSettings',
  bonusprogram: 'BonusProgram', bonustransaction: 'BonusOperation',
  processingplan: 'BillOfMaterials', processingplanfolder: 'ProcessingPlanFolder',
  processingprocess: 'ProcessingProcess', processingstage: 'ProcessingStage',
  // documents
  customerorder: 'CustomerOrder', demand: 'Demand',
  invoiceout: 'InvoiceOut', invoicein: 'InvoiceIn',
  salesreturn: 'SalesReturn', purchasereturn: 'PurchaseReturn',
  purchaseorder: 'PurchaseOrder', supply: 'Supply',
  paymentin: 'PaymentIn', paymentout: 'PaymentOut',
  cashin: 'CashIn', cashout: 'CashOut',
  enter: 'Enter', loss: 'Loss', move: 'Move', inventory: 'Inventory',
  retaildemand: 'RetailSale', retailshift: 'CashierSession',
  retaildrawercashin: 'RetailDrawerCashIn',
  retaildrawercashout: 'RetailDrawerCashOut',
  retailsalesreturn: 'RetailSalesReturn',
  prepayment: 'Prepayment', prepaymentreturn: 'PrepaymentReturn',
  internalorder: 'InternalOrder',
  counterpartyadjustment: 'CounterpartyAdjustment',
  pricelist: 'PriceList',
  commissionreportin: 'CommissionReportIn',
  commissionreportout: 'CommissionReportOut',
  factureout: 'FactureOut', facturein: 'FactureIn',
  production: 'Production', processingorder: 'ProcessingOrder',
  processing: 'Processing',
  emissionorder: 'EmissionOrder', markingcodeorder: 'MarkingCodeOrder',
  retireorder: 'RetireOrder',
};

// Aliases used by gap-report to translate moysklad's names to ours.
// We re-declare the must-haves here.
const ALIAS = {
  Counterparty: { accounts: 'bankAccounts', contactpersons: 'contactPersons', files: '_skip', notes: 'calls', mod__requisites__uz: 'uzRequisites', meta: '_skip' },
  Currency: { rate: 'rateValue', meta: '_skip' },
  Demand: { rate: 'rateValue', payedSum: 'payedSumMinor', overhead: 'overheadSumMinor', files: '_skip', meta: '_skip' },
  CustomerOrder: { rate: 'rateValue', payedSum: 'payedSumMinor', invoicedSum: 'invoicedSumMinor', reservedSum: 'reservedSumMinor', shippedSum: 'shippedSumMinor', files: '_skip', meta: '_skip' },
  // Add more as needed; the diff still works without — just shows extra
  // "missing" entries which are then easy to manually classify.
};

async function readPrismaModels() {
  const src = await readFile(PRISMA_PATH, 'utf8');
  const models = new Map();
  const re = /^model (\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const fields = new Set();
    for (const line of m[2].split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
      const fm = /^(\w+)\s+/.exec(t);
      if (fm) fields.add(fm[1]);
    }
    models.set(m[1], fields);
  }
  return models;
}

function normalise(name) {
  return name.replace(/Id$/, '').replace(/Minor$/, '').replace(/At$/, '');
}

function extractApiFields(api) {
  if (!api?.sampleOk) return null;
  const sample = api.sample;
  const target = Array.isArray(sample.rows) ? sample.rows[0] : sample;
  if (!target || typeof target !== 'object') return null;
  return Object.keys(target);
}

async function main() {
  const prismaModels = await readPrismaModels();
  const files = (await readdir(API_DIR)).filter((f) => f.endsWith('.api.json'));

  const rows = [];
  for (const file of files) {
    const slug = file.replace(/\.api\.json$/, '');
    const api = JSON.parse(await readFile(path.join(API_DIR, file), 'utf8'));
    const apiFields = extractApiFields(api);
    if (!apiFields) {
      rows.push({ slug, status: 'NO_SAMPLE', reason: api.sampleError?.slice(0, 80) });
      continue;
    }
    const prismaName = SLUG_TO_PRISMA[slug];
    if (!prismaName) {
      rows.push({ slug, status: 'NOT_MAPPED', apiFields: apiFields.length });
      continue;
    }
    const prismaFields = prismaModels.get(prismaName);
    if (!prismaFields) {
      rows.push({ slug, status: 'PRISMA_MISSING', model: prismaName });
      continue;
    }
    const prismaNorm = new Set([...prismaFields].map(normalise));
    const aliasMap = ALIAS[prismaName] ?? {};
    const missing = [];
    const present = [];
    for (const f of apiFields) {
      const al = aliasMap[f];
      if (al === '_skip') {
        present.push(f);
        continue;
      }
      const target = al ?? f;
      if (prismaNorm.has(target) || prismaFields.has(target)) present.push(f);
      else missing.push(f);
    }
    rows.push({
      slug,
      status: missing.length === 0 ? 'OK' : 'PARTIAL',
      model: prismaName,
      apiCount: apiFields.length,
      present: present.length,
      missing,
    });
  }

  rows.sort((a, b) => {
    if (a.status === 'OK' && b.status !== 'OK') return 1;
    if (b.status === 'OK' && a.status !== 'OK') return -1;
    return (b.missing?.length ?? 0) - (a.missing?.length ?? 0);
  });

  const md = ['# moysklad real-API vs our Prisma schema\n'];
  md.push(`Generated: ${new Date().toISOString()}\n`);
  md.push(`Compared **${rows.length}** slugs against the live moysklad tenant.\n`);

  const ok = rows.filter((r) => r.status === 'OK').length;
  const partial = rows.filter((r) => r.status === 'PARTIAL').length;
  const noSample = rows.filter((r) => r.status === 'NO_SAMPLE').length;
  md.push(`- ✅ Match: **${ok}**`);
  md.push(`- ⚠️ Partial: **${partial}**`);
  md.push(`- ❌ No sample (404 / endpoint shape differs): **${noSample}**\n`);

  md.push('## Per-slug results\n');
  md.push('| Status | Slug | Model | API fields | Present | Missing |');
  md.push('|---|---|---|---:|---:|---|');
  for (const r of rows) {
    if (r.status === 'NO_SAMPLE') {
      md.push(`| ❌ | \`${r.slug}\` | — | — | — | ${r.reason ?? ''} |`);
      continue;
    }
    if (r.status === 'NOT_MAPPED') {
      md.push(`| 🔵 | \`${r.slug}\` | (no Prisma model) | ${r.apiCount} | — | — |`);
      continue;
    }
    if (r.status === 'PRISMA_MISSING') {
      md.push(`| 🔴 | \`${r.slug}\` | ${r.model} (not found in schema) | — | — | — |`);
      continue;
    }
    md.push(
      `| ${r.status === 'OK' ? '✅' : '⚠️'} | \`${r.slug}\` | ${r.model} | ${r.apiCount} | ${r.present} | ${(r.missing ?? []).map((f) => `\`${f}\``).join(', ')} |`,
    );
  }

  await writeFile(OUT_MD, md.join('\n'));
  console.log(`\nDone. ${ok}/${rows.length} matched, ${partial} partial.`);
  console.log(`See ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
