import { describe, expect, it, vi } from 'vitest';
import { PurchaseManagementService } from './purchase-management.service.js';

/**
 * Unit coverage for purchase-management multi-currency consolidation
 * (commit d8c87414). All four money pillars (ordered/received/invoiced/payed)
 * are base-consolidated per (agent, currency); top-N ranking runs on the
 * CONSOLIDATED ordered sum. Rate fixture: base UZS, USD @ 12 000.
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface CannedRow {
  agent_id: string;
  agent_name: string | null;
  agent_legal_title: string | null;
  currency: string;
  orders_count: bigint;
  ordered_sum_minor: bigint;
  received_sum_minor: bigint;
  invoiced_sum_minor: bigint;
  payed_sum_minor: bigint;
  completed_count: bigint;
  on_time_count: bigint;
}

function makeService(rows: CannedRow[]) {
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    $queryRaw: vi.fn(async () => rows),
  };
  return new PurchaseManagementService({ client } as never);
}

const RANGE = { dateFrom: '2026-05-01', dateTo: '2026-05-31' };

function row(p: Partial<CannedRow> & { agent_id: string; currency: string }): CannedRow {
  return {
    agent_name: 'Supplier',
    agent_legal_title: null,
    orders_count: 1n,
    ordered_sum_minor: 0n,
    received_sum_minor: 0n,
    invoiced_sum_minor: 0n,
    payed_sum_minor: 0n,
    completed_count: 0n,
    on_time_count: 0n,
    ...p,
  };
}

describe('PurchaseManagementService — multi-currency consolidation', () => {
  it('consolidates all money pillars per agent across currencies', async () => {
    const svc = makeService([
      row({
        agent_id: 'a',
        currency: 'UZS',
        ordered_sum_minor: 3_000_000n,
        payed_sum_minor: 1_000_000n,
      }),
      // USD: ordered 1_000 → base 12_000_000 ; payed 100 → base 1_200_000
      row({ agent_id: 'a', currency: 'USD', ordered_sum_minor: 1_000n, payed_sum_minor: 100n }),
    ]);
    const r = await svc.report('acc', RANGE);
    const a = r.rows.find((x) => x.agentId === 'a');
    expect(a?.ordersCount).toBe(2);
    // ordered = 3_000_000 + 12_000_000 = 15_000_000
    expect(a?.orderedSumMinor).toBe('15000000');
    // payed = 1_000_000 + 1_200_000 = 2_200_000
    expect(a?.payedSumMinor).toBe('2200000');
    // outstanding = 15_000_000 − 2_200_000 = 12_800_000
    expect(a?.outstandingMinor).toBe('12800000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('ranks suppliers by consolidated ordered sum (foreign can outrank local)', async () => {
    const svc = makeService([
      row({ agent_id: 'local', currency: 'UZS', ordered_sum_minor: 5_000_000n }),
      // USD ordered 2_000 → base 24_000_000 > local 5_000_000
      row({ agent_id: 'import', currency: 'USD', ordered_sum_minor: 2_000n }),
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.rows[0]?.agentId).toBe('import');
  });

  it('single-currency tenant: identity (no drift)', async () => {
    const svc = makeService([
      row({
        agent_id: 'a',
        currency: 'UZS',
        ordered_sum_minor: 1_000_000n,
        payed_sum_minor: 400_000n,
      }),
    ]);
    const r = await svc.report('acc', RANGE);
    const a = r.rows.find((x) => x.agentId === 'a');
    expect(a?.orderedSumMinor).toBe('1000000');
    expect(a?.outstandingMinor).toBe('600000');
    expect(r.mixedCurrency).toBe(false);
  });
});
