import { describe, expect, it, vi } from 'vitest';
import { SlowMoversService } from './slow-movers.service.js';

/**
 * Unit coverage for the slow-movers currency field (commit abb78ece).
 *
 * Tied capital is already in the account base (Stock.costBalanceMinor is
 * normalized at supply-post, §Tier-2 step A), so there is no per-row
 * conversion — but the response must report the base code rather than a
 * hardcoded 'UZS'. (The separate `FROM stock`→`stocks` runtime fix is
 * covered live by verify-report-gaps-multicurrency.ts, since a stubbed
 * query can't exercise the SQL table name.)
 */

const E8 = 100_000_000n;

interface CannedRow {
  product_id: string;
  name: string | null;
  code: string | null;
  store_id: string;
  store_name: string | null;
  qty_on_hand: string;
  cost_minor: bigint | null;
  last_sale: Date | null;
  last_supply: Date | null;
}

function makeService(queryRows: CannedRow[], baseCode = 'UZS') {
  const client = {
    currency: {
      findMany: vi.fn(async () => [
        { code: baseCode, default: true, rateValue: E8, multiplicity: 1, indirect: false },
      ]),
    },
    $queryRaw: vi.fn(async () => queryRows),
  };
  return new SlowMoversService({ client } as never);
}

function row(p: Partial<CannedRow> = {}): CannedRow {
  return {
    product_id: 'p1',
    name: 'P1',
    code: null,
    store_id: 's1',
    store_name: 'Ombor',
    qty_on_hand: '5',
    cost_minor: 5_000_000n,
    last_sale: null,
    last_supply: null,
    ...p,
  };
}

describe('SlowMoversService — currency field', () => {
  it('reports tied capital and the account base currency', async () => {
    const svc = makeService([row()]);
    const r = await svc.report('acc', { thresholdDays: 90 });
    const p1 = r.rows.find((x) => x.productId === 'p1');
    expect(p1?.tiedCapitalMinor).toBe('5000000');
    expect(p1?.daysSinceLastSale).toBeNull(); // never sold
    expect(r.totalTiedCapitalMinor).toBe('5000000');
    expect(r.currency).toBe('UZS');
  });

  it('currency follows the account base (not hardcoded UZS)', async () => {
    const svc = makeService([row()], 'USD');
    const r = await svc.report('acc', { thresholdDays: 90 });
    expect(r.currency).toBe('USD');
  });

  it('totalTiedCapital sums rows; null cost contributes nothing', async () => {
    const svc = makeService([
      row({ product_id: 'a', cost_minor: 1_000_000n }),
      row({ product_id: 'b', cost_minor: 2_000_000n }),
      row({ product_id: 'c', cost_minor: null }),
    ]);
    const r = await svc.report('acc', { thresholdDays: 90 });
    expect(r.totalTiedCapitalMinor).toBe('3000000');
    expect(r.rows.find((x) => x.productId === 'c')?.tiedCapitalMinor).toBeNull();
  });
});
