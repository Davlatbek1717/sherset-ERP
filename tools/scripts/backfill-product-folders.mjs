#!/usr/bin/env node
/**
 * Backfill `products.product_folder_id` from moysklad — repairs the «brand
 * filter shows nothing» bug (2026-07-07).
 *
 * ROOT CAUSE: the bulk product import created the 20 brand folders (Группы) but
 * imported every product with `productFolderId = NULL` (folder membership was
 * dropped — products carried neither the FK nor a pathName). So clicking a brand
 * in the left tree filtered `WHERE product_folder_id = <id>` and matched 0 rows
 * → «Нет товаров», even though moysklad shows those products under the brand.
 * The filter logic was correct all along; only the data was missing the link.
 *
 * FIX: moysklad is the source of truth. For every moysklad product that has a
 * `productFolder`, map it to OUR product by `externalCode = 'ms:' + <mskId>` and
 * set `productFolderId` to the folder whose NAME matches (our folder names mirror
 * moysklad's 1:1). Products with no folder in moysklad are left folder-less (they
 * are folder-less in moysklad too). Idempotent — re-running only touches rows
 * whose folder differs.
 *
 * Usage (run where DATABASE_URL points at the target DB, e.g. on the server):
 *   MOYSKLAD_LOGIN=... MOYSKLAD_PASSWORD=... node tools/scripts/backfill-product-folders.mjs [--dry]
 *   MOYSKLAD_TOKEN=...  node tools/scripts/backfill-product-folders.mjs [--dry]
 *
 * --dry prints the mapping + per-folder counts WITHOUT writing.
 */

import { PrismaClient } from '../../packages/db/src/generated/index.js';

const BASE = 'https://api.moysklad.ru/api/remap/1.2';
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const DRY = process.argv.includes('--dry');

function authHeader() {
  if (process.env.MOYSKLAD_TOKEN) return `Bearer ${process.env.MOYSKLAD_TOKEN.trim()}`;
  const login = process.env.MOYSKLAD_LOGIN;
  const password = process.env.MOYSKLAD_PASSWORD;
  if (login && password) return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
  throw new Error('Set MOYSKLAD_TOKEN, or MOYSKLAD_LOGIN + MOYSKLAD_PASSWORD');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function msGet(url, headers, tries = 5) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

async function main() {
  const headers = {
    Authorization: authHeader(),
    'Accept-Encoding': 'gzip',
    Accept: 'application/json;charset=utf-8',
  };

  // 1) moysklad folders: id → name (expand is capped at limit≤100, so we resolve
  //    folder names from this list instead of expanding on the product query).
  const fj = await msGet(`${BASE}/entity/productfolder?limit=100`, headers);
  const folderNameById = new Map((fj.rows ?? []).map((f) => [f.id, f.name]));
  console.log(`moysklad folders: ${folderNameById.size}`);

  // 2) moysklad products (no expand — read productFolder.meta.href → folderId).
  const map = []; // { externalCode, folderName }
  const perFolder = {};
  let offset = 0;
  let size = Number.POSITIVE_INFINITY;
  while (offset < size) {
    const j = await msGet(`${BASE}/entity/product?limit=1000&offset=${offset}`, headers);
    size = j.meta?.size ?? 0;
    for (const p of j.rows ?? []) {
      const href = p.productFolder?.meta?.href;
      const fid = href?.match(/\/productfolder\/([^/?]+)/)?.[1];
      const name = fid && folderNameById.get(fid);
      if (!name) continue;
      map.push({ externalCode: `ms:${p.id}`, folderName: name });
      perFolder[name] = (perFolder[name] ?? 0) + 1;
    }
    offset += 1000;
    process.stderr.write(`  scanned ${Math.min(offset, size)}/${size}\r`);
  }
  process.stderr.write('\n');
  console.log(`products with a folder in moysklad: ${map.length}`);
  console.log('per-folder:', JSON.stringify(perFolder, null, 2));

  if (DRY) {
    console.log('\n--dry: no DB writes.');
    return;
  }

  // 3) apply: our folders by name → id, then set productFolderId per external code.
  const prisma = new PrismaClient();
  try {
    const folders = await prisma.productFolder.findMany({
      where: { accountId: ACCOUNT_ID },
      select: { id: true, name: true },
    });
    const folderIdByName = new Map();
    for (const f of folders) {
      if (folderIdByName.has(f.name)) {
        throw new Error(`Ambiguous folder name «${f.name}» — cannot match by name`);
      }
      folderIdByName.set(f.name, f.id);
    }

    let updated = 0;
    let missingFolder = 0;
    let missingProduct = 0;
    for (const { externalCode, folderName } of map) {
      const folderId = folderIdByName.get(folderName);
      if (!folderId) {
        missingFolder += 1;
        continue;
      }
      const res = await prisma.product.updateMany({
        where: { accountId: ACCOUNT_ID, externalCode, NOT: { productFolderId: folderId } },
        data: { productFolderId: folderId },
      });
      if (res.count > 0) updated += res.count;
      else {
        const exists = await prisma.product.count({
          where: { accountId: ACCOUNT_ID, externalCode },
        });
        if (exists === 0) missingProduct += 1;
      }
    }
    console.log(
      `\n✅ updated ${updated} products · missingFolder ${missingFolder} · missingProduct ${missingProduct}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
