#!/usr/bin/env tsx
/**
 * Admin helper — set Store.allowNegativeStock for all stores of an account.
 *
 * Usage:
 *   pnpm --filter @moysklad/db exec tsx ../../tools/admin/enable-negative-stock.ts [true|false]
 *
 * Until the Store admin UI lands (Sprint 10), this is the official way to
 * toggle the flag. Useful for dev/demo setups where initial Supply documents
 * haven't been entered yet so every Demand post would otherwise fail
 * InsufficientStock.
 */
import { prisma } from '@moysklad/db';

async function main(): Promise<void> {
  const arg = process.argv[2] ?? 'true';
  const value = arg === 'true';
  const result = await prisma.store.updateMany({
    where: {},
    data: { allowNegativeStock: value },
  });
  console.log(`✅ Updated ${result.count} stores → allowNegativeStock=${value}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
