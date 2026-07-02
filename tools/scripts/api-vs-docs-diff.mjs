#!/usr/bin/env node
// Compare real API field set against the dev.moysklad.ru docs scrape.
// Surfaces fields that the live API exposes but the docs SPA omitted —
// these are the genuine "new findings" we'd otherwise miss.
//
// Output: docs/moysklad-reference/_api-vs-docs-new-fields.md

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const API_DIR = path.join(ROOT, 'docs/moysklad-reference/_api-real');
const ENTITY_DIR = path.join(ROOT, 'docs/moysklad-reference/data-model/entity-schemas');
const DOC_DIR = path.join(ROOT, 'docs/moysklad-reference/data-model/document-schemas');
const OUT_MD = path.join(ROOT, 'docs/moysklad-reference/_api-vs-docs-new-fields.md');

function extractApiFields(api) {
  if (!api?.sampleOk) return null;
  const sample = api.sample;
  const target = Array.isArray(sample.rows) ? sample.rows[0] : sample;
  if (!target || typeof target !== 'object') return null;
  return Object.keys(target);
}

function extractDocFields(doc) {
  const t0 = doc.tables?.[0];
  if (!t0?.fields) return [];
  return t0.fields.map((f) => f.name).filter(Boolean);
}

async function loadDocFields(slug) {
  // Try entity schemas first, then documents
  for (const dir of [ENTITY_DIR, DOC_DIR]) {
    try {
      const j = JSON.parse(await readFile(path.join(dir, `${slug}.json`), 'utf8'));
      return extractDocFields(j);
    } catch {}
  }
  // moysklad's API slug ↔ docs filename diff for some docs
  const altSlugs = {
    invoicein: 'invoice-in', invoiceout: 'invoice-out',
    paymentin: 'payment-in', paymentout: 'payment-out',
    salesreturn: 'sales-return', purchasereturn: 'purchase-return',
    purchaseorder: 'purchase', customerorder: 'customer',
    prepaymentreturn: 'prepayment-return',
    retailsalesreturn: 'retail-sales-return',
    internalorder: 'internal',
    bonustransaction: 'bonus-operation',
    contactperson: null, // nested under counterparty
  };
  if (altSlugs[slug] === null) return [];
  const alt = altSlugs[slug];
  if (alt) {
    for (const dir of [ENTITY_DIR, DOC_DIR]) {
      try {
        const j = JSON.parse(await readFile(path.join(dir, `${alt}.json`), 'utf8'));
        return extractDocFields(j);
      } catch {}
    }
  }
  return null;
}

async function main() {
  const files = (await readdir(API_DIR)).filter((f) => f.endsWith('.api.json'));
  const findings = [];

  for (const file of files) {
    const slug = file.replace(/\.api\.json$/, '');
    const api = JSON.parse(await readFile(path.join(API_DIR, file), 'utf8'));
    const apiFields = extractApiFields(api);
    if (!apiFields) continue;

    const docFields = await loadDocFields(slug);
    if (docFields === null) {
      findings.push({ slug, status: 'NO_DOCS', apiFields });
      continue;
    }
    const docSet = new Set(docFields);
    const inApiNotDocs = apiFields.filter((f) => !docSet.has(f));
    const inDocsNotApi = docFields.filter((f) => !apiFields.includes(f));
    findings.push({ slug, apiFields, docFields, inApiNotDocs, inDocsNotApi });
  }

  const md = ['# Real API vs docs scrape — gap surface\n'];
  md.push(`Generated: ${new Date().toISOString()}\n`);
  md.push('Three categories per slug:');
  md.push('1. **In API, not in docs** — genuine new findings, the docs SPA');
  md.push('   omitted these. Highest priority for schema additions.');
  md.push('2. **In docs, not in API** — possibly conditionally-loaded (need');
  md.push('   `?expand=...`) OR deprecated. Lower priority.');
  md.push('3. **Both** — already known.\n');

  // Sort: most "new findings" first
  findings.sort((a, b) => (b.inApiNotDocs?.length ?? 0) - (a.inApiNotDocs?.length ?? 0));

  md.push('## Slugs with new API-only fields\n');
  md.push('| Slug | API count | New in API | Doc-only (probable expand-required) |');
  md.push('|---|---:|---|---|');
  for (const f of findings) {
    if (f.status === 'NO_DOCS') continue;
    const newCnt = f.inApiNotDocs.length;
    const docOnlyCnt = f.inDocsNotApi.length;
    if (newCnt === 0 && docOnlyCnt === 0) continue;
    md.push(
      `| \`${f.slug}\` | ${f.apiFields.length} | ${newCnt > 0 ? f.inApiNotDocs.map((x) => `\`${x}\``).join(' ') : '—'} | ${docOnlyCnt}× |`,
    );
  }

  md.push('\n## Slugs without docs scrape (API-only)\n');
  for (const f of findings.filter((x) => x.status === 'NO_DOCS')) {
    md.push(`- \`${f.slug}\`: ${f.apiFields.length} API fields`);
    md.push('  ' + f.apiFields.map((x) => `\`${x}\``).join(' '));
  }

  md.push('\n## Detail per slug\n');
  for (const f of findings) {
    if (f.status === 'NO_DOCS') continue;
    if (f.inApiNotDocs.length === 0 && f.inDocsNotApi.length === 0) continue;
    md.push(`### \`${f.slug}\``);
    if (f.inApiNotDocs.length > 0) {
      md.push(`**Only in live API** (${f.inApiNotDocs.length}):`);
      md.push(f.inApiNotDocs.map((x) => `\`${x}\``).join(', '));
    }
    if (f.inDocsNotApi.length > 0) {
      md.push(`\n**Only in docs** (${f.inDocsNotApi.length}):`);
      md.push(f.inDocsNotApi.slice(0, 30).map((x) => `\`${x}\``).join(', '));
    }
    md.push('');
  }

  await writeFile(OUT_MD, md.join('\n'));
  console.log(`Found ${findings.filter((f) => f.inApiNotDocs?.length > 0).length} slugs with new API-only fields`);
  console.log(`Output: ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
