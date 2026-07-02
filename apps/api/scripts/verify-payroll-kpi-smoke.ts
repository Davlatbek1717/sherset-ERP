/**
 * Phase-2 real-data smoke for the HR Oylik (P5) money path. The unit tests
 * mock Prisma; this drives the REAL HrKpiService + HrPayrollService through
 * the production DI graph against real Postgres, end-to-end:
 *
 *   demand(ownerId, posted) → KPI snapshotDay (personal sales attribution)
 *     → payroll computeMonthly (Σ daily → achievement → tier → kpi,
 *        commission, bonus−fine, fix) → final salary.
 *
 * Two scenarios:
 *   [1] correctness — exact sales attribution, commission, ledger flow, and
 *       the final = fix + kpi + bonus − fine + commission identity.
 *   [2] concurrency — computeMonthlyAll fired 3× in parallel must NOT create
 *       duplicate monthly-score rows (unique (account,employee,yearMonth))
 *       and must converge to the same values (idempotent upsert).
 *
 * Run (from apps/api):
 *   node --env-file=../../.env.local --import tsx scripts/verify-payroll-kpi-smoke.ts
 *
 * Safe: one throwaway Account (random UUID), cascade-deleted in finally.
 */
import { prisma } from '@moysklad/db';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { HrKpiService } from '../src/modules/hr/hr-kpi/hr-kpi.service.js';
import { HrPayrollService } from '../src/modules/hr/hr-salary/hr-payroll.service.js';

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

