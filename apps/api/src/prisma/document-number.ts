import type { Prisma } from '@moysklad/db';

/** A Prisma client (full or transaction-scoped) that can touch the counter table. */
type SequenceClient = Pick<Prisma.TransactionClient, 'documentSequence'>;

/** Attempts before giving up — one plain allocation + one post-resync retry, plus slack. */
const MAX_ALLOCATION_ATTEMPTS = 3;

export interface AllocateOptions {
  /**
   * Optional collision probe: `true` when `n` is ALREADY used by an existing row.
   *
   * Pass it whenever the counter's numbers land in a UNIQUE column that something
   * OTHER than this counter can also write — a bulk import, a migration backfill,
   * a hand-entered code. Those writes never advance the counter, and because the
   * row is seeded lazily (once, on first use) it then stays behind FOREVER: every
   * allocation collides and the create is rejected with a P2002.
   *
   * Measured in prod on 2026-08-22: the MoySklad catalog import wrote 5064
   * products with codes up to `05106` while the `'product'` counter sat at 4953,
   * so the next 153 product creates were all doomed — «Duplicate value on unique
   * field: account_id, code» — and no product had been created for six days.
   *
   * With the probe the allocator notices the collision, resyncs the counter from
   * `seed()` (the current max) and retries, so the sequence self-heals on the
   * first attempt after ANY such bulk write.
   */
  isTaken?: (n: number) => Promise<boolean>;
}

/**
 * Atomically allocate the next sequential document number for `(accountId, key)`.
 *
 * Replaces the read-max-then-insert auto-numbering every document service used:
 *
 *     const last = await prisma.<doc>.findFirst({
 *       where: { accountId, name: { startsWith: prefix } },
 *       orderBy: { name: 'desc' }, select: { name: true },
 *     });
 *     const next = (parseInt(last?.name.slice(prefix.length)) || 0) + 1;  // RACE
 *
 * Two concurrent creates read the same `last`, compute the same `next`, and both
 * INSERT the same name; the loser hits the `(account_id, name)` unique constraint,
 * `handlePrisma` maps the P2002 to a 409, and the document is silently dropped
 * (a 12-way burst reproduced 3 ok / 9 spurious-409). Allocation now goes through
 * an atomic `update … { value: { increment: 1 } }` — Postgres takes a row lock,
 * so concurrent callers serialise onto distinct values.
 *
 * The counter row is lazily seeded from the current max via `seed()` on first
 * use. The seed itself is race-safe: `createMany({ skipDuplicates: true })`
 * compiles to `INSERT … ON CONFLICT DO NOTHING`, so a concurrent first-seed
 * keeps the winner's row (a plain `upsert` is SELECT-then-INSERT under the
 * hood and threw P2002 here under a 12-way burst), and all callers then take
 * distinct values from the atomic increment.
 *
 * `key` must be stable per `(doc-type, period)` — e.g. the `"ЗП-2026-"` prefix —
 * so every document sharing that prefix advances the same counter.
 *
 * When `opts.isTaken` is supplied the allocated number is additionally checked
 * against the live table and a stale counter is resynced — see `AllocateOptions`.
 *
 * @returns the next integer in the sequence (`seed() + 1` on the first call).
 */
export async function allocateDocumentNumber(
  client: SequenceClient,
  accountId: string,
  key: string,
  seed: () => Promise<number>,
  opts?: AllocateOptions,
): Promise<number> {
  const where = { accountId_key: { accountId, key } };

  const existing = await client.documentSequence.findUnique({ where, select: { value: true } });
  if (existing === null) {
    const start = await seed();
    await client.documentSequence.createMany({
      data: [{ accountId, key, value: start }],
      skipDuplicates: true, // ON CONFLICT DO NOTHING — concurrent first-seed keeps the winner
    });
  }

  for (let attempt = 1; ; attempt++) {
    const updated = await client.documentSequence.update({
      where,
      data: { value: { increment: 1 } },
      select: { value: true },
    });
    const n = updated.value;

    // No probe (every document-name counter): keep the original behaviour exactly.
    if (opts?.isTaken === undefined || !(await opts.isTaken(n))) return n;

    if (attempt >= MAX_ALLOCATION_ATTEMPTS) {
      throw new Error(
        `Sequence '${key}': could not allocate a free number after ${attempt} attempts ` +
          `(last tried ${n}). The counter and the live table disagree — inspect ` +
          'document_sequences and the target table.',
      );
    }

    // Stale counter: a bulk write landed above it. Raise it to the current max in
    // ONE guarded statement — `value: { lt: max }` means a concurrent resync (or a
    // counter that is legitimately AHEAD of the max) can never drag it backwards,
    // and the loop's next `increment` then lands on the first free number.
    const max = await seed();
    await client.documentSequence.updateMany({
      where: { accountId, key, value: { lt: max } },
      data: { value: max },
    });
  }
}
