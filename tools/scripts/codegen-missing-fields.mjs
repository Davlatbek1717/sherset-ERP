#!/usr/bin/env node
// Codegen — for every existing Prisma model that maps to a captured moysklad
// schema, emit a Prisma snippet showing the fields that are missing, with
// proposed Prisma types translated from the moysklad type column.
//
// Output: docs/moysklad-reference/_codegen-missing-fields.md
//
// This is NOT auto-applied. It's a proposal for human review — the user
// then decides which to merge into packages/db/prisma/schema.prisma.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ENTITY_DIR = path.join(ROOT, 'docs/moysklad-reference/data-model/entity-schemas');
const DOC_DIR = path.join(ROOT, 'docs/moysklad-reference/data-model/document-schemas');
const PRISMA_PATH = path.join(ROOT, 'packages/db/prisma/schema.prisma');
const OUT_MD = path.join(ROOT, 'docs/moysklad-reference/_codegen-missing-fields.md');

// Mirror SLUG_TO_PRISMA from gap-report tool — kept in lock-step.
const SLUG_TO_PRISMA = {
  counterparty: 'Counterparty', product: 'Product', variant: 'Variant',
  productfolder: 'ProductFolder', organization: 'Organization', store: 'Store',
  retailstore: 'CashierSession', employee: 'Employee', role: 'Role',
  saleschannel: 'SalesChannel', pricetypes: 'PriceType', task: 'Task',
  cashier: 'Employee', files: 'Attachment', images: 'ProductImage',
  service: 'Product', processingplan: 'BillOfMaterials', eventfeed: 'AuditLog',
  customer: 'CustomerOrder', customerorder: 'CustomerOrder', demand: 'Demand',
  'invoice-out': 'InvoiceOut', 'invoice-in': 'InvoiceIn',
  'sales-return': 'SalesReturn', 'purchase-return': 'PurchaseReturn',
  purchase: 'PurchaseOrder', purchaseorder: 'PurchaseOrder', supply: 'Supply',
  'payment-in': 'PaymentIn', 'payment-out': 'PaymentOut',
  cashin: 'CashIn', cashout: 'CashOut', enter: 'Enter', loss: 'Loss',
  move: 'Move', inventory: 'Inventory', retaildemand: 'RetailSale',
  retailshift: 'CashierSession', production: 'WorkOrder',
  productionorder: 'WorkOrder',
};

function normaliseOurs(name) {
  return name.replace(/Id$/, '').replace(/Minor$/, '').replace(/At$/, '');
}

function mapType(moy) {
  if (!moy) return { prisma: 'String?', comment: 'unknown source type' };
  const t = moy.trim();

  // String with explicit length
  const sm = /^String\((\d+)\)$/.exec(t);
  if (sm) {
    const n = Number(sm[1]);
    if (n >= 4096) return { prisma: 'String? @db.Text', comment: '' };
    return { prisma: `String? @db.VarChar(${n})`, comment: '' };
  }

  // Plain string
  if (t === 'String') return { prisma: 'String?', comment: '' };

  // UUID
  if (t === 'UUID') return { prisma: 'String? @db.Uuid', comment: 'UUID' };

  // Boolean
  if (t === 'Boolean') return { prisma: 'Boolean @default(false)', comment: '' };

  // Numbers
  if (t === 'Int') return { prisma: 'Int?', comment: '' };
  if (t === 'Long' || t === 'Number')
    return { prisma: 'BigInt?', comment: 'Long' };
  if (t === 'Float' || t === 'Double')
    return { prisma: 'Decimal? @db.Decimal(15, 2)', comment: 'money — consider Minor (BigInt) if currency' };

  // Date
  if (t === 'DateTime')
    return { prisma: 'DateTime? @db.Timestamptz()', comment: '' };

  // Meta — reference to another entity
  if (t === 'Meta')
    return { prisma: 'String? @db.Uuid', comment: 'Meta — FK; needs explicit @relation + target' };
  if (t === 'MetaArray' || t === 'Array(Meta)')
    return { prisma: '/* relation [] */', comment: 'MetaArray — model the inverse relation' };

  // Object / Json
  if (t === 'Object' || t === 'Object(String)')
    return { prisma: 'Json?', comment: 'nested object' };

  // Arrays of primitives
  if (t === 'Array(String)') return { prisma: 'String[]', comment: '' };
  if (t === 'Array(Object)')
    return { prisma: 'Json?', comment: 'array of objects (e.g. attributes)' };

  // Enum — fall back to String + describe values in comment
  if (t === 'Enum') return { prisma: 'String?', comment: 'enum — see captured description for values' };

  // If type contains commas, it's an enum value list mistakenly captured as type
  if (t.includes(',')) {
    const vals = t.split(',').map((v) => v.trim()).slice(0, 6).join(', ');
    return { prisma: 'String?', comment: `enum-like — values: ${vals}${t.split(',').length > 6 ? ' ...' : ''}` };
  }

  // Anything else — annotate
  return { prisma: 'String?', comment: `unmapped moysklad type: "${t.slice(0, 60)}"` };
}

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

