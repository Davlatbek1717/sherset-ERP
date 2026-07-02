import { describe, expect, it } from 'vitest';
import { BulkMarkPrintedSchema } from './mass-print.js';

const uuid = () => crypto.randomUUID();

describe('BulkMarkPrintedSchema', () => {
  it('accepts ids + printed=true', () => {
    const r = BulkMarkPrintedSchema.parse({ ids: [uuid(), uuid()], printed: true });
    expect(r.printed).toBe(true);
    expect(r.ids).toHaveLength(2);
  });

  it('accepts printed=false (unmark)', () => {
    const r = BulkMarkPrintedSchema.parse({ ids: [uuid()], printed: false });
    expect(r.printed).toBe(false);
  });

  it('rejects empty ids', () => {
    expect(() => BulkMarkPrintedSchema.parse({ ids: [], printed: true })).toThrow();
  });

  it('rejects > 100 ids', () => {
    const ids = Array.from({ length: 101 }, uuid);
    expect(() => BulkMarkPrintedSchema.parse({ ids, printed: true })).toThrow();
  });

  it('rejects non-boolean printed', () => {
    expect(() => BulkMarkPrintedSchema.parse({ ids: [uuid()], printed: 'yes' })).toThrow();
  });

  it('rejects missing printed', () => {
    expect(() => BulkMarkPrintedSchema.parse({ ids: [uuid()] })).toThrow();
  });
});
