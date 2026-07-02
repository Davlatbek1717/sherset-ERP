import { describe, expect, it, vi } from 'vitest';
import { CounterpartyBalanceService } from './counterparty-balance.service.js';

/**
 * Unit coverage for the multi-currency consolidation fix (commit abb78ece).
 *
 * The bug: computeSummaries + collapseByCounterparty summed `balanceMinor`
 * across currencies (USD cents + UZS tiyin). These tests stub the prisma
 * boundary with canned multi-currency balances and assert the service folds
 * each row to the account base (валюта учёта) before summing.
 *
 * Rate fixture: base UZS (1e8), USD @ 12 000 (rateValue = 12000 * 1e8).
 * So a USD minor amount → base = amount * 12000.
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface CannedBalance {
  counterpartyId: string;
  currency: string;
  balanceMinor: bigint;
  name: string;
  archived?: boolean;
}

/** Build a PrismaService double whose counterpartyBalance.findMany returns
 *  the given canned rows (shaped with the `counterparty` include). */
function makeService(balances: CannedBalance[]) {
  const rows = balances.map((b) => ({
    counterpartyId: b.counterpartyId,
    currency: b.currency,
    balanceMinor: b.balanceMinor,
    updatedAt: new Date('2026-05-20T00:00:00Z'),
    counterparty: {
      id: b.counterpartyId,
      name: b.name,
      legalTitle: null,
      companyType: 'legal',
      archived: b.archived ?? false,
    },
  }));
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    counterpartyBalance: {
      findMany: vi.fn(async () => rows),
      count: vi.fn(async () => rows.length),
    },
  };
  return new CounterpartyBalanceService({ client } as never);
}

// Pass includeArchived=true + no search ⇒ service skips the counterparty
// pre-resolve query, so only the two stubs above are exercised.
const BASE_FILTER = { signFilter: 'all' as const, includeArchived: true };

describe('CounterpartyBalanceService — multi-currency consolidation', () => {
  it('flat summaries: USD balance is base-consolidated, not added raw to UZS', async () => {
    const svc = makeService([
      { counterpartyId: 'cp-a', currency: 'UZS', balanceMinor: 1_000_000n, name: 'A' },
      { counterpartyId: 'cp-b', currency: 'USD', balanceMinor: 100_00n, name: 'B' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, groupBy: 'none' });
    // 1_000_000 (UZS) + 100_00 * 12000 (USD→base 120_000_000) = 121_000_000
    expect(r.summaries.totalDebtMinor).toBe('121000000');
    expect(r.summaries.netMinor).toBe('121000000');
    expect(r.summaries.debtorCount).toBe(2);
    expect(r.summaries.currency).toBe('UZS');
    expect(r.summaries.mixedCurrency).toBe(true);
    // per-row display keeps each row's own currency
    expect(r.items.find((i) => i.counterpartyId === 'cp-b')?.currency).toBe('USD');
  });

  it('groupBy=counterparty: a CP holding USD+UZS collapses to a base total', async () => {
    const svc = makeService([
      { counterpartyId: 'cp-c', currency: 'UZS', balanceMinor: 500_000n, name: 'C' },
      { counterpartyId: 'cp-c', currency: 'USD', balanceMinor: 10_00n, name: 'C' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', {
      ...BASE_FILTER,
      groupBy: 'counterparty',
    });
    const cpC = r.items.find((i) => i.counterpartyId === 'cp-c');
    // 500_000 + 10_00 * 12000 (12_000_000) = 12_500_000
    expect(cpC?.balanceMinor).toBe('12500000');
    expect(cpC?.currency).toBe('UZS'); // base code, never the legacy "MIX"
    expect(r.summaries.mixedCurrency).toBe(true);
  });

  it('creditor (negative) sign survives base conversion', async () => {
    const svc = makeService([
      { counterpartyId: 'cp-d', currency: 'USD', balanceMinor: -50_00n, name: 'D' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, groupBy: 'none' });
    // -50_00 * 12000 = -60_000_000 ⇒ credit
    expect(r.summaries.totalCreditMinor).toBe('60000000');
    expect(r.summaries.creditorCount).toBe(1);
    expect(r.summaries.netMinor).toBe('-60000000');
  });

  it('single-currency tenant: consolidation is the identity (no drift)', async () => {
    const svc = makeService([
      { counterpartyId: 'cp-a', currency: 'UZS', balanceMinor: 1_000_000n, name: 'A' },
      { counterpartyId: 'cp-b', currency: 'UZS', balanceMinor: 2_500_000n, name: 'B' },
    ]);
    const r = await svc.counterpartyBalanceReport('acc', { ...BASE_FILTER, groupBy: 'none' });
    expect(r.summaries.totalDebtMinor).toBe('3500000');
    expect(r.summaries.mixedCurrency).toBe(false);
  });
});
