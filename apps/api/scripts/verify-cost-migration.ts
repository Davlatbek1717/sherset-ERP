/**
 * Logic-test for the cost-to-base migration (step C). Dev DB has 0 real
 * foreign-currency supplies, so we INJECT a deliberately "broken" pre-step-A
 * state (cost stored in the supply's document currency) via direct SQL,
 * then run the migration's UPDATE statements ACCOUNT-SCOPED (isolated from
 * the global marker), and assert everything is normalized to base.
 *
 * Run (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/verify-cost-migration.ts
 *
 * Self-cleaning: throwaway account, cascade-deleted in finally.
 */
import { prisma } from '@moysklad/db';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  if (String(actual) === String(expected)) {
    pass++;
    console.log(`  OK  ${label}: ${actual}`);
  } else {
    fail++;
    console.error(`  XX  ${label}: got ${actual}, expected ${expected}`);
  }
}

async function main(): Promise<void> {
  const accountId = crypto.randomUUID();
  const RATE = 12_000n * 100_000_000n; // USD @ 12000

  try {
    await prisma.account.create({
      data: { id: accountId, name: 'COST-MIGRATION-VERIFY-THROWAWAY' },
    });
    const org = await prisma.organization.create({ data: { accountId, name: 'Org' } });
    const store = await prisma.store.create({ data: { accountId, name: 'Ombor' } });
    const supplier = await prisma.counterparty.create({ data: { accountId, name: 'Supplier' } });
    const customer = await prisma.counterparty.create({ data: { accountId, name: 'Customer' } });
    const product = await prisma.product.create({ data: { accountId, name: 'Import P' } });

    // ── Inject BROKEN pre-step-A state (cost in supply currency) ────────
    // Foreign supply (USD@12000), 1 position: priced 5000 USD-tiyin, qty 3,
    // remaining 1 (2 consumed). cost stored RAW (supply currency), not base.
    const supply = await prisma.supply.create({
      data: {
        accountId,
        name: 'BROKEN-USD-SUPPLY',
        agentId: supplier.id,
        organizationId: org.id,
        storeId: store.id,
        currency: 'USD',
        rateValue: RATE,
        state: 'posted',
        postedAt: new Date(),
      },
    });
    const sp = await prisma.supplyPosition.create({
      data: {
        accountId,
        supplyId: supply.id,
        position: 1,
        assortmentKind: 'product',
        assortmentId: product.id,
        quantity: '3',
        priceMinor: 5000n,
        costMinor: 5000n /* RAW supply-currency */,
        remainingQty: '1',
      },
    });
    // Stock: 1 remaining unit, cost balance RAW (1 × 5000).
    await prisma.stock.create({
      data: {
        accountId,
        storeId: store.id,
        assortmentKind: 'product',
        assortmentId: product.id,
        qty: '1',
        costBalanceMinor: 5000n,
      },
    });
    // Demand consumed 2 units; consumption ledger frozen in supply currency.
    const demand = await prisma.demand.create({
      data: {
        accountId,
        name: 'BROKEN-DEMAND',
        agentId: customer.id,
        organizationId: org.id,
        storeId: store.id,
        currency: 'UZS',
        rateValue: 100_000_000n,
        state: 'posted',
        postedAt: new Date(),
        sumMinor: 180000n,
        costSumMinor: 10000n /* RAW: 2 × 5000 */,
      },
    });
    const dp = await prisma.demandPosition.create({
      data: {
        accountId,
        demandId: demand.id,
        position: 1,
        assortmentKind: 'product',
        assortmentId: product.id,
        quantity: '2',
        priceMinor: 90000n,
        costMinor: 5000n /* RAW per-unit */,
      },
    });
    await prisma.demandPositionCostConsumption.create({
      data: {
        accountId,
        demandPositionId: dp.id,
        supplyPositionId: sp.id,
        quantity: '2',
        unitCostMinor: 5000n /* RAW */,
        lineCostMinor: 10000n /* RAW */,
      },
    });

    // ── Run the migration UPDATEs, account-scoped (mirror of migrate-cost-to-base) ──
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE supply_positions sp SET cost_minor = round(sp.cost_minor::numeric * s.rate_value / 100000000)
         FROM supplies s WHERE sp.supply_id = s.id AND s.account_id = $1::uuid
           AND s.rate_value <> 100000000 AND s.state='posted' AND sp.cost_minor IS NOT NULL`,
        accountId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE demand_position_cost_consumptions c
         SET unit_cost_minor = round(c.unit_cost_minor::numeric * s.rate_value / 100000000),
             line_cost_minor = round(c.line_cost_minor::numeric * s.rate_value / 100000000)
         FROM supply_positions sp JOIN supplies s ON s.id = sp.supply_id
         WHERE c.supply_position_id = sp.id AND s.account_id = $1::uuid
           AND s.rate_value <> 100000000 AND s.state='posted'`,
        accountId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE demands d SET cost_sum_minor = sub.total FROM (
           SELECT dp.demand_id, COALESCE(SUM(c.line_cost_minor),0)::bigint AS total
           FROM demand_positions dp JOIN demand_position_cost_consumptions c ON c.demand_position_id = dp.id
           WHERE dp.demand_id IN (
             SELECT DISTINCT dp2.demand_id FROM demand_positions dp2
             JOIN demand_position_cost_consumptions c2 ON c2.demand_position_id = dp2.id
             JOIN supply_positions sp2 ON sp2.id = c2.supply_position_id
             JOIN supplies s2 ON s2.id = sp2.supply_id
             WHERE s2.account_id = $1::uuid AND s2.rate_value <> 100000000 AND s2.state='posted')
           GROUP BY dp.demand_id) sub
         WHERE d.id = sub.demand_id`,
        accountId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE demand_positions dp SET cost_minor = sub.per_unit FROM (
           SELECT c.demand_position_id,
             CASE WHEN SUM(c.quantity) > 0 THEN round(SUM(c.line_cost_minor)::numeric / SUM(c.quantity)) ELSE 0 END AS per_unit
           FROM demand_position_cost_consumptions c
           JOIN supply_positions sp ON sp.id = c.supply_position_id
           JOIN supplies s ON s.id = sp.supply_id
           WHERE s.account_id = $1::uuid AND s.rate_value <> 100000000 AND s.state='posted'
           GROUP BY c.demand_position_id) sub
         WHERE dp.id = sub.demand_position_id`,
        accountId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE stocks st SET cost_balance_minor = sub.total FROM (
           SELECT s.store_id, sp.assortment_id, COALESCE(SUM(sp.remaining_qty * sp.cost_minor),0)::bigint AS total
           FROM supply_positions sp JOIN supplies s ON s.id = sp.supply_id
           WHERE s.account_id = $1::uuid AND s.state='posted'
             AND (s.store_id, sp.assortment_id) IN (
               SELECT s3.store_id, sp3.assortment_id FROM supply_positions sp3 JOIN supplies s3 ON s3.id = sp3.supply_id
               WHERE s3.account_id = $1::uuid AND s3.rate_value <> 100000000 AND s3.state='posted')
           GROUP BY s.store_id, sp.assortment_id) sub
         WHERE st.store_id = sub.store_id AND st.assortment_id = sub.assortment_id`,
        accountId,
      );
    });

    // ── Verify everything is now base ──────────────────────────────────
    const spAfter = await prisma.supplyPosition.findUnique({
      where: { id: sp.id },
      select: { costMinor: true },
    });
    const cons = await prisma.demandPositionCostConsumption.findFirst({
      where: { demandPositionId: dp.id },
      select: { unitCostMinor: true, lineCostMinor: true },
    });
    const dAfter = await prisma.demand.findUnique({
      where: { id: demand.id },
      select: { costSumMinor: true },
    });
    const dpAfter = await prisma.demandPosition.findUnique({
      where: { id: dp.id },
      select: { costMinor: true },
    });
    const stAfter = await prisma.stock.findFirst({
      where: { accountId, assortmentId: product.id },
      select: { costBalanceMinor: true },
    });

    console.log('\nCost migration logic (USD@12000 broken → base):');
    check('supply_position.cost_minor 5000→base', spAfter?.costMinor, 60_000_000n);
    check('consumption.unit_cost 5000→base', cons?.unitCostMinor, 60_000_000n);
    check('consumption.line_cost 10000→base', cons?.lineCostMinor, 120_000_000n);
    check('demand.cost_sum re-derived → base', dAfter?.costSumMinor, 120_000_000n);
    check('demand_position.cost_minor → base', dpAfter?.costMinor, 60_000_000n);
    check('stock.cost_balance recompute (1×60M)', stAfter?.costBalanceMinor, 60_000_000n);
  } finally {
    await prisma.account.delete({ where: { id: accountId } }).catch((e) => {
      console.error(`cleanup failed (delete ${accountId}): ${e.message}`);
    });
    await prisma.$disconnect();
  }

  console.log(`\n${'-'.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('MIGRATION VERIFY CRASHED:', e);
  process.exit(1);
});
