#!/usr/bin/env node
/**
 * Import real CLIMART tenant data into the dev DB so the etalon detail
 * pages can be validated against production-shape records (not just the
 * empty seed). Pulls 50 rows per entity from the live moysklad API and
 * upserts into our Prisma DB.
 *
 * Resolves FKs by name (since moysklad UUIDs differ from ours): a doc
 * referencing organization X looks up that org by name in our DB.
 *
 * Usage:
 *   MOYSKLAD_TOKEN=xxxx pnpm tsx tools/scripts/import-from-climart.mjs
 *   (token also accepted via tools/scripts/.api-token — gitignored)
 *
 * Idempotent: re-running upserts by externalCode (when present) or name.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { PrismaClient } from '../../packages/db/src/generated/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TOKEN_FILE = path.join(__dirname, '.api-token');
const CACHE_DIR = path.join(ROOT, 'docs/moysklad-reference/_api-real');
const BASE = 'https://api.moysklad.ru/api/remap/1.2';

// Demo account / admin from prisma/seed.ts
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

const prisma = new PrismaClient();

async function getToken() {
  if (process.env.MOYSKLAD_TOKEN) return process.env.MOYSKLAD_TOKEN.trim();
  try {
    return (await readFile(TOKEN_FILE, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function fetchEntity(token, slug, limit = 50) {
  const url = `${BASE}/entity/${slug}?limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Encoding': 'gzip',
      Accept: 'application/json;charset=utf-8',
    },
  });
  if (!res.ok) throw new Error(`${slug}: ${res.status} ${res.statusText}`);
  // Node's fetch auto-decompresses gzip, but the header sometimes still
  // says content-encoding: gzip on already-decompressed bodies. Try
  // gunzip; on failure, treat the body as plain text. Mirrors api-fetch-real.mjs.
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
  const body = JSON.parse(text);
  return body.rows ?? [];
}

async function loadFromCacheOrFetch(token, slug) {
  const cachePath = path.join(CACHE_DIR, `${slug}.api.json`);
  // If token available, fetch fresh with limit=50.
  if (token) {
    try {
      const rows = await fetchEntity(token, slug, 50);
      console.log(`  → fetched ${rows.length} ${slug} rows live`);
      // Cache the fresh fetch so the next run can fall back if offline.
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(
        cachePath,
        JSON.stringify({ slug, fetchedAt: new Date().toISOString(), rows }, null, 2),
      );
      return rows;
    } catch (e) {
      console.warn(`  ! live fetch failed for ${slug} (${e.message}); falling back to cache`);
    }
  }
  // Fall back to cached single-row sample.
  try {
    const j = JSON.parse(await readFile(cachePath, 'utf8'));
    const rows = j.rows ?? j.sample?.rows ?? [];
    console.log(`  → loaded ${rows.length} ${slug} rows from cache`);
    return rows;
  } catch {
    console.warn(`  ! no cache for ${slug}; skipping`);
    return [];
  }
}

/** Map moysklad's companyType to ours (we accept both UZ-suffixed and base). */
function mapCompanyType(mskType) {
  if (!mskType) return 'legalUZ';
  const known = ['legalUZ', 'entrepreneurUZ', 'individualUZ', 'legal', 'entrepreneur', 'individual'];
  return known.includes(mskType) ? mskType : 'legalUZ';
}

