import { describe, expect, it } from 'vitest';
import {
  CreateExpenseItemSchema,
  ExpenseItemFilterSchema,
  UpdateExpenseItemSchema,
} from './expense-item.schema.js';

describe('CreateExpenseItemSchema', () => {
  it('accepts minimal payload', () => {
    const r = CreateExpenseItemSchema.safeParse({ name: 'Аренда' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateExpenseItemSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name > 100 chars', () => {
    expect(CreateExpenseItemSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('accepts code and externalCode', () => {
    const r = CreateExpenseItemSchema.safeParse({
      name: 'Реклама',
      code: 'ADV',
      externalCode: 'ext-adv',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.code).toBe('ADV');
    }
  });
});

describe('UpdateExpenseItemSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(UpdateExpenseItemSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts null to CLEAR optionals (edit form sends code.trim() || null)', () => {
    const r = UpdateExpenseItemSchema.safeParse({
      name: 'X',
      version: 1,
      code: null,
      description: null,
    });
    expect(r.success).toBe(true);
  });
});

describe('UpdateExpenseItemSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateExpenseItemSchema.safeParse({ name: 'Аренда' }).success).toBe(false);
    expect(UpdateExpenseItemSchema.safeParse({ name: 'Аренда', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateExpenseItemSchema.safeParse({ name: 'Аренда', version: 1.5 }).success).toBe(false);
    expect(UpdateExpenseItemSchema.safeParse({ name: 'Аренда', version: -1 }).success).toBe(false);
    expect(UpdateExpenseItemSchema.safeParse({ name: 'Аренда', version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateExpenseItemSchema.safeParse({ name: 'Аренда' }).success).toBe(true);
  });
});

describe('ExpenseItemFilterSchema', () => {
  it('defaults to sortBy=name asc and no archived filter', () => {
    const r = ExpenseItemFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('name');
      expect(r.data.sortDir).toBe('asc');
    }
  });

  it('parses archived from string', () => {
    const r = ExpenseItemFilterSchema.safeParse({ archived: 'false' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(false);
  });

  it('accepts search param', () => {
    const r = ExpenseItemFilterSchema.safeParse({ search: 'Аренда' });
    expect(r.success).toBe(true);
  });
});
