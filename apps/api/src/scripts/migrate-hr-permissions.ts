#!/usr/bin/env tsx
/**
 * MK27 — HR ruxsatlarini yagona omborga ko'chiruvchi BIR MARTALIK skript.
 *
 * TZ: `docs/superpowers/specs/2026-08-01-menejer-tz-design.md` §3.2.
 * Yadro (butun hukm): `../modules/permissions/hr-permission-migration.ts` —
 * bu fayl faqat I/O qiladi (DB o'qish, hisobot yozish, fail-closed to'xtash).
 *
 * Ishga tushirish (apps/api ichidan, `topup-role-permissions.ts` bilan bir xil):
 *   DRY (sukut, hech nima yozmaydi):  `npx tsx src/scripts/migrate-hr-permissions.ts`
 *   APPLY:                            `npx tsx src/scripts/migrate-hr-permissions.ts --apply`
 *   Bayroqlar: `--out <fayl>` · `--allow-loss` (ruxsat TUSHISHIGA oshkora rozilik)
 *
 * REJADAGI YO'L O'ZGARDI: reja `scripts/migrate-hr-permissions.ts` degan edi,
 * lekin repo ildizidagi `scripts/` dan `@moysklad/db` **resolve bo'lmaydi**
 * (ildizda `node_modules/@moysklad` yo'q — jonli tekshirildi, MODULE_NOT_FOUND).
 * Shuning uchun skript boshqa DB-skriptlar turgan joyga qo'yildi; qo'shimcha
 * foyda — bu yerda u typecheck va biome qamroviga tushadi.
 *
 * ⚠️ APPLY HOZIRCHA IMKONSIZ: yozadigan joy — `EmployeePermission` jadvali —
 * **MK26** fazasida yaratiladi, u hali bajarilmagan (2026-08-10 da sxemada
 * yo'qligi tekshirildi). Skript buni o'zi aniqlab **to'xtaydi**; yarim qo'llash
 * yo'q. DRY esa to'liq ishlaydi va hisobotni beradi.
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@moysklad/db';
import {
  type HrPermissionRowInput,
  type MigrationPlan,
  planHrPermissionMigration,
} from '../modules/permissions/hr-permission-migration.js';
import type { PermissionScope } from '../modules/permissions/permissions.types.js';

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ALLOW_LOSS = argv.includes('--allow-loss');
const OUT = (() => {
  const i = argv.indexOf('--out');
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : 'mk27-hr-permission-dry.md';
})();

function fail(message: string): never {
  console.error(`\n✗ TO'XTADI — ${message}\n`);
  process.exit(1);
}

function renderReport(plan: MigrationPlan, employeeNames: Map<string, string>): string {
  const L: string[] = [];
  L.push('# MK27 — HR ruxsat migratsiyasi hisoboti');
  L.push('');
  L.push(`- Rejim: **${APPLY ? 'APPLY' : 'DRY'}**`);
  L.push(`- HR qatorlari (xaritalangan): **${plan.summary.rows}**`);
  L.push(`- Tegishli xodimlar: **${plan.summary.employees}**`);
  L.push(`- Yoziladigan ERP uch-liklari: **${plan.entries.length}**`);
  L.push(
    `- Oldi (gained): **${plan.summary.gained}** · Yo'qotdi (lost): **${plan.summary.lost}** · O'zgarmadi: **${plan.summary.unchanged}**`,
  );
  L.push('');

  if (plan.errors.length > 0) {
    L.push('## ✗ RAD ETILDI — quyidagi qatorlar tushunilmadi');
    L.push('');
    for (const e of plan.errors) L.push(`- ${e}`);
    L.push('');
    L.push('Hech nima yozilmaydi (fail-closed). Avval shu qatorlar hal qilinsin.');
    return `${L.join('\n')}\n`;
  }

  const byEmployee = new Map<string, MigrationPlan['entries']>();
  for (const e of plan.entries) {
    const list = byEmployee.get(e.employeeId) ?? [];
    list.push(e);
    byEmployee.set(e.employeeId, list);
  }

  if (plan.summary.lost > 0) {
    L.push('## ⚠️ Ruxsati TUSHADIGAN xodimlar (odam tasdig‘i shart)');
    L.push('');
    for (const id of plan.summary.lostEmployees) {
      L.push(`- **${employeeNames.get(id) ?? id}** (\`${id}\`):`);
      for (const e of byEmployee.get(id) ?? []) {
        if (e.change !== 'lost') continue;
        L.push(`  - \`${e.entity}.${e.action}\`: ${e.before} → ${e.scope}`);
      }
    }
    L.push('');
  }

  L.push('## Xodimlar kesimida');
  L.push('');
  L.push('| Xodim | entity.action | rol qatlami | yoziladi | o‘zgarish |');
  L.push('|---|---|---|---|---|');
  for (const [id, list] of byEmployee) {
    for (const e of list) {
      L.push(
        `| ${employeeNames.get(id) ?? id} | \`${e.entity}.${e.action}\` | ${e.before} | ${e.scope} | ${e.change} |`,
      );
    }
  }
  L.push('');
  return `${L.join('\n')}\n`;
}

async function main(): Promise<void> {
  const hrRows = await prisma.hrEmployeePermission.findMany({
    select: { employeeId: true, pageKey: true, section: true, accessLevel: true },
    orderBy: [{ employeeId: 'asc' }, { pageKey: 'asc' }],
  });
  console.log(`· hr_employee_permission qatorlari: ${hrRows.length}`);

  const employeeIds = [...new Set(hrRows.map((r) => r.employeeId))];
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      roles: { select: { role: { select: { permissions: true } } } },
    },
  });

  // Rol qatlami = barcha rollar bo'yicha MAX(scope) — `PermissionsService` bilan
  // bir xil qoida (u yerda `maxScope`), lekin bu skript Nest'ni ko'tarmaydi.
  const ORDER: Record<string, number> = { NO: 0, OWN: 1, OWN_GROUP: 2, OWN_AND_GROUP: 3, ALL: 4 };
  const roleScopes = new Map<string, PermissionScope>();
  const employeeNames = new Map<string, string>();
  for (const emp of employees) {
    employeeNames.set(emp.id, `${emp.lastName ?? ''} ${emp.firstName ?? ''}`.trim() || emp.id);
    for (const er of emp.roles) {
      for (const p of er.role.permissions) {
        const key = `${emp.id}|${p.entity}|${p.action}`;
        const cur = roleScopes.get(key) ?? 'NO';
        if ((ORDER[p.scope] ?? 0) > (ORDER[cur] ?? 0)) {
          roleScopes.set(key, p.scope as PermissionScope);
        }
      }
    }
  }

  const rows: HrPermissionRowInput[] = hrRows.map((r) => ({
    employeeId: r.employeeId,
    pageKey: r.pageKey,
    section: r.section,
    accessLevel: r.accessLevel,
  }));

  const plan = planHrPermissionMigration(
    rows,
    (employeeId, entity, action) => roleScopes.get(`${employeeId}|${entity}|${action}`) ?? 'NO',
  );

  writeFileSync(OUT, renderReport(plan, employeeNames), 'utf8');
  console.log(`· hisobot: ${OUT}`);
  console.log(
    `· uch-liklar: ${plan.entries.length} (oldi ${plan.summary.gained} · yo'qotdi ${plan.summary.lost} · o'zgarmadi ${plan.summary.unchanged})`,
  );

  if (plan.refused) {
    for (const e of plan.errors) console.error(`  ✗ ${e}`);
    fail(`${plan.errors.length} ta qator xaritalanmadi — hech nima yozilmaydi (fail-closed)`);
  }

  if (!APPLY) {
    console.log('\n✓ DRY tugadi — hech nima yozilmadi. Qo‘llash uchun `--apply`.');
    return;
  }

  // ── APPLY qo'riqchilari ────────────────────────────────────────────────────
  // (1) Ruxsat tushishi — faqat oshkora rozilik bilan. Bu tekshiruv (2) dan
  //     OLDIN turadi: MK26 kelgunicha ham operator hisobotdagi «yo'qotdi»
  //     ro'yxatini ko'rib chiqishi va bu qulf ishlashini sinashi mumkin.
  if (plan.summary.lost > 0 && !ALLOW_LOSS) {
    fail(
      `${plan.summary.lost} ta yozuv xodimning ruxsatini TUSHIRADI (${plan.summary.lostEmployees.length} xodim) — ` +
        'hisobotni ko‘rib chiqing va rozi bo‘lsangiz `--allow-loss` bilan qayta yuring',
    );
  }
  // (2) Yozadigan joy bormi? `EmployeePermission` — MK26 fazasining ishi.
  const store = (prisma as unknown as Record<string, unknown>).employeePermission;
  if (!store) {
    fail(
      "`EmployeePermission` jadvali yo'q — u MK26 fazasida yaratiladi. " +
        'Migratsiya yozadigan joyi bo‘lmagani uchun to‘xtadi (yarim qo‘llash yo‘q).',
    );
  }
  fail('APPLY yo‘li hali yozilmagan — MK26 (EmployeePermission) kutilmoqda.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
