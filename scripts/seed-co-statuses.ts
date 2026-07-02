/**
 * Idempotent seed: customer-order custom statuses for the demo account.
 *
 * moysklad's «Статус» on a Заказ покупателя is a tenant-DEFINED list (data,
 * not code). These 4 mirror the user's real moysklad account so the demo
 * customer-order /new matches it 1:1; colours are the account's exact tones
 * (captured from the live status dropdown). Users add/edit/remove their own
 * via Settings → statuses; this is just demo data so the dropdown isn't empty.
 *
 * Run: node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/seed-co-statuses.ts
 */
import { prisma } from '@moysklad/db';

const STATUSES = [
  { name: 'Текширилмаган', color: '#e92919', position: 0 }, // red
  { name: 'Карз колди', color: '#e68116', position: 1 }, // orange
  { name: 'Туланди Накт', color: '#008739', position: 2 }, // green
  { name: 'Туланди Клик', color: '#a2c617', position: 3 }, // lime
];

async function main(): Promise<void> {
  const admin = await prisma.employee.findFirst({
    where: { email: 'admin@demo.local' },
    select: { accountId: true },
  });
  if (!admin) throw new Error('demo admin (admin@demo.local) not found — seed the DB first');
  const accountId = admin.accountId;

  for (const s of STATUSES) {
    await prisma.state.upsert({
      where: {
        accountId_entityType_name: { accountId, entityType: 'customerorder', name: s.name },
      },
      create: {
        accountId,
        entityType: 'customerorder',
        name: s.name,
        color: s.color,
        position: s.position,
      },
      update: { color: s.color, position: s.position },
    });
  }

  const all = await prisma.state.findMany({
    where: { accountId, entityType: 'customerorder' },
    orderBy: { position: 'asc' },
  });
  console.log(
    `✓ customer-order statuses (${all.length}):`,
    all.map((s) => `${s.name}=${s.color}`).join(' · '),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
