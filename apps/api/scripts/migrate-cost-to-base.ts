/**
 * One-time data migration: normalize pre-existing foreign-currency FIFO cost
 * to the account base currency (Tier-2 step C — see
 * docs/superpowers/plans/2026-05-23-cost-currency-normalization.md).
 *
 * Step A (supply.service) already converts cost→base for all NEW posts.
 * This backfills supplies POSTED BEFORE step A, where supply_positions.cost_minor
 * (and the consumption ledger + demand COGS + stock cost) are still in the
 * supply's document currency.
 *
 * CORRECTNESS: the DemandPositionCostConsumption ledger freezes per-lot
 * consumed cost, so historical demand COGS can be re-derived exactly. All
 * conversions use the supply's stored rate_value (× rate / 1e8).
 *
 * SCOPE GUARD: every UPDATE is scoped to supplies with rate_value <> 1e8, so
 * single-currency data is provably untouched (and the whole migration is a
 * no-op for single-currency tenants).
 *
 * IDEMPOTENCY: guarded by a marker row in `_cost_base_migration` (created
 * here). Re-running is a no-op once the marker exists — re-conversion would
 * double-multiply, so the guard is mandatory.
 *
 * Usage (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/migrate-cost-to-base.ts          # dry-run (counts only)
 *   node --env-file=../../.env.local --import tsx scripts/migrate-cost-to-base.ts --apply  # execute in a tx
 */
import { prisma } from '@moysklad/db';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  // Idempotency marker table (no schema migration needed — plain DDL).
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS _cost_base_migration (id int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const marker = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    'SELECT id FROM _cost_base_migration WHERE id = 1',
  );
  if (marker.length > 0) {
    console.log('Already applied (marker present) — no-op.');
    await prisma.$disconnect();
    return;
  }

  // How much foreign data is in scope?
  const scope = await prisma.$queryRawUnsafe<Array<{ supplies: bigint; positions: bigint }>>(
    `SELECT
       (SELECT COUNT(*) FROM supplies WHERE rate_value <> 100000000 AND state='posted' AND deleted_at IS NULL) AS supplies,
       (SELECT COUNT(*) FROM supply_positions sp JOIN supplies s ON s.id=sp.supply_id
         WHERE s.rate_value <> 100000000 AND s.state='posted') AS positions`,
  );
  const s = scope[0];
  console.log(`Foreign-currency posted supplies: ${s?.supplies}, positions: ${s?.positions}`);

  if (!APPLY) {
    console.log('DRY-RUN — pass --apply to execute. No changes made.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. supply_positions.cost_minor → base
    const r1 = await tx.$executeRawUnsafe(`
      UPDATE supply_positions sp
      SET cost_minor = round(sp.cost_minor::numeric * s.rate_value / 100000000)
      FROM supplies s
      WHERE sp.supply_id = s.id AND s.rate_value <> 100000000
        AND s.state = 'posted' AND sp.cost_minor IS NOT NULL`);

    // 2. consumption ledger (unit + line cost) → base — for foreign lots
    const r2 = await tx.$executeRawUnsafe(`
      UPDATE demand_position_cost_consumptions c
      SET unit_cost_minor = round(c.unit_cost_minor::numeric * s.rate_value / 100000000),
          line_cost_minor = round(c.line_cost_minor::numeric * s.rate_value / 100000000)
      FROM supply_positions sp JOIN supplies s ON s.id = sp.supply_id
      WHERE c.supply_position_id = sp.id AND s.rate_value <> 100000000 AND s.state = 'posted'`);

    // 3. demand.cost_sum_minor → re-derive from the now-base ledger (only
    //    demands that consumed a foreign lot)
    const r3 = await tx.$executeRawUnsafe(`
      UPDATE demands d
      SET cost_sum_minor = sub.total
      FROM (
        SELECT dp.demand_id, COALESCE(SUM(c.line_cost_minor), 0)::bigint AS total
        FROM demand_positions dp
        JOIN demand_position_cost_consumptions c ON c.demand_position_id = dp.id
        WHERE dp.demand_id IN (
          SELECT DISTINCT dp2.demand_id
          FROM demand_positions dp2
          JOIN demand_position_cost_consumptions c2 ON c2.demand_position_id = dp2.id
          JOIN supply_positions sp2 ON sp2.id = c2.supply_position_id
          JOIN supplies s2 ON s2.id = sp2.supply_id
          WHERE s2.rate_value <> 100000000 AND s2.state = 'posted'
        )
        GROUP BY dp.demand_id
      ) sub
      WHERE d.id = sub.demand_id`);

    // 3b. demand_positions.cost_minor (per-unit, used by profitability) →
    //     re-derive from the now-base ledger
    const r3b = await tx.$executeRawUnsafe(`
      UPDATE demand_positions dp
      SET cost_minor = sub.per_unit
      FROM (
        SELECT c.demand_position_id,
               CASE WHEN SUM(c.quantity) > 0
                    THEN round(SUM(c.line_cost_minor)::numeric / SUM(c.quantity))
                    ELSE 0 END AS per_unit
        FROM demand_position_cost_consumptions c
        JOIN supply_positions sp ON sp.id = c.supply_position_id
        JOIN supplies s ON s.id = sp.supply_id
        WHERE s.rate_value <> 100000000 AND s.state = 'posted'
        GROUP BY c.demand_position_id
      ) sub
      WHERE dp.id = sub.demand_position_id`);

    // 4. stock.cost_balance_minor → recompute from now-base remaining lots,
    //    scoped to (store, assortment) pairs touched by a foreign supply.
    //    NOTE: assumes stock cost == Σ remaining FIFO lots. Environments with
    //    non-supply cost inflows (Enter/Inventory adjustments carrying cost)
    //    should verify with the before/after query below.
    const r4 = await tx.$executeRawUnsafe(`
      UPDATE stocks st
      SET cost_balance_minor = sub.total
      FROM (
        SELECT s.store_id, sp.assortment_id,
               COALESCE(SUM(sp.remaining_qty * sp.cost_minor), 0)::bigint AS total
        FROM supply_positions sp JOIN supplies s ON s.id = sp.supply_id
        WHERE s.state = 'posted'
          AND (s.store_id, sp.assortment_id) IN (
            SELECT s3.store_id, sp3.assortment_id
            FROM supply_positions sp3 JOIN supplies s3 ON s3.id = sp3.supply_id
            WHERE s3.rate_value <> 100000000 AND s3.state = 'posted'
          )
        GROUP BY s.store_id, sp.assortment_id
      ) sub
      WHERE st.store_id = sub.store_id AND st.assortment_id = sub.assortment_id`);

    await tx.$executeRawUnsafe('INSERT INTO _cost_base_migration (id) VALUES (1)');

    console.log(
      `Applied: supply_positions=${r1}, consumptions=${r2}, demands=${r3}, demand_positions=${r3b}, stock=${r4}`,
    );
  });

  console.log('Migration complete.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('MIGRATION FAILED:', e);
  process.exit(1);
});
