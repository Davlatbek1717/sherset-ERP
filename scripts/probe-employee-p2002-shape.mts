/**
 * One-shot grounding probe (11u): capture the EXACT Prisma error shape
 * (`err.code`, `err.meta.target`) emitted when the Employee email plain index
 * and the username PARTIAL index are violated via the typed Prisma client
 * (.update). The 11t probe used $executeRawUnsafe → surfaced the raw Postgres
 * 23505, NOT Prisma's mapped P2002. The P2002→ConflictException mapping needs
 * the real `meta.target` to discriminate email vs username messages.
 *
 * All writes run inside a transaction that always throws → rolled back. The DB
 * is left untouched.
 *
 * Run: pnpm --filter @moysklad/db exec tsx ../../scripts/probe-employee-p2002-shape.mts
 */
import { prisma } from '../packages/db/src/index.ts';

function describe(label: string, e: unknown) {
  const err = e as { code?: string; meta?: unknown; name?: string; message?: string };
  console.log(`--- ${label} ---`);
  console.log(`  name   = ${err.name ?? '(none)'}`);
  console.log(`  code   = ${err.code ?? '(none)'}`);
  console.log(`  meta   = ${JSON.stringify(err.meta ?? null)}`);
  console.log(`  message= ${String(err.message ?? e).slice(0, 200)}`);
}

async function rollbackUpdate(
  victimId: string,
  data: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: victimId }, data });
      throw new Error('__ROLLBACK__');
    });
    return null; // update unexpectedly succeeded (no constraint)
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e);
    if (msg.includes('__ROLLBACK__')) return 'NO_CONSTRAINT';
    return e;
  }
}

async function main() {
  // Pick an account that has >=2 employees, at least one with a non-null username.
  const withUsername = await prisma.employee.findFirst({
    where: { username: { not: null } },
    select: { id: true, accountId: true, email: true, username: true },
  });
  if (!withUsername) {
    console.log('SKIP — no employee with a non-null username exists to collide with');
    return;
  }
  const victim = await prisma.employee.findFirst({
    where: { accountId: withUsername.accountId, id: { not: withUsername.id } },
    select: { id: true, email: true, username: true },
  });
  if (!victim) {
    console.log(`SKIP — only one employee in account ${withUsername.accountId}; cannot collide`);
    return;
  }

  console.log(`account=${withUsername.accountId}`);
  console.log(`source: id=${withUsername.id} email=${withUsername.email} username=${withUsername.username}`);
  console.log(`victim: id=${victim.id} email=${victim.email} username=${victim.username}`);
  console.log('');

  // (A) EMAIL plain index @@unique([accountId, email]) → expect P2002
  const emailRes = await rollbackUpdate(victim.id, { email: withUsername.email });
  if (emailRes === 'NO_CONSTRAINT') console.log('--- EMAIL collision: NO CONSTRAINT (update succeeded) ---');
  else if (emailRes) describe('EMAIL collision (update victim.email = source.email)', emailRes);

  console.log('');

  // (B) USERNAME partial index Employee_account_username_uk → expect P2002
  const userRes = await rollbackUpdate(victim.id, { username: withUsername.username });
  if (userRes === 'NO_CONSTRAINT') console.log('--- USERNAME collision: NO CONSTRAINT (update succeeded) ---');
  else if (userRes) describe('USERNAME collision (update victim.username = source.username)', userRes);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
