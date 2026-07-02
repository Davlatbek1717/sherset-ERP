// One-time backfill: assign an auto «Код» to every existing modification (Variant)
// that has none — moysklad shows a code on each modification (Скоч маляр 00001 →
// 00002, 00003). New variants now auto-allocate on create/generate (variant.service);
// this fills the historical code-less rows from the SAME shared product/variant
// sequence (the 'product' documentSequence counter), per account.
//
// SAFE: only touches Variant rows with code = NULL (never overwrites an existing
// code); allocates strictly ABOVE the current max code so it can't collide with the
// per-account UNIQUE(code) constraint; advances the 'product' counter so future live
// allocations continue past the backfilled codes. Idempotent — a second run is a no-op.
//
// RUN (from the api workspace so the @moysklad/db .ts client resolves under tsx):
//   cd apps/api && node --import ./node_modules/tsx/dist/loader.mjs --env-file=.env \
//     ../../scripts/backfill-variant-codes.mjs
import { PrismaClient } from '@moysklad/db';

const p = new PrismaClient();
const pad = (n) => String(n).padStart(5, '0');
const maxNumeric = (rows) => {
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.code ?? '', 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
};

try {
  const accounts = await p.variant.findMany({
    where: { code: null },
    select: { accountId: true },
    distinct: ['accountId'],
  });
  let totalFilled = 0;
  for (const { accountId } of accounts) {
    const [products, variants, codeless, seq] = await Promise.all([
      p.product.findMany({ where: { accountId, code: { not: null } }, select: { code: true } }),
      p.variant.findMany({ where: { accountId, code: { not: null } }, select: { code: true } }),
      p.variant.findMany({
        where: { accountId, code: null },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      }),
      p.documentSequence.findUnique({
        where: { accountId_key: { accountId, key: 'product' } },
        select: { value: true },
      }),
    ]);
    let next = Math.max(maxNumeric(products), maxNumeric(variants), seq?.value ?? 0);
    for (const v of codeless) {
      next += 1;
      await p.variant.update({ where: { id: v.id }, data: { code: pad(next) } });
    }
    // Advance the shared counter so live allocations continue above the backfill.
    await p.documentSequence.upsert({
      where: { accountId_key: { accountId, key: 'product' } },
      create: { accountId, key: 'product', value: next },
      update: { value: next },
    });
    totalFilled += codeless.length;
    console.log(`account ${accountId}: filled ${codeless.length} variant codes → up to ${pad(next)}`);
  }
  console.log(`DONE — ${totalFilled} variant codes backfilled across ${accounts.length} account(s).`);
} catch (e) {
  console.error('BACKFILL ERROR:', e);
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
