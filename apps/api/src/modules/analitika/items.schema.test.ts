import { describe, expect, it } from 'vitest';
import { ItemsFilterSchema, ItemsStatsFilterSchema } from './items.schema.js';

const UUID = '11111111-1111-1111-1111-111111111111';
const UUID2 = '22222222-2222-2222-2222-222222222222';

describe('ItemsFilterSchema', () => {
  it('applies defaults (sort=name asc, page=1, pageSize=50)', () => {
    const r = ItemsFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.sort).toBe('name');
    expect(r.data.order).toBe('asc');
    expect(r.data.page).toBe(1);
    expect(r.data.pageSize).toBe(50);
  });

  it('parses boolean filters from string', () => {
    const r = ItemsFilterSchema.safeParse({
      lowStock: 'true',
      noPartner: '1',
      onlyInCart: 'yes',
    });
    if (!r.success) throw r.error;
    expect(r.data.lowStock).toBe(true);
    expect(r.data.noPartner).toBe(true);
    expect(r.data.onlyInCart).toBe(true);
  });

  it('parses inCartIds from comma-separated string', () => {
    const r = ItemsFilterSchema.safeParse({ inCartIds: `${UUID},${UUID2}` });
    if (!r.success) throw r.error;
    expect(r.data.inCartIds).toEqual([UUID, UUID2]);
  });

  it('rejects an invalid sort field', () => {
    expect(ItemsFilterSchema.safeParse({ sort: 'random' }).success).toBe(false);
  });

  it('rejects pageSize > 200', () => {
    expect(ItemsFilterSchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('rejects a non-uuid in inCartIds', () => {
    expect(ItemsFilterSchema.safeParse({ inCartIds: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts a valid period window', () => {
    const r = ItemsFilterSchema.safeParse({
      salesFrom: '2026-01-01T00:00:00Z',
      salesTo: '2026-05-28T00:00:00Z',
    });
    expect(r.success).toBe(true);
  });
});

describe('ItemsStatsFilterSchema', () => {
  it('accepts an empty object', () => {
    expect(ItemsStatsFilterSchema.safeParse({}).success).toBe(true);
  });

  it('accepts the same filter subset as the list endpoint', () => {
    const r = ItemsStatsFilterSchema.safeParse({
      groupId: UUID,
      search: 'cement',
      onlyInCart: 'true',
      inCartIds: UUID,
    });
    if (!r.success) throw r.error;
    expect(r.data.groupId).toBe(UUID);
    expect(r.data.onlyInCart).toBe(true);
    expect(r.data.inCartIds).toEqual([UUID]);
  });
});
