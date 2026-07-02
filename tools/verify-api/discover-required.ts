#!/usr/bin/env tsx
/**
 * Discover required fields per entity by POST'ing empty body.
 *
 * For entities where the account has no records (so we can't verify
 * fields from a list), we POST {} and parse the validation errors from
 * the API response. The errors enumerate required fields.
 *
 * Output: docs/moysklad-reference/data-model/_required-fields.json
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_FILE = path.join(
  REPO_ROOT,
  'docs/moysklad-reference/data-model/_required-fields.json',
);

const API_BASE = 'https://api.moysklad.ru/api/remap/1.2';
const HEADERS = {
  Accept: 'application/json;charset=utf-8',
  'Content-Type': 'application/json;charset=utf-8',
} as const;

const SLUG_MAP: Record<string, string> = {
  'invoice-in': 'invoicein',
  'invoice-out': 'invoiceout',
  'payment-in': 'paymentin',
  'payment-out': 'paymentout',
  'prepayment-return': 'prepaymentreturn',
  'purchase-return': 'purchasereturn',
  'sales-return': 'salesreturn',
  'retail-sales-return': 'retailsalesreturn',
  internal: 'internalorder',
  production: 'productionorder', // try; might fail
};

function normalizeSlug(s: string): string {
  return SLUG_MAP[s] ?? s.replace(/-/g, '').toLowerCase();
}

interface Result {
  slug: string;
  normalizedSlug: string;
  status: 'discovered' | 'no_validation_info' | 'error';
  requiredFields?: string[];
  errors?: { code: number; message: string; parameter?: string }[];
  httpStatus?: number;
}

async function main(): Promise<void> {
  const token = process.env.MOYSKLAD_API_TOKEN;
  if (!token) {
    console.error('ERROR: MOYSKLAD_API_TOKEN not set');
    process.exit(1);
  }

  // Load verification report to know which slugs to retry
  const verifyReport = JSON.parse(
    await readFile(
      path.join(REPO_ROOT, 'docs/moysklad-reference/data-model/_verification-report.json'),
      'utf8',
    ),
  );

  const targets: string[] = verifyReport.results
    .filter(
      (r: { status: string; slug: string }) => r.status === 'empty_account' || r.status === 'error',
    )
    .map((r: { slug: string }) => r.slug);

  console.log(`POST-empty discovery for ${targets.length} entities...`);
  console.log();

  const results: Result[] = [];

  for (const slug of targets) {
    const normalizedSlug = normalizeSlug(slug);
    process.stdout.write(`  ${slug.padEnd(28)}`);

    try {
      const res = await fetch(`${API_BASE}/entity/${normalizedSlug}/`, {
        method: 'POST',
        headers: { ...HEADERS, Authorization: `Bearer ${token}` },
        body: '{}',
      });

      const text = await res.text();
      let body: { errors?: { code: number; error: string; parameter?: string }[] };
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }

      if (!body.errors || !body.errors.length) {
        console.log(`HTTP ${res.status}: no errors info`);
        results.push({
          slug,
          normalizedSlug,
          status: 'no_validation_info',
          httpStatus: res.status,
        });
        await sleep(150);
        continue;
      }

      const requiredFields: string[] = [];
      const errors = body.errors.map((e) => {
        if (e.parameter) requiredFields.push(e.parameter);
        return { code: e.code, message: e.error, parameter: e.parameter };
      });

      console.log(
        `OK — ${requiredFields.length} required fields: ${requiredFields.slice(0, 5).join(', ')}${requiredFields.length > 5 ? '...' : ''}`,
      );
      results.push({
        slug,
        normalizedSlug,
        status: requiredFields.length > 0 ? 'discovered' : 'no_validation_info',
        requiredFields: [...new Set(requiredFields)],
        errors,
        httpStatus: res.status,
      });
      await sleep(150);
    } catch (e) {
      console.log(`ERROR: ${(e as Error).message}`);
      results.push({
        slug,
        normalizedSlug,
        status: 'error',
        errors: [{ code: 0, message: (e as Error).message }],
      });
    }
  }

  const summary = {
    total: results.length,
    discovered: results.filter((r) => r.status === 'discovered').length,
    noInfo: results.filter((r) => r.status === 'no_validation_info').length,
    error: results.filter((r) => r.status === 'error').length,
  };

  await writeFile(
    REPORT_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2),
    'utf8',
  );

  console.log();
  console.log('Summary:');
  console.log(`  Discovered:        ${summary.discovered}`);
  console.log(`  No validation info: ${summary.noInfo}`);
  console.log(`  Errors:            ${summary.error}`);
  console.log(`\nReport: ${REPORT_FILE}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
