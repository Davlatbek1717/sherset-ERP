import { describe, expect, it } from 'vitest';
import {
  FactureInFilterSchema,
  FactureInStateSchema,
  GenerateFactureInSchema,
} from './facture-in.schema.js';

describe('GenerateFactureInSchema', () => {
  const UUID = '00000000-0000-0000-0000-000000000002';

  it('accepts a valid supplyId', () => {
    expect(GenerateFactureInSchema.parse({ supplyId: UUID }).supplyId).toBe(UUID);
  });

  it('rejects a missing supplyId', () => {
    expect(() => GenerateFactureInSchema.parse({})).toThrow();
  });

  it('rejects a non-uuid supplyId', () => {
    expect(() => GenerateFactureInSchema.parse({ supplyId: '123' })).toThrow();
  });

  it('strips unknown keys (no invoiceInId — not a moysklad pattern here)', () => {
    expect(GenerateFactureInSchema.parse({ supplyId: UUID, invoiceInId: UUID })).toEqual({
      supplyId: UUID,
    });
  });
});

describe('FactureInStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(FactureInStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown state', () => {
    expect(() => FactureInStateSchema.parse('received')).toThrow();
  });
});

describe('FactureInFilterSchema', () => {
  it('applies defaults', () => {
    const p = FactureInFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('exposes incomingDate range alongside moment range — independent fields', () => {
    const p = FactureInFilterSchema.parse({
      momentFrom: '2026-01-01',
      momentTo: '2026-01-31',
      incomingDateFrom: '2025-12-01',
      incomingDateTo: '2026-01-15',
    });
    // The two ranges must NOT collapse into one — clerks need to filter
    // «paper printed in December but received in January» independently.
    expect(p.momentFrom).toBe('2026-01-01');
    expect(p.incomingDateFrom).toBe('2025-12-01');
    expect(p.momentTo).toBe('2026-01-31');
    expect(p.incomingDateTo).toBe('2026-01-15');
  });

  it('accepts incomingDate as a sort field (moysklad parity)', () => {
    expect(FactureInFilterSchema.parse({ sortBy: 'incomingDate' }).sortBy).toBe('incomingDate');
  });

  it('coerces boolean filters from query strings', () => {
    const p = FactureInFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('coerces sumMinor range', () => {
    const p = FactureInFilterSchema.parse({
      sumMinorFrom: '50000',
      sumMinorTo: '5000000',
    });
    expect(p.sumMinorFrom).toBe(50000);
    expect(p.sumMinorTo).toBe(5000000);
  });

  it('rejects fractional sumMinor (BigInt-safe contract)', () => {
    expect(() => FactureInFilterSchema.parse({ sumMinorTo: '10.99' })).toThrow();
  });

  it('rejects non-UUID supplyId', () => {
    expect(() => FactureInFilterSchema.parse({ supplyId: 'supply-1' })).toThrow();
  });

  it('clamps limit to [1, 500]', () => {
    expect(() => FactureInFilterSchema.parse({ limit: '0' })).toThrow();
    expect(() => FactureInFilterSchema.parse({ limit: '501' })).toThrow();
  });

  it('rejects currency that is not exactly 3 chars', () => {
    expect(() => FactureInFilterSchema.parse({ currency: 'EU' })).toThrow();
    expect(() => FactureInFilterSchema.parse({ currency: 'EURO' })).toThrow();
  });

  it('accepts new panel-parity FK filters (group / agent-group / owner)', () => {
    const G = '00000000-0000-0000-0000-0000000000a1';
    const AG = '00000000-0000-0000-0000-0000000000a2';
    const O = '00000000-0000-0000-0000-0000000000a3';
    const p = FactureInFilterSchema.parse({ groupId: G, agentGroupId: AG, ownerId: O });
    expect(p.groupId).toBe(G);
    expect(p.agentGroupId).toBe(AG);
    expect(p.ownerId).toBe(O);
  });

  it('rejects non-UUID for the new FK filters', () => {
    expect(() => FactureInFilterSchema.parse({ groupId: 'group-1' })).toThrow();
    expect(() => FactureInFilterSchema.parse({ agentGroupId: 'ag-1' })).toThrow();
  });

  it('exposes «Когда изменен» (updatedAt) range — independent of moment', () => {
    const p = FactureInFilterSchema.parse({
      updatedFrom: '2026-02-01',
      updatedTo: '2026-02-28',
    });
    expect(p.updatedFrom).toBe('2026-02-01');
    expect(p.updatedTo).toBe('2026-02-28');
  });

  it('accepts agent / organization as relational sort fields (moysklad parity)', () => {
    expect(FactureInFilterSchema.parse({ sortBy: 'agent' }).sortBy).toBe('agent');
    expect(FactureInFilterSchema.parse({ sortBy: 'organization' }).sortBy).toBe('organization');
  });

  it('rejects an unbacked sort field', () => {
    expect(() => FactureInFilterSchema.parse({ sortBy: 'contractId' })).toThrow();
  });
});
