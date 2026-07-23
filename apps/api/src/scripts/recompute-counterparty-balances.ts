#!/usr/bin/env tsx
/**
 * Recompute the materialized `CounterpartyBalance` cache from the source documents.
 *
 * WHY: the demo data was bulk-imported with `applicable: true` money docs but WITHOUT
 * running each service's post() (which is what calls CounterpartyBalanceService.applyDelta),
 * so the cache stayed 0 for imported counterparties. The counterparty LIST «Баланс» column
 * and /reports/counterparty-balance read this stale cache, while the card «Показатели» tab
 * recomputes from the docs — so they disagreed. This one-off backfill makes the cache match
 * the documents, so list / report / Показатели all show the same correct balance.
 *
 * Deterministic + idempotent + re-runnable: the target is Σ(applicable docs × posted-sign)
 * per (account, counterparty, currency), mirroring CounterpartyBalanceService EXACTLY:
 *   +InvoiceOut −InvoiceIn  −PaymentIn +PaymentOut  −CashIn +CashOut
 *   −Prepayment +PrepaymentReturn  CounterpartyAdjustment ±direction
 * `applicable: true` is the precise predicate applyDelta gates on (cancel clears it).
 *
 * Run (DRY by default — prints the diff, writes nothing):
 *   pnpm --filter @moysklad/api exec tsx src/scripts/recompute-counterparty-balances.ts
 * Apply:
 *   APPLY=1 pnpm --filter @moysklad/api exec tsx src/scripts/recompute-counterparty-balances.ts
 * Verify one counterparty against the /metrics endpoint:
 *   ONLY_CP=<uuid> pnpm --filter @moysklad/api exec tsx src/scripts/recompute-counterparty-balances.ts
 */
import { PrismaClient } from '@moysklad/db';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const ONLY_CP = process.env.ONLY_CP || undefined;

type Key = string; // `${accountId}|${counterpartyId}|${currency}`
const key = (a: string, c: string, cur: string): Key => `${a}|${c}|${cur}`;

async function main() {
  const where = { applicable: true, ...(ONLY_CP ? { agentId: ONLY_CP } : {}) };
  const target = new Map<Key, bigint>();
  const add = (accountId: string, agentId: string, currency: string, signed: bigint) => {
    const k = key(accountId, agentId, currency);
    target.set(k, (target.get(k) ?? 0n) + signed);
  };

  // Minimal structural type for the (account,agent,currency)-groupBy the 8 fixed-sign money
  // docs share — they're distinct Prisma delegates, so a common shape lets us loop over them.
  type SumRow = {
    accountId: string;
    agentId: string;
    currency: string;
    _sum: { sumMinor: bigint | null };
  };
  type GroupByDelegate = {
    groupBy(args: {
      by: Array<'accountId' | 'agentId' | 'currency'>;
      where: { applicable: boolean; agentId?: string };
      _sum: { sumMinor: true };
    }): Promise<SumRow[]>;
  };
  // The 8 fixed-sign doc types → Σ sumMinor × posted-sign.
  const fixed: Array<[GroupByDelegate, bigint]> = [
    [prisma.invoiceOut as unknown as GroupByDelegate, 1n],
    [prisma.invoiceIn as unknown as GroupByDelegate, -1n],
    [prisma.paymentIn as unknown as GroupByDelegate, -1n],
    [prisma.paymentOut as unknown as GroupByDelegate, 1n],
    [prisma.cashIn as unknown as GroupByDelegate, -1n],
    [prisma.cashOut as unknown as GroupByDelegate, 1n],
    [prisma.prepayment as unknown as GroupByDelegate, -1n],
    [prisma.prepaymentReturn as unknown as GroupByDelegate, 1n],
  ];
  for (const [model, sign] of fixed) {
    const rows = await model.groupBy({
      by: ['accountId', 'agentId', 'currency'],
      where,
      _sum: { sumMinor: true },
    });
    for (const r of rows) add(r.accountId, r.agentId, r.currency, sign * (r._sum.sumMinor ?? 0n));
  }
  // Adjustments carry their own sign via `direction` (INCREASE | DECREASE).
  const adj = await prisma.counterpartyAdjustment.groupBy({
    by: ['accountId', 'agentId', 'currency', 'direction'],
    where,
    _sum: { sumMinor: true },
  });
  for (const r of adj) {
    add(
      r.accountId,
      r.agentId,
      r.currency,
      (r.direction === 'INCREASE' ? 1n : -1n) * (r._sum.sumMinor ?? 0n),
    );
  }

  // Current cache rows (so we can detect changes + zero-out rows that no longer have docs).
  const current = await prisma.counterpartyBalance.findMany({
    where: ONLY_CP ? { counterpartyId: ONLY_CP } : {},
    select: { accountId: true, counterpartyId: true, currency: true, balanceMinor: true },
  });
  const currentMap = new Map<Key, bigint>();
  for (const c of current)
    currentMap.set(key(c.accountId, c.counterpartyId, c.currency), c.balanceMinor);

  // Build the change set: every key in target ∪ current.
  const allKeys = new Set<Key>([...target.keys(), ...currentMap.keys()]);
  let changed = 0;
  let unchanged = 0;
  const samples: string[] = [];
  for (const k of allKeys) {
    const want = target.get(k) ?? 0n; // no docs ⇒ balance is 0
    const have = currentMap.get(k) ?? 0n;
    if (want === have) {
      unchanged++;
      continue;
    }
    changed++;
    if (samples.length < 12) {
      const [, cp, cur] = k.split('|');
      samples.push(`  ${cp} ${cur}: ${have} → ${want}  (Δ ${want - have})`);
    }
    if (APPLY) {
      // key() built this as `${accountId}|${counterpartyId}|${currency}` → exactly 3 parts.
      const [accountId, counterpartyId, currency] = k.split('|') as [string, string, string];
      await prisma.counterpartyBalance.upsert({
        where: { counterpartyId_currency: { counterpartyId, currency } },
        create: { accountId, counterpartyId, currency, balanceMinor: want },
        update: { balanceMinor: want },
      });
    }
  }

  console.log(
    `mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}${ONLY_CP ? ` | ONLY_CP=${ONLY_CP}` : ''}`,
  );
  console.log(
    `(account,counterparty,currency) pairs: ${allKeys.size} | changed: ${changed} | unchanged: ${unchanged}`,
  );
  if (samples.length) {
    console.log('sample changes (have → want):');
    console.log(samples.join('\n'));
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
