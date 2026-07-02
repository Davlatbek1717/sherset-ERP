import { describe, expect, it } from 'vitest';
import { CreateProjectSchema, ProjectFilterSchema, UpdateProjectSchema } from './project.schema.js';

describe('CreateProjectSchema', () => {
  it('accepts a minimal payload (only name)', () => {
    const r = CreateProjectSchema.safeParse({ name: 'Тест проект' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateProjectSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name > 255 chars', () => {
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(256) }).success).toBe(false);
  });

  it('rejects code > 50 chars', () => {
    expect(CreateProjectSchema.safeParse({ name: 'P', code: 'a'.repeat(51) }).success).toBe(false);
  });

  it('accepts code / externalCode / description', () => {
    const r = CreateProjectSchema.safeParse({
      name: 'План',
      code: '006',
      externalCode: 'ext-006',
      description: 'Проект отслеживающий план',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('006');
  });
});

describe('UpdateProjectSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(UpdateProjectSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts a partial patch', () => {
    const r = UpdateProjectSchema.safeParse({ description: 'updated', version: 1 });
    expect(r.success).toBe(true);
  });

  it('accepts null to CLEAR optional fields (edit-form sends code.trim() || null)', () => {
    const r = UpdateProjectSchema.safeParse({
      name: 'X',
      code: null,
      externalCode: null,
      description: null,
      version: 1,
    });
    expect(r.success).toBe(true);
  });

  it('still rejects an empty name', () => {
    expect(UpdateProjectSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

/**
 * Optimistic-lock contract (moysklad parity, lost-update guard).
 *
 * Every project field-edit save must carry the `version` the form loaded so
 * the repository can reject a stale write with 409. The token is REQUIRED on
 * Update (so a forgetful caller can't silently bypass the lock) and ABSENT
 * from Create (a brand-new row has no prior version to conflict with).
 */
describe('UpdateProjectSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateProjectSchema.safeParse({ name: 'Тест' }).success).toBe(false);
    expect(UpdateProjectSchema.safeParse({ name: 'Тест', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateProjectSchema.safeParse({ name: 'Тест', version: 1.5 }).success).toBe(false);
    expect(UpdateProjectSchema.safeParse({ name: 'Тест', version: -1 }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateProjectSchema.safeParse({ name: 'Тест проект' }).success).toBe(true);
  });
});

describe('ProjectFilterSchema', () => {
  it('defaults to sortBy=name asc, limit=50, no archived filter', () => {
    const r = ProjectFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('name');
      expect(r.data.sortDir).toBe('asc');
      expect(r.data.limit).toBe(50);
      expect(r.data.archived).toBeUndefined();
    }
  });

  it('coerces archived from a query string', () => {
    const r = ProjectFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });

  it('coerces limit from a query string and caps at 250', () => {
    expect(ProjectFilterSchema.safeParse({ limit: '999' }).success).toBe(false);
    const ok = ProjectFilterSchema.safeParse({ limit: '200' });
    if (!ok.success) throw ok.error;
    expect(ok.data.limit).toBe(200);
  });

  it('rejects a non-uuid cursor', () => {
    expect(ProjectFilterSchema.safeParse({ cursor: 'not-a-uuid' }).success).toBe(false);
  });

  it('coerces withTotal from a query string (Settings page opt-in)', () => {
    const on = ProjectFilterSchema.safeParse({ withTotal: 'true' });
    if (!on.success) throw on.error;
    expect(on.data.withTotal).toBe(true);
    expect(ProjectFilterSchema.safeParse({}).data?.withTotal).toBeUndefined();
  });
});
