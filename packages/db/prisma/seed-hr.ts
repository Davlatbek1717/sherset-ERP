import { PrismaClient } from '../src/generated/index.js';

const prisma = new PrismaClient();

/**
 * ⚠️ Bu ro'yxat FAQAT HR lug'ati emas — `Employee.hrRoles[]` qiymatlari
 * kassa/menejer guard'larida HOKIMIYAT PROKSISI sifatida o'qiladi
 * (`resolveShiftActor`, `manager-kpi.resolveActor`, `manager-queue`,
 * `hr-permission.guard`, `DispatcherGuard`). Slug qo'shish/olib tashlash
 * o'sha guard'larning xulqini o'zgartiradi.
 *
 * `manager` — MK29/QAROR-B4.2 da qo'shildi. Kod uni allaqachon tekshirardi
 * (`roles.includes('manager')` → menejer aktyori), lekin ro'yxatda yo'q edi:
 * ya'ni menejer shoxi seed qilingan bazada hech qachon ishga tushmasdi —
 * har kim yo `admin` (ega), yo `cashier` bo'lib qolardi.
 */
const DEFAULT_ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Menejer' },
  { value: 'cashier', label: 'Kassir' },
  { value: 'warehouse', label: 'Omborchi' },
  { value: 'staff', label: 'Xodim' },
];

const DEFAULT_KPI_TIERS = [
  { min: 50, payout: 20 },
  { min: 75, payout: 50 },
  { min: 100, payout: 100 },
  { min: 120, payout: 130 },
];

const HR_PAGE_KEYS = [
  'dashboard',
  'messages',
  'reports',
  'employees',
  'tasks',
  'oylik',
  'activity',
  'settings',
];

async function seedHrDefaults() {
  const accounts = await prisma.account.findMany({ select: { id: true } });
  console.info(`Seeding HR defaults for ${accounts.length} account(s)...`);

  for (const acct of accounts) {
    // 1. Default 4 HrRole
    for (const role of DEFAULT_ROLES) {
      await prisma.hrRole.upsert({
        where: { accountId_value: { accountId: acct.id, value: role.value } },
        create: {
          accountId: acct.id,
          value: role.value,
          label: role.label,
          isDefault: true,
        },
        update: { label: role.label, isDefault: true },
      });
    }

    // 2. HrSalaryConfig per-account singleton (default formula constants)
    await prisma.hrSalaryConfig.upsert({
      where: { accountId: acct.id },
      create: {
        accountId: acct.id,
        monthlySalesTarget: BigInt(20_000_000_00), // 20M UZS in tiyin
        monthlyKpiBudget: BigInt(2_000_000_00),
        kpiTiers: DEFAULT_KPI_TIERS,
      },
      update: {},
    });

    // 3. Mark owner employees as HR admin + checker, grant all 8 page permissions
    const owners = await prisma.employee.findMany({
      where: { accountId: acct.id, ownerId: null },
      select: { id: true, hrRoles: true },
    });

    for (const owner of owners) {
      // Only initialize HR fields if not yet set (don't override manual changes)
      if (!owner.hrRoles.includes('admin')) {
        await prisma.employee.update({
          where: { id: owner.id },
          data: {
            hrRoles: ['admin'],
            isChecker: true,
          },
        });
      }

      for (const pageKey of HR_PAGE_KEYS) {
        // Prisma can't upsert on a compound key with a nullable column;
        // use findFirst + create instead.
        const existing = await prisma.hrEmployeePermission.findFirst({
          where: {
            accountId: acct.id,
            employeeId: owner.id,
            pageKey,
            section: null,
          },
        });
        if (!existing) {
          await prisma.hrEmployeePermission.create({
            data: {
              accountId: acct.id,
              employeeId: owner.id,
              pageKey,
              accessLevel: 'full',
            },
          });
        }
      }
    }

    console.info(
      `  Account ${acct.id}: roles + salary config + ${owners.length} admin permission set ✓`,
    );
  }

  console.info('HR defaults seed complete.');
}

seedHrDefaults()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
