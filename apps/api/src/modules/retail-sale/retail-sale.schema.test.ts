import { describe, expect, it } from 'vitest';
import {
  CreateRetailSaleSchema,
  PostRetailSaleSchema,
  RefundRetailSaleSchema,
  RetailSaleFilterSchema,
  RetailSalePositionInputSchema,
  RetailSaleStateSchema,
  UpdateRetailSaleSchema,
} from './retail-sale.schema.js';

const UUID = '00000000-0000-0000-0000-000000000001';
const UUID2 = '00000000-0000-0000-0000-000000000002';

const validPosition = {
  productId: UUID,
  quantity: '2',
  priceMinor: '10000000',
  discount: '0',
};

describe('RetailSaleStateSchema', () => {
  it('accepts all six states', () => {
    expect(RetailSaleStateSchema.parse('draft')).toBe('draft');
    expect(RetailSaleStateSchema.parse('posted')).toBe('posted');
    expect(RetailSaleStateSchema.parse('refunded')).toBe('refunded');
    expect(RetailSaleStateSchema.parse('cancelled')).toBe('cancelled');
  });

  // Omborchi zanjiri (d7ab3b1): send-to-picking DB'ga 'picking' yozadi,
  // mark-ready 'ready' ga o'tkazadi. Enum ularni bilmasa, POS'ning
  // ?state=picking / ?state=ready so'rovlari 400 qaytaradi va
  // «Yig'ilmoqda»/«Tayyor» ro'yxatlari bo'sh qoladi.
  it('accepts the omborchi picking-chain states', () => {
    expect(RetailSaleStateSchema.parse('picking')).toBe('picking');
    expect(RetailSaleStateSchema.parse('ready')).toBe('ready');
  });

  it('rejects unknown state', () => {
    expect(() => RetailSaleStateSchema.parse('open')).toThrow();
    expect(() => RetailSaleStateSchema.parse('paid')).toThrow();
  });
});

describe('RetailSaleFilterSchema — picking-chain states', () => {
  // Regressiya qulfi: POS sahifasi aynan shu ikki so'rovni yuboradi
  // (sotuv/page.tsx — retail-sales-picking / retail-sales-ready).
  it('accepts ?state=picking', () => {
    expect(RetailSaleFilterSchema.parse({ state: 'picking' }).state).toBe('picking');
  });

  it('accepts ?state=ready', () => {
    expect(RetailSaleFilterSchema.parse({ state: 'ready' }).state).toBe('ready');
  });
});

