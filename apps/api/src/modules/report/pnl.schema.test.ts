import { describe, expect, it } from 'vitest';
import { PnlFilterSchema } from './pnl.schema.js';

const uuid = () => crypto.randomUUID();

describe('PnlFilterSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = PnlFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    if (!r.success) throw r.error;
    expect(r.data.groupBy).toBe('month');
    expect(r.data.limit).toBe(500);
  });

  it('rejects dateFrom > dateTo', () => {
    expect(
      PnlFilterSchema.safeParse({
        dateFrom: '2026-12-31',
        dateTo: '2026-01-01',
      }).success,
    ).toBe(false);
  });

  it('coerces date strings to Date', () => {
    const r = PnlFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    if (!r.success) throw r.error;
    expect(r.data.dateFrom).toBeInstanceOf(Date);
    expect(r.data.dateTo).toBeInstanceOf(Date);
  });

  it('accepts all groupBy enum values', () => {
    for (const groupBy of ['none', 'day', 'week', 'month', 'quarter', 'year']) {
      const r = PnlFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        groupBy,
      });
      expect(r.success, `groupBy=${groupBy}`).toBe(true);
    }
  });

  it('rejects unknown groupBy', () => {
    expect(
      PnlFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        groupBy: 'counterparty',
      }).success,
    ).toBe(false);
  });

  it('accepts organizationId UUID', () => {
    const r = PnlFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      organizationId: uuid(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed organizationId', () => {
    expect(
      PnlFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        organizationId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('coerces limit from string', () => {
    const r = PnlFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      limit: '200',
    });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(200);
  });

  it('rejects limit > 1000', () => {
    expect(
      PnlFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        limit: 5000,
      }).success,
    ).toBe(false);
  });

  it('rejects limit < 1', () => {
    expect(
      PnlFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        limit: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects missing dateFrom', () => {
    expect(PnlFilterSchema.safeParse({ dateTo: '2026-12-31' }).success).toBe(false);
  });
});
