/**
 * «Qarz undirish» (TZ v2) — PRODUCTION-XAVFSIZ rol/ruxsat seed.
 *
 * seed.ts dan FARQI: bu skript demo-ma'lumot (tovar, kontragent, hujjat)
 * YARATMAYDI. Faqat:
 *   1. Har bir mavjud accountda 4 ta debt-entity uchun ruxsat qatorlarini
 *      MAVJUD tizim rollariga qo'shadi (Administrator/Manager/Employee/ReadOnly
 *      va boshqa isSystem rollar) — seed.ts dagi defaults mantig'i bilan;
 *   2. QarzOperatori va QarzKassiri rollarini yaratadi (TZ §6 matritsasi).
 *
 * Idempotent: qayta yugurtirish xavfsiz — faqat yetishmayotgan qatorlar
 * qo'shiladi (createMany skipDuplicates); tenant qo'lda o'zgartirgan scope
 * USTIDAN YOZILMAYDI. Mavjud jadvallar/ma'lumotlarga tegilmaydi.
 *
 * Yugurtirish (prod):
 *   cd /var/www/sherset && pnpm --filter @moysklad/db exec tsx prisma/seed-debt-roles.ts
 */
import { PrismaClient } from '../src/generated/index.js';

const prisma = new PrismaClient();

const DEBT_ENTITIES = ['debt', 'debtpayment', 'debtcardpayment', 'debtreport'] as const;
const ACTIONS = ['view', 'create', 'update', 'delete', 'approve', 'print'] as const;

type Scope = 'NO' | 'OWN' | 'OWN_GROUP' | 'OWN_AND_GROUP' | 'ALL';
type Defaults = Record<(typeof ACTIONS)[number], Scope>;
type Overrides = Partial<Record<(typeof DEBT_ENTITIES)[number], Partial<Defaults>>>;

/** seed.ts dagi tizim-rol defaults'lari — debt entitylarga ham xuddi shu qoida. */
const SYSTEM_DEFAULTS: Record<string, Defaults> = {
  Administrator: {
    view: 'ALL',
    create: 'ALL',
    update: 'ALL',
    delete: 'ALL',
    approve: 'ALL',
    print: 'ALL',
  },
  Manager: {
    view: 'ALL',
    create: 'ALL',
    update: 'OWN_GROUP',
    delete: 'OWN_GROUP',
    approve: 'OWN_GROUP',
    print: 'ALL',
  },
  Employee: {
    view: 'OWN_GROUP',
    create: 'ALL',
    update: 'OWN',
    delete: 'NO',
    approve: 'OWN',
    print: 'OWN_GROUP',
  },
  ReadOnly: { view: 'ALL', create: 'NO', update: 'NO', delete: 'NO', approve: 'NO', print: 'ALL' },
};

/** TZ §6 — yangi ikki rol (permissions.types.ts SYSTEM_ROLE_TEMPLATES bilan mos). */
const DEBT_ROLES: Array<{ name: string; desc: string; defaults: Defaults; overrides: Overrides }> =
  [
    {
      name: 'QarzOperatori',
      desc: "Call-markaz operatori — qo'ng'iroq, izoh, karta (screenshot) to'lovi",
      defaults: {
        view: 'ALL',
        create: 'NO',
        update: 'NO',
        delete: 'NO',
        approve: 'NO',
        print: 'ALL',
      },
      overrides: {
        debt: { view: 'ALL', update: 'ALL' },
        debtcardpayment: { create: 'ALL' },
        debtreport: { view: 'ALL' },
      },
    },
    {
      name: 'QarzKassiri',
      desc: "Kassir — qarz berish, naqd/terminal to'lov qabul qilish",
      defaults: {
        view: 'ALL',
        create: 'NO',
        update: 'NO',
        delete: 'NO',
        approve: 'NO',
        print: 'ALL',
      },
      overrides: {
        debt: { view: 'ALL', create: 'ALL', update: 'ALL' },
        debtpayment: { create: 'ALL' },
        debtreport: { view: 'NO' },
      },
    },
  ];

function scopeOf(
  defaults: Defaults,
  overrides: Overrides | undefined,
  entity: string,
  action: string,
): Scope {
  return (
    overrides?.[entity as (typeof DEBT_ENTITIES)[number]]?.[action as (typeof ACTIONS)[number]] ??
    defaults[action as (typeof ACTIONS)[number]] ??
    'NO'
  );
}

async function main(): Promise<void> {
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  console.info(`Accountlar: ${accounts.length}`);

  for (const account of accounts) {
    // 1) MAVJUD tizim rollariga debt-entity ruxsatlarini qo'shish.
    const systemRoles = await prisma.role.findMany({
      where: { accountId: account.id, isSystem: true },
      select: { id: true, name: true },
    });

    for (const role of systemRoles) {
      const defaults = SYSTEM_DEFAULTS[role.name];
      const debtTpl = DEBT_ROLES.find((r) => r.name === role.name);
      // Nomi tanish bo'lmagan isSystem rollar (Kassir, Skladchi, ...) — debt
      // bo'limiga default kirish YO'Q (xavfsiz taraf): keyin admin UI'dan ochiladi.
      const effDefaults: Defaults = defaults ??
        debtTpl?.defaults ?? {
          view: 'NO',
          create: 'NO',
          update: 'NO',
          delete: 'NO',
          approve: 'NO',
          print: 'NO',
        };
      const effOverrides = debtTpl?.overrides;

      const rows = [];
      for (const entity of DEBT_ENTITIES) {
        for (const action of ACTIONS) {
          rows.push({
            roleId: role.id,
            entity,
            action,
            scope: scopeOf(effDefaults, effOverrides, entity, action),
          });
        }
      }
      const res = await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
      if (res.count > 0) console.info(`  [${account.name}] ${role.name}: +${res.count} ruxsat`);
    }

    // 2) QarzOperatori / QarzKassiri rollarini yaratish (yo'q bo'lsa).
    for (const r of DEBT_ROLES) {
      const role = await prisma.role.upsert({
        where: { accountId_name: { accountId: account.id, name: r.name } },
        update: {},
        create: { accountId: account.id, name: r.name, description: r.desc, isSystem: true },
      });
      const rows = [];
      for (const entity of DEBT_ENTITIES) {
        for (const action of ACTIONS) {
          rows.push({
            roleId: role.id,
            entity,
            action,
            scope: scopeOf(r.defaults, r.overrides, entity, action),
          });
        }
      }
      const res = await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
      console.info(`  [${account.name}] ${r.name}: tayyor (+${res.count} ruxsat)`);
    }
  }

  console.info("✅ Debt-role seed tugadi (demo-ma'lumot YARATILMADI).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
