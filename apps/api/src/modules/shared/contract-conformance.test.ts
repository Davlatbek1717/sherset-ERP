import { CONTRACT_PROVENANCE, flattenSchemaKeys } from '@moysklad/contracts';
import { describe, expect, it } from 'vitest';
import {
  collectSourceKeys,
  methodObjectKeys,
  prismaModelFields,
  readRepoFile,
  selectBlockKeys,
  sliceMethod,
  zodObjectKeys,
} from './contract-provenance.js';

/**
 * CONTRACT CONFORMANCE — the enforcement half of `@moysklad/contracts`.
 *
 * Audit finding `FE-12`: web pages hand-declare the shape of every API response,
 * so the server can stop sending a field and nothing fails until a user hits the
 * page. That is not hypothetical here — `findCurrentForCashier` was the one
 * session read that omitted the `cashier` include, the FE type claimed the field
 * existed, and the POS register died with `undefined.name` in front of a cashier
 * (2026-06-08k).
 *
 * Moving those interfaces into a shared package fixes the duplication but not
 * the tether. This test is the tether: for every contract in the registry it
 * flattens the schema's keys and proves each one is produced by a declared place
 * in the real server source — a Prisma model, a `select`/`include` block, a
 * hand-built response object, or an apps/api Zod schema.
 *
 * SCOPE, honestly: this proves key PRESENCE, statically. It does not check
 * types (a column going `Int → String` passes), does not run a query, and does
 * not prove the route is reachable. Those stay Phase-2 runtime work.
 */
describe('contract provenance registry', () => {
  it('covers every schema the contracts package exports', async () => {
    const pkg = (await import('@moysklad/contracts')) as Record<string, unknown>;
    const exportedSchemas = Object.keys(pkg).filter((k) => k.endsWith('Schema'));
    const registered = new Set(CONTRACT_PROVENANCE.map((c) => c.contract));

    // Composed/among-parts schemas that are covered transitively by a registered
    // parent contract (their keys are flattened into it). Listing them here is a
    // deliberate decision per schema, so a NEW export cannot slip through
    // unregistered by accident.
    const coveredByParent = new Set([
      'CashDeskRefSchema', // inside CurrentSessionSchema
      'UserRefSchema', // inside CurrentSessionSchema
      'SessionStateSchema', // enum, no keys
      'CurrentSessionResponseSchema', // nullable wrapper of CurrentSessionSchema
      'ProductStockSchema', // inside PosProductRowSchema
      'SalePriceEntrySchema', // inside PosProductRowSchema
    ]);

    const unregistered = exportedSchemas.filter(
      (name) => !registered.has(name) && !coveredByParent.has(name),
    );
    expect(unregistered).toEqual([]);
  });

  for (const contract of CONTRACT_PROVENANCE) {
    describe(`${contract.contract} (${contract.endpoint})`, () => {
      it('every contract key is produced by a declared server source', () => {
        const required = flattenSchemaKeys(contract.schema);
        const provided = collectSourceKeys(contract.sources);
        const exempt = new Set((contract.exempt ?? []).map((e) => e.key));

        const missing = [...required].filter((k) => !provided.has(k) && !exempt.has(k));
        expect(missing).toEqual([]);
      });

      it('declares at least one source', () => {
        expect(contract.sources.length).toBeGreaterThan(0);
      });
    });
  }
});