describe('RetailSalePositionInputSchema', () => {
  it('parses a valid position', () => {
    const parsed = RetailSalePositionInputSchema.parse(validPosition);
    expect(parsed.productId).toBe(UUID);
    expect(parsed.quantity).toBe('2');
    expect(parsed.priceMinor).toBe('10000000');
    expect(parsed.discount).toBe('0');
  });

  it('defaults discount to "0"', () => {
    const { discount: _, ...rest } = validPosition;
    const parsed = RetailSalePositionInputSchema.parse(rest);
    expect(parsed.discount).toBe('0');
  });

  it('rejects fractional priceMinor', () => {
    expect(() =>
      RetailSalePositionInputSchema.parse({ ...validPosition, priceMinor: '100.5' }),
    ).toThrow();
  });

  it('rejects negative quantity', () => {
    expect(() =>
      RetailSalePositionInputSchema.parse({ ...validPosition, quantity: '-1' }),
    ).toThrow();
  });

  it('accepts fractional quantity (e.g. 0.5 kg)', () => {
    const parsed = RetailSalePositionInputSchema.parse({ ...validPosition, quantity: '0.5' });
    expect(parsed.quantity).toBe('0.5');
  });

  it('rejects non-UUID productId', () => {
    expect(() =>
      RetailSalePositionInputSchema.parse({ ...validPosition, productId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('accepts discount up to 2 decimal places', () => {
    const parsed = RetailSalePositionInputSchema.parse({ ...validPosition, discount: '10.50' });
    expect(parsed.discount).toBe('10.50');
  });
});

describe('CreateRetailSaleSchema', () => {
  const valid = {
    sessionId: UUID2,
    positions: [validPosition],
  };

  it('parses minimal valid input', () => {
    const parsed = CreateRetailSaleSchema.parse(valid);
    expect(parsed.sessionId).toBe(UUID2);
    expect(parsed.positions).toHaveLength(1);
    expect(parsed.agentId).toBeUndefined();
  });

  it('requires at least one position', () => {
    expect(() => CreateRetailSaleSchema.parse({ ...valid, positions: [] })).toThrow(
      /at least one position/i,
    );
  });

  it('accepts optional agentId', () => {
    const parsed = CreateRetailSaleSchema.parse({ ...valid, agentId: UUID });
    expect(parsed.agentId).toBe(UUID);
  });

  it('rejects non-UUID sessionId', () => {
    expect(() => CreateRetailSaleSchema.parse({ ...valid, sessionId: 'not-a-uuid' })).toThrow();
  });

  it('accepts multiple positions', () => {
    const parsed = CreateRetailSaleSchema.parse({
      ...valid,
      positions: [validPosition, { ...validPosition, productId: UUID2, quantity: '3' }],
    });
    expect(parsed.positions).toHaveLength(2);
  });

  it('accepts optional «Внешний код» (externalCode)', () => {
    const parsed = CreateRetailSaleSchema.parse({ ...valid, externalCode: 'POS-9001' });
    expect(parsed.externalCode).toBe('POS-9001');
  });

  it('leaves externalCode undefined when omitted', () => {
    const parsed = CreateRetailSaleSchema.parse(valid);
    expect(parsed.externalCode).toBeUndefined();
  });

  it('rejects an externalCode longer than 50 chars', () => {
    expect(() =>
      CreateRetailSaleSchema.parse({ ...valid, externalCode: 'x'.repeat(51) }),
    ).toThrow();
  });
});

describe('PostRetailSaleSchema', () => {
  it('parses valid payment split', () => {
    const parsed = PostRetailSaleSchema.parse({
      cashAmountMinor: '20000000',
      cardAmountMinor: '0',
      expectedSumMinor: '20000000',
    });
    expect(parsed.cashAmountMinor).toBe('20000000');
    expect(parsed.cardAmountMinor).toBe('0');
    expect(parsed.expectedSumMinor).toBe('20000000');
  });

  it('accepts mixed cash+card payment', () => {
    const parsed = PostRetailSaleSchema.parse({
      cashAmountMinor: '10000000',
      cardAmountMinor: '10000000',
      expectedSumMinor: '20000000',
    });
    expect(parsed.cashAmountMinor).toBe('10000000');
    expect(parsed.cardAmountMinor).toBe('10000000');
  });

  it('coerces numeric inputs to strings', () => {
    const parsed = PostRetailSaleSchema.parse({
      cashAmountMinor: 25000000,
      cardAmountMinor: 0,
      expectedSumMinor: 25000000,
    });
    expect(parsed.cashAmountMinor).toBe('25000000');
  });

  it('rejects fractional amounts', () => {
    expect(() =>
      PostRetailSaleSchema.parse({
        cashAmountMinor: '100.5',
        cardAmountMinor: '0',
        expectedSumMinor: '100',
      }),
    ).toThrow();
  });

  it('rejects missing cashAmountMinor', () => {
    expect(() =>
      PostRetailSaleSchema.parse({ cardAmountMinor: '0', expectedSumMinor: '0' }),
    ).toThrow();
  });
});

describe('RefundRetailSaleSchema', () => {
  const valid = {
    positions: [validPosition],
    cashAmountMinor: '10000000',
    cardAmountMinor: '0',
  };

  it('parses valid refund', () => {
    const parsed = RefundRetailSaleSchema.parse(valid);
    expect(parsed.positions).toHaveLength(1);
    expect(parsed.cashAmountMinor).toBe('10000000');
    expect(parsed.cardAmountMinor).toBe('0');
  });

  it('defaults cashAmountMinor and cardAmountMinor to "0"', () => {
    const parsed = RefundRetailSaleSchema.parse({ positions: [validPosition] });
    expect(parsed.cashAmountMinor).toBe('0');
    expect(parsed.cardAmountMinor).toBe('0');
  });

  it('requires at least one position', () => {
    expect(() => RefundRetailSaleSchema.parse({ ...valid, positions: [] })).toThrow(
      /at least one position/i,
    );
  });
});

describe('UpdateRetailSaleSchema', () => {
  it('accepts partial update with only description', () => {
    const parsed = UpdateRetailSaleSchema.parse({ version: 1, description: 'Updated note' });
    expect(parsed.description).toBe('Updated note');
    expect(parsed.positions).toBeUndefined();
  });

  it('accepts positions replacement', () => {
    const parsed = UpdateRetailSaleSchema.parse({ version: 3, positions: [validPosition] });
    expect(parsed.positions).toHaveLength(1);
  });

  it('rejects empty positions array when provided', () => {
    expect(() => UpdateRetailSaleSchema.parse({ version: 1, positions: [] })).toThrow();
  });

  it('accepts «Внешний код» on update', () => {
    const parsed = UpdateRetailSaleSchema.parse({ version: 1, externalCode: 'SYNC-42' });
    expect(parsed.externalCode).toBe('SYNC-42');
  });
});

describe('UpdateRetailSaleSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateRetailSaleSchema.safeParse({ description: 'x' }).success).toBe(false);
    expect(UpdateRetailSaleSchema.safeParse({ version: 1, description: 'x' }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateRetailSaleSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateRetailSaleSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateRetailSaleSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});

describe('RetailSaleFilterSchema', () => {
  it('applies defaults', () => {
    const parsed = RetailSaleFilterSchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.sortBy).toBe('moment');
    expect(parsed.sortDir).toBe('desc');
    expect(parsed.state).toBeUndefined();
  });

  it('coerces limit from string', () => {
    const parsed = RetailSaleFilterSchema.parse({ limit: '20' });
    expect(parsed.limit).toBe(20);
  });

  it('accepts state filter', () => {
    const parsed = RetailSaleFilterSchema.parse({ state: 'posted' });
    expect(parsed.state).toBe('posted');
  });

  it('rejects invalid state', () => {
    expect(() => RetailSaleFilterSchema.parse({ state: 'open' })).toThrow();
  });

  it('accepts sessionId filter', () => {
    const parsed = RetailSaleFilterSchema.parse({ sessionId: UUID });
    expect(parsed.sessionId).toBe(UUID);
  });

  it('rejects limit above max (500)', () => {
    expect(() => RetailSaleFilterSchema.parse({ limit: 501 })).toThrow();
  });

  it('accepts sortBy moment', () => {
    const parsed = RetailSaleFilterSchema.parse({ sortBy: 'moment' });
    expect(parsed.sortBy).toBe('moment');
  });

  it('rejects invalid sortBy', () => {
    expect(() => RetailSaleFilterSchema.parse({ sortBy: 'invalid' })).toThrow();
  });

  it('accepts dateFrom/dateTo as strings', () => {
    const parsed = RetailSaleFilterSchema.parse({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    expect(parsed.dateFrom).toBeInstanceOf(Date);
    expect(parsed.dateTo).toBeInstanceOf(Date);
  });
});
