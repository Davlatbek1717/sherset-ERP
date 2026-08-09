#!/usr/bin/env tsx
/**
 * F019 — OMBOR MIGRATSIYASI 1–2-QADAM (7-bo'lim TZ §4).
 *
 *   1-qadam: `Product.attributes.__yacheyka` kodlaridan `StoreZone` (kodning
 *            1-segmenti = sklad) + `StoreCell` (butun kod = nom) generatsiya.
 *   2-qadam: har (ombor × tovar) uchun `Stock.qty − Σ StockByCell` farqi
 *            tovarning ASOSIY yacheykasiga `StockByCell` qatori bo'lib yoziladi.
 *
 * Butun mantiq `modules/store/cell-migration{,.runner}.ts` da va DBsiz
 * testlangan (`*.test.ts`, 39 test) — bu fayl FAQAT Prisma adapteri va
 * hisobot chiqaruvchisi.
 *
 * REJIMLAR (default — DRY, hech narsa yozilmaydi):
 *   pnpm --filter @moysklad/api exec tsx src/scripts/migrate-cells-step1-2.ts
 *   APPLY=1    … same …          → yozadi + manifest faylini saqlaydi
 *   ROLLBACK=1 … same …          → manifest bo'yicha DRY qaytarish rejasi
 *   ROLLBACK=1 APPLY=1 … same …  → qaytarishni bajaradi
 *
 * MUHIT:
 *   ACCOUNT_ID  — akkaunt (bitta bo'lsa avtomat aniqlanadi)
 *   STORE_ID    — qoldig'i yo'q tovarlar uchun yacheyka yaratiladigan ombor
 *                 (bitta `Store` bo'lsa avtomat; bir nechta bo'lsa MAJBURIY)
 *   MANIFEST    — manifest fayli yo'li (default `./cell-migration-manifest.json`)
 *
 * FAIL-CLOSED: akkaunt/ombor bir qiymatli aniqlanmasa `exit 1` — noto'g'ri
 * omborga yuzlab yacheyka yaratish qimmat va qo'lda tozalanadigan xato.
 * PROD (`sherset_v2`) ga bu skript AVTOMATIK yugurtirilmaydi — «OPS-QADAMLAR».
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { type Prisma, PrismaClient } from '@moysklad/db';
import type { CellMigrationManifest } from '../modules/store/cell-migration.js';
import type { CellMigrationPort } from '../modules/store/cell-migration.runner.js';
import { rollbackCellMigration, runCellMigration } from '../modules/store/cell-migration.runner.js';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const ROLLBACK = process.env.ROLLBACK === '1';
const MANIFEST_PATH = process.env.MANIFEST ?? './cell-migration-manifest.json';

const TX = { timeout: 180_000, maxWait: 30_000 } as const;

function die(message: string): never {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

/** Prisma `Decimal` ni satrga — `Number` ga tushirmaymiz (0.1+0.2 klassi). */
const q = (v: { toString(): string }) => v.toString();

