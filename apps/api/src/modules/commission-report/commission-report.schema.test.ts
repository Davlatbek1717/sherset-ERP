import { describe, expect, it } from 'vitest';
import {
  CommissionReportCreateSchema,
  CommissionReportInCreateSchema,
  CommissionReportKindSchema,
  CommissionReportListQuerySchema,
  CommissionReportPositionInputSchema,
  CommissionReportStateSchema,
} from './commission-report.schema.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const AGENT = '22222222-2222-2222-2222-222222222222';
const PROD = '33333333-3333-3333-3333-333333333333';

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

describe('CommissionReportKindSchema («Тип документа»)', () => {
  it('accepts out (Выданный) and in (Полученный)', () => {
    expect(CommissionReportKindSchema.parse('out')).toBe('out');
    expect(CommissionReportKindSchema.parse('in')).toBe('in');
  });
  it('rejects unknown kind', () => {
    expect(() => CommissionReportKindSchema.parse('both')).toThrow();
  });
});

describe('CommissionReportListQuerySchema', () => {
  it('applies pagination + sort defaults', () => {
    const p = CommissionReportListQuerySchema.parse({});
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(100);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('clamps pageSize to [1, 200]', () => {
    expect(() => CommissionReportListQuerySchema.parse({ pageSize: '0' })).toThrow();
    expect(() => CommissionReportListQuerySchema.parse({ pageSize: '201' })).toThrow();
    expect(CommissionReportListQuerySchema.parse({ pageSize: '200' }).pageSize).toBe(200);
  });

  it('exposes the five money + name/date sort columns', () => {
    for (const s of [
      'moment',
      'name',
      'sum',
      'commission',
      'otherServices',
      'commitentSum',
      'payed',
      'agent',
    ]) {
      expect(CommissionReportListQuerySchema.parse({ sortBy: s }).sortBy).toBe(s);
    }
  });
  it('rejects an unsupported sort column (no silent 400 from a stray header)', () => {
    expect(() => CommissionReportListQuerySchema.parse({ sortBy: 'vatSum' })).toThrow();
  });

  it('accepts the «Тип документа» kind filter', () => {
    expect(CommissionReportListQuerySchema.parse({ kind: 'in' }).kind).toBe('in');
  });

  it('carries comma-separated reference filters through verbatim (service splits them)', () => {
    const p = CommissionReportListQuerySchema.parse({
      agentIds: 'a,b',
      organizationIds: 'o1',
      agentGroupIds: 'g1,g2',
      agentOwnerIds: 'e1',
      contractIds: 'c1',
      ownerIds: 'u1',
      groupIds: 'd1',
    });
    expect(p.agentIds).toBe('a,b');
    expect(p.agentGroupIds).toBe('g1,g2');
  });

  it('parses the tri-state boolean filters from query strings', () => {
    const p = CommissionReportListQuerySchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
      shared: 'false',
    });
    expect(p.applicable).toBe('true');
    expect(p.printed).toBe('false');
    expect(p.published).toBe('true');
    expect(p.shared).toBe('false');
  });
  it('rejects a non-enum boolean value', () => {
    expect(() => CommissionReportListQuerySchema.parse({ applicable: 'maybe' })).toThrow();
  });

  it('caps the search term at 100 chars', () => {
    expect(() => CommissionReportListQuerySchema.parse({ search: 'x'.repeat(101) })).toThrow();
  });
});

describe('CommissionReportPositionInputSchema («Товары» line)', () => {
  it('applies per-line defaults (qty 1, price/discount/commission 0, vat null, vatEnabled)', () => {
    const p = CommissionReportPositionInputSchema.parse({ assortmentId: PROD });
    expect(p.quantity).toBe('1');
    expect(p.priceMinor).toBe('0');
    expect(p.discount).toBe('0');
    expect(p.vat).toBeNull();
    expect(p.vatEnabled).toBe(true);
    expect(p.commissionMinor).toBe('0');
  });
  it('rejects a non-uuid assortmentId', () => {
    expect(() => CommissionReportPositionInputSchema.parse({ assortmentId: 'x' })).toThrow();
  });
  it('rejects a fractional priceMinor / commissionMinor (tiyin are integers)', () => {
    expect(() =>
      CommissionReportPositionInputSchema.parse({ assortmentId: PROD, priceMinor: '10.5' }),
    ).toThrow();
    expect(() =>
      CommissionReportPositionInputSchema.parse({ assortmentId: PROD, commissionMinor: '1.5' }),
    ).toThrow();
  });
});

