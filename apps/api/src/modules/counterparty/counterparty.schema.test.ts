import { describe, expect, it } from 'vitest';
import {
  BulkSetStateSchema,
  BulkUpdateCounterpartySchema,
  CounterpartyFilterSchema,
  CreateCounterpartySchema,
  UpdateCounterpartySchema,
} from './counterparty.schema.js';

const uuid = () => crypto.randomUUID();

describe('UpdateCounterpartySchema — edit-save regression (2026-06-18)', () => {
  // The edit form clears unset FKs by sending `null`. stateId/bonusProgramId were
  // bare .optional() and 400'd ("Expected string, received null") on every save of
  // a counterparty with no CRM status — masked by an FE 3-value companyType enum
  // that itself blocked editing ~99% of (RU-company-type) counterparties.
  it('accepts null stateId / bonusProgramId (clearing an unset FK)', () => {
    const r = UpdateCounterpartySchema.safeParse({
      version: 1,
      name: 'X',
      stateId: null,
      bonusProgramId: null,
      ownerId: null,
      groupId: null,
      priceTypeId: null,
    });
    expect(r.success).toBe(true);
  });

  it('accepts every model companyType incl. the RU variants (individual/legal)', () => {
    for (const companyType of ['legalUZ', 'individual', 'legal', 'entrepreneur']) {
      expect(CreateCounterpartySchema.safeParse({ name: 'X', companyType }).success).toBe(true);
    }
  });

  it('accepts «Группы» memberships (groupIds) on create/update; rejects a non-uuid', () => {
    expect(
      CreateCounterpartySchema.safeParse({ name: 'X', groupIds: [crypto.randomUUID()] }).success,
    ).toBe(true);
    expect(CreateCounterpartySchema.safeParse({ name: 'X', groupIds: [] }).success).toBe(true);
    expect(
      UpdateCounterpartySchema.safeParse({ version: 1, groupIds: [crypto.randomUUID()] }).success,
    ).toBe(true);
    expect(CreateCounterpartySchema.safeParse({ name: 'X', groupIds: ['nope'] }).success).toBe(
      false,
    );
  });
});

describe('BulkSetStateSchema («Статус ▾» bulk)', () => {
  it('accepts ids + a state id, and a null stateId (clear status)', () => {
    expect(BulkSetStateSchema.safeParse({ ids: [uuid()], stateId: uuid() }).success).toBe(true);
    expect(BulkSetStateSchema.safeParse({ ids: [uuid(), uuid()], stateId: null }).success).toBe(
      true,
    );
  });
  it('rejects an empty id list, a non-uuid id, and a non-uuid stateId', () => {
    expect(BulkSetStateSchema.safeParse({ ids: [], stateId: null }).success).toBe(false);
    expect(BulkSetStateSchema.safeParse({ ids: ['not-a-uuid'], stateId: null }).success).toBe(
      false,
    );
    expect(BulkSetStateSchema.safeParse({ ids: [uuid()], stateId: 'nope' }).success).toBe(false);
  });
});

