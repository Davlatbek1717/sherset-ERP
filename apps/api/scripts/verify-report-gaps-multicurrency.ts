/**
 * Live-DB verification for the three report gaps found AFTER the original
 * 2026-05-22 currency audit (which missed counterparty-balance + stock-balance
 * entirely and left slow-movers/unit-economics as Tier-2 "blocked"):
 *
 *   [1] slow-movers      — was querying `FROM stock` (table is `stocks`), so
 *                          the report threw at runtime. Proves it now RUNS and
 *                          tied capital is base (cost normalized at step A/C).
 *   [2] counterparty-balance — summaries summed balanceMinor across currencies
 *                          (USD cents + UZS tiyin). Proves base consolidation
 *                          + mixedCurrency in both flat and groupBy modes.
 *   [3] unit-economics   — revenue summed across demand currencies. Proves
 *                          per-product fold consolidates revenue to base while
 *                          COGS (already base) sums directly.
 *
 * Run (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/verify-report-gaps-multicurrency.ts
 *
 * Safe: ONE throwaway Account (random UUID), cascade-deleted in finally.
 */
import { prisma } from '@moysklad/db';
import { CounterpartyBalanceService } from '../src/modules/report/counterparty-balance.service.js';
import { SlowMoversService } from '../src/modules/report/slow-movers.service.js';
import { UnitEconomicsService } from '../src/modules/report/unit-economics.service.js';

