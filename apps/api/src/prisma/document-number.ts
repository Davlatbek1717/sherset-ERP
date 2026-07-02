import type { Prisma } from '@moysklad/db';

/** A Prisma client (full or transaction-scoped) that can touch the counter table. */
type SequenceClient = Pick<Prisma.TransactionClient, 'documentSequence'>;

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
 * @returns the next integer in the sequence (`seed() + 1` on the first call).
 */
export async function allocateDocumentNumber(
  client: SequenceClient,
  accountId: string,
  key: string,
  seed: () => Promise<number>,
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

  const updated = await client.documentSequence.update({
    where,
    data: { value: { increment: 1 } },
    select: { value: true },
  });
  return updated.value;
}
