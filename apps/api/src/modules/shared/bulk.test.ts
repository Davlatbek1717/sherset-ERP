import { describe, expect, it } from 'vitest';
import { BulkIdsSchema, BulkTransitionSchema, runBulk, runBulkImport } from './bulk.js';

const uuid = () => crypto.randomUUID();

describe('BulkIdsSchema', () => {
  it('accepts 1–100 uuids', () => {
    expect(BulkIdsSchema.safeParse({ ids: [uuid()] }).success).toBe(true);
    expect(BulkIdsSchema.safeParse({ ids: new Array(100).fill(0).map(uuid) }).success).toBe(true);
  });

  it('rejects empty array', () => {
    expect(BulkIdsSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it('rejects > 100', () => {
    expect(BulkIdsSchema.safeParse({ ids: new Array(101).fill(0).map(uuid) }).success).toBe(false);
  });

  it('rejects non-uuid entries', () => {
    expect(BulkIdsSchema.safeParse({ ids: ['not-a-uuid'] }).success).toBe(false);
  });
});

describe('BulkTransitionSchema', () => {
  it('requires both ids and target', () => {
    expect(BulkTransitionSchema.safeParse({ ids: [uuid()], target: 'post' }).success).toBe(true);
    expect(BulkTransitionSchema.safeParse({ ids: [uuid()] }).success).toBe(false);
    expect(BulkTransitionSchema.safeParse({ target: 'post' }).success).toBe(false);
  });

  it('enforces target length 1–50', () => {
    expect(BulkTransitionSchema.safeParse({ ids: [uuid()], target: '' }).success).toBe(false);
    const longTarget = 'x'.repeat(51);
    expect(BulkTransitionSchema.safeParse({ ids: [uuid()], target: longTarget }).success).toBe(
      false,
    );
  });
});

describe('runBulk', () => {
  it('returns all succeeded when every op resolves', async () => {
    const ids = [uuid(), uuid(), uuid()];
    const res = await runBulk(ids, async (id) => id);
    expect(res.total).toBe(3);
    expect(res.succeeded.sort()).toEqual([...ids].sort());
    expect(res.failed).toEqual([]);
  });

  it('aggregates failures with error messages', async () => {
    const ids = [uuid(), uuid(), uuid()];
    const res = await runBulk(ids, async (id) => {
      if (id === ids[1]) throw new Error('boom');
      return id;
    });
    expect(res.total).toBe(3);
    expect(res.succeeded).toHaveLength(2);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0]!.id).toBe(ids[1]);
    expect(res.failed[0]!.error).toBe('boom');
  });

  it('falls back to string coercion for non-Error rejections', async () => {
    const ids = [uuid()];
    const res = await runBulk(ids, async () => {
      throw 'plain string reason';
    });
    expect(res.failed[0]!.error).toBe('plain string reason');
  });

  it('preserves id order in succeeded array based on resolution order', async () => {
    const ids = [uuid(), uuid()];
    const res = await runBulk(ids, async (id) => id);
    // Both succeed; arrays length match
    expect(res.succeeded).toHaveLength(2);
    expect(new Set(res.succeeded)).toEqual(new Set(ids));
  });

  it('dedupes duplicate ids — op runs ONCE per id (no same-entity race)', async () => {
    const a = uuid();
    const b = uuid();
    const calls: string[] = [];
    const res = await runBulk([a, a, b, a], async (id) => {
      calls.push(id);
      return id;
    });
    expect(calls.sort()).toEqual([a, b].sort()); // op called once each, not 4×
    expect(res.total).toBe(2);
    expect(res.succeeded.sort()).toEqual([a, b].sort());
  });
});

describe('runBulkImport', () => {
  it('reports per-row insertion outcome by 0-based index', async () => {
    const rows = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const res = await runBulkImport(rows, async (row, i) => ({ id: `id-${i}`, name: row.name }));
    expect(res.total).toBe(3);
    expect(res.inserted).toHaveLength(3);
    expect(res.failed).toHaveLength(0);
    expect(res.inserted[1]!).toEqual({ index: 1, result: { id: 'id-1', name: 'B' } });
  });

  it('continues past a failing row and reports the index', async () => {
    const rows = [{ name: 'good' }, { name: 'bad' }, { name: 'good2' }];
    const res = await runBulkImport(rows, async (row) => {
      if (row.name === 'bad') throw new Error('rejected by validator');
      return { id: row.name };
    });
    expect(res.total).toBe(3);
    expect(res.inserted).toHaveLength(2);
    expect(res.failed).toEqual([{ index: 1, error: 'rejected by validator' }]);
  });

  it('coerces non-Error throws to string', async () => {
    const res = await runBulkImport([{ x: 1 }], async () => {
      throw 42;
    });
    expect(res.failed[0]!.error).toBe('42');
  });

  it('handles an empty input array without errors', async () => {
    const res = await runBulkImport([], async () => 'unused');
    expect(res.total).toBe(0);
    expect(res.inserted).toHaveLength(0);
    expect(res.failed).toHaveLength(0);
  });
});
