import { describe, expect, it } from 'vitest';
import { SalesReportFilterSchema } from './report.schema.js';

const uuid = () => crypto.randomUUID();

describe('SalesReportFilterSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = SalesReportFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    if (!r.success) throw r.error;
    expect(r.data.groupBy).toBe('month');
    expect(r.data.limit).toBe(500);
  });

  it('coerces date strings to Date', () => {
    const r = SalesReportFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    if (!r.success) throw r.error;
    expect(r.data.dateFrom).toBeInstanceOf(Date);
    expect(r.data.dateTo).toBeInstanceOf(Date);
  });

  it('rejects dateFrom > dateTo', () => {
    expect(
      SalesReportFilterSchema.safeParse({
        dateFrom: '2026-12-31',
        dateTo: '2026-01-01',
      }).success,
    ).toBe(false);
  });

  it('accepts equal dates (single-day report)', () => {
    const r = SalesReportFilterSchema.safeParse({
      dateFrom: '2026-04-25',
      dateTo: '2026-04-25',
    });
    expect(r.success).toBe(true);
  });

  it('accepts all groupBy enum values', () => {
    const variants = [
      'none',
      'day',
      'week',
      'month',
      'quarter',
      'year',
      'counterparty',
      'organization',
      'store',
      'product',
    ];
    for (const groupBy of variants) {
      const r = SalesReportFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        groupBy,
      });
      expect(r.success, `groupBy=${groupBy}`).toBe(true);
    }
  });

  it('rejects unknown groupBy', () => {
    expect(
      SalesReportFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        groupBy: 'minute',
      }).success,
    ).toBe(false);
  });

  it('coerces limit from string', () => {
    const r = SalesReportFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      limit: '100',
    });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(100);
  });

  it('rejects limit > 1000', () => {
    expect(
      SalesReportFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        limit: 5000,
      }).success,
    ).toBe(false);
  });

  it('rejects limit < 1', () => {
    expect(
      SalesReportFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        limit: 0,
      }).success,
    ).toBe(false);
  });

  it('accepts all FK filters together', () => {
    const r = SalesReportFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      counterpartyId: uuid(),
      organizationId: uuid(),
      storeId: uuid(),
      productId: uuid(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed counterpartyId UUID', () => {
    expect(
      SalesReportFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        counterpartyId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('rejects missing dateFrom', () => {
    expect(SalesReportFilterSchema.safeParse({ dateTo: '2026-12-31' }).success).toBe(false);
  });

  it('rejects missing dateTo', () => {
    expect(SalesReportFilterSchema.safeParse({ dateFrom: '2026-01-01' }).success).toBe(false);
  });
});
