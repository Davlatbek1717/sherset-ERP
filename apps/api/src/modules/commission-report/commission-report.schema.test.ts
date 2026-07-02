import { describe, expect, it } from 'vitest';
import {
  CommissionReportFilterSchema,
  CommissionReportStateSchema,
} from './commission-report.schema.js';

describe('CommissionReportStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(CommissionReportStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown state', () => {
    expect(() => CommissionReportStateSchema.parse('settled')).toThrow();
  });
});

describe('CommissionReportFilterSchema', () => {
  it('applies defaults', () => {
    const p = CommissionReportFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('exposes paid quick-filter independent of state', () => {
    // The settlement state (paid vs unpaid) is orthogonal to the
    // FSM state (draft/posted/cancelled) — a posted row can still
    // be unpaid. The filter must accept `paid` without coupling it
    // to `state`.
    const paid = CommissionReportFilterSchema.parse({ paid: 'true' });
    expect(paid.paid).toBe(true);
    expect(paid.state).toBeUndefined();

    const unpaid = CommissionReportFilterSchema.parse({ paid: 'false' });
    expect(unpaid.paid).toBe(false);
  });

  it('exposes reward range as a separate filter from total range', () => {
    // The consigner's cut is what most settlement disputes hinge on,
    // so it must be filterable independently of the gross total.
    const p = CommissionReportFilterSchema.parse({
      sumMinorFrom: '1000000',
      sumMinorTo: '99999999',
      rewardSumMinorFrom: '10000',
      rewardSumMinorTo: '500000',
    });
    expect(p.sumMinorFrom).toBe(1000000);
    expect(p.sumMinorTo).toBe(99999999);
    expect(p.rewardSumMinorFrom).toBe(10000);
    expect(p.rewardSumMinorTo).toBe(500000);
  });

  it('rejects fractional reward range (BigInt-safe contract)', () => {
    expect(() => CommissionReportFilterSchema.parse({ rewardSumMinorFrom: '100.5' })).toThrow();
  });

  it('accepts rewardSumMinor as a sort field', () => {
    expect(CommissionReportFilterSchema.parse({ sortBy: 'rewardSumMinor' }).sortBy).toBe(
      'rewardSumMinor',
    );
  });

  it('rejects non-UUID contractId', () => {
    expect(() => CommissionReportFilterSchema.parse({ contractId: 'contract-1' })).toThrow();
  });

  it('coerces boolean filters from query strings', () => {
    const p = CommissionReportFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      paid: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.paid).toBe(true);
  });

  it('clamps limit to [1, 500]', () => {
    expect(() => CommissionReportFilterSchema.parse({ limit: '0' })).toThrow();
    expect(() => CommissionReportFilterSchema.parse({ limit: '501' })).toThrow();
  });
});
