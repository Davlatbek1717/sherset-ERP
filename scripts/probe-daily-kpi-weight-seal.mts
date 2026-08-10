/**
 * KPI-05 — `employee_daily_kpi_metrics` OG'IRLIK MUHRI xulqi JONLI bazada
 * (`climart_adopt`).
 *
 * Nega alohida skript: vitest gate'i migratsiya MATNINI o'qiydi, ya'ni «CHECK
 * yozilganmi» savoliga javob beradi. «CHECK RAD ETADIMI» degan savolga faqat
 * baza javob beradi ([[browser-qa-catches-what-static-cannot]] ning DB tomoni).
 *
 * Hamma yozuv BITTA tranzaksiyada va OXIRIDA QAYTARILADI (rollback) — skript
 * bazani o'zgartirmaydi. Kutilgan xatolar SAVEPOINT bilan izolyatsiya qilinadi
 * (aks holda birinchi CHECK butun tranzaksiyani abort qilardi).
 *
 * Yugurtirish (repo ildizidan):
 *   pnpm exec tsx scripts/probe-daily-kpi-weight-seal.mts
 */
import { prisma } from '../packages/db/src/index.ts';

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
  // ---- (0) Ustunlar HAQIQATAN qo'shilganmi -------------------------------
  console.log("(0) og'irlik muhri ustunlari mavjud");
  const cols = await prisma.$queryRawUnsafe<
    Array<{ column_name: string; is_nullable: string; data_type: string }>
  >(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns
     WHERE table_name = 'employee_daily_kpi_metrics'
       AND column_name IN ('weight_applied', 'weight_source');`,
  );
  check('ikkala ustun bor', cols.length === 2, cols.map((c) => c.column_name).join(', '));
  check(
    "ikkalasi ham NULLABLE (NULL = muhr yo'q)",
    cols.length === 2 && cols.every((c) => c.is_nullable === 'YES'),
  );

  // ---- (1) MAVJUD qatorlar TEGILMAGAN ------------------------------------
  // Migratsiya `UPDATE` qilmaydi: eski kunlar muhrsiz qolishi SHART, aks holda
  // bugungi og'irlik o'tgan kunga qo'llanib, uning balli qayta yozilardi.
  console.log("\n(1) migratsiyadan oldingi qatorlar MUHRSIZ (tarix qayta yozilmagan)");
  const existing = await prisma.$queryRawUnsafe<Array<{ total: bigint; sealed: bigint }>>(
    `SELECT COUNT(*) AS total, COUNT("weight_source") AS sealed
     FROM employee_daily_kpi_metrics;`,
  );
  const { total, sealed } = existing[0];
  check(`mavjud ${total} qatordan 0 tasi muhrlangan`, Number(sealed) === 0, `sealed=${sealed}`);
  // Vacuous emasligi: jadval bo'sh bo'lsa yuqoridagi tekshiruv hech narsa
  // isbotlamaydi — buni ochiq aytamiz.
  check('o`lchov vacuous emas (jadvalda qator bor)', Number(total) > 0, `total=${total}`);

  // ---- (2) CHECK xulqi ---------------------------------------------------
  console.log('\n(2) CHECK`lar (hammasi rollback qilinadigan tranzaksiyada)');
  const day = await prisma.$queryRawUnsafe<Array<{ id: string; account_id: string }>>(
    `SELECT id, account_id FROM employee_daily_kpi LIMIT 1;`,
  );
  if (day.length === 0) throw new Error("Fixture yo'q: `employee_daily_kpi` bo'sh");
  const { id: dailyKpiId, account_id: accountId } = day[0];
  console.log(`  Fixture: dailyKpi=${dailyKpiId} account=${accountId}`);

  const row = (
    key: string,
    weight: string,
    source: string,
  ) => `INSERT INTO employee_daily_kpi_metrics
          ("id", "account_id", "daily_kpi_id", "metric_key", "auto_value", "complete",
           "weight_applied", "weight_source")
        VALUES (gen_random_uuid(), '${accountId}', '${dailyKpiId}', '${key}', 100, TRUE,
                ${weight}, ${source})`;

  try {
    await prisma.$transaction(async (tx) => {
      await expectOk(
        tx,
        "to'g'ri muhr (`employee_target` + og'irlik) qabul qilinadi",
        row('probe_w_a', '40.50', `'employee_target'`),
      );
      await expectOk(
        tx,
        "muhrlangan OG'IRLIKSIZLIK (`employee_target` + NULL) qabul qilinadi",
        row('probe_w_b', 'NULL', `'employee_target'`),
      );
      await expectOk(tx, '`profile` manbasi lug`atda', row('probe_w_c', '70', `'profile'`));
      await expectOk(tx, '`none` manbasi lug`atda', row('probe_w_d', 'NULL', `'none'`));
      await expectOk(
        tx,
        'umuman muhrsiz (ikkisi ham NULL) qabul qilinadi — eski qator yo`li',
        row('probe_w_e', 'NULL', 'NULL'),
      );

      await expectPgError(
        tx,
        "noma'lum manba RAD etiladi",
        row('probe_w_f', '40', `'boshqa_manba'`),
        '23514',
      );
      await expectPgError(
        tx,
        "og'irlik bor, manba YO'Q — RAD etiladi (muhr butunligi)",
        row('probe_w_g', '40', 'NULL'),
        '23514',
      );
      await expectPgError(
        tx,
        "og'irlik 100 dan katta — RAD etiladi",
        row('probe_w_h', '100.01', `'profile'`),
        '23514',
      );
      await expectPgError(
        tx,
        "manfiy og'irlik — RAD etiladi",
        row('probe_w_i', '-1', `'profile'`),
        '23514',
      );
      await expectOk(tx, 'chegaralar YOPIQ: 0 va 100 qabul qilinadi', row('probe_w_j', '0', `'profile'`));
      await expectOk(tx, 'chegaralar YOPIQ: 100 qabul qilinadi', row('probe_w_k', '100', `'profile'`));

      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (String((e as Error).message) !== ROLLBACK) throw e;
    console.log('  · tranzaksiya QAYTARILDI (baza o`zgarmadi)');
  }

  const after = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM employee_daily_kpi_metrics WHERE "metric_key" LIKE 'probe_w_%';`,
  );
  check('rollback haqiqatan bo`ldi (probe qatorlari yo`q)', Number(after[0].n) === 0);

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi · ${fail} yiqildi`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
