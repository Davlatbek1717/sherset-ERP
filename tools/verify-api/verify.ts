#!/usr/bin/env tsx
/**
 * Live API entity verification (v2).
 *
 * For each entity schema JSON, fetch an actual record from Moysklad API
 * (or the list endpoint with limit=1) and compare the actual fields present
 * in the response against our documented schema.
 *
 * Why not /metadata?  /metadata only returns custom attributes configured
 * per account — not the base schema. The real fields are seen in actual
 * entity responses.
 *
 * Produces: docs/moysklad-reference/data-model/_verification-report.json
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SCHEMAS_DIR = path.join(REPO_ROOT, 'docs/moysklad-reference/data-model');
const REPORT_FILE = path.join(SCHEMAS_DIR, '_verification-report.json');

const API_BASE = 'https://api.moysklad.ru/api/remap/1.2';
const COMMON_HEADERS = {
  Accept: 'application/json;charset=utf-8',
} as const;

interface VerificationResult {
  slug: string;
  normalizedSlug: string;
  status: 'verified' | 'partial' | 'empty_account' | 'not_found' | 'error';
  observedFields?: string[];
  ourFields?: string[];
  missingInApi?: string[];
  newInApi?: string[];
  httpStatus?: number;
  error?: string;
}

/** Map our filename slug → Moysklad API slug (usually lowercase, no hyphens) */
function normalizeSlug(fileSlug: string): string {
  const map: Record<string, string> = {
    'invoice-in': 'invoicein',
    'invoice-out': 'invoiceout',
    'payment-in': 'paymentin',
    'payment-out': 'paymentout',
    'prepayment-return': 'prepaymentreturn',
    'purchase-return': 'purchasereturn',
    'sales-return': 'salesreturn',
    'retail-sales-return': 'retailsalesreturn',
    'assortment-legacy': 'assortment',
    'bonus-operation': 'bonustransaction',
    'tracking-code': 'emissionorder', // tracking-code embedded in emissionorder
  };
  return map[fileSlug] ?? fileSlug.replace(/-/g, '').toLowerCase();
}

/** Some entities don't have their own /entity/<slug>/ endpoint */
const SKIP_SLUGS = new Set([
  'webhookstock', // part of webhook
  'tracking-code', // embedded; no own endpoint
]);

async function main(): Promise<void> {
  const token = process.env.MOYSKLAD_API_TOKEN;
  if (!token) {
    console.error('ERROR: MOYSKLAD_API_TOKEN env var not set.');
    process.exit(1);
  }

  const entityFiles = (await readdir(path.join(SCHEMAS_DIR, 'entity-schemas')))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ kind: 'entity', path: path.join(SCHEMAS_DIR, 'entity-schemas', f), file: f }));
  const docFiles = (await readdir(path.join(SCHEMAS_DIR, 'document-schemas')))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      kind: 'document',
      path: path.join(SCHEMAS_DIR, 'document-schemas', f),
      file: f,
    }));

  const allFiles = [...entityFiles, ...docFiles];
  console.log(`Verifying ${allFiles.length} schemas via live entity listing...`);
  console.log();

  const results: VerificationResult[] = [];

  for (const { path: filePath, file } of allFiles) {
    const slug = file.replace('.json', '');
    const normalizedSlug = normalizeSlug(slug);
    process.stdout.write(`  ${slug.padEnd(28)}`);

    if (SKIP_SLUGS.has(slug)) {
      console.log('SKIPPED (embedded)');
      results.push({
        slug,
        normalizedSlug,
        status: 'not_found',
        error: 'Embedded / no own endpoint',
      });
      continue;
    }

    try {
      const ourSchema = JSON.parse(await readFile(filePath, 'utf8'));
      const ourFields = new Set<string>(
        (ourSchema.tables?.[0]?.fields ?? []).map((f: { name: string }) => f.name),
      );

      // Try list endpoint with limit=1
      const url = `${API_BASE}/entity/${normalizedSlug}/?limit=1`;
      const res = await fetch(url, {
        headers: {
          ...COMMON_HEADERS,
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 404) {
        console.log(`NOT FOUND (404) slug=${normalizedSlug}`);
        results.push({ slug, normalizedSlug, status: 'not_found', httpStatus: 404 });
        await sleep(150);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        console.log(`HTTP ${res.status}: ${text.slice(0, 60)}`);
        results.push({
          slug,
          normalizedSlug,
          status: 'error',
          httpStatus: res.status,
          error: text.slice(0, 200),
        });
        await sleep(300);
        continue;
      }

      const body = (await res.json()) as { rows?: unknown[]; meta?: unknown };
      const rows = body.rows ?? [];

      if (!rows.length) {
        // Account has no records — we can't see fields. Try POST with empty body to trigger validation (shows required fields)
        console.log('EMPTY (no records on account)');
        results.push({
          slug,
          normalizedSlug,
          status: 'empty_account',
          ourFields: [...ourFields],
        });
        await sleep(150);
        continue;
      }

      const sampleRow = rows[0] as Record<string, unknown>;
      const apiFields = new Set<string>(Object.keys(sampleRow));

      const missingInApi: string[] = [];
      const newInApi: string[] = [];
      for (const f of ourFields) if (!apiFields.has(f)) missingInApi.push(f);
      for (const f of apiFields) if (!ourFields.has(f)) newInApi.push(f);

      const status = missingInApi.length === 0 && newInApi.length === 0 ? 'verified' : 'partial';
      console.log(`${status.toUpperCase()} (+${newInApi.length}, -${missingInApi.length})`);

      results.push({
        slug,
        normalizedSlug,
        status,
        observedFields: [...apiFields].sort(),
        ourFields: [...ourFields].sort(),
        missingInApi,
        newInApi,
      });
      await sleep(150);
    } catch (e) {
      console.log(`ERROR: ${(e as Error).message}`);
      results.push({ slug, normalizedSlug, status: 'error', error: (e as Error).message });
    }
  }

  const summary = {
    total: results.length,
    verified: results.filter((r) => r.status === 'verified').length,
    partial: results.filter((r) => r.status === 'partial').length,
    emptyAccount: results.filter((r) => r.status === 'empty_account').length,
    notFound: results.filter((r) => r.status === 'not_found').length,
    error: results.filter((r) => r.status === 'error').length,
  };

  await writeFile(
    REPORT_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2),
    'utf8',
  );

  console.log();
  console.log('Summary:');
  console.log(`  Verified:       ${summary.verified}`);
  console.log(`  Partial (drift):${summary.partial}`);
  console.log(`  Empty account:  ${summary.emptyAccount} (no records — can't verify from list)`);
  console.log(`  Not found:      ${summary.notFound}`);
  console.log(`  Errors:         ${summary.error}`);
  console.log(`\nReport: ${REPORT_FILE}`);

  if (summary.partial > 0) {
    console.log('\nPartial (drift) details — first 5:');
    for (const r of results.filter((r) => r.status === 'partial').slice(0, 5)) {
      console.log(`  ${r.slug}:`);
      if (r.newInApi?.length) console.log(`    + new in API: ${r.newInApi.slice(0, 8).join(', ')}`);
      if (r.missingInApi?.length)
        console.log(`    - missing in API: ${r.missingInApi.slice(0, 8).join(', ')}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
