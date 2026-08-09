import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CurrentSessionResponseSchema, CurrentSessionSchema } from './cashier-session.js';
import { listEnvelope } from './envelope.js';
import { PosProductRowSchema } from './product.js';
import { CONTRACT_PROVENANCE, flattenSchemaKeys } from './provenance.js';
import { CashDeskRowSchema } from './reference.js';

const SESSION = {
  id: '11111111-1111-4111-8111-111111111111',
  state: 'open',
  openedAt: '2026-08-09T06:00:00.000Z',
  cashier: { id: '22222222-2222-4222-8222-222222222222', name: 'Kassir' },
  cashDesk: { id: '33333333-3333-4333-8333-333333333333', name: 'Kassa 1', currency: 'UZS' },
  store: { id: '44444444-4444-4444-8444-444444444444', name: 'Asosiy ombor' },
  organization: { id: '55555555-5555-4555-8555-555555555555', name: 'Sherset' },
  salesCount: 3,
  salesSumMinor: '150000',
  openingCashMinor: '0',
};

describe('CurrentSession contract', () => {
  it('accepts a realistic /cashier-sessions/current payload', () => {
    expect(CurrentSessionSchema.parse(SESSION)).toMatchObject({ state: 'open' });
  });

  it('accepts null — the endpoint returns null when no shift is open', () => {
    expect(CurrentSessionResponseSchema.parse(null)).toBeNull();
  });

  /**
   * The wire rule that keeps biting: `apps/api/src/main.ts` installs a global
   * `BigInt.prototype.toJSON`, so every minor-unit column arrives as a STRING.
   * A page that types these `number` compiles and then does arithmetic on
   * `undefined`/`NaN`, so the contract has to reject the number form outright.
   */
  it('rejects minor amounts sent as numbers, not strings', () => {
    expect(() => CurrentSessionSchema.parse({ ...SESSION, salesSumMinor: 150000 })).toThrow();
  });

  it('rejects a missing relation — the 2026-06-08k crash shape', () => {
    const { cashier, ...withoutCashier } = SESSION;
    void cashier;
    expect(() => CurrentSessionSchema.parse(withoutCashier)).toThrow();
  });
});

describe('CashDeskRow contract', () => {
  it('accepts the stringified BigInt balance the service sends', () => {
    const row = {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Kassa 1',
      currency: 'UZS',
      balanceMinor: '-2500',
      archived: false,
    };
    expect(CashDeskRowSchema.parse(row).balanceMinor).toBe('-2500');
  });
});

describe('PosProductRow contract', () => {
  it('accepts a POS row with live stock and sale prices', () => {
    const row = {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Kabel 2x1.5',
      code: 'K-215',
      buyPrice: '900000',
      salePrices: [{ priceTypeId: 'pt-1', value: '1200000', currencyCode: 'UZS' }],
      stock: { onHand: '10.5', reserved: '0.5', inTransit: '2', available: '12' },
    };
    expect(PosProductRowSchema.parse(row).stock?.available).toBe('12');
  });

  it('accepts a row without the stock block (paths that skip attachStock)', () => {
    const row = { id: '66666666-6666-4666-8666-666666666666', name: 'X', code: null };
    expect(PosProductRowSchema.parse(row).stock).toBeUndefined();
  });

  it('rejects a decimal quantity sent as a number', () => {
    const row = {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'X',
      code: null,
      stock: { onHand: 10.5, reserved: '0', inTransit: '0', available: '10.5' },
    };
    expect(() => PosProductRowSchema.parse(row)).toThrow();
  });
});

describe('list envelope', () => {
  it('tolerates the three shapes the API actually returns', () => {
    const env = listEnvelope(z.object({ id: z.string() }));
    expect(env.parse({ items: [] })).toEqual({ items: [] });
    expect(env.parse({ items: [], total: 0 }).total).toBe(0);
    expect(env.parse({ items: [], total: 1, nextCursor: 'abc' }).nextCursor).toBe('abc');
  });
});

describe('flattenSchemaKeys', () => {
  it('walks through object / array / optional / nullable wrappers', () => {
    const schema = z.object({
      top: z.string(),
      wrapped: z
        .object({ inner: z.array(z.object({ deep: z.string() })) })
        .nullable()
        .optional(),
    });
    expect([...flattenSchemaKeys(schema)].sort()).toEqual(['deep', 'inner', 'top', 'wrapped']);
  });

  it('finds every key of the real CurrentSession contract', () => {
    const keys = flattenSchemaKeys(CurrentSessionSchema);
    for (const k of ['cashier', 'cashDesk', 'currency', 'openingCashMinor', 'name']) {
      expect(keys.has(k)).toBe(true);
    }
  });

  it('terminates on a self-referential schema', () => {
    const node: z.ZodTypeAny = z.lazy(() => z.object({ id: z.string(), child: node.optional() }));
    expect(() => flattenSchemaKeys(node)).not.toThrow();
  });
});

describe('provenance registry hygiene', () => {
  it('every entry names an endpoint, a schema and at least one justified source', () => {
    expect(CONTRACT_PROVENANCE.length).toBeGreaterThan(0);
    for (const entry of CONTRACT_PROVENANCE) {
      expect(entry.endpoint).toMatch(/^(GET|POST|PATCH|PUT|DELETE) \//);
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(source.why.length).toBeGreaterThan(20);
      }
    }
  });

  it('declares no unexplained exemptions', () => {
    for (const entry of CONTRACT_PROVENANCE) {
      for (const exemption of entry.exempt ?? []) {
        expect(exemption.why.length).toBeGreaterThan(20);
      }
    }
  });

  it('points at apps/api or packages/db paths that exist in this repo layout', () => {
    for (const entry of CONTRACT_PROVENANCE) {
      for (const source of entry.sources) {
        if (source.kind === 'select' || source.kind === 'method') {
          expect(source.service).toMatch(/^apps\/api\/src\//);
        }
        if (source.kind === 'zod') expect(source.file).toMatch(/^apps\/api\/src\//);
      }
    }
  });
});
