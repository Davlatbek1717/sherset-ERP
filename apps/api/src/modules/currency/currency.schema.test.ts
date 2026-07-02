import { describe, expect, it } from 'vitest';
import {
  CreateCurrencySchema,
  CurrencyFilterSchema,
  UpdateCurrencySchema,
  rateToRateValue,
  rateValueToRate,
} from './currency.schema.js';

describe('rateToRateValue — money discipline (no float drift)', () => {
  it('integer rate', () => {
    expect(rateToRateValue('1')).toBe('100000000');
    expect(rateToRateValue('63')).toBe('6300000000');
    expect(rateToRateValue('12750')).toBe('1275000000000');
  });

  it('drift-prone decimals are exact (string math, not IEEE-754)', () => {
    expect(rateToRateValue('0.1')).toBe('10000000');
    expect(rateToRateValue('0.2')).toBe('20000000');
    expect(rateToRateValue('12750.5')).toBe('1275050000000');
    expect(rateToRateValue('0.00000001')).toBe('1'); // 1 / 1e8
  });

  it('truncates beyond 8 dp deterministically', () => {
    expect(rateToRateValue('1.123456789')).toBe('112345678');
  });

  it('round-trips through rateValueToRate', () => {
    for (const r of ['1', '63', '12750.5', '0.1', '0.00000001', '9999.99999999']) {
      expect(rateValueToRate(rateToRateValue(r))).toBe(r);
    }
  });

  it('rateValueToRate trims trailing fraction zeros + base 1', () => {
    expect(rateValueToRate('100000000')).toBe('1');
    expect(rateValueToRate('6300000000')).toBe('63');
    expect(rateValueToRate('10000000')).toBe('0.1');
  });
});

describe('CreateCurrencySchema', () => {
  it('accepts a valid currency, upcasing the alpha isoCode', () => {
    // moysklad model: code = ISO NUMERIC ("840"), isoCode = ISO ALPHA ("USD").
    const r = CreateCurrencySchema.parse({
      code: '840',
      isoCode: 'usd',
      name: 'dollar',
      rate: '12750.50',
    });
    expect(r.code).toBe('840');
    expect(r.isoCode).toBe('USD');
    expect(r.rateUpdateType).toBe('MANUAL');
    expect(r.multiplicity).toBe(1);
    expect(r.default).toBe(false);
  });

  it('defaults rate to "1" when omitted', () => {
    const r = CreateCurrencySchema.parse({ code: '978', isoCode: 'EUR', name: 'euro' });
    expect(r.rate).toBe('1');
  });

  it('rejects a zero rate', () => {
    expect(
      CreateCurrencySchema.safeParse({ code: '840', isoCode: 'USD', name: 'd', rate: '0' }).success,
    ).toBe(false);
    expect(
      CreateCurrencySchema.safeParse({
        code: '840',
        isoCode: 'USD',
        name: 'd',
        rate: '0.00000000',
      }).success,
    ).toBe(false);
  });

  it('rejects a non-numeric code and a non-3-letter isoCode', () => {
    expect(CreateCurrencySchema.safeParse({ code: '84', isoCode: 'USD', name: 'd' }).success).toBe(
      false,
    );
    expect(CreateCurrencySchema.safeParse({ code: '840', isoCode: '840', name: 'd' }).success).toBe(
      false,
    );
  });

  it('rejects an empty name and a >8dp / non-numeric rate', () => {
    expect(CreateCurrencySchema.safeParse({ code: '840', isoCode: 'USD', name: '' }).success).toBe(
      false,
    );
    expect(
      CreateCurrencySchema.safeParse({ code: '840', isoCode: 'USD', name: 'd', rate: 'abc' })
        .success,
    ).toBe(false);
  });

  it('coerces boolean-ish strings + enum rateUpdateType', () => {
    const r = CreateCurrencySchema.parse({
      code: '643',
      isoCode: 'RUB',
      name: 'rubl',
      default: 'true',
      system: '1',
      rateUpdateType: 'AUTO',
    });
    expect(r.default).toBe(true);
    expect(r.system).toBe(true);
    expect(r.rateUpdateType).toBe('AUTO');
    expect(
      CreateCurrencySchema.safeParse({
        code: '643',
        isoCode: 'RUB',
        name: 'r',
        rateUpdateType: 'WEEKLY',
      }).success,
    ).toBe(false);
  });
});

describe('UpdateCurrencySchema — partial', () => {
  it('accepts an empty object and a single-field patch', () => {
    expect(UpdateCurrencySchema.parse({})).toEqual({});
    const r = UpdateCurrencySchema.parse({ rate: '13100' });
    expect(r.rate).toBe('13100');
  });
});

describe('CurrencyFilterSchema', () => {
  it('defaults + parses archived string', () => {
    const r = CurrencyFilterSchema.parse({ archived: 'true' });
    expect(r.archived).toBe(true);
    expect(r.sortBy).toBe('code');
    expect(r.sortDir).toBe('asc');
  });
});