const E8 = 100_000_000n;
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

  try {
    await prisma.account.create({ data: { id: accountId, name: 'REPORT-GAPS-VERIFY-THROWAWAY' } });
    await prisma.currency.createMany({
      data: [
        {
          accountId,
          code: 'UZS',
          name: 'soʻm',
          default: true,
          rateValue: E8,
          multiplicity: 1,
          indirect: false,
        },
        {
          accountId,
          code: 'USD',
          name: 'dollar',
          default: false,
          rateValue: 12_000n * E8,
          multiplicity: 1,
          indirect: false,
        },
      ],
    });
    const org = await prisma.organization.create({ data: { accountId, name: 'Org' } });
    const store = await prisma.store.create({ data: { accountId, name: 'Ombor' } });
    const cpA = await prisma.counterparty.create({ data: { accountId, name: 'CP-A (UZS)' } });
    const cpB = await prisma.counterparty.create({ data: { accountId, name: 'CP-B (USD)' } });
    const cpC = await prisma.counterparty.create({ data: { accountId, name: 'CP-C (MIX)' } });
    const customer = await prisma.counterparty.create({ data: { accountId, name: 'Customer' } });
    const slowProd = await prisma.product.create({ data: { accountId, name: 'SLOW P' } });
    const ueProd = await prisma.product.create({ data: { accountId, name: 'UE P' } });

    // ── [1] slow-movers — stock with qty>0, base cost, never sold ──────────
    await prisma.stock.create({
      data: {
        accountId,
        storeId: store.id,
        assortmentKind: 'product',
        assortmentId: slowProd.id,
        qty: '5',
        costBalanceMinor: 5_000_000n, // base (post step A/C)
      },
    });
    const slow = new SlowMoversService({ client: prisma } as never);
    const slowReport = await slow.report(accountId, { thresholdDays: 90 });
    console.log('\n[1] slow-movers (FROM stocks runtime fix + base currency):');
    const slowRow = slowReport.rows.find((r) => r.productId === slowProd.id);
    check('report ran (rows present)', slowReport.totalRows >= 1, true);
    check('slow row found', slowRow?.productId, slowProd.id);
    check('tied capital = base cost', slowRow?.tiedCapitalMinor, '5000000');
    check('never-sold → daysSinceLastSale null', slowRow?.daysSinceLastSale, null);
    check('currency = base', slowReport.currency, 'UZS');
    check('totalTiedCapital = base', slowReport.totalTiedCapitalMinor, '5000000');

    // ── [2] counterparty-balance flat summaries (cross-currency sum fix) ───
    // cpA: +1_000_000 UZS (base 1_000_000). cpB: +100_00 USD (base 120_000_000).
    await prisma.counterpartyBalance.createMany({
      data: [
        { accountId, counterpartyId: cpA.id, currency: 'UZS', balanceMinor: 1_000_000n },
        { accountId, counterpartyId: cpB.id, currency: 'USD', balanceMinor: 100_00n },
      ],
    });
    const cpSvc = new CounterpartyBalanceService({ client: prisma } as never);
    const flat = await cpSvc.counterpartyBalanceReport(accountId, {
      signFilter: 'all',
      groupBy: 'none',
    });
    console.log('\n[2] counterparty-balance flat (base-consolidated summaries):');
    // 1_000_000 (UZS) + 120_000_000 (USD→base) = 121_000_000
    check('totalDebt consolidated', flat.summaries.totalDebtMinor, '121000000');
    check('net consolidated', flat.summaries.netMinor, '121000000');
    check('debtorCount', flat.summaries.debtorCount, 2);
    check('summaries.currency base', flat.summaries.currency, 'UZS');
    check('summaries.mixedCurrency', flat.summaries.mixedCurrency, true);

    // ── [3] counterparty-balance groupBy=counterparty (collapse to base) ──
    // cpC holds BOTH: +500_000 UZS and +10_00 USD → base 500_000 + 12_000_000.
    await prisma.counterpartyBalance.createMany({
      data: [
        { accountId, counterpartyId: cpC.id, currency: 'UZS', balanceMinor: 500_000n },
        { accountId, counterpartyId: cpC.id, currency: 'USD', balanceMinor: 10_00n },
      ],
    });
    const grouped = await cpSvc.counterpartyBalanceReport(accountId, {
      signFilter: 'all',
      groupBy: 'counterparty',
    });
    console.log('\n[3] counterparty-balance groupBy (multi-currency collapse → base):');
    const cpCrow = grouped.items.find((r) => r.counterpartyId === cpC.id);
    check('cpC collapsed to base', cpCrow?.balanceMinor, '12500000');
    check('cpC row currency = base (not MIX)', cpCrow?.currency, 'UZS');
    check('grouped mixedCurrency', grouped.summaries.mixedCurrency, true);
    // total now 121_000_000 + 12_500_000 = 133_500_000
    check('grouped totalDebt', grouped.summaries.totalDebtMinor, '133500000');

    // ── [4] unit-economics (revenue→base fold, cost already base) ──────────
    // UZS demand: qty 2 @ price 10_000 → rev 20_000 (base 20_000), cost 3_000/u → cogs 6_000
    // USD demand: qty 1 @ price 5_00   → rev 500 → base 6_000_000,    cost 40_000/u → cogs 40_000
    const dUzs = await prisma.demand.create({
      data: {
        accountId,
        name: 'D-UZS',
        agentId: customer.id,
        organizationId: org.id,
        storeId: store.id,
        currency: 'UZS',
        rateValue: E8,
        state: 'posted',
        moment: new Date('2026-05-15T10:00:00Z'),
        sumMinor: 20_000n,
      },
    });
    await prisma.demandPosition.create({
      data: {
        accountId,
        demandId: dUzs.id,
        position: 1,
        assortmentKind: 'product',
        assortmentId: ueProd.id,
        productId: ueProd.id,
        quantity: '2',
        priceMinor: 10_000n,
        discount: '0',
        costMinor: 3_000n,
      },
    });
    const dUsd = await prisma.demand.create({
      data: {
        accountId,
        name: 'D-USD',
        agentId: customer.id,
        organizationId: org.id,
        storeId: store.id,
        currency: 'USD',
        rateValue: 12_000n * E8,
        state: 'posted',
        moment: new Date('2026-05-16T10:00:00Z'),
        sumMinor: 5_00n,
      },
    });
    await prisma.demandPosition.create({
      data: {
        accountId,
        demandId: dUsd.id,
        position: 1,
        assortmentKind: 'product',
        assortmentId: ueProd.id,
        productId: ueProd.id,
        quantity: '1',
        priceMinor: 5_00n,
        discount: '0',
        costMinor: 40_000n,
      },
    });
    const ue = new UnitEconomicsService({ client: prisma } as never);
    const ueReport = await ue.report(accountId, { dateFrom: '2026-05-01', dateTo: '2026-05-31' });
    console.log('\n[4] unit-economics (revenue consolidated, COGS base):');
    const ueRow = ueReport.rows.find((r) => r.productId === ueProd.id);
    check('product folded across currencies', ueRow?.productId, ueProd.id);
    check('qty summed', ueRow?.quantitySold, '3');
    check('orders summed', ueRow?.ordersCount, 2);
    // 20_000 (UZS) + 6_000_000 (USD→base) = 6_020_000
    check('revenue consolidated → base', ueRow?.revenueMinor, '6020000');
    // 6_000 + 40_000 (both base) = 46_000
    check('cogs summed (base)', ueRow?.cogsMinor, '46000');
    check('totals revenue consolidated', ueReport.totals.revenueMinor, '6020000');
    check('currency = base', ueReport.currency, 'UZS');
    check('mixedCurrency', ueReport.mixedCurrency, true);
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
  console.error('VERIFY SCRIPT CRASHED:', e);
  process.exit(1);
});
