import { describe, expect, it } from 'vitest';
import {
  AllocateCodeSchema,
  ApplyCodeSchema,
  ListMarkingCodesSchema,
  MarkingStatusSchema,
  SaveMarkingConfigSchema,
  parseGs1DataMatrix,
} from './marking.schema.js';

describe('MarkingStatusSchema', () => {
  it.each(['allocated', 'applied', 'sold', 'returned', 'retired', 'rejected'])(
    'accepts %s',
    (s) => {
      expect(MarkingStatusSchema.safeParse(s).success).toBe(true);
    },
  );
  it('rejects unknown', () => {
    expect(MarkingStatusSchema.safeParse('expired').success).toBe(false);
  });
});

describe('SaveMarkingConfigSchema', () => {
  const base = {
    stir: '300123456',
    apiBaseUrl: 'https://aslbelgisi.uz/api',
  };
  it('accepts valid config', () => {
    const r = SaveMarkingConfigSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.testMode).toBe(true);
  });
  it('accepts 14-digit STIR', () => {
    expect(SaveMarkingConfigSchema.safeParse({ ...base, stir: '30012345678901' }).success).toBe(
      true,
    );
  });
  it('rejects 10-digit STIR', () => {
    expect(SaveMarkingConfigSchema.safeParse({ ...base, stir: '3001234567' }).success).toBe(false);
  });
});

describe('AllocateCodeSchema', () => {
  it('rejects code shorter than 20 chars', () => {
    expect(AllocateCodeSchema.safeParse({ code: '0123456789' }).success).toBe(false);
  });
});

describe('ApplyCodeSchema', () => {
  it('requires productId', () => {
    expect(ApplyCodeSchema.safeParse({ code: '01'.repeat(15) }).success).toBe(false);
  });
});

describe('ListMarkingCodesSchema', () => {
  it('uses default limit 50', () => {
    const r = ListMarkingCodesSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });
});

describe('parseGs1DataMatrix', () => {
  // Real-world DataMatrix sample (test data only):
  //   AI 01 = 04606203094158 (GTIN-14)
  //   AI 21 = SerialAlpha
  //   AI 91 = EE06
  //   AI 92 = abcdef
  it('parses a valid GS1 DataMatrix', () => {
    const code = '0104606203094158' + '21' + 'SerialAlpha' + '91' + 'EE06' + '92' + 'abcdef';
    const parsed = parseGs1DataMatrix(code);
    expect(parsed.gtin).toBe('04606203094158');
    expect(parsed.serial).toBe('SerialAlpha');
    expect(parsed.crypto).toBe('EE06');
    expect(parsed.cryptoTail).toBe('abcdef');
  });

  it('parses without crypto tails', () => {
    const code = '0104606203094158' + '21' + 'Serial';
    const parsed = parseGs1DataMatrix(code);
    expect(parsed.gtin).toBe('04606203094158');
    expect(parsed.serial).toBe('Serial');
    expect(parsed.crypto).toBeUndefined();
  });

  it('throws when AI 01 missing', () => {
    expect(() => parseGs1DataMatrix('AB04606203094158')).toThrow(/AI 01/);
  });

  it('throws when GTIN is not 14 digits', () => {
    expect(() => parseGs1DataMatrix('0112345' + '21' + 'X')).toThrow(/14 digits|GTIN/);
  });

  it('strips FNC1 separators', () => {
    const fnc1 = String.fromCharCode(0x1d);
    const code = '0104606203094158' + fnc1 + '21' + 'Serial' + fnc1 + '91' + 'EE06';
    const parsed = parseGs1DataMatrix(code);
    expect(parsed.gtin).toBe('04606203094158');
    expect(parsed.serial).toBe('Serial');
    expect(parsed.crypto).toBe('EE06');
  });
});
