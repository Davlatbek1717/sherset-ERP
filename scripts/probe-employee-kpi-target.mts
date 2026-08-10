/**
 * KPI-01 — `employee_kpi_targets` XULQ o'lchovi JONLI bazada (`climart_adopt`).
 *
 * Nega alohida skript: vitest gate'i sxema/migratsiya MATNINI o'qiydi, ya'ni
 * «CHECK yozilganmi» degan savolga javob beradi. «CHECK RAD ETADIMI» degan
 * savolga faqat baza javob beradi — [[browser-qa-catches-what-static-cannot]]
 * ning DB tomoni. Reja testlari (1)…(5) shu yerda o'lchanadi.
 *
 * Hamma yozuv BITTA tranzaksiya ichida va OXIRIDA QAYTARILADI (rollback):
 * skript bazani o'zgartirmaydi. Kutilgan xatolar SAVEPOINT bilan izolyatsiya
 * qilinadi (aks holda birinchi CHECK butun tranzaksiyani abort qilardi).
 *
 * Yugurtirish (repo ildizidan):
 *   pnpm exec tsx scripts/probe-employee-kpi-target.mts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../packages/db/src/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  HERE,
  '..',
  'packages/db/prisma/migrations/20260810160000_employee_kpi_target/migration.sql',
);

const BACKFILL_BEGIN = '-- >>> BACKFILL BEGIN';
const BACKFILL_END = '-- <<< BACKFILL END';

/** Migratsiyaning AYNAN o'sha backfill bloki — nusxa emas (nusxa eskirardi). */
function backfillSql(): string {
  const sql = readFileSync(MIGRATION, 'utf8');
  const from = sql.indexOf(BACKFILL_BEGIN);
  const to = sql.indexOf(BACKFILL_END);
  if (from < 0 || to < 0) throw new Error('BACKFILL markerlari topilmadi — migratsiya buzilgan?');
  return sql.slice(from + BACKFILL_BEGIN.length, to);
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Kutilgan Postgres xatosi: SAVEPOINT bilan o'ralgan, tranzaksiya tirik qoladi. */
async function expectPgError(tx: Tx, name: string, sql: string, code: string) {
  await tx.$executeRawUnsafe('SAVEPOINT probe_sp');
  try {
    await tx.$executeRawUnsafe(sql);
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT probe_sp');
    check(name, false, `qabul qilindi (kutilgan ${code} rad etish)`);
  } catch (e) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT probe_sp');
    const msg = String((e as Error)?.message ?? e);
    check(name, msg.includes(code), msg.includes(code) ? code : msg.slice(0, 160));
  }
}

async function expectOk(tx: Tx, name: string, sql: string) {
  await tx.$executeRawUnsafe('SAVEPOINT probe_sp');
  try {
    await tx.$executeRawUnsafe(sql);
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT probe_sp');
    check(name, true);
  } catch (e) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT probe_sp');
    check(name, false, String((e as Error)?.message ?? e).slice(0, 160));
  }
}

const ROLLBACK = '__PROBE_ROLLBACK__';