const YEAR_MONTH = '2026-05';
const DAY = new Date('2026-05-15T08:00:00Z'); // 13:00 Asia/Tashkent — same local day

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const kpi = app.get(HrKpiService);
  const payroll = app.get(HrPayrollService);
  const accountId = crypto.randomUUID();

  try {
    await prisma.account.create({ data: { id: accountId, name: 'PAYROLL-SMOKE-THROWAWAY' } });
    const org = await prisma.organization.create({ data: { accountId, name: 'Org' } });
    const store = await prisma.store.create({ data: { accountId, name: 'Ombor' } });
    const customer = await prisma.counterparty.create({ data: { accountId, name: 'Customer' } });

    // Salary config: target 1_000_000, kpi budget 500_000, commission 10%,
    // tiers: <100% ⇒ 0 payout, ≥100% ⇒ full budget.
    await prisma.hrSalaryConfig.create({
      data: {
        accountId,
        fixWeight: 1,
        kpiWeight: 1,
        bonusWeight: 1,
        monthlySalesTarget: 1_000_000n,
        monthlyKpiBudget: 500_000n,
        commissionPercent: 10,
        kpiTiers: [
          { min: 0, payout: 0 },
          { min: 100, payout: 100 },
        ],
      },
    });

    // ── Employee 1: hits 100% target, has a bonus + fine ───────────────
    const e1 = await prisma.employee.create({
      data: {
        accountId,
        name: 'E1',
        email: `e1-${accountId}@smoke.local`,
        salaryConfig: { baseSalaryMinor: '2000000' },
      },
    });
    await prisma.demand.create({
      data: {
        accountId,
        name: 'D-E1',
        agentId: customer.id,
        organizationId: org.id,
        storeId: store.id,
        ownerId: e1.id,
        currency: 'UZS',
        rateValue: 100_000_000n,
        state: 'posted',
        postedAt: DAY,
        sumMinor: 1_000_000n,
      },
    });
    await prisma.hrBonusFineLog.createMany({
      data: [
        {
          accountId,
          employeeId: e1.id,
          kind: 'bonus',
          source: 'manual',
          amountMinor: 300_000n,
          createdAt: DAY,
        },
        {
          accountId,
          employeeId: e1.id,
          kind: 'fine',
          source: 'manual',
          amountMinor: 100_000n,
          createdAt: DAY,
        },
      ],
    });

    // ── [1] end-to-end correctness ─────────────────────────────────────
    const snap1 = await kpi.snapshotDay(accountId, DAY);
    const dailyE1 = await prisma.hrKpiDailyLog.findFirst({
      where: { accountId, employeeId: e1.id },
      select: { personalSalesMinor: true },
    });
    console.log('\n[1] KPI snapshot + payroll compute (E1, 100% target):');
    check('snapshot wrote a row', snap1.written >= 1, true);
    check('personal sales attributed to owner', dailyE1?.personalSalesMinor, 1_000_000n);

    const m1 = await payroll.computeMonthly(accountId, e1.id, YEAR_MONTH);
    check('total sales = Σ daily', m1.totalSalesMinor, 1_000_000n);
    check('commission = sales × 10%', m1.commissionMinor, 100_000n);
    check('kpi earned (100% tier → full budget)', m1.kpiEarnedMinor, 500_000n);
    check('fix = base salary', m1.fixComponentMinor, 2_000_000n);
    check('bonus ledger flowed in', m1.bonusSumMinor, 300_000n);
    check('fine ledger flowed in', m1.fineSumMinor, 100_000n);
    // final = 2_000_000 + 500_000 + 300_000 − 100_000 + 100_000 = 2_800_000
    check('final salary', m1.finalSalaryMinor, 2_800_000n);
    // self-consistency identity (holds regardless of formula constants)
    const identity =
      m1.fixComponentMinor +
      m1.kpiEarnedMinor +
      m1.bonusSumMinor -
      m1.fineSumMinor +
      m1.commissionMinor;
    check('final == Σ components (identity)', m1.finalSalaryMinor, identity);

    // ── [2] concurrency — parallel computeMonthlyAll must not duplicate ─
    const e2 = await prisma.employee.create({
      data: {
        accountId,
        name: 'E2',
        email: `e2-${accountId}@smoke.local`,
        salaryConfig: { baseSalaryMinor: '1000000' },
      },
    });
    await prisma.demand.create({
      data: {
        accountId,
        name: 'D-E2',
        agentId: customer.id,
        organizationId: org.id,
        storeId: store.id,
        ownerId: e2.id,
        currency: 'UZS',
        rateValue: 100_000_000n,
        state: 'posted',
        postedAt: DAY,
        sumMinor: 500_000n,
      },
    });
    await kpi.snapshotDay(accountId, DAY); // now covers E1 + E2

    console.log('\n[2] concurrent computeMonthlyAll ×3 (race / lost-update):');
    await Promise.allSettled([
      payroll.computeMonthlyAll(accountId, YEAR_MONTH),
      payroll.computeMonthlyAll(accountId, YEAR_MONTH),
      payroll.computeMonthlyAll(accountId, YEAR_MONTH),
    ]);
    const rowCount = await prisma.hrKpiMonthlyScore.count({
      where: { accountId, yearMonth: YEAR_MONTH },
    });
    check('exactly 2 score rows (no concurrent duplicates)', rowCount, 2);

    const e1Row = await prisma.hrKpiMonthlyScore.findFirst({
      where: { accountId, employeeId: e1.id, yearMonth: YEAR_MONTH },
      select: { finalSalaryMinor: true },
    });
    const e2Row = await prisma.hrKpiMonthlyScore.findFirst({
      where: { accountId, employeeId: e2.id, yearMonth: YEAR_MONTH },
      select: { finalSalaryMinor: true, commissionMinor: true, kpiEarnedMinor: true },
    });
    check('E1 final stable under concurrency', e1Row?.finalSalaryMinor, 2_800_000n);
    // E2: 50% achievement ⇒ tier 0 ⇒ kpi 0; commission 500_000×10% = 50_000;
    // final = 1_000_000 + 0 + 0 − 0 + 50_000 = 1_050_000
    check('E2 kpi earned (50% tier → 0)', e2Row?.kpiEarnedMinor, 0n);
    check('E2 commission', e2Row?.commissionMinor, 50_000n);
    check('E2 final salary', e2Row?.finalSalaryMinor, 1_050_000n);
  } finally {
    await prisma.account.delete({ where: { id: accountId } }).catch((e) => {
      console.error(`cleanup failed (delete ${accountId}): ${e.message}`);
    });
    await app.close();
    await prisma.$disconnect();
  }

  console.log(`\n${'-'.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('SMOKE CRASHED:', e);
  process.exit(1);
});
