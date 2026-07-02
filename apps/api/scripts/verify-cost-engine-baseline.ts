/**
 * Money-engine regression baseline (Tier-2 step D — see
 * docs/superpowers/plans/2026-05-23-cost-currency-normalization.md).
 *
 * Locks in the CURRENT §117 FIFO cost-ledger behavior BEFORE the
 * cost-currency normalization change, so that change can prove
 * zero-regression for the single-currency (UZS) case:
 *
 *   1. post identity   — single-currency supply: SupplyPosition.cost_minor
 *      == priceAfterDiscount (no rate applied; will stay identical after
 *      normalization because rateValue=1e8 ⇒ ×1).
 *   2. stock cost      — stock.cost_balance_minor == Σ line cost.
 *   3. FIFO consume    — a posted demand's cost_sum_minor == consumed
 *      qty × lot cost; supply remainingQty decremented.
 *   4. zero-sum        — post→unpost a supply returns stock to baseline.
 *
 * Drives the REAL services through the production DI graph
 * (NestFactory.createApplicationContext) — no stubs.
 *
 * Run (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/verify-cost-engine-baseline.ts
 *
 * Safe: one throwaway Account (random UUID), cascade-deleted in finally.
 */
import { prisma } from '@moysklad/db';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { DemandService } from '../src/modules/demand/demand.service.js';
import { PnlService } from '../src/modules/report/pnl.service.js';
import { StockService } from '../src/modules/stock/stock.service.js';
import { SupplyService } from '../src/modules/supply/supply.service.js';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    pass++;
    console.log(`  OK  ${label}: ${actual}`);
  } else {
    fail++;
    console.error(`  XX  ${label}: got ${actual}, expected ${expected}`);
  }
}

