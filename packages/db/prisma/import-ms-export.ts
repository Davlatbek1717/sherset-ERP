/**
 * File-based MoySklad importer — loads a `moysklad-export` folder
 * (products.json / product-folders.json / uom.json in MoySklad remap/1.2
 * shape: { meta, rows }) and upserts products + folders into the DB.
 *
 * This is the counterpart to seed-real.ts (which pulls live from the API);
 * here the data comes from a static export of the CORRECT account.
 *
 * Run:
 *   EXPORT_DIR=/root/ms-export \
 *   DATABASE_URL=... \
 *   node_modules/.bin/tsx prisma/import-ms-export.ts
 *
 * Money is in MINOR units (tiyin) — the same unit our schema stores — so the
 * conversion is 1:1. Prices keep their real price type («Sotilish narxi» /
 * «Optom narx»), derived from each salePrice's embedded priceType meta.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/index.js';

const prisma = new PrismaClient();
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const DIR = process.env.EXPORT_DIR ?? '.';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function extractMsId(href?: string): string | null {
  if (!href) return null;
  const m = href.match(UUID);
  return m ? m[0] : null;
}
function priceToMinor(v: number | undefined | null): bigint | null {
  return v == null ? null : BigInt(Math.round(v));
}

interface MsSalePrice {
  value: number;
  priceType?: { id?: string; name?: string; externalCode?: string };
}
interface MsRef {
  meta?: { href?: string };
}
interface MsProduct {
  id: string;
  name: string;
  code?: string;
  article?: string;
  description?: string;
  pathName?: string;
  archived?: boolean;
  buyPrice?: { value: number };
  minPrice?: { value: number };
  salePrices?: MsSalePrice[];
  productFolder?: MsRef;
  uom?: MsRef;
}
interface MsFolder {
  id: string;
  name: string;
  pathName?: string;
  archived?: boolean;
}
interface MsUom {
  id: string;
  name: string;
}

async function loadRows<T>(file: string): Promise<T[]> {
  const raw = JSON.parse(await readFile(resolve(DIR, file), 'utf8'));
  return (Array.isArray(raw) ? raw : (raw.rows ?? [])) as T[];
}

// ── price types: reuse (match by externalCode OR name; create if missing) ──
const priceTypeCache = new Map<string, string>();
async function resolveDefaultPriceTypeId(): Promise<string> {
  const pt = await prisma.priceType.findFirst({
    where: { accountId: ACCOUNT_ID, archived: false, isDefault: true },
    select: { id: true },
  });
  return pt?.id ?? 'default';
}
async function resolvePriceTypeId(
  pt: MsSalePrice['priceType'],
  fallback: string,
): Promise<string> {
  const msId = pt?.id;
  if (!msId) return fallback;
  const cached = priceTypeCache.get(msId);
  if (cached) return cached;
  const externalCode = `ms:${msId}`;
  const name = (pt?.name ?? 'Price').slice(0, 100);
  const existing = await prisma.priceType.findFirst({
    where: { accountId: ACCOUNT_ID, OR: [{ externalCode }, { name }] },
    select: { id: true },
  });
  let id: string;
  if (existing) {
    id = existing.id;
  } else {
    const created = await prisma.priceType.create({
      data: { accountId: ACCOUNT_ID, name, externalCode },
      select: { id: true },
    });
    id = created.id;
    console.log(`    + price type «${name}» created`);
  }
  priceTypeCache.set(msId, id);
  return id;
}

async function main(): Promise<void> {
  console.log('📦 File-based MoySklad export import');
  console.log(`  Target account: ${ACCOUNT_ID}`);
  console.log(`  Export dir: ${DIR}`);

  const products = await loadRows<MsProduct>('products.json');
  const folders = await loadRows<MsFolder>('product-folders.json');
  const uoms = await loadRows<MsUom>('uom.json');
  console.log(
    `  Loaded: ${products.length} products, ${folders.length} folders, ${uoms.length} uom`,
  );

  // uom id → name (schema stores uom as a plain string)
  const uomName = new Map<string, string>();
  for (const u of uoms) uomName.set(u.id, u.name);

  // ── folders ──
  const folderMap = new Map<string, string>();
  let fIns = 0;
  for (const f of folders) {
    if (!f.id || !f.name) continue;
    const externalCode = `ms:${f.id}`;
    const existing = await prisma.productFolder.findFirst({
      where: { accountId: ACCOUNT_ID, externalCode },
      select: { id: true },
    });
    const data = {
      name: f.name.slice(0, 255),
      pathName: f.pathName?.slice(0, 500) ?? null,
      archived: f.archived ?? false,
    };
    let id: string;
    if (existing) {
      await prisma.productFolder.update({ where: { id: existing.id }, data });
      id = existing.id;
    } else {
      const c = await prisma.productFolder.create({
        data: { ...data, accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      id = c.id;
    }
    folderMap.set(f.id, id);
    fIns++;
  }
  console.log(`  ↳ Folders: ${fIns}/${folders.length} upserted`);

  // ── products ──
  const defaultPtId = await resolveDefaultPriceTypeId();
  let ins = 0;
  let skip = 0;
  for (const r of products) {
    if (!r.id || !r.name) {
      skip++;
      continue;
    }
    try {
      const externalCode = `ms:${r.id}`;
      const existing = await prisma.product.findFirst({
        where: { accountId: ACCOUNT_ID, externalCode },
        select: { id: true },
      });
      const folderMsId = extractMsId(r.productFolder?.meta?.href);
      const productFolderId = folderMsId ? (folderMap.get(folderMsId) ?? null) : null;
      const uomMsId = extractMsId(r.uom?.meta?.href);
      const uom = uomMsId ? (uomName.get(uomMsId)?.slice(0, 20) ?? null) : null;

      const salePrices: Array<{ priceTypeId: string; value: string }> = [];
      for (const sp of r.salePrices ?? []) {
        salePrices.push({
          priceTypeId: await resolvePriceTypeId(sp.priceType, defaultPtId),
          value: String(Math.round(sp.value)),
        });
      }

      const data = {
        name: r.name.slice(0, 255),
        code: r.code?.slice(0, 50) ?? null,
        article: r.article?.slice(0, 50) ?? null,
        description: r.description ?? null,
        pathName: r.pathName?.slice(0, 500) ?? null,
        archived: r.archived ?? false,
        buyPrice: priceToMinor(r.buyPrice?.value),
        minPrice: priceToMinor(r.minPrice?.value),
        salePrices,
        uom,
        productFolderId,
        kind: 'product',
      };
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
      } else {
        await prisma.product.create({ data: { ...data, accountId: ACCOUNT_ID, externalCode } });
      }
      ins++;
      if (ins % 500 === 0) console.log(`    … products ${ins}/${products.length}`);
    } catch (e) {
      skip++;
      if (skip <= 10) console.warn(`    ! ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  ↳ Products: ${ins} upserted (${skip} skipped of ${products.length})`);

  const totals = {
    products: await prisma.product.count({ where: { accountId: ACCOUNT_ID } }),
    withFolder: await prisma.product.count({
      where: { accountId: ACCOUNT_ID, productFolderId: { not: null } },
    }),
    folders: await prisma.productFolder.count({ where: { accountId: ACCOUNT_ID } }),
    priceTypes: await prisma.priceType.count({ where: { accountId: ACCOUNT_ID } }),
  };
  console.log('---');
  console.log(`✓ Done. Totals: ${JSON.stringify(totals)}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
