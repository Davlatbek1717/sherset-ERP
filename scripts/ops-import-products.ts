#!/usr/bin/env tsx
/**
 * ops-import-products.ts — MoySklad'dan FAQAT tovarlar katalogini olib keladi.
 *
 * Nega alohida skript: `seed-real.ts` bir yo'la HAMMASINI tortadi (kontragent,
 * hujjatlar, pul hujjatlari, hatto Enter/Inventory) — bu qoldiqni ham
 * o'zgartiradi. Bu yerda faqat `/entity/product` upsert qilinadi, boshqa
 * hech narsaga tegilmaydi.
 *
 * Mantiq `seed-real.ts` → `importLiveProducts()` bilan bir xil: `ms:<id>`
 * externalCode kaliti bo'yicha idempotent upsert. Ikkalasi ajralib qolmasligi
 * uchun o'zgartirish kiritilsa ikkalasiga ham kiritilsin.
 *
 * ⚠️ Mavjud tovarda `name/code/article/description/archived/buyPrice/minPrice`
 * va `salePrices` USTIDAN yoziladi — MoySklad manba deb qabul qilinadi.
 *
 * Yugurtirish:
 *   node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/ops-import-products.ts
 *   … --dry-run     — hech narsa yozmaydi, faqat sanaydi
 */

import { PrismaClient } from '../packages/db/src/generated/index.js';
import { mapSalePriceTiers } from '../packages/db/src/sale-price-tiers.js';

const prisma = new PrismaClient();

const ACCOUNT_ID = process.env.ACCOUNT_ID ?? '00000000-0000-0000-0000-000000000001';
const BASE = process.env.MOYSKLAD_BASE_URL ?? 'https://api.moysklad.ru/api/remap/1.2';
const TOKEN = process.env.MOYSKLAD_TOKEN ?? '';
const DRY = process.argv.includes('--dry-run');
const PAGE = 1000;

interface MsPrice {
  value?: number;
  /** Qavat nomi — narx turini shu bo'yicha bog'laymiz (P12 tuzatishi). */
  priceType?: { name?: string };
}
interface MsProduct {
  id?: string;
  name?: string;
  code?: string;
  article?: string;
  description?: string;
  archived?: boolean;
  buyPrice?: MsPrice;
  minPrice?: MsPrice;
  salePrices?: MsPrice[];
}

/** Tarmoq uzilishi bir sahifada butun importni to'xtatmasin — 3 marta urinadi. */
async function msGet<T>(path: string): Promise<{ rows: T[]; size: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { rows?: T[]; meta?: { size?: number } };
      return { rows: json.rows ?? [], size: json.meta?.size ?? 0 };
    } catch (e) {
      lastErr = e;
      const why = e instanceof Error ? `${e.message}${e.cause ? ` (${String(e.cause)})` : ''}` : e;
      console.warn(`  ↻ ${path} — ${attempt}-urinish muvaffaqiyatsiz: ${why}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(
    `MoySklad ${path} — 3 urinishdan keyin ham olinmadi: ${lastErr instanceof Error ? lastErr.message : lastErr}`,
  );
}

/**
 * Akkauntning narx turlari — POZITSIYA tartibida, default birinchi.
 *
 * 🔴 P12 tuzatishi: ilgari bu yerda FAQAT default tur olinar va HAR qavat
 * o'shanga muhrlanardi ⇒ optom narx hech qachon o'z turiga tushmasdi (prodda
 * 3960 tovar optomsiz qolgan edi). Endi mapping `mapSalePriceTiers` da.
 */
async function orderedPriceTypes(): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.priceType.findMany({
    where: { accountId: ACCOUNT_ID, archived: false },
    orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
    select: { id: true, name: true },
  });
  if (rows.length === 0) throw new Error('Narx turi topilmadi — avval PriceType yarating');
  return rows;
}

async function main(): Promise<void> {
  if (!TOKEN) throw new Error('MOYSKLAD_TOKEN yo`q');
  console.log(`📦 Tovar importi — akkaunt ${ACCOUNT_ID}${DRY ? ' (DRY-RUN)' : ''}`);

  const priceTypes = await orderedPriceTypes();
  const before = await prisma.product.count({ where: { accountId: ACCOUNT_ID } });

  // MoySklad narxlarni ALLAQACHON minor birlikda (×100) beradi — qo'shimcha
  // ko'paytirish YO'Q (seed-real dagi bir xil izoh).
  const toMinor = (v: number | undefined): bigint | null =>
    v === undefined ? null : BigInt(Math.round(v));

  // 1) Butun katalogni sahifalab yig'amiz (limit 1000 → ~5 so'rov).
  const all: MsProduct[] = [];
  let offset = 0;
  for (;;) {
    const { rows, size } = await msGet<MsProduct>(`/entity/product?limit=${PAGE}&offset=${offset}`);
    if (offset === 0) console.log(`  MoySklad'da jami: ${size}`);
    if (rows.length === 0) break;
    all.push(...rows);
    offset += rows.length;
    console.log(`  ↓ olindi ${all.length}/${size}`);
    if (offset >= size) break;
  }

  // 2) Mavjudlarni BITTA so'rov bilan xaritaga olamiz (har qator uchun alohida
  //    `findFirst` 4700 ta so'rov degani edi).
  const existingRows = await prisma.product.findMany({
    where: { accountId: ACCOUNT_ID, externalCode: { startsWith: 'ms:' } },
    select: { id: true, externalCode: true },
  });
  const idByExternal = new Map(existingRows.map((p) => [p.externalCode ?? '', p.id]));
  console.log(`  Bazada MoySklad tovarlari: ${idByExternal.size}`);

  let total = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const r of all) {
    if (!r.id || !r.name) continue;
    total++;
    const externalCode = `ms:${r.id}`;
    const data = {
      name: r.name.slice(0, 255),
      code: r.code?.slice(0, 50) ?? null,
      article: r.article?.slice(0, 100) ?? null,
      description: r.description ?? null,
      archived: r.archived ?? false,
      buyPrice: toMinor(r.buyPrice?.value),
      minPrice: toMinor(r.minPrice?.value),
      salePrices: mapSalePriceTiers(r.salePrices, priceTypes),
    };
    try {
      const existingId = idByExternal.get(externalCode);
      if (DRY) {
        if (existingId) updated++;
        else created++;
        continue;
      }
      if (existingId) {
        await prisma.product.update({ where: { id: existingId }, data });
        updated++;
      } else {
        await prisma.product.create({
          data: { ...data, accountId: ACCOUNT_ID, externalCode, kind: 'product' },
        });
        created++;
      }
    } catch (e) {
      failed++;
      console.warn(`  ! ${r.name}: ${e instanceof Error ? e.message : e}`);
    }
    if (total % 500 === 0) console.log(`  … ${total} ta ishlandi`);
  }

  const after = await prisma.product.count({ where: { accountId: ACCOUNT_ID } });
  console.log(
    `✅ Ko'rildi ${total} · yangi ${created} · yangilandi ${updated} · xato ${failed}` +
      `\n   Bazada tovarlar: ${before} → ${after}`,
  );
}

main()
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