describe('BulkUpdateCounterpartySchema («Массовое редактирование» — live-grounded 2026-06-18)', () => {
  it('accepts ids + a partial patch (only the enabled fields land)', () => {
    expect(
      BulkUpdateCounterpartySchema.safeParse({ ids: [uuid()], patch: { archived: true } }).success,
    ).toBe(true);
    expect(
      BulkUpdateCounterpartySchema.safeParse({
        ids: [uuid(), uuid()],
        patch: { stateId: uuid(), shared: false, companyType: 'individual' },
      }).success,
    ).toBe(true);
  });

  it('accepts the «Группы» m2m modes (set / add / remove group-id lists)', () => {
    expect(
      BulkUpdateCounterpartySchema.safeParse({
        ids: [uuid()],
        patch: { setGroupIds: [uuid(), uuid()] },
      }).success,
    ).toBe(true);
    expect(
      BulkUpdateCounterpartySchema.safeParse({
        ids: [uuid()],
        patch: { addGroupIds: [uuid()], removeGroupIds: [uuid()] },
      }).success,
    ).toBe(true);
    // empty arrays are valid (e.g. «Установить группы» = clear all memberships)
    expect(
      BulkUpdateCounterpartySchema.safeParse({ ids: [uuid()], patch: { setGroupIds: [] } }).success,
    ).toBe(true);
    // a non-uuid group id is rejected
    expect(
      BulkUpdateCounterpartySchema.safeParse({ ids: [uuid()], patch: { addGroupIds: ['nope'] } })
        .success,
    ).toBe(false);
  });

  it('accepts null to CLEAR a clearable field (moysklad «очистить»)', () => {
    expect(
      BulkUpdateCounterpartySchema.safeParse({
        ids: [uuid()],
        patch: { stateId: null, ownerId: null, groupId: null, priceTypeId: null, gender: null },
      }).success,
    ).toBe(true);
  });

  it('merges custom «Дополнительные поля» via a free-form attributes record', () => {
    expect(
      BulkUpdateCounterpartySchema.safeParse({
        ids: [uuid()],
        patch: { attributes: { usto: 'X' } },
      }).success,
    ).toBe(true);
  });

  it('rejects an EMPTY patch (must change at least one field)', () => {
    expect(BulkUpdateCounterpartySchema.safeParse({ ids: [uuid()], patch: {} }).success).toBe(
      false,
    );
  });

  it('rejects an empty id list, a non-uuid id, and an unknown companyType', () => {
    expect(
      BulkUpdateCounterpartySchema.safeParse({ ids: [], patch: { archived: true } }).success,
    ).toBe(false);
    expect(
      BulkUpdateCounterpartySchema.safeParse({ ids: ['nope'], patch: { archived: true } }).success,
    ).toBe(false);
    expect(
      BulkUpdateCounterpartySchema.safeParse({ ids: [uuid()], patch: { companyType: 'nope' } })
        .success,
    ).toBe(false);
  });
});

