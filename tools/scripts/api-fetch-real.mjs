#!/usr/bin/env node
// Fetch real moysklad API responses for every entity / document slug,
// then diff field-by-field against our Prisma schema.
//
// Output: docs/moysklad-reference/_api-real/
//   - <slug>.metadata.json    — moysklad's own metadata describing the entity
//   - <slug>.sample.json      — one row from the live tenant (production
//                               data shape, including conditionally-present
//                               fields the docs scrape can miss)
//   - _api-coverage.md        — summary diff vs our Prisma schema
//
// Usage:
//   MOYSKLAD_TOKEN=xxxx node tools/scripts/api-fetch-real.mjs
//   (token can also live in tools/scripts/.api-token — gitignored)

import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TOKEN_FILE = path.join(__dirname, '.api-token');
const OUT_DIR = path.join(ROOT, 'docs/moysklad-reference/_api-real');
const ENTITY_DIR = path.join(ROOT, 'docs/moysklad-reference/data-model/entity-schemas');
const DOC_DIR = path.join(ROOT, 'docs/moysklad-reference/data-model/document-schemas');
const PRISMA = path.join(ROOT, 'packages/db/prisma/schema.prisma');

const BASE = 'https://api.moysklad.ru/api/remap/1.2';

async function getToken() {
  if (process.env.MOYSKLAD_TOKEN) return process.env.MOYSKLAD_TOKEN.trim();
  try {
    return (await readFile(TOKEN_FILE, 'utf8')).trim();
  } catch {
    throw new Error(
      `MOYSKLAD_TOKEN not set. Either export it or write it to ${TOKEN_FILE}`,
    );
  }
}

