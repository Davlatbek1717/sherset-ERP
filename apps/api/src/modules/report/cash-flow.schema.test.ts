import { describe, expect, it } from 'vitest';
import { CashFlowFilterSchema } from './cash-flow.schema.js';

const uuid = () => crypto.randomUUID();

describe('CashFlowFilterSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = CashFlowFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    if (!r.success) throw r.error;
    expect(r.data.groupBy).toBe('month');
    expect(r.data.limit).toBe(500);
  });

  it('rejects dateFrom > dateTo', () => {
    expect(
      CashFlowFilterSchema.safeParse({
        dateFrom: '2026-12-31',
        dateTo: '2026-01-01',
      }).success,
    ).toBe(false);
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
      'channel',
    ];
    for (const groupBy of variants) {
      const r = CashFlowFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        groupBy,
      });
      expect(r.success, `groupBy=${groupBy}`).toBe(true);
    }
  });

  it('rejects unknown groupBy', () => {
    expect(
      CashFlowFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        groupBy: 'minute',
      }).success,
    ).toBe(false);
  });

  it('accepts all channel filter values', () => {
    const channels = ['cash_in', 'cash_out', 'payment_in', 'payment_out'];
    for (const channel of channels) {
      const r = CashFlowFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        channel,
      });
      expect(r.success, `channel=${channel}`).toBe(true);
    }
  });

  it('rejects unknown channel', () => {
    expect(
      CashFlowFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        channel: 'crypto',
      }).success,
    ).toBe(false);
  });

  it('coerces date strings to Date', () => {
    const r = CashFlowFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    if (!r.success) throw r.error;
    expect(r.data.dateFrom).toBeInstanceOf(Date);
    expect(r.data.dateTo).toBeInstanceOf(Date);
  });

  it('rejects limit > 1000', () => {
    expect(
      CashFlowFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        limit: 5000,
      }).success,
    ).toBe(false);
  });

  it('accepts FK filters together', () => {
    const r = CashFlowFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      counterpartyId: uuid(),
      organizationId: uuid(),
      channel: 'payment_in',
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed counterpartyId', () => {
    expect(
      CashFlowFilterSchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        counterpartyId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('coerces limit from string', () => {
    const r = CashFlowFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      limit: '100',
    });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(100);
  });
});