const port: CellMigrationPort = {
  loadZones: (accountId) =>
    prisma.storeZone.findMany({
      where: { accountId },
      select: { id: true, storeId: true, name: true, sortOrder: true },
    }),
  loadCells: (accountId) =>
    prisma.storeCell.findMany({
      where: { accountId },
      select: { id: true, storeId: true, name: true, sortOrder: true, zoneId: true },
    }),
  loadProductHomeCodes: async (accountId) => {
    // `->>` ataylab: jsonb `?` operatori ba'zi drayverlarda parametr
    // to'ldirgichi bilan chalkashadi. Bo'sh/probel kod bu yerda TASHLANMAYDI —
    // hisobotdagi «no-home-code» sanog'i shundan chiqadi.
    const rows = await prisma.$queryRaw<Array<{ id: string; code: string }>>`
      SELECT id, attributes->>'__yacheyka' AS code
        FROM products
       WHERE account_id = ${accountId}::uuid
         AND deleted_at IS NULL
         AND COALESCE(TRIM(attributes->>'__yacheyka'), '') <> ''
    `;
    return rows.map((r) => ({ productId: r.id, code: r.code }));
  },
  loadStocks: async (accountId) => {
    const rows = await prisma.stock.findMany({
      where: { accountId },
      select: { storeId: true, assortmentKind: true, assortmentId: true, qty: true },
    });
    return rows.map((r) => ({ ...r, qty: q(r.qty) }));
  },
  loadStockByCell: async (accountId) => {
    const rows = await prisma.stockByCell.findMany({
      where: { accountId },
      select: {
        storeId: true,
        cellId: true,
        assortmentKind: true,
        assortmentId: true,
        qty: true,
      },
    });
    return rows.map((r) => ({ ...r, qty: q(r.qty) }));
  },

  createZones: async (accountId, rows) => {
    await prisma.storeZone.createMany({
      data: rows.map((r) => ({ accountId, ...r })),
      skipDuplicates: true,
    });
    // id'larni QAYTA o'qiymiz: `createMany` ularni qaytarmaydi va
    // `skipDuplicates` tufayli parallel sessiya yaratgan zona ham shu yerda
    // topilishi KERAK (aks holda yacheyka zonasiz qolib ketardi).
    return prisma.storeZone.findMany({
      where: { accountId, OR: rows.map((r) => ({ storeId: r.storeId, name: r.name })) },
      select: { id: true, storeId: true, name: true },
    });
  },
  createCells: async (accountId, rows) => {
    await prisma.storeCell.createMany({
      data: rows.map((r) => ({ accountId, ...r })),
      skipDuplicates: true,
    });
    return prisma.storeCell.findMany({
      where: { accountId, OR: rows.map((r) => ({ storeId: r.storeId, name: r.name })) },
      select: { id: true, storeId: true, name: true },
    });
  },
  applyBackfill: async (accountId, writes) => {
    await prisma.$transaction(async (tx) => {
      for (const w of writes) {
        await tx.stockByCell.upsert({
          where: {
            accountId_storeId_cellId_assortmentKind_assortmentId: {
              accountId,
              storeId: w.storeId,
              cellId: w.cellId,
              assortmentKind: w.assortmentKind,
              assortmentId: w.assortmentId,
            },
          },
          create: {
            accountId,
            storeId: w.storeId,
            cellId: w.cellId,
            assortmentKind: w.assortmentKind,
            assortmentId: w.assortmentId,
            qty: w.deltaQty as unknown as Prisma.Decimal,
          },
          update: { qty: { increment: w.deltaQty as unknown as Prisma.Decimal } },
        });
      }
    }, TX);
  },

  deleteStockByCell: async (accountId, rows) => {
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        await tx.stockByCell.delete({
          where: {
            accountId_storeId_cellId_assortmentKind_assortmentId: { accountId, ...r },
          },
        });
      }
    }, TX);
  },
  decrementStockByCell: async (accountId, rows) => {
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        await tx.stockByCell.update({
          where: {
            accountId_storeId_cellId_assortmentKind_assortmentId: {
              accountId,
              storeId: r.storeId,
              cellId: r.cellId,
              assortmentKind: r.assortmentKind,
              assortmentId: r.assortmentId,
            },
          },
          data: { qty: { decrement: r.qty as unknown as Prisma.Decimal } },
        });
      }
    }, TX);
  },
  deleteCells: async (accountId, ids) => {
    await prisma.storeCell.deleteMany({ where: { accountId, id: { in: ids } } });
  },
  deleteZones: async (accountId, ids) => {
    await prisma.storeZone.deleteMany({ where: { accountId, id: { in: ids } } });
  },
  cellsInUse: async (accountId, cellIds) => {
    if (cellIds.length === 0) return new Set<string>();
    const where = { accountId, cellId: { in: cellIds } };
    const pick = { cellId: true } as const;
    const [loss, enter, supply, purchaseReturn, salesReturn, demand, links] = await Promise.all([
      prisma.lossPosition.findMany({ where, select: pick, distinct: ['cellId'] }),
      prisma.enterPosition.findMany({ where, select: pick, distinct: ['cellId'] }),
      prisma.supplyPosition.findMany({ where, select: pick, distinct: ['cellId'] }),
      prisma.purchaseReturnPosition.findMany({ where, select: pick, distinct: ['cellId'] }),
      prisma.salesReturnPosition.findMany({ where, select: pick, distinct: ['cellId'] }),
      prisma.demandPosition.findMany({ where, select: pick, distinct: ['cellId'] }),
      // ProductCellLink yacheyka bilan CASCADE o'chadi ⇒ uni hisobga olmasak,
      // rollback tovar-biriktirmalarini JIMGINA yo'q qilardi.
      prisma.productCellLink.findMany({ where, select: pick, distinct: ['cellId'] }),
    ]);
    const out = new Set<string>();
    for (const rows of [loss, enter, supply, purchaseReturn, salesReturn, demand, links]) {
      for (const r of rows) if (r.cellId) out.add(r.cellId);
    }
    return out;
  },
  zoneCellCounts: async (accountId, zoneIds) => {
    if (zoneIds.length === 0) return new Map();
    const rows = await prisma.storeCell.groupBy({
      by: ['zoneId'],
      where: { accountId, zoneId: { in: zoneIds } },
      _count: { _all: true },
    });
    const out = new Map<string, number>();
    for (const z of zoneIds) out.set(z, 0);
    for (const r of rows) if (r.zoneId) out.set(r.zoneId, r._count._all);
    return out;
  },
};

