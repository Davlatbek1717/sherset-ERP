import { describe, expect, it } from 'vitest';
import { allocateDocumentNumber } from './document-number.js';

/**
 * In-memory stand-in for `prisma.documentSequence`. Models the real delegate's
 * contract: `findUnique` returns the row or null, `createMany { skipDuplicates }`
 * inserts only when absent (ON CONFLICT DO NOTHING keeps the existing winner),
 * `update { increment }` is the atomic step. The DB enforces atomicity across
 * connections via a row lock — the live concurrent-create burst proves that
 * end-to-end; this unit test pins the orchestration logic (seed once, increment
 * every call, isolate per account/key).
 */
function makeFakeClient() {
  const rows = new Map<string, { value: number }>();
  const keyOf = (w: { accountId_key: { accountId: string; key: string } }) =>
    `${w.accountId_key.accountId}::${w.accountId_key.key}`;
  // Plain (non-async) returns — `allocateDocumentNumber` awaits them either way,
  // which also mirrors that `await <non-promise>` resolves immediately.
  const client = {
    documentSequence: {
      findUnique({ where }: { where: { accountId_key: { accountId: string; key: string } } }) {
        return rows.get(keyOf(where)) ?? null;
      },
      createMany({
        data,
      }: {
        data: Array<{ accountId: string; key: string; value: number }>;
        skipDuplicates: boolean;
      }) {
        let count = 0;
        for (const row of data) {
          const k = `${row.accountId}::${row.key}`;
          if (!rows.has(k)) {
            rows.set(k, { value: row.value });
            count++;
          }
        }
        return { count };
      },
      update({
        where,
        data,
      }: {
        where: { accountId_key: { accountId: string; key: string } };
        data: { value: { increment: number } };
      }) {
        const k = keyOf(where);
        const row = rows.get(k);
        if (!row) throw new Error('Record not found');
        row.value += data.value.increment;
        return { value: row.value };
      },
      // Conditional bump used by the stale-counter resync: raises the counter to
      // `value` only while it is still BELOW it (compiles to a single guarded
      // UPDATE, so a concurrent resync cannot lower it).
      updateMany({
        where,
        data,
      }: {
        where: { accountId: string; key: string; value: { lt: number } };
        data: { value: number };
      }) {
        const k = `${where.accountId}::${where.key}`;
        const row = rows.get(k);
        if (!row || row.value >= where.value.lt) return { count: 0 };
        row.value = data.value;
        return { count: 1 };
      },
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: structural fake of the Prisma delegate
  return client as any;
}

describe('allocateDocumentNumber', () => {
  it('first allocation seeds from the current max and returns seed + 1', async () => {
    const client = makeFakeClient();
    let seedCalls = 0;
    const n = await allocateDocumentNumber(client, 'acc-1', 'ЗП-2026-', async () => {
      seedCalls++;
      return 50;
    });
    expect(n).toBe(51);
    expect(seedCalls).toBe(1);
  });

  it('seeds from 0 when there are no existing documents → first number is 1', async () => {
    const client = makeFakeClient();
    const n = await allocateDocumentNumber(client, 'acc-1', 'ОП-2026-', async () => 0);
    expect(n).toBe(1);
  });

  it('does NOT re-seed once the counter row exists', async () => {
    const client = makeFakeClient();
    let seedCalls = 0;
    const seed = async () => {
      seedCalls++;
      return 50;
    };
    const a = await allocateDocumentNumber(client, 'acc-1', 'ЗП-2026-', seed);
    const b = await allocateDocumentNumber(client, 'acc-1', 'ЗП-2026-', seed);
    const c = await allocateDocumentNumber(client, 'acc-1', 'ЗП-2026-', seed);
    expect([a, b, c]).toEqual([51, 52, 53]);
    expect(seedCalls).toBe(1); // seeded once, then pure increments
  });

  it('hands out strictly increasing, distinct numbers over many allocations', async () => {
    const client = makeFakeClient();
    const seed = async () => 0;
    const nums: number[] = [];
    for (let i = 0; i < 50; i++) {
      nums.push(await allocateDocumentNumber(client, 'acc-1', 'ПКО-2026-', seed));
    }
    expect(new Set(nums).size).toBe(50); // all distinct
    expect(nums).toEqual(Array.from({ length: 50 }, (_, i) => i + 1)); // 1..50, no gaps
  });

  it('keeps independent counters per key (doc-type / year prefix)', async () => {
    const client = makeFakeClient();
    const co = await allocateDocumentNumber(client, 'acc-1', 'ЗП-2026-', async () => 10);
    const pko = await allocateDocumentNumber(client, 'acc-1', 'ПКО-2026-', async () => 99);
    const co2 = await allocateDocumentNumber(client, 'acc-1', 'ЗП-2026-', async () => 10);
    expect(co).toBe(11);
    expect(pko).toBe(100);
    expect(co2).toBe(12); // ЗП counter advanced independently of ПКО
  });

  /**
   * Stale-counter regression (prod 2026-08-22). The counter row is seeded ONCE and
   * then only ever incremented — so a bulk write that inserts rows ABOVE it (the
   * MoySklad catalog import wrote 5064 products with codes up to 05106 while the
   * 'product' counter sat at 4953) leaves it permanently behind, and every auto
   * allocation collides with an imported row: `Duplicate value on unique field:
   * account_id, code`, with 153 consecutive failures queued up before the first
   * free code. `isTaken` lets the allocator notice the collision and resync.
   */
  describe('stale counter (bulk write landed above it)', () => {
    it('resyncs to the current max and returns the first FREE number', async () => {
      const client = makeFakeClient();
      // counter behind: sits at 4953 while codes 4954..5106 are all occupied
      await allocateDocumentNumber(client, 'acc-1', 'product', async () => 4952);
      const taken = new Set(Array.from({ length: 153 }, (_, i) => 4954 + i));
      let seedCalls = 0;
      const n = await allocateDocumentNumber(
        client,
        'acc-1',
        'product',
        async () => {
          seedCalls++;
          return 5106; // real max across products+variants
        },
        { isTaken: async (v) => taken.has(v) },
      );
      expect(n).toBe(5107); // first free code, NOT 153 collisions later
      expect(seedCalls).toBe(1); // reseeded exactly once, on the collision
    });

    it('leaves a healthy counter alone — no reseed when the number is free', async () => {
      const client = makeFakeClient();
      let seedCalls = 0;
      const seed = async () => {
        seedCalls++;
        return 10;
      };
      const a = await allocateDocumentNumber(client, 'acc-1', 'product', seed, {
        isTaken: async () => false,
      });
      const b = await allocateDocumentNumber(client, 'acc-1', 'product', seed, {
        isTaken: async () => false,
      });
      expect([a, b]).toEqual([11, 12]);
      expect(seedCalls).toBe(1); // only the lazy first seed; the resync never fired
    });

    it('never lowers a counter that is already ahead of the max', async () => {
      const client = makeFakeClient();
      await allocateDocumentNumber(client, 'acc-1', 'product', async () => 500);
      // 501 is somehow taken but the real max is far BELOW the counter — the
      // conditional resync must not drag the counter backwards.
      const n = await allocateDocumentNumber(client, 'acc-1', 'product', async () => 10, {
        isTaken: async (v) => v === 501,
      });
      expect(n).toBe(502);
    });

    it('gives up with a clear error instead of looping forever', async () => {
      const client = makeFakeClient();
      await expect(
        allocateDocumentNumber(client, 'acc-1', 'product', async () => 0, {
          isTaken: async () => true, // every number taken — pathological
        }),
      ).rejects.toThrow(/could not allocate a free number/i);
    });
  });

  it('keeps independent counters per account (tenant isolation)', async () => {
    const client = makeFakeClient();
    const a1 = await allocateDocumentNumber(client, 'acc-1', 'ЗП-2026-', async () => 5);
    const a2 = await allocateDocumentNumber(client, 'acc-2', 'ЗП-2026-', async () => 200);
    const a1b = await allocateDocumentNumber(client, 'acc-1', 'ЗП-2026-', async () => 5);
    expect(a1).toBe(6);
    expect(a2).toBe(201);
    expect(a1b).toBe(7);
  });
});