describe('provenance extractors', () => {
  const SELECT_FIXTURE = `
  async findThing(id: string) {
    return this.prisma.client.thing.findFirst({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        desk: { select: { id: true, currency: true } },
      },
    });
  }

  async other() {}
`;

  it('selectBlockKeys pulls nested include keys', () => {
    const keys = selectBlockKeys(SELECT_FIXTURE, 'findThing');
    expect([...keys].sort()).toEqual(['currency', 'desk', 'id', 'name', 'owner']);
  });

  it('selectBlockKeys does NOT leak keys from the next method', () => {
    const src = `${SELECT_FIXTURE}
  async later() {
    return { leaked: true };
  }
`;
    expect(selectBlockKeys(src, 'findThing').has('leaked')).toBe(false);
  });

  it('sliceMethod throws loudly when the method is renamed away', () => {
    expect(() => sliceMethod(SELECT_FIXTURE, 'noSuchMethod')).toThrow(/noSuchMethod/);
  });

  it('selectBlockKeys throws when the method has no select/include block', () => {
    expect(() => selectBlockKeys('  async bare() { return 1; }', 'bare')).toThrow(
      /select|include/i,
    );
  });

  it('methodObjectKeys collects hand-built response keys', () => {
    const src = `
  private async attachStock(page: T[]) {
    return page.map((p) => ({
      ...p,
      stock: { onHand: '0', reserved: '0', inTransit: '0', available: '0' },
    }));
  }
`;
    const keys = methodObjectKeys(src, 'attachStock');
    for (const k of ['stock', 'onHand', 'reserved', 'inTransit', 'available']) {
      expect(keys.has(k)).toBe(true);
    }
  });

  it('prismaModelFields reads scalar columns and ignores attributes/comments', () => {
    const schema = `
model Widget {
  /// doc comment
  id        String  @id @default(uuid()) @db.Uuid
  name      String  @db.VarChar(255)
  // line comment
  archived  Boolean @default(false)
  owner     User    @relation(fields: [ownerId], references: [id])

  @@index([name])
  @@map("widgets")
}

model Other {
  ghost String
}
`;
    const fields = prismaModelFields(schema, 'Widget');
    expect([...fields].sort()).toEqual(['archived', 'id', 'name', 'owner']);
    expect(fields.has('ghost')).toBe(false);
  });

  it('prismaModelFields throws when the model is renamed away', () => {
    expect(() => prismaModelFields('model A { id String }', 'B')).toThrow(/B/);
  });

  it('zodObjectKeys reads a named server Zod schema', () => {
    const src = `
export const SalePriceSchema = z.object({
  priceTypeId: z.string().min(1),
  value: bigIntString,
  currencyCode: z.string().length(3).default('UZS'),
});
export const Other = z.object({ nope: z.string() });
`;
    const keys = zodObjectKeys(src, 'SalePriceSchema');
    expect([...keys].sort()).toEqual(['currencyCode', 'priceTypeId', 'value']);
  });

  it('zodObjectKeys throws when the schema export is renamed away', () => {
    expect(() => zodObjectKeys('export const A = z.object({});', 'B')).toThrow(/B/);
  });
});

/**
 * RED-PROOF against the REAL regression, not a fixture.
 *
 * The extractor self-tests above prove the parsing works. This proves the check
 * would have caught the actual 2026-06-08k production crash: take the live
 * `cashier-session.service.ts`, delete the `cashier:` include line, and confirm
 * the CurrentSession contract stops being satisfied. If someone ever weakens the
 * conformance check into something that always passes, this test goes red.
 */
describe('conformance catches the historical POS crash', () => {
  it('CurrentSession contract fails when the `cashier` include is removed', () => {
    const contract = CONTRACT_PROVENANCE.find((c) => c.contract === 'CurrentSessionSchema');
    if (!contract) throw new Error('CurrentSessionSchema not registered');
    const selectSource = contract.sources.find((s) => s.kind === 'select');
    if (!selectSource || selectSource.kind !== 'select') {
      throw new Error('CurrentSessionSchema must declare a select-provenance source');
    }

    const real = readRepoFile(selectSource.service);
    expect(selectBlockKeys(real, selectSource.method).has('cashier')).toBe(true);

    // Sabotage the METHOD, not the file: `list`/`findOne`/`open`/`close` carry
    // a byte-identical `cashier:` include, and a file-wide non-global replace
    // hits the first of those instead — which looks like a working sabotage and
    // silently turns this proof into a no-op.
    const body = sliceMethod(real, selectSource.method);
    const sabotagedBody = body.replace(/^\s*cashier:\s*\{\s*select:.*$/m, '');
    expect(sabotagedBody).not.toBe(body);
    const sabotaged = real.replace(body, sabotagedBody);
    expect(selectBlockKeys(sabotaged, selectSource.method).has('cashier')).toBe(false);
  });
});
