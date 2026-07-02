import { describe, expect, it } from 'vitest';
import {
  FactureOutFilterSchema,
  FactureOutStateSchema,
  GenerateFactureOutSchema,
} from './facture-out.schema.js';

describe('GenerateFactureOutSchema', () => {
  const UUID = '00000000-0000-0000-0000-000000000001';

  it('accepts a valid demandId', () => {
    expect(GenerateFactureOutSchema.parse({ demandId: UUID }).demandId).toBe(UUID);
  });

  it('rejects a missing demandId', () => {
    expect(() => GenerateFactureOutSchema.parse({})).toThrow();
  });

  it('rejects a non-uuid demandId', () => {
    expect(() => GenerateFactureOutSchema.parse({ demandId: 'not-a-uuid' })).toThrow();
  });

  it('strips unknown keys (no invoiceOutId — not a moysklad pattern here)', () => {
    expect(GenerateFactureOutSchema.parse({ demandId: UUID, invoiceOutId: UUID })).toEqual({
      demandId: UUID,
    });
  });
});

describe('FactureOutStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(FactureOutStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown state', () => {
    expect(() => FactureOutStateSchema.parse('printed')).toThrow();
  });
});

describe('FactureOutFilterSchema', () => {
  it('applies defaults when nothing passed', () => {
    const p = FactureOutFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
    expect(p.cursor).toBeUndefined();
  });

  it('coerces boolean filters from query strings', () => {
    const p = FactureOutFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
      includeDeleted: 'false',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
    expect(p.includeDeleted).toBe(false);
  });

  it('coerces sumMinor range from query strings to numbers', () => {
    const p = FactureOutFilterSchema.parse({
      sumMinorFrom: '100000',
      sumMinorTo: '999999999',
    });
    expect(p.sumMinorFrom).toBe(100000);
    expect(p.sumMinorTo).toBe(999999999);
  });

  it('rejects fractional sumMinor (BigInt-safe contract)', () => {
    expect(() => FactureOutFilterSchema.parse({ sumMinorFrom: '10.5' })).toThrow();
  });

  it('rejects negative sumMinor', () => {
    expect(() => FactureOutFilterSchema.parse({ sumMinorFrom: '-1' })).toThrow();
  });

  it('clamps limit to [1, 500]', () => {
    expect(() => FactureOutFilterSchema.parse({ limit: '0' })).toThrow();
    expect(() => FactureOutFilterSchema.parse({ limit: '501' })).toThrow();
    expect(FactureOutFilterSchema.parse({ limit: '500' }).limit).toBe(500);
    expect(FactureOutFilterSchema.parse({ limit: '1' }).limit).toBe(1);
  });

  it('rejects non-UUID for FK fields', () => {
    expect(() => FactureOutFilterSchema.parse({ agentId: 'not-a-uuid' })).toThrow();
    expect(() => FactureOutFilterSchema.parse({ ownerId: '123' })).toThrow();
    expect(() => FactureOutFilterSchema.parse({ demandId: 'demand-1' })).toThrow();
  });

  it('rejects currency that is not exactly 3 chars', () => {
    expect(() => FactureOutFilterSchema.parse({ currency: 'US' })).toThrow();
    expect(() => FactureOutFilterSchema.parse({ currency: 'USDD' })).toThrow();
    expect(FactureOutFilterSchema.parse({ currency: 'USD' }).currency).toBe('USD');
  });

  it('caps search to 100 characters', () => {
    const long = 'x'.repeat(101);
    expect(() => FactureOutFilterSchema.parse({ search: long })).toThrow();
    expect(FactureOutFilterSchema.parse({ search: 'x'.repeat(100) }).search).toHaveLength(100);
  });

  it('accepts only documented sort fields', () => {
    expect(FactureOutFilterSchema.parse({ sortBy: 'moment' }).sortBy).toBe('moment');
    expect(FactureOutFilterSchema.parse({ sortBy: 'name' }).sortBy).toBe('name');
    expect(FactureOutFilterSchema.parse({ sortBy: 'sumMinor' }).sortBy).toBe('sumMinor');
    expect(() => FactureOutFilterSchema.parse({ sortBy: 'agentId' })).toThrow();
  });

  it('accepts new panel-parity FK filters (group / agent-group / owner)', () => {
    const G = '00000000-0000-0000-0000-0000000000b1';
    const AG = '00000000-0000-0000-0000-0000000000b2';
    const O = '00000000-0000-0000-0000-0000000000b3';
    const p = FactureOutFilterSchema.parse({ groupId: G, agentGroupId: AG, ownerId: O });
    expect(p.groupId).toBe(G);
    expect(p.agentGroupId).toBe(AG);
    expect(p.ownerId).toBe(O);
  });

  it('rejects non-UUID for the new FK filters', () => {
    expect(() => FactureOutFilterSchema.parse({ groupId: 'group-1' })).toThrow();
    expect(() => FactureOutFilterSchema.parse({ agentGroupId: 'ag-1' })).toThrow();
  });

  it('exposes «Когда изменен» (updatedAt) range — independent of moment', () => {
    const p = FactureOutFilterSchema.parse({
      updatedFrom: '2026-02-01',
      updatedTo: '2026-02-28',
    });
    expect(p.updatedFrom).toBe('2026-02-01');
    expect(p.updatedTo).toBe('2026-02-28');
  });

  it('accepts agent / organization as relational sort fields (moysklad parity)', () => {
    expect(FactureOutFilterSchema.parse({ sortBy: 'agent' }).sortBy).toBe('agent');
    expect(FactureOutFilterSchema.parse({ sortBy: 'organization' }).sortBy).toBe('organization');
  });
});
