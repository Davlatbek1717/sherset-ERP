/**
 * Live-DB verification for the cash-flow multi-currency consolidation fix
 * (commit befdf368). Proves the raw SQL in groupByDate + groupByFk actually
 * runs against Postgres AND that mixed-currency sub-totals are consolidated
 * to base via toBaseMinor — the runtime gap the unit tests couldn't cover.
 *
 * Run (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/verify-cashflow-multicurrency.ts
 *
 * Safe: creates ONE throwaway Account (random UUID, name
 * "CASHFLOW-VERIFY-THROWAWAY") and cascade-deletes it in a finally block —
 * never reads or mutates real tenant data, leaves zero residue.
 */
import { prisma } from '@moysklad/db';
import { AgingService } from '../src/modules/report/aging.service.js';
import { AverageBasketService } from '../src/modules/report/average-basket.service.js';
import { CashFlowService } from '../src/modules/report/cash-flow.service.js';
import { PurchaseManagementService } from '../src/modules/report/purchase-management.service.js';
import { SalesByChannelService } from '../src/modules/report/sales-by-channel.service.js';
import { SalesByHourService } from '../src/modules/report/sales-by-hour.service.js';

const E8 = 100_000_000n;
let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}: ${actual}`);
  } else {
    fail++;
    console.error(`  ❌ ${label}: got ${actual}, expected ${expected}`);
  }
}

async function main(): Promise<void> {
  const svc = new CashFlowService({ client: prisma } as never);
  const accountId = crypto.randomUUID();

  try {
    // ── seed throwaway tenant graph ────────────────────────────────────
    await prisma.account.create({ data: { id: accountId, name: 'CASHFLOW-VERIFY-THROWAWAY' } });

    await prisma.currency.createMany({
      data: [
        {
          accountId,
          code: 'UZS',
          name: 'O‘zbek so‘mi',
          default: true,
          rateValue: E8,
          multiplicity: 1,
          indirect: false,
        },
        {
          accountId,
          code: 'USD',
          name: 'AQSh dollari',
          default: false,
          rateValue: 12_000n * E8, // 1 USD = 12 000 UZS
          multiplicity: 1,
          indirect: false,
        },
      ],
    });

    const org = await prisma.organization.create({
      data: { accountId, name: 'Verify Org' },
    });
    const cashDesk = await prisma.cashDesk.create({
      data: { accountId, name: 'Verify Kassa' },
    });
    const cpA = await prisma.counterparty.create({
      data: { accountId, name: 'CP-A (UZS)' },
    });
    const cpB = await prisma.counterparty.create({
      data: { accountId, name: 'CP-B (USD)' },
    });
    const store = await prisma.store.create({
      data: { accountId, name: 'Verify Ombor' },
    });

    const moment = new Date('2026-05-15T10:00:00Z');
    const asOfDate = new Date('2026-05-20T00:00:00Z');

    // cp-A: 10 000 so'm cash-in (UZS) → base 1_000_000 tiyin
    // cp-B: 100 USD cash-in (USD)     → base 100_00 × 12000 = 120_000_000 tiyin
    // cp-A: 5 000 so'm cash-out (UZS) → base 500_000 tiyin (outflow)
    await prisma.cashIn.createMany({
      data: [
        {
          accountId,
          name: 'PKO-VERIFY-1',
          agentId: cpA.id,
          organizationId: org.id,
          cashDeskId: cashDesk.id,
          currency: 'UZS',
          state: 'posted',
          moment,
          sumMinor: 1_000_000n,
        },
        {
          accountId,
          name: 'PKO-VERIFY-2',
          agentId: cpB.id,
          organizationId: org.id,
          cashDeskId: cashDesk.id,
          currency: 'USD',
          state: 'posted',
          moment,
          sumMinor: 100_00n,
        },
      ],
    });
    await prisma.cashOut.create({
      data: {
        accountId,
        name: 'RKO-VERIFY-1',
        agentId: cpA.id,
        organizationId: org.id,
        cashDeskId: cashDesk.id,
        currency: 'UZS',
        state: 'posted',
        moment,
        sumMinor: 500_000n,
      },
    });

    const filterBase = {
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
    };

    // ── 1. totals (already-correct path — sanity) ─────────────────────
    const totalsReport = await svc.cashFlowReport(accountId, {
      ...filterBase,
      groupBy: 'none',
    });
    console.log('\n[1] Totals (base-consolidated):');
    // inflow = 1_000_000 (UZS) + 120_000_000 (USD→base) = 121_000_000
    check('inflowSumMinor', totalsReport.totals.inflowSumMinor, '121000000');
    check('outflowSumMinor', totalsReport.totals.outflowSumMinor, '500000');
    check('netSumMinor', totalsReport.totals.netSumMinor, '120500000');
    check('mixedCurrency', totalsReport.mixedCurrency, true);
    check('currency', totalsReport.currency, 'UZS');

    // ── 2. groupBy=day (THE FIX — was raw SUM mixing currencies) ──────
    const dayReport = await svc.cashFlowReport(accountId, {
      ...filterBase,
      groupBy: 'day',
    });
    console.log('\n[2] groupBy=day (fixed multi-currency consolidation):');
    check('day buckets', dayReport.groups.length, 1);
    const day = dayReport.groups[0];
    check('day inflow consolidated', day?.inflowSumMinor, '121000000');
    check('day outflow', day?.outflowSumMinor, '500000');
    check('day net', day?.netSumMinor, '120500000');
    check('day inflowCount', day?.inflowCount, 2);
    check('day outflowCount', day?.outflowCount, 1);

    // ── 3. groupBy=counterparty (THE FIX — FK ranking on consolidated) ─
    const cpReport = await svc.cashFlowReport(accountId, {
      ...filterBase,
      groupBy: 'counterparty',
    });
    console.log('\n[3] groupBy=counterparty (consolidated net ranking):');
    check('cp groups', cpReport.groups.length, 2);
    // cp-B (USD → 120_000_000 base) must rank ABOVE cp-A (net 500_000) —
    // proves ranking runs on CONSOLIDATED net, not raw foreign minor.
    check('rank[0] = cp-B', cpReport.groups[0]?.ref?.name, 'CP-B (USD)');
    check('cp-B inflow consolidated', cpReport.groups[0]?.inflowSumMinor, '120000000');
    check('rank[1] = cp-A', cpReport.groups[1]?.ref?.name, 'CP-A (UZS)');
    check('cp-A net (1M in - 0.5M out)', cpReport.groups[1]?.netSumMinor, '500000');

    // ── 4. groupBy=channel (already-correct path — sanity) ────────────
    const chReport = await svc.cashFlowReport(accountId, {
      ...filterBase,
      groupBy: 'channel',
    });
    console.log('\n[4] groupBy=channel (sanity):');
    const cashInRow = chReport.groups.find((g) => g.key === 'cash_in');
    check('cash_in channel consolidated', cashInRow?.inflowSumMinor, '121000000');

    // ── 5. AGING multi-currency (the second fix) ──────────────────────
    // cp-A owes: 2_000_000 UZS (90+ bucket) + 50 USD (current bucket).
    // Consolidated total = 2_000_000 + 50_00×12000 = 2_000_000 + 60_000_000.
    const longAgo = new Date(asOfDate.getTime() - 200 * 86_400_000); // 90+ bucket
    const recent = asOfDate; // due == asOf ⇒ ageDays 0 ⇒ current bucket
    await prisma.invoiceOut.createMany({
      data: [
        {
          accountId,
          name: 'SCH-VERIFY-UZS',
          agentId: cpA.id,
          organizationId: org.id,
          currency: 'UZS',
          state: 'posted',
          moment: longAgo,
          paymentPlannedMoment: longAgo,
          sumMinor: 2_000_000n,
          payedSumMinor: 0n,
        },
        {
          accountId,
          name: 'SCH-VERIFY-USD',
          agentId: cpA.id,
          organizationId: org.id,
          currency: 'USD',
          state: 'posted',
          moment: recent,
          paymentPlannedMoment: recent,
          sumMinor: 50_00n,
          payedSumMinor: 0n,
        },
      ],
    });

    const aging = new AgingService({ client: prisma } as never);
    const agingReport = await aging.report(accountId, {
      side: 'receivables',
      asOf: asOfDate.toISOString(),
    });
    console.log('\n[5] aging receivables (multi-currency consolidation):');
    const cpAaging = agingReport.rows.find((r) => r.counterpartyId === cpA.id);
    // 2_000_000 (UZS) + 60_000_000 (USD→base) = 62_000_000
    check('cp-A aging total consolidated', cpAaging?.totalMinor, '62000000');
    check('aging mixedCurrency', agingReport.mixedCurrency, true);
    check('aging currency base', agingReport.currency, 'UZS');
    const plus90 = cpAaging?.buckets.find((b) => b.key === '90_plus');
    const current = cpAaging?.buckets.find((b) => b.key === 'current');
    check('90+ bucket = UZS invoice', plus90?.amountMinor, '2000000');
    check('current bucket = USD→base', current?.amountMinor, '60000000');

    // ── 6. SALES reports (demands, mixed currency) ────────────────────
    // cpA demand: 10 000 so'm (UZS) → base 1_000_000 tiyin
    // cpB demand: 50 USD (USD)      → base 50_00×12000 = 60_000_000 tiyin
    // Total revenue consolidated = 61_000_000.
    await prisma.demand.createMany({
      data: [
        {
          accountId,
          name: 'OT-VERIFY-UZS',
          agentId: cpA.id,
          organizationId: org.id,
          storeId: store.id,
          currency: 'UZS',
          state: 'posted',
          moment,
          sumMinor: 1_000_000n,
        },
        {
          accountId,
          name: 'OT-VERIFY-USD',
          agentId: cpB.id,
          organizationId: org.id,
          storeId: store.id,
          currency: 'USD',
          state: 'posted',
          moment,
          sumMinor: 50_00n,
        },
      ],
    });

    const byChannel = new SalesByChannelService({ client: prisma } as never);
    const channelReport = await byChannel.report(accountId, {
      from: '2026-05-01',
      to: '2026-05-31',
    });
    console.log('\n[6] sales-by-channel (revenue consolidation):');
    check('total revenue consolidated', channelReport.totalRevenueMinor, '61000000');
    check('sales-by-channel mixedCurrency', channelReport.mixedCurrency, true);

    const byHour = new SalesByHourService({ client: prisma } as never);
    const hourReport = await byHour.report(accountId, {
      from: '2026-05-01',
      to: '2026-05-31',
      timezone: 'UTC',
    });
    console.log('\n[7] sales-by-hour (revenue consolidation):');
    const hour10 = hourReport.rows.find((r) => r.hour === 10);
    check('hour-10 revenue consolidated', hour10?.revenueMinor, '61000000');
    check('sales-by-hour mixedCurrency', hourReport.mixedCurrency, true);

    const basket = new AverageBasketService({ client: prisma } as never);
    const basketReport = await basket.report(accountId, {
      from: '2026-05-01',
      to: '2026-05-31',
      granularity: 'month',
    });
    console.log('\n[8] average-basket (revenue consolidation):');
    check('basket total revenue consolidated', basketReport.totals.revenueMinor, '61000000');
    check('basket mixedCurrency', basketReport.mixedCurrency, true);

    // ── 9. PURCHASE-MANAGEMENT (purchase orders, mixed currency) ──────
    // cpA PO: 30 000 so'm (UZS) → base 3_000_000 tiyin
    // cpB PO: 20 USD (USD)      → base 20_00×12000 = 24_000_000 tiyin
    await prisma.purchaseOrder.createMany({
      data: [
        {
          accountId,
          name: 'ZK-VERIFY-UZS',
          agentId: cpA.id,
          organizationId: org.id,
          storeId: store.id,
          currency: 'UZS',
          state: 'posted',
          moment,
          sumMinor: 3_000_000n,
        },
        {
          accountId,
          name: 'ZK-VERIFY-USD',
          agentId: cpB.id,
          organizationId: org.id,
          storeId: store.id,
          currency: 'USD',
          state: 'posted',
          moment,
          sumMinor: 20_00n,
        },
      ],
    });

    const purchaseMgmt = new PurchaseManagementService({ client: prisma } as never);
    const pmReport = await purchaseMgmt.report(accountId, {
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
    });
    console.log('\n[9] purchase-management (ordered consolidation):');
    check('PM total ordered consolidated', pmReport.totals.orderedSumMinor, '27000000');
    check('PM mixedCurrency', pmReport.mixedCurrency, true);
    // cpB (USD 24M base) outranks cpA (UZS 3M) — ranking on consolidated.
    check('PM rank[0] = cp-B', pmReport.rows[0]?.agentName, 'CP-B (USD)');
  } finally {
    // ── cleanup: cascade-delete the throwaway tenant ──────────────────
    await prisma.account.delete({ where: { id: accountId } }).catch((e) => {
      console.error(`cleanup failed (manual delete needed for ${accountId}): ${e.message}`);
    });
    await prisma.$disconnect();
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('VERIFY SCRIPT CRASHED:', e);
  process.exit(1);
});