async function resolveAccountId(): Promise<string> {
  const fromEnv = process.env.ACCOUNT_ID;
  if (fromEnv) return fromEnv;
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  if (accounts.length === 1 && accounts[0]) return accounts[0].id;
  return die(
    `ACCOUNT_ID kerak — bazada ${accounts.length} ta akkaunt bor: ${accounts
      .map((a) => `${a.name} (${a.id})`)
      .join(', ')}`,
  );
}

async function resolveStoreId(accountId: string): Promise<string> {
  const fromEnv = process.env.STORE_ID;
  if (fromEnv) return fromEnv;
  const stores = await prisma.store.findMany({
    where: { accountId },
    select: { id: true, name: true },
  });
  if (stores.length === 1 && stores[0]) return stores[0].id;
  return die(
    `STORE_ID kerak — akkauntda ${stores.length} ta ombor bor: ${stores
      .map((s) => `${s.name} (${s.id})`)
      .join(', ')}`,
  );
}

function head(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 62 - title.length))}`);
}

async function migrate() {
  const accountId = await resolveAccountId();
  const defaultStoreId = await resolveStoreId(accountId);

  const r = await runCellMigration(port, { accountId, defaultStoreId, apply: APPLY });

  console.log(`rejim: ${APPLY ? 'APPLY (yozmoqda)' : 'DRY-RUN (hech narsa yozilmaydi)'}`);
  console.log(`akkaunt: ${accountId} · default ombor: ${defaultStoreId}`);

  head('1-QADAM — zona / yacheyka');
  console.log(
    `zona:     yaratiladi ${r.generation.zonesToCreate.length} · mavjud ${r.generation.zonesExisting}`,
  );
  console.log(
    `yacheyka: yaratiladi ${r.generation.cellsToCreate.length} · mavjud ${r.generation.cellsExisting}`,
  );
  for (const c of r.generation.cellsToCreate.slice(0, 10)) {
    console.log(`   + ${c.name}  (zona «${c.zoneName}»)`);
  }
  if (r.generation.cellsToCreate.length > 10) {
    console.log(`   … yana ${r.generation.cellsToCreate.length - 10} ta`);
  }

  head("NOTO'G'RI FORMATDAGI KODLAR");
  if (r.generation.invalid.length === 0) console.log('yo‘q');
  for (const bad of r.generation.invalid) {
    console.log(
      `   ✗ ${bad.message}  — ${bad.productIds.length} tovar: ${bad.productIds.join(', ')}`,
    );
  }
  for (const short of r.generation.shortCodes) {
    console.log(
      `   ⚠ «${short.code}» — ${short.segments} segment (4 kutilgan), ${short.productIds.length} tovar`,
    );
  }
  for (const col of r.generation.zonePaddingCollisions) {
    console.log(
      `   ⚠ sklad ${col.numeric} ikki xil yozilgan: ${col.names.join(' / ')} — ikkita zona chiqadi`,
    );
  }

  head('2-QADAM — backfill');
  console.log(
    `yoziladigan qator: ${r.backfill.writes.length} · allaqachon mos: ${r.backfill.alreadyBalanced}`,
  );
  const byReason = new Map<string, number>();
  for (const u of r.backfill.unaddressed) {
    byReason.set(u.reason, (byReason.get(u.reason) ?? 0) + 1);
  }
  for (const [reason, n] of byReason) console.log(`   · biriktirilmagan (${reason}): ${n}`);

  head('FARQ HISOBOTI — Σ StockByCell vs Stock');
  console.log(
    `oldin:  ${r.diffBefore.mismatches} nomuvofiqlik · |farq| jami ${r.diffBefore.totalAbsDiff}`,
  );
  console.log(
    `keyin${APPLY ? ' ' : ' (kutilgan)'}: ${r.diffAfter.mismatches} nomuvofiqlik · |farq| jami ${r.diffAfter.totalAbsDiff}`,
  );
  for (const row of r.diffAfter.rows.slice(0, 15)) {
    console.log(
      `   ${row.assortmentKind} ${row.assortmentId}: ombor ${row.stockQty} · yacheyka ${row.cellQty} · farq ${row.diff}`,
    );
  }
  if (r.diffAfter.rows.length > 15) console.log(`   … yana ${r.diffAfter.rows.length - 15} ta`);

  if (APPLY && r.manifest) {
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(r.manifest, null, 2)}\n`, 'utf8');
    head('YOZILDI');
    console.log(
      `zona ${r.writes.zones} · yacheyka ${r.writes.cells} · StockByCell ${r.writes.stockRows}`,
    );
    console.log(`manifest: ${MANIFEST_PATH}  (qaytarish uchun SAQLANG)`);
  } else {
    console.log('\nyozilmadi (DRY). Bajarish uchun: APPLY=1');
  }
}