function describeFlags(flags) {
  if (!flags) return '';
  const parts = [];
  if (flags.required) parts.push('REQUIRED');
  if (flags.readOnly) parts.push('readonly');
  if (flags.requiredOnCreate) parts.push('required-on-create');
  if (flags.expandable) parts.push('expandable');
  if (flags.onDemand) parts.push('on-demand');
  if (flags.immutableAfterSet) parts.push('immutable-after-set');
  if (flags.regionTag) parts.push(`region=${flags.regionTag}`);
  return parts.join(', ');
}

function shortDesc(desc) {
  if (!desc) return '';
  return desc.replace(/\s+/g, ' ').replace(/Обязательное при.*$/, '').replace(/Только для чтения.*$/, '').trim().slice(0, 120);
}

async function main() {
  const prismaModels = await readPrismaModels();
  const sections = [];

  for (const [dirLabel, dir] of [['entity', ENTITY_DIR], ['document', DOC_DIR]]) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const slug = file.replace(/\.json$/, '');
      const prismaName = SLUG_TO_PRISMA[slug];
      if (!prismaName) continue;
      const prismaFields = prismaModels.get(prismaName);
      if (!prismaFields) continue;

      const json = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      const t0 = json.tables?.[0];
      if (!t0?.fields) continue;

      const oursNormalised = new Set();
      for (const f of prismaFields) oursNormalised.add(normaliseOurs(f));

      const missing = t0.fields.filter((f) => f.name && !oursNormalised.has(f.name));
      if (missing.length === 0) continue;

      const lines = [];
      lines.push(`## ${dirLabel}: \`${slug}\` → \`${prismaName}\``);
      lines.push(`Missing **${missing.length}** of ${t0.fields.length} captured fields.\n`);
      lines.push('```prisma');
      lines.push(`// Add to model ${prismaName} { ... }`);
      for (const f of missing) {
        const map = mapType(f.type);
        const flagStr = describeFlags(f.flags);
        const desc = shortDesc(f.description);
        const annot = [desc, flagStr, map.comment].filter(Boolean).join(' | ');
        if (annot) lines.push(`  // ${annot}`);
        lines.push(`  ${f.name} ${map.prisma}`);
      }
      lines.push('```');
      sections.push({ slug, prismaName, missingCount: missing.length, body: lines.join('\n') });
    }
  }

  sections.sort((a, b) => b.missingCount - a.missingCount);

  const md = [
    '# Codegen — missing fields per existing model',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'For each existing Prisma model that maps to a captured moysklad schema,',
    'this lists the captured fields that are NOT in our schema, with a proposed',
    'Prisma type translated from the moysklad type column.',
    '',
    '**Manual review required** — `Meta`/`MetaArray` need explicit `@relation`',
    'targets, money fields may want the `Minor` BigInt pattern, enum-like',
    'strings may want a real enum.',
    '',
    `**${sections.length}** models have missing fields, totalling **${sections.reduce(
      (s, x) => s + x.missingCount,
      0,
    )}** fields.`,
    '',
    '---',
    '',
    sections.map((s) => s.body).join('\n\n---\n\n'),
  ].join('\n');

  await writeFile(OUT_MD, md);
  console.log(`Wrote ${OUT_MD}`);
  console.log(`${sections.length} models with gaps, ${sections.reduce((s, x) => s + x.missingCount, 0)} total fields proposed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
