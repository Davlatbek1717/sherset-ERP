import { describe, expect, it } from 'vitest';
import {
  CloseSessionSchema,
  DrawerCashSchema,
  OpenSessionSchema,
  SessionFilterSchema,
  SessionStateSchema,
} from './cashier-session.schema.js';

const UUID = '00000000-0000-0000-0000-000000000001';
const UUID2 = '00000000-0000-0000-0000-000000000002';
const UUID3 = '00000000-0000-0000-0000-000000000003';

describe('SessionStateSchema', () => {
  it('accepts open and closed', () => {
    expect(SessionStateSchema.parse('open')).toBe('open');
    expect(SessionStateSchema.parse('closed')).toBe('closed');
  });

  it('rejects unknown state', () => {
    expect(() => SessionStateSchema.parse('draft')).toThrow();
    expect(() => SessionStateSchema.parse('paused')).toThrow();
  });
});

describe('OpenSessionSchema', () => {
  const valid = {
    cashDeskId: UUID,
    storeId: UUID2,
    organizationId: UUID3,
  };

  it('parses minimal valid input with default openingCash = 0', () => {
    const parsed = OpenSessionSchema.parse(valid);
    expect(parsed.openingCashMinor).toBe('0');
    expect(parsed.cashDeskId).toBe(UUID);
    expect(parsed.storeId).toBe(UUID2);
    expect(parsed.organizationId).toBe(UUID3);
  });

  it('accepts explicit openingCashMinor', () => {
    const parsed = OpenSessionSchema.parse({ ...valid, openingCashMinor: '500000' });
    expect(parsed.openingCashMinor).toBe('500000');
  });

  it('coerces number openingCashMinor to string', () => {
    const parsed = OpenSessionSchema.parse({ ...valid, openingCashMinor: 1000000 });
    expect(parsed.openingCashMinor).toBe('1000000');
  });

  it('rejects fractional openingCashMinor', () => {
    expect(() => OpenSessionSchema.parse({ ...valid, openingCashMinor: '100.5' })).toThrow();
  });

  it('rejects negative openingCashMinor', () => {
    expect(() => OpenSessionSchema.parse({ ...valid, openingCashMinor: '-100' })).toThrow();
  });

  it('rejects missing cashDeskId', () => {
    const { cashDeskId: _, ...rest } = valid;
    expect(() => OpenSessionSchema.parse(rest)).toThrow();
  });

  it('rejects non-UUID cashDeskId', () => {
    expect(() => OpenSessionSchema.parse({ ...valid, cashDeskId: 'not-a-uuid' })).toThrow();
  });

  it('accepts optional description', () => {
    const parsed = OpenSessionSchema.parse({ ...valid, description: 'Night shift' });
    expect(parsed.description).toBe('Night shift');
  });

  it('accepts null description', () => {
    const parsed = OpenSessionSchema.parse({ ...valid, description: null });
    expect(parsed.description).toBeNull();
  });

  it('accepts optional «Внешний код» (externalCode)', () => {
    const parsed = OpenSessionSchema.parse({ ...valid, externalCode: 'TILL-07' });
    expect(parsed.externalCode).toBe('TILL-07');
  });

  it('leaves externalCode undefined when omitted', () => {
    const parsed = OpenSessionSchema.parse(valid);
    expect(parsed.externalCode).toBeUndefined();
  });

  it('rejects an externalCode longer than 50 chars', () => {
    expect(() => OpenSessionSchema.parse({ ...valid, externalCode: 'x'.repeat(51) })).toThrow();
  });
});

describe('CloseSessionSchema', () => {
  it('parses valid closingCashMinor', () => {
    const parsed = CloseSessionSchema.parse({ closingCashMinor: '750000' });
    expect(parsed.closingCashMinor).toBe('750000');
  });

  it('coerces number to string', () => {
    const parsed = CloseSessionSchema.parse({ closingCashMinor: 999000 });
    expect(parsed.closingCashMinor).toBe('999000');
  });

  it('accepts zero closing cash (empty drawer)', () => {
    const parsed = CloseSessionSchema.parse({ closingCashMinor: '0' });
    expect(parsed.closingCashMinor).toBe('0');
  });

  it('rejects fractional closing cash', () => {
    expect(() => CloseSessionSchema.parse({ closingCashMinor: '500.50' })).toThrow();
  });

  it('rejects negative closing cash', () => {
    expect(() => CloseSessionSchema.parse({ closingCashMinor: '-1' })).toThrow();
  });

  it('rejects missing closingCashMinor', () => {
    expect(() => CloseSessionSchema.parse({})).toThrow();
  });

  it('accepts optional description', () => {
    const parsed = CloseSessionSchema.parse({ closingCashMinor: '0', description: 'Shift ended' });
    expect(parsed.description).toBe('Shift ended');
  });
});

describe('DrawerCashSchema (Внесение/Изъятие)', () => {
  it('accepts a positive sumMinor + optional note', () => {
    const parsed = DrawerCashSchema.parse({ sumMinor: '50000', description: 'sdacha' });
    expect(parsed.sumMinor).toBe('50000');
    expect(parsed.description).toBe('sdacha');
  });

  it('coerces a numeric sumMinor to string', () => {
    expect(DrawerCashSchema.parse({ sumMinor: 12345 }).sumMinor).toBe('12345');
  });

  it('rejects zero sumMinor (meaningless drawer op)', () => {
    expect(DrawerCashSchema.safeParse({ sumMinor: '0' }).success).toBe(false);
  });

  it('rejects negative / non-integer sumMinor', () => {
    expect(DrawerCashSchema.safeParse({ sumMinor: '-100' }).success).toBe(false);
    expect(DrawerCashSchema.safeParse({ sumMinor: '12.5' }).success).toBe(false);
  });

  it('requires sumMinor', () => {
    expect(DrawerCashSchema.safeParse({ description: 'x' }).success).toBe(false);
  });
});

describe('SessionFilterSchema', () => {
  it('applies defaults', () => {
    const parsed = SessionFilterSchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.state).toBeUndefined();
    expect(parsed.cashierId).toBeUndefined();
  });

  it('coerces limit from string', () => {
    const parsed = SessionFilterSchema.parse({ limit: '10' });
    expect(parsed.limit).toBe(10);
  });

  it('accepts state filter', () => {
    const parsed = SessionFilterSchema.parse({ state: 'closed' });
    expect(parsed.state).toBe('closed');
  });

  it('rejects invalid state', () => {
    expect(() => SessionFilterSchema.parse({ state: 'pending' })).toThrow();
  });

  it('accepts cashierId UUID filter', () => {
    const parsed = SessionFilterSchema.parse({ cashierId: UUID });
    expect(parsed.cashierId).toBe(UUID);
  });

  it('rejects limit above max (500)', () => {
    expect(() => SessionFilterSchema.parse({ limit: 501 })).toThrow();
  });

  it('accepts dateFrom and dateTo as strings', () => {
    const parsed = SessionFilterSchema.parse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    expect(parsed.dateFrom).toBeInstanceOf(Date);
    expect(parsed.dateTo).toBeInstanceOf(Date);
  });

  it('accepts a search term (moysklad «Смены» toolbar search) and trims it', () => {
    const parsed = SessionFilterSchema.parse({ search: '  Olim  ' });
    expect(parsed.search).toBe('Olim');
  });

  it('drops an all-whitespace / empty search term (min(1) after trim)', () => {
    expect(SessionFilterSchema.parse({}).search).toBeUndefined();
    expect(() => SessionFilterSchema.parse({ search: '   ' })).toThrow();
  });
});