async function callApi(token, endpoint) {
  const url = `${BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Encoding': 'gzip',
      Accept: 'application/json;charset=utf-8',
    },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, error: await res.text() };
  }
  // Manually gunzip if the server returned compressed body and the
  // runtime didn't auto-decompress.
  const ct = res.headers.get('content-encoding');
  let text;
  if (ct === 'gzip') {
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      text = gunzipSync(buf).toString('utf8');
    } catch {
      text = buf.toString('utf8');
    }
  } else {
    text = await res.text();
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: true, data: text };
  }
}

// Slugs we want to introspect. Mostly the same set as the captured
// schemas, plus a few extra for completeness.
const ENTITY_SLUGS = [
  'product', 'service', 'bundle', 'variant', 'productfolder', 'consignment',
  'counterparty', 'contactperson', 'contract', 'organization', 'employee',
  'group', 'role', 'project', 'saleschannel', 'pricetype', 'currency', 'country',
  'region', 'taxrate', 'uom', 'expenseitem', 'discount', 'customentity',
  'store', 'retailstore', 'cashier', 'task', 'webhook', 'webhookstock',
  'companysettings', 'usersettings', 'bonusprogram', 'bonustransaction',
  'processingplan', 'processingplanfolder', 'processingprocess', 'processingstage',
  'attributemetadata',
];

const DOC_SLUGS = [
  'customerorder', 'demand', 'invoiceout', 'salesreturn',
  'purchaseorder', 'invoicein', 'supply', 'purchasereturn',
  'paymentin', 'paymentout', 'cashin', 'cashout',
  'enter', 'loss', 'move', 'inventory',
  'retaildemand', 'retailshift', 'retaildrawercashin', 'retaildrawercashout',
  'retailsalesreturn',
  'prepayment', 'prepaymentreturn', 'internalorder', 'counterpartyadjustment',
  'pricelist', 'commissionreportin', 'commissionreportout',
  'factureout', 'facturein',
  'production', 'processingorder', 'processing',
  'emissionorder', 'markingcodeorder', 'retireorder',
  'crptdemand', // marking-aware demand variant
];

async function fetchOne(token, kind, slug) {
  const out = { kind, slug, metadataOk: false, sampleOk: false };

  // Metadata describes ALL the fields including custom attributes
  const metaRes = await callApi(token, `/entity/${slug}/metadata`);
  if (metaRes.ok) {
    out.metadataOk = true;
    out.metadata = metaRes.data;
  } else {
    out.metadataError = `${metaRes.status}: ${(metaRes.error || '').slice(0, 200)}`;
  }

  // Sample row — the actual JSON shape the API returns. Some entities
  // have no public list endpoint (e.g. companysettings is singular),
  // we handle 404 by trying the singular path.
  let sampleRes = await callApi(token, `/entity/${slug}?limit=1`);
  if (!sampleRes.ok && sampleRes.status === 404) {
    sampleRes = await callApi(token, `/entity/${slug}`);
  }
  if (sampleRes.ok) {
    out.sampleOk = true;
    out.sample = sampleRes.data;
  } else {
    out.sampleError = `${sampleRes.status}: ${(sampleRes.error || '').slice(0, 200)}`;
  }

  return out;
}

function extractSampleFields(sample) {
  if (!sample) return [];
  // Lists return { rows: [...] }; singletons return the object itself.
  const target = Array.isArray(sample.rows) ? sample.rows[0] : sample;
  if (!target || typeof target !== 'object') return [];
  return Object.keys(target);
}

async function main() {
  const token = await getToken();
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching ${ENTITY_SLUGS.length} entities + ${DOC_SLUGS.length} documents…`);

  const results = [];
  let i = 0;
  const total = ENTITY_SLUGS.length + DOC_SLUGS.length;

  for (const slug of ENTITY_SLUGS) {
    i++;
    process.stdout.write(`\r[${i}/${total}] entity:${slug}                       `);
    const r = await fetchOne(token, 'entity', slug);
    results.push(r);
    await writeFile(path.join(OUT_DIR, `${slug}.api.json`), JSON.stringify(r, null, 2));
    await new Promise((r) => setTimeout(r, 250)); // rate-limit polite gap
  }
  for (const slug of DOC_SLUGS) {
    i++;
    process.stdout.write(`\r[${i}/${total}] document:${slug}                       `);
    const r = await fetchOne(token, 'document', slug);
    results.push(r);
    await writeFile(path.join(OUT_DIR, `${slug}.api.json`), JSON.stringify(r, null, 2));
    await new Promise((r) => setTimeout(r, 250));
  }
  process.stdout.write('\n');

  // Build coverage doc — for each slug, list the live API field names.
  const md = ['# Real moysklad API field inventory', ''];
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push('');
  md.push(`Token: live read against the **CLIMART SNATEXNIKA DO'KONI** tenant.`);
  md.push('Each row shows the fields the API actually returns — this is the');
  md.push('ground truth that supersedes the dev.moysklad.ru docs scrape.');
  md.push('');
  md.push('| Slug | Kind | Metadata | Sample | Field count | Notes |');
  md.push('|---|---|---|---|---:|---|');
  for (const r of results) {
    const fields = extractSampleFields(r.sample);
    const note = r.sampleError ? `❌ sample: ${r.sampleError.slice(0, 80)}` : '';
    md.push(
      `| \`${r.slug}\` | ${r.kind} | ${r.metadataOk ? '✓' : '❌'} | ${r.sampleOk ? '✓' : '❌'} | ${fields.length} | ${note} |`,
    );
  }
  md.push('');
  md.push('## Per-slug field lists');
  md.push('');
  for (const r of results) {
    if (!r.sampleOk) continue;
    const fields = extractSampleFields(r.sample);
    md.push(`### ${r.kind}/${r.slug} (${fields.length} fields)`);
    md.push('');
    md.push(fields.map((f) => `\`${f}\``).join(', '));
    md.push('');
  }
  await writeFile(path.join(OUT_DIR, '_api-coverage.md'), md.join('\n'));

  // Summary
  const okMeta = results.filter((r) => r.metadataOk).length;
  const okSample = results.filter((r) => r.sampleOk).length;
  console.log(`\n=== Done ===`);
  console.log(`metadata fetched: ${okMeta}/${results.length}`);
  console.log(`sample fetched: ${okSample}/${results.length}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
