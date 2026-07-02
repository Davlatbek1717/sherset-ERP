import { describe, expect, it } from 'vitest';
import {
  BulkImportMxikSchema,
  CreateMxikSchema,
  MxikCodeSchema,
  MxikFilterSchema,
  MxikSourceSchema,
  UpdateMxikSchema,
} from './mxik.schema.js';

const VALID_CODE = '01234567890123456';

describe('MxikCodeSchema', () => {
  it('accepts a 17-digit decimal code', () => {
    expect(MxikCodeSchema.parse(VALID_CODE)).toBe(VALID_CODE);
  });

  it('rejects shorter / longer codes', () => {
    expect(() => MxikCodeSchema.parse('1234567890123456')).toThrow();
    expect(() => MxikCodeSchema.parse('123456789012345678')).toThrow();
  });

  it('rejects non-digit characters', () => {
    expect(() => MxikCodeSchema.parse('0123456789012345A')).toThrow();
    expect(() => MxikCodeSchema.parse('01234567890123-56')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => MxikCodeSchema.parse('')).toThrow();
  });
});

describe('MxikSourceSchema', () => {
  it('accepts the three known sources', () => {
    expect(MxikSourceSchema.parse('soliq')).toBe('soliq');
    expect(MxikSourceSchema.parse('manual')).toBe('manual');
    expect(MxikSourceSchema.parse('override')).toBe('override');
  });

  it('rejects unknown sources', () => {
    expect(() => MxikSourceSchema.parse('user')).toThrow();
    expect(() => MxikSourceSchema.parse('')).toThrow();
  });
});

describe('CreateMxikSchema', () => {
  const valid = {
    code: VALID_CODE,
    nameUz: 'Non, oddiy',
    nameRu: 'Хлеб обычный',
    nameEn: 'Bread, regular',
    unitCode: '796',
    source: 'soliq',
  };

  it('parses a complete payload', () => {
    const r = CreateMxikSchema.parse(valid);
    expect(r.code).toBe(VALID_CODE);
    expect(r.source).toBe('soliq');
  });

  it('defaults source to "manual" when omitted', () => {
    const { source: _, ...rest } = valid;
    const r = CreateMxikSchema.parse(rest);
    expect(r.source).toBe('manual');
  });

  it('rejects empty nameUz', () => {
    expect(() => CreateMxikSchema.parse({ ...valid, nameUz: '' })).toThrow();
  });

  it('rejects nameUz over 500 chars', () => {
    expect(() => CreateMxikSchema.parse({ ...valid, nameUz: 'x'.repeat(501) })).toThrow();
  });

  it('strips/rejects invalid groupCode', () => {
    expect(() => CreateMxikSchema.parse({ ...valid, groupCode: 'abc' })).toThrow();
    // 1-17 digits accepted
    expect(CreateMxikSchema.parse({ ...valid, groupCode: '0123' }).groupCode).toBe('0123');
  });
});

describe('UpdateMxikSchema', () => {
  it('makes everything optional EXCEPT code (which is omitted entirely)', () => {
    const r = UpdateMxikSchema.parse({});
    expect(r.code).toBeUndefined();
    expect(r.nameUz).toBeUndefined();
  });

  it('refuses code in the body — code is the immutable id', () => {
    // omit() drops `code`; if a caller tries to send it, Zod silently strips it
    const r = UpdateMxikSchema.parse({ code: VALID_CODE, nameUz: 'X' } as never);
    // biome-ignore lint/suspicious/noExplicitAny: probe the sanitized output
    expect((r as any).code).toBeUndefined();
    expect(r.nameUz).toBe('X');
  });
});

describe('BulkImportMxikSchema', () => {
  const row = (suffix: string) => ({
    code: '0123456789012'.padEnd(13, '0') + suffix,
    nameUz: 'Item',
  });

  it('parses 1-2000 rows', () => {
    expect(BulkImportMxikSchema.safeParse({ rows: [row('0001')] }).success).toBe(true);
    expect(
      BulkImportMxikSchema.safeParse({
        rows: new Array(2000).fill(0).map((_, i) => row(String(i).padStart(4, '0'))),
      }).success,
    ).toBe(true);
  });

  it('rejects empty array', () => {
    expect(BulkImportMxikSchema.safeParse({ rows: [] }).success).toBe(false);
  });

  it('rejects > 2000 rows', () => {
    expect(
      BulkImportMxikSchema.safeParse({
        rows: new Array(2001).fill(0).map((_, i) => row(String(i).padStart(4, '0'))),
      }).success,
    ).toBe(false);
  });
});

describe('MxikFilterSchema', () => {
  it('applies defaults', () => {
    const f = MxikFilterSchema.parse({});
    expect(f.archived).toBe(false);
    expect(f.limit).toBe(25);
  });

  it('coerces archived from "true" string', () => {
    expect(MxikFilterSchema.parse({ archived: 'true' }).archived).toBe(true);
    expect(MxikFilterSchema.parse({ archived: 'false' }).archived).toBe(false);
  });

  it('rejects limit above max (500)', () => {
    expect(MxikFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts hierarchical codePrefix (1-17 digits)', () => {
    expect(MxikFilterSchema.parse({ codePrefix: '01' }).codePrefix).toBe('01');
    expect(MxikFilterSchema.parse({ codePrefix: VALID_CODE }).codePrefix).toBe(VALID_CODE);
  });

  it('rejects non-digit codePrefix', () => {
    expect(MxikFilterSchema.safeParse({ codePrefix: 'abc' }).success).toBe(false);
  });
});
