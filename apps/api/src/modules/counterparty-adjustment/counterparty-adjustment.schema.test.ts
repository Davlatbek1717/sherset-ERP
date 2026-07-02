import { describe, expect, it } from 'vitest';
import {
  CounterpartyAdjustmentFilterSchema,
  CreateCounterpartyAdjustmentSchema,
  UpdateCounterpartyAdjustmentSchema,
} from './counterparty-adjustment.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreateCounterpartyAdjustmentSchema', () => {
  const base = {
    agentId: uuid(),
    organizationId: uuid(),
    sumMinor: '1000000',
  };

  it('accepts a minimal valid payload', () => {
    expect(CreateCounterpartyAdjustmentSchema.safeParse(base).success).toBe(true);
  });

  it('defaults direction=INCREASE, currency=UZS, rateValue=1.0 (100000000)', () => {
    const r = CreateCounterpartyAdjustmentSchema.safeParse(base);
    if (!r.success) throw r.error;
    expect(r.data.direction).toBe('INCREASE');
    expect(r.data.currency).toBe('UZS');
    expect(r.data.rateValue).toBe('100000000');
  });

  it('rejects non-integer sumMinor (e.g. decimal)', () => {
    expect(
      CreateCounterpartyAdjustmentSchema.safeParse({ ...base, sumMinor: '100.50' }).success,
    ).toBe(false);
  });
});

describe('CounterpartyAdjustmentFilterSchema', () => {
  it('defaults limit=50, sortBy=moment, sortDir=desc', () => {
    const r = CounterpartyAdjustmentFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
    expect(r.data.sortBy).toBe('moment');
    expect(r.data.sortDir).toBe('desc');
  });

  it('coerces string limit to number', () => {
    const r = CounterpartyAdjustmentFilterSchema.safeParse({ limit: '25' });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(25);
  });

  it('parses applicable=true from string query', () => {
    const r = CounterpartyAdjustmentFilterSchema.safeParse({ applicable: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.applicable).toBe(true);
  });

  it('rejects invalid state', () => {
    expect(CounterpartyAdjustmentFilterSchema.safeParse({ state: 'posted-invalid' }).success).toBe(
      false,
    );
  });

  it('rejects limit above max (500)', () => {
    expect(CounterpartyAdjustmentFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts the extended moysklad-parity FK + range filters', () => {
    const r = CounterpartyAdjustmentFilterSchema.safeParse({
      agentGroupId: uuid(),
      contractId: uuid(),
      projectId: uuid(),
      groupId: uuid(),
      ownerId: uuid(),
      updatedFrom: '2026-01-01',
      updatedTo: '2026-02-01',
    });
    if (!r.success) throw r.error;
    expect(r.data.updatedFrom).toBe('2026-01-01');
    expect(r.data.updatedTo).toBe('2026-02-01');
  });

  it('accepts both adjustment directions as a filter', () => {
    for (const direction of ['INCREASE', 'DECREASE'] as const) {
      const r = CounterpartyAdjustmentFilterSchema.safeParse({ direction });
      if (!r.success) throw r.error;
      expect(r.data.direction).toBe(direction);
    }
  });

  it('accepts agent and organization as relational sort keys', () => {
    for (const sortBy of ['agent', 'organization'] as const) {
      const r = CounterpartyAdjustmentFilterSchema.safeParse({ sortBy });
      if (!r.success) throw r.error;
      expect(r.data.sortBy).toBe(sortBy);
    }
  });

  it('rejects an unknown sort key', () => {
    expect(CounterpartyAdjustmentFilterSchema.safeParse({ sortBy: 'cashDesk' }).success).toBe(
      false,
    );
  });

  it('rejects a non-uuid agentGroupId', () => {
    expect(
      CounterpartyAdjustmentFilterSchema.safeParse({ agentGroupId: 'not-a-uuid' }).success,
    ).toBe(false);
  });
});

describe('UpdateCounterpartyAdjustmentSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    // All fields are optional, so {} would otherwise parse — the required
    // version token is what makes a version-less save fail.
    expect(UpdateCounterpartyAdjustmentSchema.safeParse({}).success).toBe(false);
    expect(UpdateCounterpartyAdjustmentSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateCounterpartyAdjustmentSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateCounterpartyAdjustmentSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateCounterpartyAdjustmentSchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(
      CreateCounterpartyAdjustmentSchema.safeParse({
        agentId: crypto.randomUUID(),
        organizationId: crypto.randomUUID(),
        sumMinor: '1000000',
      }).success,
    ).toBe(true);
  });
});