async function rollback() {
  let manifest: CellMigrationManifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as CellMigrationManifest;
  } catch (e) {
    return die(`manifest o'qilmadi (${MANIFEST_PATH}): ${(e as Error).message}`);
  }
  if (manifest.version !== 1)
    return die(`manifest versiyasi qo'llab-quvvatlanmaydi: ${manifest.version}`);

  const r = await rollbackCellMigration(port, manifest, { apply: APPLY });

  console.log(
    `rejim: ROLLBACK ${APPLY ? '(bajarilmoqda)' : 'DRY-RUN'} · manifest ${MANIFEST_PATH}`,
  );
  console.log(`manifest sanasi: ${manifest.appliedAt}`);
  head('QAYTARISH REJASI');
  console.log(`StockByCell o'chiriladi: ${r.plan.stockDeletes.length}`);
  console.log(`StockByCell kamaytiriladi: ${r.plan.stockDecrements.length}`);
  console.log(`yacheyka o'chiriladi: ${r.plan.cellDeletes.length} / ${manifest.cells.length}`);
  console.log(`zona o'chiriladi: ${r.plan.zoneDeletes.length} / ${manifest.zones.length}`);

  head('BLOKLANGANLAR (tegilmadi)');
  if (r.blocked.length === 0) console.log('yo‘q');
  for (const b of r.blocked) console.log(`   ⚠ [${b.reason}] ${b.detail}`);

  head('FARQ HISOBOTI');
  console.log(`${r.diffAfter.mismatches} nomuvofiqlik · |farq| jami ${r.diffAfter.totalAbsDiff}`);

  if (!APPLY) console.log('\no‘chirilmadi (DRY). Bajarish uchun: ROLLBACK=1 APPLY=1');
}

async function main() {
  if (ROLLBACK) await rollback();
  else await migrate();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  if (process.exitCode !== 1) console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
