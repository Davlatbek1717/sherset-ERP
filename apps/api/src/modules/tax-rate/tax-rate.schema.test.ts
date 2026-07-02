import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CreateTaxRateSchema,
  TaxRateFilterSchema,
  UpdateTaxRateSchema,
} from './tax-rate.schema.js';

describe('CreateTaxRateSchema', () => {
  it('accepts 0% rate', () => {
    const r = CreateTaxRateSchema.safeParse({ rate: 0 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Number(r.data.rate)).toBe(0);
      expect(r.data.shared).toBe(true);
    }
  });

  it('accepts 12% rate with comment', () => {
    const r = CreateTaxRateSchema.safeParse({ rate: 12, comment: 'UZ standard' });
    expect(r.success).toBe(true);
  });

  it('rejects negative rate', () => {
    expect(CreateTaxRateSchema.safeParse({ rate: -1 }).success).toBe(false);
  });

  it('rejects rate > 100', () => {
    expect(CreateTaxRateSchema.safeParse({ rate: 101 }).success).toBe(false);
  });

  it('coerces rate from string', () => {
    const r = CreateTaxRateSchema.safeParse({ rate: '15' });
    if (!r.success) throw r.error;
    expect(Number(r.data.rate)).toBe(15);
  });
});

describe('UpdateTaxRateSchema', () => {
  it('accepts empty object', () => {
    expect(UpdateTaxRateSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts null to CLEAR comment (edit form sends comment.trim() || null)', () => {
    const r = UpdateTaxRateSchema.safeParse({ rate: 12, comment: null, version: 1 });
    expect(r.success).toBe(true);
  });
});

describe('TaxRateFilterSchema', () => {
  it('defaults to sortBy=rate asc, no archived filter', () => {
    const r = TaxRateFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('rate');
      expect(r.data.sortDir).toBe('asc');
      expect(r.data.archived).toBeUndefined();
    }
  });

  it('parses archived=true from string', () => {
    const r = TaxRateFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });

  it('accepts search param', () => {
    expect(TaxRateFilterSchema.safeParse({ search: 'стандарт' }).success).toBe(true);
  });
});

/**
 * Optimistic-lock contract (moysklad parity, lost-update guard).
 *
 * Every tax-rate edit save must carry the `version` the form loaded so the
 * repository can reject a stale write with 409. The token is REQUIRED on Update
 * (so a forgetful caller can't silently bypass the lock) and ABSENT from Create
 * (a brand-new row has no prior version to conflict with).
 */
describe('UpdateTaxRateSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateTaxRateSchema.safeParse({}).success).toBe(false);
    expect(UpdateTaxRateSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateTaxRateSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateTaxRateSchema.safeParse({ version: -1 }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateTaxRateSchema.safeParse({ rate: 12 }).success).toBe(true);
  });
});

// REGRESSION-LOCK (L11, 2026-06-05): the tax-rates list search box was inert —
// the FE handler was a no-op AND TaxRateService.list() parsed the schema's
// `search` field but never applied it to the Prisma where. Source-scan the
// service so the wiring (comment-contains OR numeric-rate match) cannot silently
// revert to dropping `filter.search` again.
describe('TaxRateService.list search wiring', () => {
  const serviceSrc = readFileSync(
    fileURLToPath(new URL('./tax-rate.service.ts', import.meta.url)),
    'utf8',
  );

  it('list() applies filter.search to the where clause (comment contains OR rate)', () => {
    expect(serviceSrc, 'list() must consume the schema search field').toContain('filter.search');
    expect(serviceSrc, 'search must match the free-text comment column').toContain(
      'comment: { contains: search',
    );
    expect(serviceSrc, 'a numeric search must also match the rate column').toContain(
      'or.push({ rate: num })',
    );
  });
});