async function main() {
  const emp = await prisma.$queryRawUnsafe<Array<{ id: string; account_id: string }>>(
    `SELECT p.employee_id AS id, p.account_id FROM kpi_profiles p
     WHERE p.employee_id IS NOT NULL AND p.archived = FALSE LIMIT 1;`,
  );
  if (emp.length === 0)
    throw new Error("Fixture yo'q: xodimga biriktirilgan KPI profili topilmadi");
  const { id: employeeId, account_id: accountId } = emp[0];
  console.log(`Fixture: employee=${employeeId} account=${accountId}\n`);

  // ---- (3) BACKFILL — migratsiya qo'llangandan keyingi HOLAT ----------------
  console.log("(3) backfill: profil maqsadi → EmployeeKpiTarget (aynan ko'chgan)");
  const mismatch = await prisma.$queryRawUnsafe<
    Array<{
      employee_id: string;
      key: string;
      src_target: bigint | null;
      got_target: bigint | null;
      src_weight: string | null;
      got_weight: string | null;
    }>
  >(
    `WITH latest AS (
       SELECT DISTINCT ON (p.id) p.id AS profile_id, p.account_id, p.employee_id, v.id AS version_id
       FROM kpi_profiles p
       JOIN kpi_profile_versions v ON v.profile_id = p.id
       WHERE p.employee_id IS NOT NULL AND p.archived = FALSE
       ORDER BY p.id, v.version DESC
     ), src AS (
       SELECT l.employee_id, d.key, m.target, m.weight
       FROM latest l
       JOIN kpi_profile_metrics m ON m.profile_version_id = l.version_id
       JOIN kpi_metric_defs d ON d.id = m.metric_def_id
     )
     SELECT src.employee_id, src.key, src.target AS src_target, t.target_value AS got_target,
            src.weight::text AS src_weight, t.weight::text AS got_weight
     FROM src
     LEFT JOIN employee_kpi_targets t
       ON t.employee_id = src.employee_id AND t.metric_key = src.key AND t.period = 'daily'
     WHERE t.id IS NULL
        OR t.target_value IS DISTINCT FROM src.target
        OR t.weight IS DISTINCT FROM src.weight;`,
  );
  check(
    "har profil maqsadi mos target qatoriga ko'chgan",
    mismatch.length === 0,
    mismatch.length ? JSON.stringify(mismatch.slice(0, 3)) : "farq yo'q",
  );

  // VACUOUS EMASLIGI: yuqoridagi «farq yo'q» manba BO'SH bo'lganda ham yashil
  // bo'lardi. Shuning uchun ko'chirilgan qatorlar soni alohida o'lchanadi.
  const counts = await prisma.$queryRawUnsafe<Array<{ targets: number; emps: number }>>(
    `SELECT COUNT(*)::int AS targets, COUNT(DISTINCT employee_id)::int AS emps
     FROM employee_kpi_targets;`,
  );
  check(
    "backfill BO'SH emas",
    counts[0].targets > 0 && counts[0].emps > 0,
    `${counts[0].targets} qator · ${counts[0].emps} xodim`,
  );

  const noPos = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM employee_kpi_targets t
     WHERE NOT EXISTS (SELECT 1 FROM kpi_profiles p WHERE p.employee_id = t.employee_id);`,
  );
  check('lavozim-profillari backfill QILINMAGAN', noPos[0].n === 0, `begona qator: ${noPos[0].n}`);

  const moneyBad = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM employee_kpi_targets
     WHERE ("unit" = 'money') <> ("currency" IS NOT NULL);`,
  );
  check('backfill valyutasi birlikka mos', moneyBad[0].n === 0);

  try {
    await prisma.$transaction(
      async (tx) => {
        // ---- (1) money ↔ currency CHECK ------------------------------------
        console.log('\n(1) CHECK: valyuta faqat pul birligida, pulda majburiy');
        const row = (over: string) =>
          `INSERT INTO employee_kpi_targets
             (id, account_id, employee_id, metric_key, "unit", target_value, "period", weight, currency, active, created_at, updated_at)
           VALUES (gen_random_uuid(), '${accountId}', '${employeeId}', 'probe_metric', ${over}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`;
        await expectPgError(
          tx,
          'money + currency NULL → rad',
          row(`'money', 100, 'daily', NULL, NULL`),
          '23514',
        );
        await expectPgError(
          tx,
          'count + currency NOT NULL → rad',
          row(`'count', 5, 'daily', NULL, 'UZS'`),
          '23514',
        );
        await expectOk(tx, 'money + currency → qabul', row(`'money', 100, 'daily', NULL, 'UZS'`));
        await expectOk(
          tx,
          'count + currency NULL → qabul',
          row(`'count', 5, 'weekly', NULL, NULL`),
        );
        await expectPgError(
          tx,
          'notanish birlik → rad',
          row(`'weight_kg', 5, 'daily', NULL, NULL`),
          '23514',
        );
        await expectPgError(
          tx,
          'notanish davr → rad',
          row(`'count', 5, 'yearly', NULL, NULL`),
          '23514',
        );

        // ---- (2) @@unique(employee, metric, period) -------------------------
        console.log('\n(2) UNIQUE: (xodim, metrika, davr) takrorlanmaydi');
        const dup = (period: string, key = 'probe_uniq') =>
          `INSERT INTO employee_kpi_targets
             (id, account_id, employee_id, metric_key, "unit", target_value, "period", weight, currency, active, created_at, updated_at)
           VALUES (gen_random_uuid(), '${accountId}', '${employeeId}', '${key}', 'count', 7, '${period}', NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`;
        await expectOk(tx, 'birinchi qator', dup('daily'));
        await expectPgError(tx, 'aynan takror → rad', dup('daily'), '23505');
        await expectOk(tx, 'boshqa davr → qabul (davr kalitning bir qismi)', dup('monthly'));

        // ---- (4) BACKFILL IDEMPOTENT ---------------------------------------
        console.log('\n(4) backfill idempotent: migratsiya bloki qayta yugurtiriladi');
        const before = await tx.$queryRawUnsafe<Array<{ n: number }>>(
          'SELECT COUNT(*)::int AS n FROM employee_kpi_targets;',
        );
        await tx.$executeRawUnsafe(backfillSql());
        const after = await tx.$queryRawUnsafe<Array<{ n: number }>>(
          'SELECT COUNT(*)::int AS n FROM employee_kpi_targets;',
        );
        check(
          'qayta yugurtirish dublikat yozmadi',
          before[0].n === after[0].n,
          `${before[0].n} → ${after[0].n}`,
        );

        // ---- (5) CROSS-TENANT ----------------------------------------------
        console.log("\n(5) cross-tenant: B hisobi A ning qatorini ko'rmaydi");
        const bAcct = '00000000-0000-0000-0000-0000000000b1';
        const bEmp = '00000000-0000-0000-0000-0000000000b2';
        await tx.$executeRawUnsafe(
          `INSERT INTO accounts (id, name, updated_at) VALUES ('${bAcct}', 'PROBE-B', CURRENT_TIMESTAMP);`,
        );
        // Mavjud xodim qatorini NUSXALAB olamiz (id/account_id almashtirilib):
        // shunda `employees` ning hamma NOT NULL ustunlari o'z-o'zidan to'g'ri
        // bo'ladi va probe yangi ustun qo'shilganda eskirmaydi.
        const cols = await tx.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string }>>(
          `SELECT column_name, is_nullable FROM information_schema.columns
           WHERE table_name = 'employees' ORDER BY ordinal_position;`,
        );
        const UNIQUEISH = new Set([
          'username',
          'email',
          'phone',
          'telegram_chat_id',
          'telegram_user_id',
        ]);
        const colList = cols.map((c) => `"${c.column_name}"`).join(', ');
        const valList = cols
          .map((c) => {
            if (c.column_name === 'id') return `'${bEmp}'::uuid`;
            if (c.column_name === 'account_id') return `'${bAcct}'::uuid`;
            if (UNIQUEISH.has(c.column_name) && c.is_nullable === 'YES') return 'NULL';
            return `"${c.column_name}"`;
          })
          .join(', ');
        await tx.$executeRawUnsafe(
          `INSERT INTO employees (${colList}) SELECT ${valList} FROM employees WHERE id = '${employeeId}';`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO employee_kpi_targets
             (id, account_id, employee_id, metric_key, "unit", target_value, "period", weight, currency, active, created_at, updated_at)
           VALUES (gen_random_uuid(), '${bAcct}', '${bEmp}', 'probe_uniq', 'count', 7, 'daily', NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
        );
        const aScoped = await tx.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT COUNT(*)::int AS n FROM employee_kpi_targets
           WHERE account_id = '${accountId}' AND employee_id = '${bEmp}';`,
        );
        check("A hisobi kesimida B ning qatori YO'Q", aScoped[0].n === 0);
        const bScoped = await tx.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT COUNT(*)::int AS n FROM employee_kpi_targets WHERE account_id = '${bAcct}';`,
        );
        check("B hisobida faqat o'z qatori", bScoped[0].n === 1, `${bScoped[0].n} qator`);

        // ---- (6) EVENT append-only: qator o'chsa jurnal QOLADI ---------------
        console.log("\n(6) audit: target o'chsa event qoladi (targetId → NULL)");
        const tId = '00000000-0000-0000-0000-0000000000c1';
        await tx.$executeRawUnsafe(
          `INSERT INTO employee_kpi_targets
             (id, account_id, employee_id, metric_key, "unit", target_value, "period", weight, currency, active, created_at, updated_at)
           VALUES ('${tId}', '${accountId}', '${employeeId}', 'probe_evt', 'count', 3, 'daily', NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO employee_kpi_target_events
             (id, account_id, target_id, employee_id, action, payload_json, actor_id, created_at)
           VALUES (gen_random_uuid(), '${accountId}', '${tId}', '${employeeId}', 'created',
                   '{"metricKey":"probe_evt","targetValue":3}'::jsonb, NULL, CURRENT_TIMESTAMP);`,
        );
        await tx.$executeRawUnsafe(`DELETE FROM employee_kpi_targets WHERE id = '${tId}';`);
        const evt = await tx.$queryRawUnsafe<Array<{ n: number; nulls: number }>>(
          `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE target_id IS NULL)::int AS nulls
           FROM employee_kpi_target_events WHERE employee_id = '${employeeId}';`,
        );
        check(
          "o'chirishdan keyin event qoldi va targetId NULL",
          evt[0].n >= 1 && evt[0].nulls >= 1,
          `event=${evt[0].n} nullTarget=${evt[0].nulls}`,
        );
        await expectPgError(
          tx,
          'notanish action → rad',
          `INSERT INTO employee_kpi_target_events (id, account_id, target_id, employee_id, action, payload_json, created_at)
           VALUES (gen_random_uuid(), '${accountId}', NULL, '${employeeId}', 'exploded', '{}'::jsonb, CURRENT_TIMESTAMP);`,
          '23514',
        );

        // ---- (7) MUTANT: backfill ENG OXIRGI versiyani oladimi --------------
        // Fixture'da hamma versiyalar bir xil maqsadga ega, ya'ni (3) testi
        // «oxirgi versiya» da'vosini AJRATA OLMAYDI. Shu yerda ataylab YANGI
        // versiya (boshqa maqsad bilan) qo'yiladi: backfill eskisini olsa test
        // qizaradi ([[tz-label-test-vacuous-math-round]] — mutant bilan tekshir).
        console.log('\n(7) mutant: yangi profil versiyasi → backfill yangisini oladi');
        const pick = await tx.$queryRawUnsafe<
          Array<{
            profile_id: string;
            account_id: string;
            employee_id: string;
            version: number;
            metric_def_id: string;
            key: string;
          }>
        >(
          `SELECT DISTINCT ON (p.id) p.id AS profile_id, p.account_id, p.employee_id,
                  v.version, m.metric_def_id, d.key
           FROM kpi_profiles p
           JOIN kpi_profile_versions v ON v.profile_id = p.id
           JOIN kpi_profile_metrics m ON m.profile_version_id = v.id
           JOIN kpi_metric_defs d ON d.id = m.metric_def_id
           WHERE p.employee_id IS NOT NULL AND p.archived = FALSE AND d.unit <> 'money'
           ORDER BY p.id, v.version DESC
           LIMIT 1;`,
        );
        if (pick.length === 0) {
          check('mutant fixture topildi', false, "mos profil/metrika yo'q");
        } else {
          const pk = pick[0];
          const newVersionId = '00000000-0000-0000-0000-0000000000d1';
          await tx.$executeRawUnsafe(
            `INSERT INTO kpi_profile_versions (id, account_id, profile_id, version, effective_from, created_at)
             VALUES ('${newVersionId}', '${pk.account_id}', '${pk.profile_id}', ${pk.version + 1}, CURRENT_DATE, CURRENT_TIMESTAMP);`,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO kpi_profile_metrics (id, account_id, profile_version_id, metric_def_id, weight, target)
             VALUES (gen_random_uuid(), '${pk.account_id}', '${newVersionId}', '${pk.metric_def_id}', 42.00, 987654);`,
          );
          await tx.$executeRawUnsafe(
            `DELETE FROM employee_kpi_targets
             WHERE employee_id = '${pk.employee_id}' AND metric_key = '${pk.key}' AND period = 'daily';`,
          );
          await tx.$executeRawUnsafe(backfillSql());
          const got = await tx.$queryRawUnsafe<
            Array<{ target_value: bigint | null; weight: string | null }>
          >(
            `SELECT target_value, weight::text AS weight FROM employee_kpi_targets
             WHERE employee_id = '${pk.employee_id}' AND metric_key = '${pk.key}' AND period = 'daily';`,
          );
          check(
            'yangi versiya maqsadi olindi (eskisi emas)',
            got.length === 1 && got[0].target_value === 987654n && got[0].weight === '42.00',
            got.length === 1
              ? `target=${got[0].target_value} weight=${got[0].weight}`
              : `${got.length} qator`,
          );
        }

        throw new Error(ROLLBACK); // hech qachon commit qilinmaydi
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes(ROLLBACK)) throw e;
    console.log("\n(tranzaksiya qaytarildi — baza o'zgarmadi)");
  }

  console.log(`\nNATIJA: ${pass} ✓ · ${fail} ✗`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
