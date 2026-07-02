import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CreateRegionSchema, RegionFilterSchema, UpdateRegionSchema } from './region.schema.js';

describe('CreateRegionSchema', () => {
  it('accepts minimal payload with name only', () => {
    const r = CreateRegionSchema.safeParse({ name: 'Toshkent shahri' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateRegionSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name > 255 chars', () => {
    expect(CreateRegionSchema.safeParse({ name: 'a'.repeat(256) }).success).toBe(false);
  });

  it('accepts ISO 3166-2 code', () => {
    const r = CreateRegionSchema.safeParse({ name: 'Toshkent shahri', code: 'UZ-TA' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('UZ-TA');
  });

  it('rejects code > 10 chars', () => {
    expect(CreateRegionSchema.safeParse({ name: 'X', code: 'UZ-TOOLONGCODE' }).success).toBe(false);
  });

  it('accepts optional externalCode', () => {
    const r = CreateRegionSchema.safeParse({
      name: 'Andijon',
      code: 'UZ-AN',
      externalCode: 'an-001',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.externalCode).toBe('an-001');
  });
});

describe('UpdateRegionSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(UpdateRegionSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts partial update with name only', () => {
    const r = UpdateRegionSchema.safeParse({ name: 'Navoiy', version: 1 });
    expect(r.success).toBe(true);
  });

  it('accepts null to CLEAR optionals (edit form sends code.trim() || null)', () => {
    const r = UpdateRegionSchema.safeParse({
      name: 'X',
      code: null,
      externalCode: null,
      version: 1,
    });
    expect(r.success).toBe(true);
  });
});

describe('RegionFilterSchema', () => {
  it('defaults to sortBy=name asc', () => {
    const r = RegionFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('name');
      expect(r.data.sortDir).toBe('asc');
    }
  });

  it('accepts search param', () => {
    const r = RegionFilterSchema.safeParse({ search: 'Toshkent' });
    expect(r.success).toBe(true);
  });

  it('accepts sortBy=code', () => {
    const r = RegionFilterSchema.safeParse({ sortBy: 'code' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sortBy).toBe('code');
  });

  it('rejects unknown sortBy field', () => {
    expect(RegionFilterSchema.safeParse({ sortBy: 'version' }).success).toBe(false);
  });
});

/**
 * Optimistic-lock contract (moysklad parity, lost-update guard).
 *
 * Every region edit save must carry the `version` the form loaded so the
 * repository can reject a stale write with 409. The token is REQUIRED on Update
 * (so a forgetful caller can't silently bypass the lock) and ABSENT from Create
 * (a brand-new row has no prior version to conflict with).
 */
describe('UpdateRegionSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateRegionSchema.safeParse({ name: 'Toshkent' }).success).toBe(false);
    expect(UpdateRegionSchema.safeParse({ name: 'Toshkent', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateRegionSchema.safeParse({ name: 'X', version: 1.5 }).success).toBe(false);
    expect(UpdateRegionSchema.safeParse({ name: 'X', version: -1 }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateRegionSchema.safeParse({ name: 'Toshkent shahri' }).success).toBe(true);
  });
});

// REGRESSION-LOCK (L12, 2026-06-05): the regions list search box placeholder
// promises «По названию или коду» but the service originally searched name only,
// so a code query (e.g. «UZ-TA») silently returned nothing. Source-scan the
// service so the OR over name AND code cannot quietly revert to name-only.
describe('RegionService.list search wiring', () => {
  const serviceSrc = readFileSync(
    fileURLToPath(new URL('./region.service.ts', import.meta.url)),
    'utf8',
  );

  it('list() applies filter.search to a name-OR-code where clause', () => {
    expect(serviceSrc, 'list() must consume the schema search field').toContain('filter.search');
    expect(serviceSrc, 'search must OR over name AND code (placeholder honesty)').toMatch(
      /OR:\s*\[[\s\S]*name:\s*\{\s*contains[\s\S]*code:\s*\{\s*contains/,
    );
  });
});
