import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Document-number rollout lock (2026-06-10).
 *
 * Every document auto-number used to be read-max-then-insert:
 *
 *     findFirst({ where: { name: { startsWith: prefix } }, orderBy: { name: 'desc' } })
 *     → `${prefix}${String(lastN + 1).padStart(5, '0')}`              // RACE
 *
 * Two concurrent creates read the same max and insert the same name; the loser
 * hits the (account_id, name) unique constraint → spurious 409 → the document is
 * silently dropped (live 12-way burst on POST /customer-orders reproduced
 * 3 ok / 9 × 409). Allocation now goes through `allocateDocumentNumber` — an
 * atomic Postgres row-lock increment on DocumentSequence (see
 * document-number.ts; unit-tested in document-number.test.ts; re-verified live
 * 12/12 with zero 409s).
 *
 * This scan is SELF-MAINTAINING (no hand-kept service list — the 08m lesson):
 * any *.service.ts whose source has the doc-number generator shape
 * (a `startsWith: prefix`-scoped query + a width-5 padStart format) must
 * allocate through the helper, so a future service written with the old
 * pattern fails CI immediately.
 *
 * analitika/order.service.ts is intentionally exempt by shape: it numbers from
 * count()+1 with NO startsWith query, and retries on P2002 in a loop — a
 * collision self-heals there instead of surfacing a 409 to the user.
 */
const MODULES_DIR = fileURLToPath(new URL('../modules', import.meta.url));

function collectServiceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectServiceFiles(full));
    else if (entry.name.endsWith('.service.ts')) out.push(full);
  }
  return out;
}

const files = collectServiceFiles(MODULES_DIR).map((path) => ({
  path,
  src: readFileSync(path, 'utf8'),
}));

/**
 * MASTER-TODO #26: the detector used to require BOTH `startsWith: prefix` AND
 * a width-5 padStart. That shape is being RETIRED — services have moved to
 * moysklad's prefix-less «Номер» (plain 5-digit; the seeder reads the highest
 * trailing digits instead of a prefix-scoped query), so only 11 files still
 * match it while 37 actually generate document numbers. The floor of 31 then
 * failed — reporting the migration AWAY from the raced pattern as breakage.
 *
 * Keyed on the durable half instead: a width-5 zero-padded number IS the
 * generator shape, prefixed or not. `analitika/order.service.ts` stays exempt
 * for the reason the header documents (count()+1 with a P2002 retry loop).
 */
const NUMBER_EXEMPT = ['analitika', 'order.service.ts'].join(sep);

const generatorFiles = files.filter(
  (f) => f.src.includes(".padStart(5, '0')") && !f.path.endsWith(NUMBER_EXEMPT),
);

describe('document-number generators allocate atomically (no read-max race)', () => {
  it('finds the generator fleet (non-vacuous scan floor)', () => {
    // 31 at rollout time (29 doc services + customer-order + opportunity);
    // 36 today. A refactor that breaks the detector shape must lower this
    // consciously — it must never silently drop to a handful.
    expect(generatorFiles.length).toBeGreaterThanOrEqual(31);
  });

  it('every generator-shaped service calls allocateDocumentNumber', () => {
    const unwired = generatorFiles
      .filter((f) => !f.src.includes('allocateDocumentNumber('))
      .map((f) => f.path);
    expect(unwired).toEqual([]);
  });

  it('no service computes a doc number with the raced `+ 1).padStart(5` shape', () => {
    const raced = files.filter((f) => f.src.includes("+ 1).padStart(5, '0')")).map((f) => f.path);
    expect(raced).toEqual([]);
  });
});
