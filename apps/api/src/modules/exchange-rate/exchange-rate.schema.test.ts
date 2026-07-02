import { describe, expect, it } from 'vitest';
import {
  CbruResponseSchema,
  CbruRowSchema,
  CurrencyCodeSchema,
  ExchangeRateFilterSchema,
} from './exchange-rate.schema.js';

describe('CurrencyCodeSchema', () => {
  it('accepts ISO-4217 three-letter uppercase', () => {
    expect(CurrencyCodeSchema.parse('USD')).toBe('USD');
    expect(CurrencyCodeSchema.parse('EUR')).toBe('EUR');
    expect(CurrencyCodeSchema.parse('UZS')).toBe('UZS');
  });

  it('rejects lowercase, length != 3, digits', () => {
    expect(() => CurrencyCodeSchema.parse('usd')).toThrow();
    expect(() => CurrencyCodeSchema.parse('US')).toThrow();
    expect(() => CurrencyCodeSchema.parse('USDX')).toThrow();
    expect(() => CurrencyCodeSchema.parse('123')).toThrow();
    expect(() => CurrencyCodeSchema.parse('US1')).toThrow();
  });
});

describe('CbruRowSchema', () => {
  const valid = {
    Ccy: 'USD',
    Rate: '12895.46',
    Nominal: '1',
    Date: '01.04.2026',
  };

  it('parses a typical CBRU row', () => {
    const r = CbruRowSchema.parse(valid);
    expect(r.Ccy).toBe('USD');
    expect(r.Rate).toBe('12895.46');
    expect(r.Nominal).toBe('1');
    expect(r.Date).toBe('01.04.2026');
  });

  it('accepts integer-only Rate', () => {
    const r = CbruRowSchema.parse({ ...valid, Rate: '12895' });
    expect(r.Rate).toBe('12895');
  });

  it('accepts large Nominal (KRW etc)', () => {
    const r = CbruRowSchema.parse({ ...valid, Ccy: 'KRW', Nominal: '1000' });
    expect(r.Nominal).toBe('1000');
  });

  it('rejects negative Rate', () => {
    expect(() => CbruRowSchema.parse({ ...valid, Rate: '-12895.46' })).toThrow();
  });

  it('rejects scientific-notation Rate', () => {
    expect(() => CbruRowSchema.parse({ ...valid, Rate: '1.28e4' })).toThrow();
  });

  it('rejects ISO date format (YYYY-MM-DD) — CBRU uses DD.MM.YYYY', () => {
    expect(() => CbruRowSchema.parse({ ...valid, Date: '2026-04-01' })).toThrow();
  });

  it('rejects float Nominal', () => {
    expect(() => CbruRowSchema.parse({ ...valid, Nominal: '1.5' })).toThrow();
  });

  it('rejects unknown currency shape', () => {
    expect(() => CbruRowSchema.parse({ ...valid, Ccy: 'usd' })).toThrow();
  });
});

describe('CbruResponseSchema', () => {
  it('accepts an array of rows', () => {
    const rows = CbruResponseSchema.parse([
      { Ccy: 'USD', Rate: '12895.46', Nominal: '1', Date: '01.04.2026' },
      { Ccy: 'EUR', Rate: '14123.78', Nominal: '1', Date: '01.04.2026' },
    ]);
    expect(rows).toHaveLength(2);
  });

  it('accepts an empty array (CBRU sometimes returns [] for non-trading days)', () => {
    const rows = CbruResponseSchema.parse([]);
    expect(rows).toHaveLength(0);
  });

  it('rejects non-array input', () => {
    expect(() => CbruResponseSchema.parse({})).toThrow();
    expect(() => CbruResponseSchema.parse(null)).toThrow();
  });
});

describe('ExchangeRateFilterSchema', () => {
  it('parses empty input — all fields optional', () => {
    const f = ExchangeRateFilterSchema.parse({});
    expect(f.date).toBeUndefined();
    expect(f.currency).toBeUndefined();
  });

  it('coerces ISO date string to Date', () => {
    const f = ExchangeRateFilterSchema.parse({ date: '2026-04-26' });
    expect(f.date).toBeInstanceOf(Date);
  });

  it('rejects invalid currency in filter', () => {
    expect(() => ExchangeRateFilterSchema.parse({ currency: 'usd' })).toThrow();
  });

  it('accepts UPPERCASE currency in filter', () => {
    const f = ExchangeRateFilterSchema.parse({ currency: 'EUR' });
    expect(f.currency).toBe('EUR');
  });
});