/** Decimal-string tolerant compare ("10" == "10.000000"). */
function checkNum(label: string, actual: string | undefined, expected: number): void {
  const n = Number(actual ?? 'NaN');
  if (n === expected) {
    pass++;
    console.log(`  OK  ${label}: ${actual}`);
  } else {
    fail++;
    console.error(`  XX  ${label}: got ${actual}, expected ${expected}`);
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const supplySvc = app.get(SupplyService);
  const demandSvc = app.get(DemandService);
  const stockSvc = app.get(StockService);

  const accountId = crypto.randomUUID();
  try {
    await prisma.account.create({
      data: { id: accountId, name: 'COST-ENGINE-BASELINE-THROWAWAY' },
    });
    const emp = await prisma.employee.create({
      data: { accountId, name: 'Verify User', email: `verify-${accountId}@local` },
    });
    const userId = emp.id;
    const org = await prisma.organization.create({ data: { accountId, name: 'Org' } });
    const store = await prisma.store.create({ data: { accountId, name: 'Ombor' } });
    const supplier = await prisma.counterparty.create({ data: { accountId, name: 'Supplier' } });
    const customer = await prisma.counterparty.create({ data: { accountId, name: 'Customer' } });
    const product = await prisma.product.create({ data: { accountId, name: 'Mahsulot P' } });

    // ── Cycle B: post identity + stock cost + FIFO consume ──────────────
    const supply = await supplySvc.create(accountId, userId, {
      agentId: supplier.id,
      organizationId: org.id,
      storeId: store.id,
      currency: 'UZS',
      rateValue: '100000000',
      positions: [
        { assortmentKind: 'product', assortmentId: product.id, quantity: '10', priceMinor: '1000' },
      ],
    });
    await supplySvc.transition(accountId, userId, supply.id, 'post');

    const sp = await prisma.supplyPosition.findFirst({
      where: { supplyId: supply.id },
      select: { costMinor: true, remainingQty: true },
    });
    console.log('\n[1] post identity (single-currency UZS):');
    // priceAfterDiscount(1000, no disc) = 1000; identity (rateValue=1e8 ⇒ ×1)
    check('SupplyPosition.cost_minor == price', sp?.costMinor?.toString(), '1000');

    const stockAfterPost = await stockSvc.getBalances(accountId, store.id, [
      { kind: 'product', id: product.id },
    ]);
    const balPost = stockAfterPost.get(product.id);
    console.log('\n[2] stock cost balance:');
    checkNum('stock qty', balPost?.qty, 10);
    check('stock cost_balance_minor == 10×1000', balPost?.costBalanceMinor?.toString(), '10000');

    const demand = await demandSvc.create(accountId, userId, {
      agentId: customer.id,
      organizationId: org.id,
      storeId: store.id,
      currency: 'UZS',
      rateValue: '100000000',
      positions: [
        { assortmentKind: 'product', assortmentId: product.id, quantity: '4', priceMinor: '1500' },
      ],
    });
    await demandSvc.transition(accountId, userId, demand.id, 'post');

    const dRow = await prisma.demand.findUnique({
      where: { id: demand.id },
      select: { costSumMinor: true },
    });
    const spAfterConsume = await prisma.supplyPosition.findFirst({
      where: { supplyId: supply.id },
      select: { remainingQty: true },
    });
    console.log('\n[3] FIFO consume (demand qty 4 of lot@1000):');
    check('demand.cost_sum_minor == 4×1000', dRow?.costSumMinor?.toString(), '4000');
    checkNum('supply remainingQty == 6', spAfterConsume?.remainingQty?.toString(), 6);

    // ── Cycle A: post→unpost zero-sum (fresh supply, no consume) ────────
    const baselineStock = await stockSvc.getBalances(accountId, store.id, [
      { kind: 'product', id: product.id },
    ]);
    const qtyBefore = baselineStock.get(product.id)?.qty ?? '0';
    const costBefore = baselineStock.get(product.id)?.costBalanceMinor?.toString() ?? '0';

    const supply2 = await supplySvc.create(accountId, userId, {
      agentId: supplier.id,
      organizationId: org.id,
      storeId: store.id,
      currency: 'UZS',
      rateValue: '100000000',
      positions: [
        { assortmentKind: 'product', assortmentId: product.id, quantity: '5', priceMinor: '2000' },
      ],
    });
    await supplySvc.transition(accountId, userId, supply2.id, 'post');
    await supplySvc.transition(accountId, userId, supply2.id, 'unpost');

    const afterUnpost = await stockSvc.getBalances(accountId, store.id, [
      { kind: 'product', id: product.id },
    ]);
    console.log('\n[4] post→unpost zero-sum:');
    checkNum('stock qty restored', afterUnpost.get(product.id)?.qty ?? '0', Number(qtyBefore));
    check(
      'stock cost restored',
      afterUnpost.get(product.id)?.costBalanceMinor?.toString() ?? '0',
      costBefore,
    );

    // ── Cycle C: MULTI-CURRENCY normalization (Step A proof) ────────────
    // USD supply, rate 12 000 (rateValue = 12000×1e8). A foreign lot priced
    // 50 USD (5000 cents) must land in the FIFO ledger as BASE:
    // 5000 × 12000 = 60_000_000 tiyin. Demand consuming it gets base COGS.
    const product2 = await prisma.product.create({ data: { accountId, name: 'Import P2' } });
    const usdSupply = await supplySvc.create(accountId, userId, {
      agentId: supplier.id,
      organizationId: org.id,
      storeId: store.id,
      currency: 'USD',
      rateValue: (12_000n * 100_000_000n).toString(),
      positions: [
        { assortmentKind: 'product', assortmentId: product2.id, quantity: '3', priceMinor: '5000' },
      ],
    });
    await supplySvc.transition(accountId, userId, usdSupply.id, 'post');

    const usdSp = await prisma.supplyPosition.findFirst({
      where: { supplyId: usdSupply.id },
      select: { costMinor: true },
    });
    console.log('\n[5] multi-currency cost normalization (USD@12000 → base):');
    check('USD SupplyPosition.cost_minor → base', usdSp?.costMinor?.toString(), '60000000');

    const usdStock = await stockSvc.getBalances(accountId, store.id, [
      { kind: 'product', id: product2.id },
    ]);
    check(
      'USD stock cost_balance_minor → base',
      usdStock.get(product2.id)?.costBalanceMinor?.toString(),
      '180000000',
    );

    const usdDemand = await demandSvc.create(accountId, userId, {
      agentId: customer.id,
      organizationId: org.id,
      storeId: store.id,
      currency: 'UZS',
      rateValue: '100000000',
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: product2.id,
          quantity: '2',
          priceMinor: '90000',
        },
      ],
    });
    await demandSvc.transition(accountId, userId, usdDemand.id, 'post');
    const usdDRow = await prisma.demand.findUnique({
      where: { id: usdDemand.id },
      select: { costSumMinor: true },
    });
    // 2 × 60_000_000 base lot cost = 120_000_000 base COGS
    check('demand COGS from USD lot → base', usdDRow?.costSumMinor?.toString(), '120000000');

    // ── 6. P&L COGS reflects base-normalized cost (Step E) ─────────────
    // Period COGS = demand1 (4×1000=4000, single-cur lot) + demand2
    // (2×60_000_000=120_000_000, USD lot via Step A) = 120_004_000 base.
    const pnl = app.get(PnlService);
    const pnlReport = await pnl.pnlReport(accountId, {
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      groupBy: 'none',
    });
    console.log('\n[6] P&L COGS base-consolidated (Step E):');
    check('P&L COGS == 4000 + 120_000_000', pnlReport.totals.cogsMinor, '120004000');
    check('P&L currency base', pnlReport.currency, 'UZS');
  } finally {
    await prisma.account.delete({ where: { id: accountId } }).catch((e) => {
      console.error(`cleanup failed (delete ${accountId} manually): ${e.message}`);
    });
    await app.close();
    await prisma.$disconnect();
  }

  console.log(`\n${'-'.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('BASELINE SCRIPT CRASHED:', e);
  process.exit(1);
});
