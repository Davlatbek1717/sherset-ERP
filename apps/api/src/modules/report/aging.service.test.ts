import { describe, expect, it, vi } from 'vitest';
import { AgingService } from './aging.service.js';

/**
 * Unit coverage for the aging multi-currency consolidation (commit 7a0b7068).
 *
 * Each invoice's outstanding (sum − payed, in the invoice's own currency)
 * must be base-consolidated before being bucketed and summed; a USD
 * invoice's foreign minor units were previously added raw to UZS tiyin.
 *
 * Rate fixture: base UZS (1e8), USD @ 12 000 ⇒ USD minor → base ×12000.
 */

const E8 = 100_000_000n;
const AS_OF = new Date('2026-05-20T00:00:00Z');
const DAY = 86_400_000;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface CannedInvoice {
  counterparty_id: string;
  counterparty_name: string;
  invoice_id: string;
  due: Date;
  outstanding: bigint;
  currency: string;
}

function makeService(rows: CannedInvoice[]) {
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    $queryRaw: vi.fn(async () => rows),
  };
  return new AgingService({ client } as never);
}

describe('AgingService — multi-currency consolidation', () => {
  it('consolidates each invoice outstanding to base before bucketing', async () => {
    const svc = makeService([
      {
        counterparty_id: 'cp-a',
        counterparty_name: 'A',
        invoice_id: 'inv-uzs',
        due: new Date(AS_OF.getTime() - 200 * DAY), // 90+ bucket
        outstanding: 2_000_000n,
        currency: 'UZS',
      },
      {
        counterparty_id: 'cp-a',
        counterparty_name: 'A',
        invoice_id: 'inv-usd',
        due: AS_OF, // age 0 ⇒ current bucket
        outstanding: 50_00n, // → base 60_000_000
        currency: 'USD',
      },
    ]);
    const r = await svc.report('acc', { side: 'receivables', asOf: AS_OF.toISOString() });
    const cpA = r.rows.find((x) => x.counterpartyId === 'cp-a');
    // 2_000_000 (UZS) + 50_00 * 12000 (60_000_000) = 62_000_000
    expect(cpA?.totalMinor).toBe('62000000');
    expect(cpA?.buckets.find((b) => b.key === '90_plus')?.amountMinor).toBe('2000000');
    expect(cpA?.buckets.find((b) => b.key === 'current')?.amountMinor).toBe('60000000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('single-currency tenant: identity (no drift)', async () => {
    const svc = makeService([
      {
        counterparty_id: 'cp-b',
        counterparty_name: 'B',
        invoice_id: 'inv-1',
        due: new Date(AS_OF.getTime() - 10 * DAY),
        outstanding: 750_000n,
        currency: 'UZS',
      },
    ]);
    const r = await svc.report('acc', { side: 'receivables', asOf: AS_OF.toISOString() });
    expect(r.rows.find((x) => x.counterpartyId === 'cp-b')?.totalMinor).toBe('750000');
    expect(r.mixedCurrency).toBe(false);
  });
});
