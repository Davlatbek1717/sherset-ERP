/**
 * One-shot diagnostic: ground-truth the Employee (account_id, username) unique
 * index in the LIVE moysklad_dev DB. Verifies the 11s handoff claim
 * "username uniqueness is NOT DB-enforced" against reality.
 *
 * Run: pnpm --filter @moysklad/db exec tsx ../../scripts/probe-employee-username-index.mts
 *   (or from repo root with a tsx that resolves @moysklad/db)
 */
import { prisma } from '../packages/db/src/index.ts';

async function main() {
  // 1. Every index whose definition touches `username` on employees.
  const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = 'employees' AND indexdef ILIKE '%username%'
     ORDER BY indexname;`,
  );
  console.log('--- (1) username indexes on employees ---');
  if (idx.length === 0) console.log('  (NONE) — username uniqueness NOT enforced');
  for (const r of idx) console.log(`  ${r.indexname}\n      ${r.indexdef}`);

  // 2. Duplicate non-null (account_id, username) rows that WOULD violate uniqueness.
  const dups = await prisma.$queryRawUnsafe<
    Array<{ account_id: string; username: string; n: bigint }>
  >(
    `SELECT account_id, username, COUNT(*)::bigint AS n FROM employees
     WHERE username IS NOT NULL
     GROUP BY account_id, username HAVING COUNT(*) > 1
     ORDER BY n DESC;`,
  );
  console.log('--- (2) duplicate non-null (account_id, username) ---');
  console.log(`  ${dups.length} duplicate group(s)`);
  for (const d of dups) console.log(`  acct=${d.account_id} username=${d.username} ×${d.n}`);

  // 3. Empirical enforcement test (UPDATE collision, rolled back — avoids unrelated
  //    NOT NULL columns of a fresh INSERT). Take an existing non-null username, then
  //    try to stamp it onto a DIFFERENT employee in the same account: must 23505.
  const sample = await prisma.$queryRawUnsafe<
    Array<{ account_id: string; username: string; id: string }>
  >('SELECT account_id, username, id FROM employees WHERE username IS NOT NULL LIMIT 1;');
  console.log('--- (3) empirical enforcement (UPDATE collision, rolled back) ---');
  if (sample.length === 0) {
    console.log('  SKIP — no employee has a non-null username to collide with');
  } else {
    const { account_id, username, id } = sample[0];
    const victim = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM employees WHERE account_id = $1::uuid AND id <> $2::uuid LIMIT 1;',
      account_id,
      id,
    );
    if (victim.length === 0) {
      console.log(`  SKIP — only one employee in account ${account_id}; cannot UPDATE-collide`);
    } else {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'UPDATE employees SET username = $1 WHERE id = $2::uuid',
            username,
            victim[0].id,
          );
          throw new Error('__ROLLBACK__'); // never commit even if it (wrongly) succeeds
        });
        console.log('  unreachable');
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/unique constraint|duplicate key|Unique constraint|23505/i.test(msg)) {
          console.log(`  ENFORCED ✓ — duplicate username "${username}" rejected (23505)`);
        } else if (msg.includes('__ROLLBACK__')) {
          console.log(
            `  NOT ENFORCED ✗ — duplicate username "${username}" UPDATE succeeded (would persist)`,
          );
        } else {
          console.log(`  INCONCLUSIVE — ${msg.slice(0, 200)}`);
        }
      }
    }
  }

  // 4. The OTHER 11s-claimed drift: document_sequences.updated_at default.
  const ds = await prisma.$queryRawUnsafe<
    Array<{ column_name: string; column_default: string | null }>
  >(
    `SELECT column_name, column_default FROM information_schema.columns
     WHERE table_name = 'document_sequences' ORDER BY ordinal_position;`,
  );
  console.log('--- (4) document_sequences columns + defaults ---');
  for (const c of ds) console.log(`  ${c.column_name} :: default=${c.column_default ?? '(none)'}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
