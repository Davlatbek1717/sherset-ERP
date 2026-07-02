/**
 * Extra seed data for entities the base seed.ts doesn't cover.
 *
 * Adds 2 sample rows for each of: CashIn, CashOut, PaymentOut, Enter,
 * Loss, Move, Inventory, Task. Plus a 2nd Store + a CashDesk that
 * those documents reference.
 *
 * Run AFTER `pnpm --filter @moysklad/db seed`:
 *   pnpm --filter @moysklad/db tsx prisma/seed-extras.ts
 *
 * Idempotent — uses upsert with stable IDs so re-running is safe.
 */
import { PrismaClient } from '../src/generated/index.js';

const prisma = new PrismaClient();

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const CP_ID = '00000000-0000-0000-0001-000000000002'; // XYZ YaTTT (from base seed)

async function main(): Promise<void> {
  console.log('🌱 Seeding extra documents...');

  // Look up the existing org + admin + main store + product (from base seed)
  const account = await prisma.account.findUniqueOrThrow({ where: { id: ACCOUNT_ID } });
  const admin = await prisma.employee.findFirstOrThrow({ where: { accountId: ACCOUNT_ID } });
  const org = await prisma.organization.findFirstOrThrow({ where: { accountId: ACCOUNT_ID } });
  const mainStore = await prisma.store.findFirstOrThrow({
    where: { accountId: ACCOUNT_ID, code: 'MAIN' },
  });
  const product = await prisma.product.findFirstOrThrow({ where: { accountId: ACCOUNT_ID } });
  const counterparty = await prisma.counterparty.findUniqueOrThrow({ where: { id: CP_ID } });

  console.log('  ↳ Refs loaded:', {
    org: org.name,
    store: mainStore.name,
    product: product.name,
    cp: counterparty.name,
  });

  // ── 2nd store (needed for Move) ──────────────────────────────────────
  const altStore = await prisma.store.upsert({
    where: { accountId_code: { accountId: ACCOUNT_ID, code: 'ALT' } },
    update: {},
    create: {
      accountId: ACCOUNT_ID,
      name: 'Filial ombor',
      code: 'ALT',
      address: "Tashkent, Bobur ko'chasi, 25",
    },
  });
  console.log('  ✓ Store:', altStore.name);

  // ── CashDesk (needed for CashIn / CashOut) ──────────────────────────
  const cashDesk = await prisma.cashDesk.upsert({
    where: { id: '00000000-0000-0000-0002-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000001',
      accountId: ACCOUNT_ID,
      name: 'Asosiy kassa',
      currency: 'UZS',
      balanceMinor: 5_000_000_00n,
    },
  });
  console.log('  ✓ CashDesk:', cashDesk.name);

  const baseFields = {
    accountId: ACCOUNT_ID,
    ownerId: admin.id,
    organizationId: org.id,
  };

  // ── CashIn (2 samples: 1 posted, 1 draft) ───────────────────────────
  for (let i = 1; i <= 2; i++) {
    const id = `00000000-0001-0000-0000-00000000000${i}`;
    await prisma.cashIn.upsert({
      where: { id },
      update: {},
      create: {
        id,
        ...baseFields,
        agentId: counterparty.id,
        cashDeskId: cashDesk.id,
        name: `ПКО-2026-0000${i}`,
        sumMinor: BigInt(500_000_00 * i),
        applicable: i === 1,
        state: i === 1 ? 'posted' : 'draft',
        postedAt: i === 1 ? new Date() : null,
        paymentPurpose: i === 1 ? "Mahsulot uchun to'lov" : null,
        description: 'Demo seed',
      },
    });
  }
  console.log('  ✓ CashIn ×2');

  // ── CashOut ─────────────────────────────────────────────────────────
  for (let i = 1; i <= 2; i++) {
    const id = `00000000-0002-0000-0000-00000000000${i}`;
    await prisma.cashOut.upsert({
      where: { id },
      update: {},
      create: {
        id,
        ...baseFields,
        agentId: counterparty.id,
        cashDeskId: cashDesk.id,
        name: `РКО-2026-0000${i}`,
        sumMinor: BigInt(300_000_00 * i),
        applicable: i === 1,
        state: i === 1 ? 'posted' : 'draft',
        postedAt: i === 1 ? new Date() : null,
        expenseItem: i === 1 ? 'Reklama' : null,
        description: 'Demo seed',
      },
    });
  }
  console.log('  ✓ CashOut ×2');

  // ── PaymentOut ──────────────────────────────────────────────────────
  for (let i = 1; i <= 2; i++) {
    const id = `00000000-0003-0000-0000-00000000000${i}`;
    await prisma.paymentOut.upsert({
      where: { id },
      update: {},
      create: {
        id,
        ...baseFields,
        agentId: counterparty.id,
        name: `ПР-2026-0000${i}`,
        sumMinor: BigInt(750_000_00 * i),
        applicable: i === 1,
        state: i === 1 ? 'posted' : 'draft',
        postedAt: i === 1 ? new Date() : null,
        paymentPurpose: "Bank o'tkazma",
        description: 'Demo seed',
      },
    });
  }
  console.log('  ✓ PaymentOut ×2');

  // ── Enter (warehouse intake) ────────────────────────────────────────
  for (let i = 1; i <= 2; i++) {
    const id = `00000000-0004-0000-0000-00000000000${i}`;
    await prisma.enter.upsert({
      where: { id },
      update: {},
      create: {
        id,
        ...baseFields,
        storeId: mainStore.id,
        name: `ОП-2026-0000${i}`,
        sumMinor: BigInt(200_000_00 * i),
        applicable: i === 1,
        state: i === 1 ? 'posted' : 'draft',
        postedAt: i === 1 ? new Date() : null,
        description: 'Demo seed (initial stock)',
      },
    });
  }
  console.log('  ✓ Enter ×2');

  // ── Loss (write-off) ────────────────────────────────────────────────
  for (let i = 1; i <= 2; i++) {
    const id = `00000000-0005-0000-0000-00000000000${i}`;
    await prisma.loss.upsert({
      where: { id },
      update: {},
      create: {
        id,
        ...baseFields,
        storeId: mainStore.id,
        name: `СП-2026-0000${i}`,
        sumMinor: BigInt(50_000_00 * i),
        applicable: i === 1,
        state: i === 1 ? 'posted' : 'draft',
        postedAt: i === 1 ? new Date() : null,
        reason: i === 1 ? 'damaged' : 'expired',
        description: 'Demo seed',
      },
    });
  }
  console.log('  ✓ Loss ×2');

  // ── Move (transfer between stores) ──────────────────────────────────
  for (let i = 1; i <= 2; i++) {
    const id = `00000000-0006-0000-0000-00000000000${i}`;
    await prisma.move.upsert({
      where: { id },
      update: {},
      create: {
        id,
        accountId: ACCOUNT_ID,
        ownerId: admin.id,
        organizationId: org.id,
        sourceStoreId: mainStore.id,
        destinationStoreId: altStore.id,
        name: `ПЕ-2026-0000${i}`,
        sumMinor: BigInt(100_000_00 * i),
        applicable: i === 1,
        state: i === 1 ? 'posted' : 'draft',
        postedAt: i === 1 ? new Date() : null,
        description: 'Demo seed',
      },
    });
  }
  console.log('  ✓ Move ×2');

  // ── Inventory ───────────────────────────────────────────────────────
  for (let i = 1; i <= 2; i++) {
    const id = `00000000-0007-0000-0000-00000000000${i}`;
    await prisma.inventory.upsert({
      where: { id },
      update: {},
      create: {
        id,
        ...baseFields,
        storeId: mainStore.id,
        name: `ИН-2026-0000${i}`,
        applicable: i === 1,
        state: i === 1 ? 'posted' : 'draft',
        postedAt: i === 1 ? new Date() : null,
      },
    });
  }
  console.log('  ✓ Inventory ×2');

  // ── Task ────────────────────────────────────────────────────────────
  const taskTitles = [
    "Mijozga qo'ng'iroq qilish",
    'Hisob-fakturani tekshirish',
    "Yangi mahsulot qo'shish",
  ];
  for (let i = 1; i <= 3; i++) {
    const id = `00000000-0008-0000-0000-00000000000${i}`;
    await prisma.task.upsert({
      where: { id },
      update: {},
      create: {
        id,
        accountId: ACCOUNT_ID,
        authorId: admin.id,
        assigneeId: admin.id,
        agentId: counterparty.id,
        title: taskTitles[i - 1] ?? `Vazifa ${i}`,
        description: 'Demo seed task',
        status: i === 1 ? 'open' : i === 2 ? 'in_progress' : 'done',
        priority: i === 3 ? 'low' : i === 1 ? 'high' : 'normal',
      },
    });
  }
  console.log('  ✓ Task ×3');

  // moysklad «Дополнительные поля» (custom attributes) — demo set matching the climart
  // account: «Усто» (counterparty-REFERENCE → renders as a counterparty picker) +
  // «tgid» (string, Telegram chat id). Reference attrs store { id, name }; the list
  // renders the name and filters on the .id path (REFERENCE_ATTR_TYPES in the service).
  let usto = await prisma.attributeMetadata.findFirst({
    where: { accountId: ACCOUNT_ID, entity: 'Counterparty', code: 'usto' },
  });
  usto = usto
    ? await prisma.attributeMetadata.update({
        where: { id: usto.id },
        data: { type: 'counterparty' },
      })
    : await prisma.attributeMetadata.create({
        data: {
          accountId: ACCOUNT_ID,
          entity: 'Counterparty',
          code: 'usto',
          name: 'Усто',
          type: 'counterparty',
          position: 0,
        },
      });
  if (
    !(await prisma.attributeMetadata.findFirst({
      where: { accountId: ACCOUNT_ID, entity: 'Counterparty', code: 'tgid' },
    }))
  ) {
    await prisma.attributeMetadata.create({
      data: {
        accountId: ACCOUNT_ID,
        entity: 'Counterparty',
        code: 'tgid',
        name: 'tgid',
        type: 'string',
        position: 99,
        description: 'Чат ID для Телеграм',
      },
    });
  }
  // reference a master «Усто …» counterparty on a few non-archived clients
  const usta = await prisma.counterparty.findFirst({
    where: { accountId: ACCOUNT_ID, name: { startsWith: 'Усто' } },
    select: { id: true, name: true },
  });
  if (usta) {
    const clients = await prisma.counterparty.findMany({
      where: { accountId: ACCOUNT_ID, archived: false, name: { not: { startsWith: 'Усто' } } },
      select: { id: true, attributes: true },
      take: 3,
    });
    for (const [i, c] of clients.entries()) {
      const a = { ...((c.attributes as Record<string, unknown>) ?? {}) };
      a.usto = { id: usta.id, name: usta.name };
      a.tgid = `10000${i}`;
      await prisma.counterparty.update({ where: { id: c.id }, data: { attributes: a } });
    }
  }
  console.log('  ✓ Custom attrs: Усто (counterparty-ref) + tgid (string)');

  console.log('\n🎉 Extra seed complete.');
  console.log(`   Account: ${account.name}`);
}

main()
  .catch((e) => {
    console.error('❌ Extras seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
