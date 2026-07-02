import { describe, expect, it } from 'vitest';
import {
  CreateOpportunitySchema,
  OpportunityFilterSchema,
  TransitionSchema,
  UpdateOpportunitySchema,
} from './opportunity.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreateOpportunitySchema', () => {
  it('accepts a minimal payload', () => {
    const r = CreateOpportunitySchema.safeParse({ name: 'Big sale' });
    if (!r.success) throw r.error;
    expect(r.data.currency).toBe('UZS');
  });

  it('coerces amount string into BigInt', () => {
    const r = CreateOpportunitySchema.safeParse({ name: 'X', amount: '500000' });
    if (!r.success) throw r.error;
    expect(r.data.amount).toBe(500000n);
  });

  it('coerces amount number into BigInt', () => {
    const r = CreateOpportunitySchema.safeParse({ name: 'X', amount: 12345 });
    if (!r.success) throw r.error;
    expect(r.data.amount).toBe(12345n);
  });

  it('rejects negative amount', () => {
    expect(CreateOpportunitySchema.safeParse({ name: 'X', amount: '-1' }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(CreateOpportunitySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects 256-char name', () => {
    expect(CreateOpportunitySchema.safeParse({ name: 'a'.repeat(256) }).success).toBe(false);
  });

  it('rejects probability > 100', () => {
    expect(CreateOpportunitySchema.safeParse({ name: 'X', probability: 200 }).success).toBe(false);
  });

  it('rejects probability < 0', () => {
    expect(CreateOpportunitySchema.safeParse({ name: 'X', probability: -1 }).success).toBe(false);
  });

  it('coerces expectedCloseDate from ISO string', () => {
    const r = CreateOpportunitySchema.safeParse({
      name: 'X',
      expectedCloseDate: '2026-06-01T00:00:00Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.expectedCloseDate).toBeInstanceOf(Date);
  });

  it('treats empty-string description as null', () => {
    const r = CreateOpportunitySchema.safeParse({ name: 'X', description: '' });
    if (!r.success) throw r.error;
    expect(r.data.description).toBeNull();
  });

  it('treats empty-string source as null', () => {
    const r = CreateOpportunitySchema.safeParse({ name: 'X', source: '' });
    if (!r.success) throw r.error;
    expect(r.data.source).toBeNull();
  });

  it('rejects invalid pipelineId UUID', () => {
    expect(CreateOpportunitySchema.safeParse({ name: 'X', pipelineId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('accepts full payload', () => {
    const r = CreateOpportunitySchema.safeParse({
      name: 'Premium contract',
      pipelineId: uuid(),
      stageId: uuid(),
      counterpartyId: uuid(),
      contactPersonId: uuid(),
      amount: '500000000',
      currency: 'UZS',
      probability: 75,
      expectedCloseDate: '2026-07-01',
      source: 'website',
      description: 'Q3 enterprise customer',
    });
    expect(r.success).toBe(true);
  });
});

describe('UpdateOpportunitySchema', () => {
  it('all fields optional (except version)', () => {
    expect(UpdateOpportunitySchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts lostReason', () => {
    const r = UpdateOpportunitySchema.safeParse({ version: 1, lostReason: 'price too high' });
    if (!r.success) throw r.error;
    expect(r.data.lostReason).toBe('price too high');
  });

  it('treats empty-string lostReason as null', () => {
    const r = UpdateOpportunitySchema.safeParse({ version: 1, lostReason: '' });
    if (!r.success) throw r.error;
    expect(r.data.lostReason).toBeNull();
  });
});

describe('UpdateOpportunitySchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateOpportunitySchema.safeParse({}).success).toBe(false);
    expect(UpdateOpportunitySchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateOpportunitySchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateOpportunitySchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateOpportunitySchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateOpportunitySchema.safeParse({ name: 'Big sale' }).success).toBe(true);
  });
});

describe('TransitionSchema', () => {
  it('requires stageId', () => {
    expect(TransitionSchema.safeParse({}).success).toBe(false);
  });

  it('accepts stageId alone', () => {
    const r = TransitionSchema.safeParse({ stageId: uuid() });
    expect(r.success).toBe(true);
  });

  it('accepts stageId + lostReason', () => {
    const r = TransitionSchema.safeParse({
      stageId: uuid(),
      lostReason: 'found a competitor',
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed stageId', () => {
    expect(TransitionSchema.safeParse({ stageId: 'bad-uuid' }).success).toBe(false);
  });
});

describe('OpportunityFilterSchema', () => {
  it('defaults limit to 50', () => {
    const r = OpportunityFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('rejects limit above max (500)', () => {
    expect(OpportunityFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('coerces archived from string', () => {
    const r = OpportunityFilterSchema.safeParse({ archived: 'false' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(false);
  });

  it('coerces date range from ISO strings', () => {
    const r = OpportunityFilterSchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    if (!r.success) throw r.error;
    expect(r.data.dateFrom).toBeInstanceOf(Date);
    expect(r.data.dateTo).toBeInstanceOf(Date);
  });

  it('accepts pipelineId + stageId + status filter', () => {
    const r = OpportunityFilterSchema.safeParse({
      pipelineId: uuid(),
      stageId: uuid(),
      status: 'open',
    });
    expect(r.success).toBe(true);
  });

  it('coerces updated date range from ISO strings', () => {
    const r = OpportunityFilterSchema.safeParse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-12-31',
    });
    if (!r.success) throw r.error;
    expect(r.data.updatedFrom).toBeInstanceOf(Date);
    expect(r.data.updatedTo).toBeInstanceOf(Date);
  });

  it('accepts ownerId filter', () => {
    const r = OpportunityFilterSchema.safeParse({ ownerId: uuid() });
    expect(r.success).toBe(true);
  });

  it('accepts agent sort key (relational orderBy)', () => {
    const r = OpportunityFilterSchema.safeParse({ sortBy: 'agent', sortDir: 'asc' });
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('agent');
  });

  it('accepts updatedAt sort key', () => {
    const r = OpportunityFilterSchema.safeParse({ sortBy: 'updatedAt' });
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('updatedAt');
  });

  it('rejects unknown sort key', () => {
    expect(OpportunityFilterSchema.safeParse({ sortBy: 'random' }).success).toBe(false);
  });
});
