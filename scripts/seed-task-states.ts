/**
 * Idempotent seed: task states («Тип задачи») for the demo account.
 *
 * moysklad's «Тип задачи» on a task is the task's `state` (Состояние) — a
 * tenant-DEFINED coloured list (State rows, entityType="task"), NOT a separate
 * "type" table. These 3 mirror the user's real moysklad account 1:1 (names +
 * exact colours captured from the live `task/metadata` states via the moysklad
 * REST API). Users add/edit/remove their own via Settings → task statuses; this
 * is just demo data so the «Тип задачи» dropdown isn't empty.
 *
 * Run: node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/seed-task-states.ts
 */
import { prisma } from '@moysklad/db';

const STATES = [
  { name: 'Вазифа', color: '#a2c617', position: 0 }, // lime
  { name: 'Текшириш', color: '#009fe3', position: 1 }, // blue
  { name: 'Мухим иш', color: '#e92919', position: 2 }, // red
];

async function main(): Promise<void> {
  const admin = await prisma.employee.findFirst({
    where: { email: 'admin@demo.local' },
    select: { accountId: true },
  });
  if (!admin) throw new Error('demo admin (admin@demo.local) not found — seed the DB first');
  const accountId = admin.accountId;

  for (const s of STATES) {
    await prisma.state.upsert({
      where: { accountId_entityType_name: { accountId, entityType: 'task', name: s.name } },
      create: {
        accountId,
        entityType: 'task',
        name: s.name,
        color: s.color,
        stateType: 'Regular',
        position: s.position,
      },
      update: { color: s.color, position: s.position },
    });
  }

  const all = await prisma.state.findMany({
    where: { accountId, entityType: 'task' },
    orderBy: { position: 'asc' },
  });
  console.log(`✓ task states (${all.length}):`, all.map((s) => `${s.name}=${s.color}`).join(' · '));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