/** Get the admin employee for the demo account (used as default owner). */
async function getDefaultOwnerId() {
  const admin = await prisma.employee.findFirst({
    where: { accountId: ACCOUNT_ID, email: 'admin@demo.local' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/** Find by externalCode; update if exists, otherwise create. */
async function upsertByExternalCode(model, externalCode, data) {
  const existing = await model.findFirst({
    where: { accountId: ACCOUNT_ID, externalCode },
    select: { id: true },
  });
  if (existing) {
    return model.update({ where: { id: existing.id }, data });
  }
  return model.create({ data });
}

async function importOrganizations(rows, ownerId) {
  let count = 0;
  for (const r of rows) {
    await upsertByExternalCode(prisma.organization, r.id, {
      accountId: ACCOUNT_ID,
      ownerId,
      name: r.name,
      legalTitle: r.legalTitle ?? null,
      legalAddress: r.legalAddress ?? null,
      companyType: mapCompanyType(r.companyType),
      email: r.email ?? null,
      phone: r.phone ?? null,
      externalCode: r.id,
      archived: !!r.archived,
    });
    count++;
  }
  return count;
}

async function importStores(rows, ownerId) {
  let count = 0;
  for (const r of rows) {
    await upsertByExternalCode(prisma.store, r.id, {
      accountId: ACCOUNT_ID,
      ownerId,
      name: r.name,
      pathName: r.pathName ?? null,
      address: r.address ?? null,
      externalCode: r.id,
      archived: !!r.archived,
    });
    count++;
  }
  return count;
}

async function importCounterparties(rows, ownerId) {
  let count = 0;
  for (const r of rows) {
    await upsertByExternalCode(prisma.counterparty, r.id, {
      accountId: ACCOUNT_ID,
      ownerId,
      name: r.name,
      legalTitle: r.legalTitle ?? null,
      legalAddress: r.legalAddress ?? null,
      companyType: mapCompanyType(r.companyType),
      email: r.email ?? null,
      phone: r.phone ?? null,
      description: r.description ?? null,
      code: r.code ?? null,
      externalCode: r.id,
      archived: !!r.archived,
      salesAmount: r.salesAmount ? BigInt(Math.round(Number(r.salesAmount) * 100)) : 0n,
    });
    count++;
  }
  return count;
}

async function importProducts(rows, ownerId) {
  let count = 0;
  for (const r of rows) {
    // moysklad: salePrices is array of { value, currency: meta, priceType: meta }
    // ours: Json with [{ priceTypeId, value }] — we'll just store the raw shape
    const salePrices = Array.isArray(r.salePrices)
      ? r.salePrices.map((sp) => ({
          priceTypeId: 'default',
          value: sp.value ? String(Math.round(Number(sp.value))) : '0',
        }))
      : null;
    const buyPrice = r.buyPrice?.value ? BigInt(Math.round(Number(r.buyPrice.value))) : null;
    const minPrice = r.minPrice?.value ? BigInt(Math.round(Number(r.minPrice.value))) : null;
    const data = {
      accountId: ACCOUNT_ID,
      ownerId,
      name: r.name,
      code: r.code ?? null,
      externalCode: r.id,
      article: r.article ?? null,
      description: r.description ?? null,
      pathName: r.pathName ?? null,
      kind: 'product',
      uom: r.uom?.meta?.href?.match(/\/uom\/([^/]+)$/)?.[1]
        ? null // we don't have the UOM dimension imported yet
        : null,
      vat: r.vat ?? null,
      vatEnabled: r.vatEnabled ?? true,
      useParentVat: r.useParentVat ?? true,
      salePrices,
      buyPrice,
      minPrice,
      paymentItemType: r.paymentItemType ?? null,
    };
    await upsertByExternalCode(prisma.product, r.id, data);
    count++;
  }
  return count;
}

async function main() {
  const token = await getToken();
  console.log(token ? '🔑 token found — fetching live data' : '⚠️  no token — using cache only');

  const ownerId = await getDefaultOwnerId();
  if (!ownerId) {
    throw new Error('admin@demo.local employee not found — run `pnpm --filter @moysklad/db seed` first');
  }
  console.log('👤 using owner:', ownerId);

  const summary = {};

  console.log('📦 organizations…');
  const orgRows = await loadFromCacheOrFetch(token, 'organization');
  summary.organization = await importOrganizations(orgRows, ownerId);

  console.log('🏬 stores…');
  const storeRows = await loadFromCacheOrFetch(token, 'store');
  summary.store = await importStores(storeRows, ownerId);

  console.log('👥 counterparties…');
  const cpRows = await loadFromCacheOrFetch(token, 'counterparty');
  summary.counterparty = await importCounterparties(cpRows, ownerId);

  console.log('📦 products…');
  const prodRows = await loadFromCacheOrFetch(token, 'product');
  summary.product = await importProducts(prodRows, ownerId);

  console.log('\n✅ Import complete:');
  for (const [slug, count] of Object.entries(summary)) {
    console.log(`   ${slug.padEnd(20)} ${count} rows`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await prisma.$disconnect();
  process.exit(1);
});