describe('CommissionReportCreateSchema («Выданный» create)', () => {
  it('requires organizationId + agentId as UUIDs', () => {
    expect(() => CommissionReportCreateSchema.parse({})).toThrow();
    expect(() => CommissionReportCreateSchema.parse({ organizationId: ORG })).toThrow();
    expect(() =>
      CommissionReportCreateSchema.parse({ organizationId: 'nope', agentId: AGENT }),
    ).toThrow();
  });

  it('applies header defaults (currency UZS, rate 1e8, VAT on, posted, no positions)', () => {
    const c = CommissionReportCreateSchema.parse({ organizationId: ORG, agentId: AGENT });
    expect(c.currency).toBe('UZS');
    expect(c.rateValue).toBe('100000000');
    expect(c.vatEnabled).toBe(true);
    expect(c.vatIncluded).toBe(false);
    // «Проведено» defaults checked (moysklad parity).
    expect(c.applicable).toBe(true);
    expect(c.statusId).toBeUndefined();
    expect(c.positions).toEqual([]);
  });

  it('accepts a null/uuid «Статус» and rejects a non-uuid statusId', () => {
    const STATUS = '44444444-4444-4444-4444-444444444444';
    expect(
      CommissionReportCreateSchema.parse({ organizationId: ORG, agentId: AGENT, statusId: STATUS })
        .statusId,
    ).toBe(STATUS);
    expect(
      CommissionReportCreateSchema.parse({ organizationId: ORG, agentId: AGENT, statusId: null })
        .statusId,
    ).toBeNull();
    expect(() =>
      CommissionReportCreateSchema.parse({ organizationId: ORG, agentId: AGENT, statusId: 'nope' }),
    ).toThrow();
  });

  it('lets «Проведено» be unchecked (applicable=false ⇒ a draft)', () => {
    const c = CommissionReportCreateSchema.parse({
      organizationId: ORG,
      agentId: AGENT,
      applicable: false,
    });
    expect(c.applicable).toBe(false);
  });

  it('upper-cases the currency ISO code', () => {
    const c = CommissionReportCreateSchema.parse({
      organizationId: ORG,
      agentId: AGENT,
      currency: 'usd',
    });
    expect(c.currency).toBe('USD');
  });

  it('accepts a positions array', () => {
    const c = CommissionReportCreateSchema.parse({
      organizationId: ORG,
      agentId: AGENT,
      positions: [
        { assortmentId: PROD, quantity: '2', priceMinor: '5000', commissionMinor: '500' },
      ],
    });
    expect(c.positions).toHaveLength(1);
    expect(c.positions[0]?.commissionMinor).toBe('500');
  });

  it('rejects a 4-letter currency code', () => {
    expect(() =>
      CommissionReportCreateSchema.parse({ organizationId: ORG, agentId: AGENT, currency: 'USDT' }),
    ).toThrow();
  });
});

describe('CommissionReportInCreateSchema («Полученный» create)', () => {
  it('requires organizationId (продавец) + agentId (комиссионер) as UUIDs', () => {
    expect(() => CommissionReportInCreateSchema.parse({})).toThrow();
    expect(() => CommissionReportInCreateSchema.parse({ organizationId: ORG })).toThrow();
  });

  it('applies header defaults (currency UZS, rate 1e8, posted, otherServices 0, no positions)', () => {
    const c = CommissionReportInCreateSchema.parse({ organizationId: ORG, agentId: AGENT });
    expect(c.currency).toBe('UZS');
    expect(c.rateValue).toBe('100000000');
    expect(c.applicable).toBe(true);
    expect(c.otherServicesMinor).toBe('0');
    expect(c.incomingNumber).toBeUndefined();
    expect(c.positions).toEqual([]);
  });

  it('carries «Входящий номер» / date + «Прочие услуги»', () => {
    const c = CommissionReportInCreateSchema.parse({
      organizationId: ORG,
      agentId: AGENT,
      incomingNumber: 'IN-42',
      incomingDate: '2026-06-01',
      otherServicesMinor: '150000',
    });
    expect(c.incomingNumber).toBe('IN-42');
    expect(c.incomingDate).toBe('2026-06-01');
    expect(c.otherServicesMinor).toBe('150000');
  });

  it('rejects a fractional «Прочие услуги» (tiyin are integers)', () => {
    expect(() =>
      CommissionReportInCreateSchema.parse({
        organizationId: ORG,
        agentId: AGENT,
        otherServicesMinor: '10.5',
      }),
    ).toThrow();
  });
});