describe('CounterpartyFilterSchema', () => {
  it('applies defaults (archived=false, limit=25, sortBy=createdAt, sortDir=desc)', () => {
    const r = CounterpartyFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(false);
    expect(r.data.limit).toBe(25);
    expect(r.data.sortBy).toBe('createdAt');
    expect(r.data.sortDir).toBe('desc');
  });

  it('coerces archived from the string "true"/"false"', () => {
    const a = CounterpartyFilterSchema.safeParse({ archived: 'true' });
    const b = CounterpartyFilterSchema.safeParse({ archived: 'false' });
    if (!a.success || !b.success) throw a.success ? b.error : a.error;
    expect(a.data.archived).toBe(true);
    expect(b.data.archived).toBe(false);
  });

  it('accepts the master-data filter set (companyType, ownerId, groupId, stateId)', () => {
    const r = CounterpartyFilterSchema.safeParse({
      companyType: 'legalUZ',
      ownerId: uuid(),
      groupId: uuid(),
      stateId: uuid(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown companyType value', () => {
    expect(CounterpartyFilterSchema.safeParse({ companyType: 'notAType' }).success).toBe(false);
  });

  describe('tags (Метки) filter', () => {
    it('accepts a single trimmed tag', () => {
      const r = CounterpartyFilterSchema.safeParse({ tags: '  vip  ' });
      if (!r.success) throw r.error;
      expect(r.data.tags).toBe('vip');
    });

    it('is optional — omitted when not provided', () => {
      const r = CounterpartyFilterSchema.safeParse({});
      if (!r.success) throw r.error;
      expect(r.data.tags).toBeUndefined();
    });

    it('rejects an empty / whitespace-only tag (after trim)', () => {
      expect(CounterpartyFilterSchema.safeParse({ tags: '   ' }).success).toBe(false);
    });
  });

  // moysklad «Фильтр» parity enrichment (2026-06-11k). Each field below is
  // backed by an existing Counterparty column — these tests pin the parse so a
  // refactor can't silently drop a filter param (the «accepted-but-unapplied»
  // dead-filter class). The runtime smoke proves they actually NARROW the query.
  describe('«Показывать» archived tri-state (parity with products)', () => {
    it("maps 'all' → undefined (NO archive predicate — shows both)", () => {
      const r = CounterpartyFilterSchema.safeParse({ archived: 'all' });
      if (!r.success) throw r.error;
      expect(r.data.archived).toBeUndefined();
    });

    it("preserves the .default(false) — an absent param stays 'only non-archived'", () => {
      const r = CounterpartyFilterSchema.safeParse({});
      if (!r.success) throw r.error;
      expect(r.data.archived).toBe(false);
    });

    it("still maps 'true'/'false' to the booleans", () => {
      const a = CounterpartyFilterSchema.safeParse({ archived: 'true' });
      const b = CounterpartyFilterSchema.safeParse({ archived: 'false' });
      if (!a.success || !b.success) throw a.success ? b.error : a.error;
      expect(a.data.archived).toBe(true);
      expect(b.data.archived).toBe(false);
    });

    it("rejects an unknown sentinel (not 'all'/'true'/'false')", () => {
      expect(CounterpartyFilterSchema.safeParse({ archived: 'maybe' }).success).toBe(false);
    });
  });

  describe('discrete contains / range fields (each backed by a real column)', () => {
    it('accepts address / code / inn / discountCard text filters', () => {
      const r = CounterpartyFilterSchema.safeParse({
        address: 'Tashkent',
        code: 'CP-1',
        inn: '301',
        discountCard: '777',
      });
      if (!r.success) throw r.error;
      expect(r.data.address).toBe('Tashkent');
      expect(r.data.code).toBe('CP-1');
      expect(r.data.inn).toBe('301');
      expect(r.data.discountCard).toBe('777');
    });

    it('coerces shared tri-state from "true"/"false" and omits when absent', () => {
      const a = CounterpartyFilterSchema.safeParse({ shared: 'true' });
      const b = CounterpartyFilterSchema.safeParse({ shared: 'false' });
      const c = CounterpartyFilterSchema.safeParse({});
      if (!a.success || !b.success || !c.success) throw new Error('parse failed');
      expect(a.data.shared).toBe(true);
      expect(b.data.shared).toBe(false);
      expect(c.data.shared).toBeUndefined();
    });

    it('accepts a priceTypeId uuid (Цены) and rejects a non-uuid', () => {
      expect(CounterpartyFilterSchema.safeParse({ priceTypeId: uuid() }).success).toBe(true);
      expect(CounterpartyFilterSchema.safeParse({ priceTypeId: 'nope' }).success).toBe(false);
    });

    it('accepts createdFrom/To and updatedFrom/To range bounds', () => {
      const r = CounterpartyFilterSchema.safeParse({
        createdFrom: '2026-01-01',
        createdTo: '2026-01-31',
        updatedFrom: '2026-02-01',
        updatedTo: '2026-02-28',
      });
      if (!r.success) throw r.error;
      expect(r.data.createdFrom).toBe('2026-01-01');
      expect(r.data.updatedTo).toBe('2026-02-28');
    });
  });
});

describe('UpdateCounterpartySchema — edit-save null clearing (regression: was 400)', () => {
  // The counterparties/[id] edit form sends every empty optional field as `null`
  // (`v.legalTitle || null`, `v.priceTypeId || null`, …). Bare .optional() rejected
  // null ("Expected string, received null") and 400'd the save of any counterparty
  // with a blank optional field — i.e. essentially every counterparty. These fields
  // are now .nullish(). One assertion per field the FE clears (page.tsx:201-213).
  const clearableTextFields = [
    'legalTitle',
    'legalAddress',
    'actualAddress',
    'fax',
    'code',
    'externalCode',
    'discountCardNumber',
    'description',
  ] as const;

  for (const field of clearableTextFields) {
    it(`accepts null for ${field} on update (cleared field)`, () => {
      expect(UpdateCounterpartySchema.safeParse({ version: 1, [field]: null }).success).toBe(true);
    });
  }

  it('accepts null for priceTypeId on update (price-type picker cleared → disconnect)', () => {
    expect(UpdateCounterpartySchema.safeParse({ version: 1, priceTypeId: null }).success).toBe(
      true,
    );
  });

  it('accepts null for email on update (cleared email — keeps the .or(literal("")) branch too)', () => {
    expect(UpdateCounterpartySchema.safeParse({ version: 1, email: null }).success).toBe(true);
    expect(UpdateCounterpartySchema.safeParse({ version: 1, email: '' }).success).toBe(true);
    expect(UpdateCounterpartySchema.safeParse({ version: 1, email: 'a@b.com' }).success).toBe(true);
  });

  it('clears phone on update — null/"" map to null (not a silently-swallowed no-op)', () => {
    // Regression guard for the Phase-2 QA find (2026-06-10): the phone transform used to
    // `return undefined` for an empty/cleared value, which the update() service guard
    // (`if (parsed.phone !== undefined) ...`) then SKIPPED — so clearing the phone on the
    // edit form saved 200 but kept the old number. The transform must yield null so the
    // clear actually reaches the column (matches sibling contact-person.schema.ts).
    const cleared = UpdateCounterpartySchema.safeParse({ version: 1, phone: null });
    expect(cleared.success).toBe(true);
    expect(cleared.success && cleared.data.phone).toBe(null);
    const empty = UpdateCounterpartySchema.safeParse({ version: 1, phone: '   ' });
    expect(empty.success && empty.data.phone).toBe(null);
    // a real number still normalises through (not nulled)
    const real = UpdateCounterpartySchema.safeParse({ version: 1, phone: '+998901112233' });
    expect(real.success && typeof real.data.phone).toBe('string');
  });

  it('still rejects null for the required name', () => {
    expect(UpdateCounterpartySchema.safeParse({ version: 1, name: null }).success).toBe(false);
  });

  it('Create also accepts null for the clearable fields (consistency; null === absent)', () => {
    expect(
      CreateCounterpartySchema.safeParse({ name: 'Acme', legalTitle: null, description: null })
        .success,
    ).toBe(true);
  });
});

describe('CounterpartyFilterSchema — Phase-2 adversarial-audit regression locks (2026-06-18)', () => {
  it('rejects a non-finite «Баланс» bound (Infinity/1e400/NaN) — was a raw 500 (RangeError)', () => {
    // BigInt(Math.round(Infinity * 100)) throws RangeError → uncaught 500. .finite()
    // turns it into a clean 400. A long pasted number also overflows to Infinity.
    expect(CounterpartyFilterSchema.safeParse({ balanceFrom: 'Infinity' }).success).toBe(false);
    expect(CounterpartyFilterSchema.safeParse({ balanceFrom: '1e400' }).success).toBe(false);
    expect(CounterpartyFilterSchema.safeParse({ balanceTo: 'NaN' }).success).toBe(false);
    // a real finite (incl. negative) bound still parses
    expect(
      CounterpartyFilterSchema.safeParse({ balanceFrom: '-500.5', balanceTo: '1000' }).success,
    ).toBe(true);
  });

  it('accepts `page` (1-based offset paging) and rejects page < 1', () => {
    const r = CounterpartyFilterSchema.safeParse({ page: '3' });
    if (!r.success) throw r.error;
    expect(r.data.page).toBe(3);
    expect(CounterpartyFilterSchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('drops salesAmount as a sort key (dead always-0 column; «Сумма продаж» is computed)', () => {
    expect(CounterpartyFilterSchema.safeParse({ sortBy: 'salesAmount' }).success).toBe(false);
    expect(CounterpartyFilterSchema.safeParse({ sortBy: 'name' }).success).toBe(true);
  });
});
