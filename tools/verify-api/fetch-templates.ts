#!/usr/bin/env tsx
/**
 * Fetch print template lists for every document type via Moysklad API.
 *
 * Uses /entity/<slug>/metadata/embeddedtemplate and customtemplate.
 *
 * Output: docs/moysklad-reference/print-templates/<slug>/api-list.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/moysklad-reference/print-templates');

const API_BASE = 'https://api.moysklad.ru/api/remap/1.2';

// Entity slugs that support print templates
const DOC_SLUGS = [
  'customerorder',
  'purchaseorder',
  'internalorder',
  'productionorder',
  'demand',
  'supply',
  'move',
  'enter',
  'loss',
  'inventory',
  'invoiceout',
  'invoicein',
  'factureout',
  'facturein',
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'prepayment',
  'prepaymentreturn',
  'salesreturn',
  'purchasereturn',
  'commissionreportin',
  'commissionreportout',
  'processing',
  'productiontask',
  'processingorder',
  'processingstagecompletion',
  'retaildemand',
  'retailsalesreturn',
  'retailshift',
  'pricelist',
  // reference entities with templates:
  'product',
  'counterparty',
];

interface Template {
  id: string;
  name: string;
  type: 'embedded' | 'custom';
  fileType?: string;
  contentHref?: string;
}

async function main(): Promise<void> {
  const token = process.env.MOYSKLAD_API_TOKEN;
  if (!token) {
    console.error('No token');
    process.exit(1);
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json;charset=utf-8',
  };

  console.log(`Fetching print templates for ${DOC_SLUGS.length} entities...\n`);

  const allTemplates: Record<string, Template[]> = {};
  let totalTemplates = 0;

  for (const slug of DOC_SLUGS) {
    const templates: Template[] = [];

    for (const type of ['embeddedtemplate', 'customtemplate'] as const) {
      try {
        const r = await fetch(`${API_BASE}/entity/${slug}/metadata/${type}`, { headers });
        if (r.status === 404) continue;
        if (!r.ok) continue;
        const body = (await r.json()) as { rows?: Array<Record<string, unknown>> };
        for (const row of body.rows ?? []) {
          templates.push({
            id: row.id as string,
            name: row.name as string,
            type: type === 'embeddedtemplate' ? 'embedded' : 'custom',
            fileType: row.type as string,
            contentHref:
              (row.content as { meta?: { href?: string } } | undefined)?.meta?.href ?? undefined,
          });
        }
      } catch {
        /* ignore */
      }

      await sleep(100);
    }

    allTemplates[slug] = templates;
    totalTemplates += templates.length;

    const outDir = path.join(OUT_DIR, slug);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'api-list.json'), JSON.stringify(templates, null, 2), 'utf8');

    console.log(`  ${slug.padEnd(28)} ${templates.length.toString().padStart(3)} templates`);
  }

  // Summary
  await writeFile(
    path.join(OUT_DIR, '_summary.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalTemplates,
        byEntity: Object.fromEntries(Object.entries(allTemplates).map(([k, v]) => [k, v.length])),
        uzSpecificTemplates: Object.entries(allTemplates).flatMap(([slug, templates]) =>
          templates
            .filter((t) => /узбекистан|узб\b|\buz\b/i.test(t.name))
            .map((t) => ({ entity: slug, ...t })),
        ),
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\nTotal: ${totalTemplates} templates across ${DOC_SLUGS.length} entities`);
  console.log(`Summary: ${OUT_DIR}/_summary.json`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
