import { describe, expect, it } from 'vitest';
import {
  CreatePrepaymentSchema,
  PrepaymentFilterSchema,
  UpdatePrepaymentSchema,
} from './prepayment.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreatePrepaymentSchema', () => {
  const base = {
    agentId: uuid(),
    organizationId: uuid(),
    sumMinor: '1000000',
  };

  it('accepts a minimal valid payload', () => {
    expect(CreatePrepaymentSchema.safeParse(base).success).toBe(true);
  });

  it('defaults currency=UZS, rateValue=1.0 (100000000)', () => {
    const r = CreatePrepaymentSchema.safeParse(base);
    if (!r.success) throw r.error;
    expect(r.data.currency).toBe('UZS');
    expect(r.data.rateValue).toBe('100000000');
  });

  it('rejects non-integer sumMinor (e.g. decimal)', () => {
    expect(CreatePrepaymentSchema.safeParse({ ...base, sumMinor: '100.50' }).success).toBe(false);
  });

  it('rejects a retail split that does not add up to sumMinor', () => {
    const r = CreatePrepaymentSchema.safeParse({
      ...base,
      sumMinor: '1000000',
      cashSumMinor: '400000',
      noCashSumMinor: '400000',
      qrSumMinor: '100000',
    });
    expect(r.success).toBe(false);
  });
});

describe('UpdatePrepaymentSchema — retail-split null contract', () => {
  // Regression for the 2026-06-03g audit: the detail page cleared a split field
  // by sending JSON `null`, but the split fields are `bigintMinor.optional()`
  // (string|undefined) on a `.strict()` object — `null` is REJECTED, so every
  // wholesale save 400'd. The FE was fixed to send '0'; this locks the contract.
  it('rejects null for a retail-split field (FE must send "0", not null)', () => {
    expect(UpdatePrepaymentSchema.safeParse({ cashSumMinor: null }).success).toBe(false);
    expect(UpdatePrepaymentSchema.safeParse({ noCashSumMinor: null }).success).toBe(false);
    expect(UpdatePrepaymentSchema.safeParse({ qrSumMinor: null }).success).toBe(false);
  });

  it('accepts the post-fix wholesale payload (splits as "0")', () => {
    // `version` is now a required optimistic-lock token on update.
    const r = UpdatePrepaymentSchema.safeParse({
      sumMinor: '500000',
      cashSumMinor: '0',
      noCashSumMinor: '0',
      qrSumMinor: '0',
      version: 1,
    });
    expect(r.success).toBe(true);
  });

  it('accepts omitting the split fields entirely (undefined)', () => {
    expect(UpdatePrepaymentSchema.safeParse({ sumMinor: '500000', version: 1 }).success).toBe(true);
  });
});

describe('UpdatePrepaymentSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdatePrepaymentSchema.safeParse({ sumMinor: '500000' }).success).toBe(false);
    expect(UpdatePrepaymentSchema.safeParse({ sumMinor: '500000', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdatePrepaymentSchema.safeParse({ sumMinor: '500000', version: 1.5 }).success).toBe(
      false,
    );
    expect(UpdatePrepaymentSchema.safeParse({ sumMinor: '500000', version: -1 }).success).toBe(
      false,
    );
    expect(UpdatePrepaymentSchema.safeParse({ sumMinor: '500000', version: '1' }).success).toBe(
      false,
    );
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(
      CreatePrepaymentSchema.safeParse({
        agentId: uuid(),
        organizationId: uuid(),
        sumMinor: '1000000',
      }).success,
    ).toBe(true);
  });
});

describe('PrepaymentFilterSchema', () => {
  it('defaults limit=50, sortBy=moment, sortDir=desc', () => {
    const r = PrepaymentFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
    expect(r.data.sortBy).toBe('moment');
    expect(r.data.sortDir).toBe('desc');
  });

  it('coerces string limit to number', () => {
    const r = PrepaymentFilterSchema.safeParse({ limit: '25' });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(25);
  });

  it('parses applicable=true from string query', () => {
    const r = PrepaymentFilterSchema.safeParse({ applicable: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.applicable).toBe(true);
  });

  it('rejects invalid state', () => {
    expect(PrepaymentFilterSchema.safeParse({ state: 'posted-invalid' }).success).toBe(false);
  });

  it('rejects limit above max (500)', () => {
    expect(PrepaymentFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts the extended moysklad-parity FK + range filters', () => {
    const r = PrepaymentFilterSchema.safeParse({
      agentGroupId: uuid(),
      groupId: uuid(),
      ownerId: uuid(),
      updatedFrom: '2026-01-01',
      updatedTo: '2026-02-01',
    });
    if (!r.success) throw r.error;
    expect(r.data.updatedFrom).toBe('2026-01-01');
    expect(r.data.updatedTo).toBe('2026-02-01');
  });

  it('accepts agent and organization as relational sort keys', () => {
    for (const sortBy of ['agent', 'organization'] as const) {
      const r = PrepaymentFilterSchema.safeParse({ sortBy });
      if (!r.success) throw r.error;
      expect(r.data.sortBy).toBe(sortBy);
    }
  });

  it('rejects an unknown sort key', () => {
    expect(PrepaymentFilterSchema.safeParse({ sortBy: 'cashDesk' }).success).toBe(false);
  });

  it('rejects a non-uuid agentGroupId', () => {
    expect(PrepaymentFilterSchema.safeParse({ agentGroupId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects a non-uuid groupId', () => {
    expect(PrepaymentFilterSchema.safeParse({ groupId: 'not-a-uuid' }).success).toBe(false);
  });
});
