#!/usr/bin/env tsx
/**
 * BIR MARTALIK (2026-08-30): egasining «delix_tovarlar_yangi_narxlar So'ngi.xlsx»
 * faylidan delix tovarlarining narxlarini prodga qo'llash.
 *
 * Fixture: `delix-narxlar-20260830.json` (xlsx'dan parse qilingan, 376 qator).
 * Moslash KOD bo'yicha + nom tengligi qo'riqchisi (nom farq qilsa SKIP+report).
 *
 * Qoidalar (2026-08-19 `ops-apply-price-sheet.ts` naqshi):
 * · qiymatlar faylda SO'Mda, bazada TIYIN ⇒ ×100 (yaxlitlash bilan);
 * · chakana/optom — `sale_prices[]` qavati priceTypeId bo'yicha NOM orqali
 *   topilgan turlar bilan yangilanadi, currencyCode='UZS';
 * · tan narx — `buy_price` + `buy_price_currency='UZS'` (fayl to'liq so'mda;
 *   yagona «USD» yorlig'i ham so'm qiymat — hisobotda ko'rsatiladi);
 * · 0/bo'sh narx bazadagi qiymatni O'CHIRMAYDI — SKIP + hisobot;
 * · faylda yo'q tovarlarga (36 ta invektor) TEGILMAYDI;
 * · min narx, arxiv holati, qoldiqqa TEGILMAYDI.
 *
 * DRY-RUN sukut; yozish faqat `--apply` bilan. Idempotent: ikkinchi yugurish 0.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(here, '..', '..', '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  // noUncheckedIndexedAccess: guruhlar regexda majburiy — bu faqat torayish.
  const key = m?.[1];
  const rawVal = m?.[2];
  if (key !== undefined && rawVal !== undefined && process.env[key] === undefined) {
    let v = rawVal.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}

const { PrismaClient } = await import('@moysklad/db');
const prisma = new PrismaClient();

type FileRow = {
  code: string | null;
  name: string;
  buy: number | null;
  buyCur: string | null;
  retail: number | null;
  opt: number | null;
};
type SalePrice = { priceTypeId: string; value: string; currencyCode?: string };

const toMinor = (som: number): bigint => BigInt(Math.round(som * 100));
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function withTier(list: SalePrice[], priceTypeId: string, minor: bigint): SalePrice[] {
  const out = list.filter((p) => p && typeof p.priceTypeId === 'string');
  const next: SalePrice = { priceTypeId, value: minor.toString(), currencyCode: 'UZS' };
  const i = out.findIndex((p) => p.priceTypeId === priceTypeId);
  if (i >= 0) out[i] = next;
  else out.push(next);
  return out;
}
const tierValue = (list: SalePrice[], id: string): bigint | null => {
  const hit = list.find((p) => p.priceTypeId === id);
  return hit ? BigInt(hit.value) : null;
};

async function main() {
  const apply = process.argv.includes('--apply');
  const rows: FileRow[] = JSON.parse(
    readFileSync(join(here, 'delix-narxlar-20260830.json'), 'utf8'),
  );

  const types = await prisma.priceType.findMany({ select: { id: true, name: true } });
  const retailType = types.find((t) => t.name === 'Розничная цена')?.id;
  const optType = types.find((t) => t.name === 'Оптовая цена')?.id;
  if (!retailType || !optType) throw new Error('Narx turlari topilmadi (Розничная/Оптовая)');

  const stats = {
    matched: 0,
    notFound: [] as string[],
    nameMismatch: [] as string[],
    retail: 0,
    opt: 0,
    buy: 0,
    curFixed: 0,
    unchanged: 0,
    zeroSkipped: [] as string[],
  };
  let updated = 0;

  for (const r of rows) {
    if (!r.code) continue;
    const p = await prisma.product.findFirst({
      where: { code: r.code, deletedAt: null },
      select: { id: true, name: true, buyPrice: true, buyPriceCurrency: true, salePrices: true },
    });
    if (!p) {
      stats.notFound.push(`${r.code} ${r.name}`);
      continue;
    }
    if (norm(p.name) !== norm(r.name)) {
      stats.nameMismatch.push(`${r.code}: fayl='${r.name}' db='${p.name}'`);
      continue;
    }
    stats.matched++;

    let prices = (
      Array.isArray(p.salePrices) ? (p.salePrices as unknown as SalePrice[]) : []
    ).filter((x) => x && typeof x.priceTypeId === 'string');
    let changed = false;

    if (r.retail && r.retail > 0) {
      const want = toMinor(r.retail);
      if (tierValue(prices, retailType) !== want) {
        prices = withTier(prices, retailType, want);
        stats.retail++;
        changed = true;
      }
    } else if (tierValue(prices, retailType)) {
      stats.zeroSkipped.push(`${r.code} chakana`);
    }

    if (r.opt && r.opt > 0) {
      const want = toMinor(r.opt);
      if (tierValue(prices, optType) !== want) {
        prices = withTier(prices, optType, want);
        stats.opt++;
        changed = true;
      }
    } else if (tierValue(prices, optType)) {
      stats.zeroSkipped.push(`${r.code} optom`);
    }

    const data: Record<string, unknown> = {};
    if (r.buy && r.buy > 0) {
      const want = toMinor(r.buy);
      const curWrong = p.buyPriceCurrency !== null && p.buyPriceCurrency !== 'UZS';
      if (p.buyPrice !== want || curWrong) {
        data.buyPrice = want;
        data.buyPriceCurrency = 'UZS';
        stats.buy++;
        if (curWrong) stats.curFixed++;
        changed = true;
      }
    } else if (p.buyPrice) {
      stats.zeroSkipped.push(`${r.code} tan`);
    }

    if (!changed) {
      stats.unchanged++;
      continue;
    }
    data.salePrices = prices as unknown as object;
    if (apply) {
      await prisma.product.update({ where: { id: p.id }, data });
    }
    updated++;
  }

  console.log(`Rejim: ${apply ? '🔴 APPLY' : 'DRY-RUN'}`);
  console.log(
    `Fayl qatori: ${rows.length} · mos: ${stats.matched} · topilmadi: ${stats.notFound.length} · nom farqi: ${stats.nameMismatch.length}`,
  );
  console.log(
    `O'zgargan tovar: ${updated} (chakana ${stats.retail} · optom ${stats.opt} · tan ${stats.buy}, shundan valyuta USD→UZS tuzatildi ${stats.curFixed}) · o'zgarishsiz: ${stats.unchanged}`,
  );
  console.log(
    `0/bo'sh tufayli tegilmagan narx kataklari: ${stats.zeroSkipped.length}`,
    stats.zeroSkipped.join(', ') || '',
  );
  for (const s of stats.notFound) console.log('  TOPILMADI:', s);
  for (const s of stats.nameMismatch) console.log('  NOM FARQI:', s);
  await prisma.$disconnect();
}

await main();
