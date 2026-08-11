#!/usr/bin/env tsx
/**
 * P12 O'LCHOV — katalog narx zanjiri (2026-08-11). **READ-ONLY** (yozmaydi).
 *
 * Savol: prodda nechta tovarda chakana narx yo'q/0, optom narx yo'q, tan narx
 * NULL (≠ 0!) — ya'ni «narx POLI» va «0-narx himoyasi» qancha katalogga tegadi.
 *
 * 🔴 NULL ≠ 0 (`retail-cost-freeze-null-contract` xotirasi): tan narx NULL =
 * «yig'ilmagan» (pol YO'Q), 0 = «yig'ilgan va haqiqatan nol» (pol 0). Skript
 * ikkalasini ALOHIDA sanaydi — bir ustunga qo'shilsa siyosat qarori yolg'on
 * raqamga tayanardi.
 *
 * Narx zanjiri POS'da uch qavat va ikkalasi ham JSON `salePrices` ichida:
 *   chakana = default PriceType (yoki legacy 'default' sentinel yoki 1-qator)
 *   optom   = 2-PriceType (yoki legacy 'wholesale' sentinel) — fallback YO'Q
 *   tan     = `Product.buyPrice` ustuni
 * Rezolyutsiya `retail-sale/price-snapshot.ts` dan IMPORT qilinadi — bu yerda
 * qayta yozilsa o'lchov POS ko'rgan narxdan farq qilardi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-p12-price-audit.ts
 */
import { PrismaClient } from '@moysklad/db';
import {
  type SalePricesJson,
  resolveBasePriceMinor,
  resolveWholesaleMinor,
} from '../modules/retail-sale/price-snapshot.js';

const prisma = new PrismaClient();
const som = (m: bigint | null) =>
  m == null ? 'null' : `${(m / 100n).toLocaleString('ru-RU')} so'm`;

async function main() {
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  console.log(`Akkauntlar: ${accounts.length}`);

  for (const acc of accounts) {
    const priceTypes = await prisma.priceType.findMany({
      where: { accountId: acc.id, archived: false },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, isDefault: true, position: true },
    });
    const defaultId = priceTypes.find((t) => t.isDefault)?.id ?? priceTypes[0]?.id ?? null;
    const wholesaleId = priceTypes.find((t) => t.id !== defaultId)?.id ?? null;

    const products = await prisma.product.findMany({
      where: { accountId: acc.id, archived: false, kind: 'product' },
      select: { id: true, name: true, code: true, buyPrice: true, salePrices: true },
    });

    let noRetail = 0; // chakana narx umuman yo'q (null)
    let zeroRetail = 0; // chakana narx = 0
    let noWholesale = 0;
    let nullCost = 0; // tan narx NULL — pol YO'Q
    let zeroCost = 0; // tan narx 0 — pol 0 (ALOHIDA!)
    let retailBelowCost = 0; // kartaning o'zi poldan past — pol yoqilsa sotib bo'lmaydi
    const samplesNoPrice: string[] = [];
    const samplesBelowCost: string[] = [];

    for (const p of products) {
      const base = resolveBasePriceMinor(p.salePrices as SalePricesJson, defaultId);
      const wholesale = resolveWholesaleMinor(p.salePrices as SalePricesJson, wholesaleId);
      if (base == null) {
        noRetail++;
        if (samplesNoPrice.length < 5) samplesNoPrice.push(`${p.name} (${p.code ?? '—'})`);
      } else if (base === 0n) {
        zeroRetail++;
        if (samplesNoPrice.length < 5) samplesNoPrice.push(`${p.name} (${p.code ?? '—'}) = 0`);
      }
      if (wholesale == null) noWholesale++;
      if (p.buyPrice == null) nullCost++;
      else if (p.buyPrice === 0n) zeroCost++;
      if (p.buyPrice != null && base != null && base < p.buyPrice) {
        retailBelowCost++;
        if (samplesBelowCost.length < 5)
          samplesBelowCost.push(`${p.name}: chakana ${som(base)} < tan ${som(p.buyPrice)}`);
      }
    }

    console.log(`\n=== ${acc.name} (${acc.id}) ===`);
    console.log(
      `PriceType'lar (${priceTypes.length}): ${priceTypes
        .map((t) => `${t.name}${t.isDefault ? ' [default]' : ''}`)
        .join(', ')}`,
    );
    console.log(`  default=${defaultId ?? 'YO‘Q'} · wholesale=${wholesaleId ?? 'YO‘Q'}`);
    console.log(`Tovarlar (archived emas, kind=product): ${products.length}`);
    console.log(`  chakana narx YO'Q (null): ${noRetail}`);
    console.log(`  chakana narx = 0:         ${zeroRetail}`);
    console.log(`  optom narx YO'Q:          ${noWholesale}`);
    console.log(`  tan narx NULL (pol YO'Q): ${nullCost}`);
    console.log(`  tan narx = 0 (pol 0):     ${zeroCost}`);
    console.log(`  chakana < tan (pol buzadi): ${retailBelowCost}`);
    if (samplesNoPrice.length) console.log(`  namuna narxsiz: ${samplesNoPrice.join(' | ')}`);
    if (samplesBelowCost.length) console.log(`  namuna pol-buzar: ${samplesBelowCost.join(' | ')}`);

    // Variantlar (modifikatsiya) ham narx tashiydi — o'z ustunlarida.
    const variants = await prisma.variant.findMany({
      where: { accountId: acc.id, archived: false },
      select: { id: true, buyPrice: true, salePrices: true },
    });
    let vNoRetail = 0;
    let vNullCost = 0;
    for (const v of variants) {
      if (resolveBasePriceMinor(v.salePrices as SalePricesJson, defaultId) == null) vNoRetail++;
      if (v.buyPrice == null) vNullCost++;
    }
    console.log(
      `  Variant (archived emas): ${variants.length} · chakana YO'Q ${vNoRetail} · tan NULL ${vNullCost}`,
    );

    // Poldan past sotilgan tarixiy cheklar — pol yoqilgach bunday chek endi
    // post bo'lmaydi; hozir nechtasi borligi qarorning narxini ko'rsatadi.
    const belowCostEvents = await prisma.cashierAuditEvent.count({
      where: { accountId: acc.id, type: 'SOLD_BELOW_COST' },
    });
    console.log(`  Tarixiy SOLD_BELOW_COST hodisalari: ${belowCostEvents}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
