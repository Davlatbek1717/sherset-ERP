import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KPI-01 — `EmployeeKpiTarget` / `EmployeeKpiTargetEvent` SXEMA SHARTNOMASI.
 *
 * Nega static guard: bu faza kod emas, BAZA qatlamini kiritadi. Xulq
 * (CHECK rad etadimi, backfill dublikat yozadimi) jonli bazada
 * `scripts/probe-employee-kpi-target.mts` bilan o'lchanadi — bu yerda esa
 * o'sha shartnoma REGRESS bo'lmasligi qulflanadi (`employee-username-unique-index`
 * naqshi: sxema + migratsiya matni birga tekshiriladi).
 *
 * Har tekshiruv «qaysi ishlab-chiqarish o'zgarishi buni yiqitadi» savoliga
 * javob beradi — vacuous match bo'lmasligi uchun izohlar OLIB TASHLANADI
 * (migratsiyaning o'z izohlari lug'at so'zlarini takrorlaydi).
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const SCHEMA = join(REPO_ROOT, 'packages/db/prisma/schema.prisma');
const MIGRATION = join(
  REPO_ROOT,
  'packages/db/prisma/migrations/20260810160000_employee_kpi_target/migration.sql',
);

const stripPrismaComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
/** SQL `--` izohlari lug'at so'zlarini takrorlaydi → tekshirishdan chiqariladi. */
const stripSqlComments = (s: string) => s.replace(/--.*$/gm, '');

const schema = stripPrismaComments(readFileSync(SCHEMA, 'utf8'));
const modelBlock = (name: string) =>
  schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';

describe('KPI-01 sxema — EmployeeKpiTarget (yengil, versiyalanmaydigan maqsad qatlami)', () => {
  const model = modelBlock('EmployeeKpiTarget');

  it("model mavjud va `employee_kpi_targets` jadvaliga bog'langan", () => {
    expect(model).not.toBe('');
    expect(model).toMatch(/@@map\("employee_kpi_targets"\)/);
  });

  it("og'irlik IXTIYORIY (`Decimal?`) — NULL = oylik balldan tashqarida (KPI-05 shartnomasi)", () => {
    // `Decimal` (nullable emas) qilinsa «og'irliksiz KPI» umuman ifodalanmaydi
    // va butun «todo kabi» maqsad yo'qoladi.
    expect(model).toMatch(/weight\s+Decimal\?\s+@db\.Decimal\(5,\s*2\)/);
  });

  it('maqsad raqami IXTIYORIY (`BigInt?`) — NULL = raqamsiz «bajarildi/bajarilmadi»', () => {
    expect(model).toMatch(/targetValue\s+BigInt\?\s+@map\("target_value"\)/);
  });

  it("`unit` ustuni bor — CHECK boshqa jadvalni ko'ra olmaydi, birlik QATORDA turishi shart", () => {
    // Bu ustun olib tashlansa `money ↔ currency` CHECK'ini yozib bo'lmaydi
    // (`kpi_metric_defs.unit` boshqa jadval) va birlik-lug'atlari aralashadi.
    expect(model).toMatch(/unit\s+String\s+@db\.VarChar\(10\)/);
    expect(model).toMatch(/currency\s+String\?\s+@db\.VarChar\(3\)/);
  });

  it("qo'lda metrika belgisi `manualDoneAt` timestamptz? sifatida bor", () => {
    expect(model).toMatch(
      /manualDoneAt\s+DateTime\?\s+@map\("manual_done_at"\)\s+@db\.Timestamptz\(\)/,
    );
  });

  it("takror maqsad yo'q: @@unique([employeeId, metricKey, period])", () => {
    expect(model).toMatch(/@@unique\(\[employeeId,\s*metricKey,\s*period\]\)/);
  });

  it("ro'yxat va katalog so'rovlari uchun ikki indeks", () => {
    expect(model).toMatch(/@@index\(\[accountId,\s*employeeId,\s*active\]\)/);
    expect(model).toMatch(/@@index\(\[accountId,\s*metricKey\]\)/);
  });

  it("xodim o'chirilsa maqsad ham ketadi (Cascade), muallif izi esa SetNull", () => {
    expect(model).toMatch(
      /employee\s+Employee\s+@relation\("EmployeeKpiTargetEmployee"[^)]*onDelete:\s*Cascade\)/,
    );
    expect(model).toMatch(
      /createdBy\s+Employee\?\s+@relation\("EmployeeKpiTargetActor"[^)]*onDelete:\s*SetNull\)/,
    );
  });
});

describe('KPI-01 sxema — EmployeeKpiTargetEvent (append-only audit)', () => {
  const model = modelBlock('EmployeeKpiTargetEvent');

  it("model mavjud va `employee_kpi_target_events` ga bog'langan", () => {
    expect(model).not.toBe('');
    expect(model).toMatch(/@@map\("employee_kpi_target_events"\)/);
  });

  it("maqsad qatori O'CHSA event QOLADI — targetId nullable + onDelete: SetNull", () => {
    // Cascade qo'yilsa o'chirish jurnalni ham o'chirardi: «kim o'chirdi»
    // savoliga javob YO'QOLADI (bulk-update-wrote-no-audit klassi).
    expect(model).toMatch(/targetId\s+String\?\s+@map\("target_id"\)/);
    expect(model).toMatch(/target\s+EmployeeKpiTarget\?\s+@relation\([^)]*onDelete:\s*SetNull\)/);
  });

  it('payload MATN sifatida saqlanadi (Json, majburiy) — havola emas', () => {
    // [[journal-copies-text-not-reference]]: qator o'chgach ham «nima edi»
    // savoliga javob shu ustundan chiqadi.
    expect(model).toMatch(/payloadJson\s+Json\s+@map\("payload_json"\)/);
  });
});

describe('KPI-01 migratsiya — CHECK lar va idempotent backfill', () => {
  // Migratsiya hali yo'q bo'lsa ham suite YIQILMASIN — har tekshiruv o'z
  // xabari bilan qizarsin (ENOENT butun blokni ko'rinmas qilardi).
  const raw = existsSync(MIGRATION) ? readFileSync(MIGRATION, 'utf8') : '';
  const sql = stripSqlComments(raw);

  it('migratsiya fayli mavjud', () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });

  it("birlik yopiq lug'at (money/count/percent/minutes)", () => {
    expect(sql).toMatch(
      /CHECK\s*\(\s*"unit"\s+IN\s*\(\s*'money',\s*'count',\s*'percent',\s*'minutes'\s*\)\s*\)/,
    );
  });

  it("davr yopiq lug'at — §2.5: daily | weekly | monthly", () => {
    expect(sql).toMatch(
      /CHECK\s*\(\s*"period"\s+IN\s*\(\s*'daily',\s*'weekly',\s*'monthly'\s*\)\s*\)/,
    );
  });

  it('🔴 valyuta FAQAT pul birligida va pul birligida MAJBURIY (ikki tomonlama CHECK)', () => {
    // Bir tomoni tushib qolsa «5 ta mijoz UZS da» yoki valyutasiz pul maqsadi
    // yoziladi — [[manager-kpi-unit-vocabularies]] bug-klassi (100× xato).
    expect(sql).toMatch(/"unit"\s*=\s*'money'\s+AND\s+"currency"\s+IS\s+NOT\s+NULL/);
    expect(sql).toMatch(/"unit"\s*<>\s*'money'\s+AND\s+"currency"\s+IS\s+NULL/);
  });

  it("event harakati yopiq lug'at (created/updated/deleted/marked_done/reopened)", () => {
    expect(sql).toMatch(
      /CHECK\s*\(\s*"action"\s+IN\s*\(\s*'created',\s*'updated',\s*'deleted',\s*'marked_done',\s*'reopened'\s*\)\s*\)/,
    );
  });

  it('(employee_id, metric_key, period) UNIQUE indeksi yaratiladi', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*ON "employee_kpi_targets"\("employee_id",\s*"metric_key",\s*"period"\)/,
    );
  });

  it('backfill IDEMPOTENT — ON CONFLICT DO NOTHING', () => {
    // Migratsiya ikki marta yugurtirilsa (yoki qo'lda takrorlansa) dublikat
    // yozmasligi shart; DO UPDATE emas — mavjud qatorni USTIGA yozish menejer
    // tahririni jimgina bekor qilardi.
    expect(sql).toMatch(/ON CONFLICT[^;]*DO NOTHING/);
    expect(sql).not.toMatch(/ON CONFLICT[^;]*DO UPDATE/);
  });

  it("backfill FAQAT xodimga biriktirilgan profillardan (lavozim profili ko'chirilmaydi)", () => {
    // Lavozim profillari xodimga emas, ROLGA tegishli — ular KPI-03 resolveri
    // uchun baza bo'lib qoladi. Ko'chirilsa har xodimga «shaxsiy» nusxa paydo
    // bo'lib, lavozim maqsadini keyin o'zgartirish hech kimga ta'sir qilmasdi.
    expect(sql).toMatch(/"employee_id"\s+IS\s+NOT\s+NULL/);
  });

  it("backfill faqat ENG OXIRGI profil versiyasidan o'qiydi", () => {
    // Hamma versiyalar olinsa bir metrikaning bir necha eski maqsadi
    // navbatma-navbat urinardi va g'olib TASODIFIY bo'lardi.
    expect(sql).toMatch(/ORDER BY[\s\S]{0,80}"version" DESC/);
  });

  it('backfill valyutani HISOB valyutasidan oladi, sanoqda NULL qoldiradi', () => {
    // Manba `accounts.currency` bo'lishi shart: qattiq 'UZS' yozilsa boshqa
    // valyutali hisobda maqsad jimgina noto'g'ri valyutada saqlanardi.
    expect(sql).toMatch(/JOIN "accounts" a ON a\."id" = p\."account_id"/);
    expect(sql).toMatch(/a\."currency"\s+AS\s+"account_currency"/);
    // Va ELSE shoxi NULL — CHECK aynan shuni talab qiladi.
    expect(sql).toMatch(
      /CASE\s+WHEN\s+src\."unit"\s*=\s*'money'\s+THEN\s+src\."account_currency"\s+ELSE\s+NULL\s+END/,
    );
  });

  it("backfill davri 'daily' — profil maqsadi kunlik edi", () => {
    expect(sql).toMatch(/'daily'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KPI-03 — KUN MUHRI (`employee_daily_kpi_metrics.target_value/target_source`)
// ─────────────────────────────────────────────────────────────────────────────

const SEAL_MIGRATION = join(
  REPO_ROOT,
  'packages/db/prisma/migrations/20260810180000_daily_kpi_metric_target_seal/migration.sql',
);

/**
 * KPI-03 sxema shartnomasi — `EmployeeKpiTarget` VERSIYALANMAGANI uchun tarix
 * butunligi AYNAN shu ikki ustunga tayanadi. Ular yo'qolsa (yoki `target_source`
 * NOT NULL qilinsa) «tahrir faqat kelajakka» kafolati jimgina yo'qoladi.
 */
describe('KPI-03 sxema — kunlik ko`rsatkichga MUHRLANGAN maqsad', () => {
  const model = modelBlock('EmployeeDailyKpiMetric');
  const sealSql = stripSqlComments(
    existsSync(SEAL_MIGRATION) ? readFileSync(SEAL_MIGRATION, 'utf8') : '',
  );

  it('`targetValue BigInt?` — o`sha kungi maqsad qator ICHIDA muhrlanadi', () => {
    // Ustun bo'lmasa maqsad har o'qishda profil/target qatoridan QAYTA
    // hisoblanardi, ya'ni bugungi tahrir o'tgan kunning ballini o'zgartirardi
    // (tan-narx muzlatish klassi).
    expect(model).toMatch(/targetValue\s+BigInt\?\s+@map\("target_value"\)/);
  });

  it('`targetSource` NULLABLE — NULL = MUHR YO`Q (migratsiyadan oldingi qator)', () => {
    // 🔴 NULL ≠ 0 ning aynan shu fazadagi ko'rinishi: muhrlangan «maqsad yo'q»
    // (`none`) va umuman muhrlanmagan qatorni farqlash SHU ustun bilan bo'ladi.
    // NOT NULL + default qilinsa eski kunlar «maqsadsiz muhrlangan» bo'lib
    // qolar va profil maqsadidan hisoblangan ballari nolga tushardi.
    expect(model).toMatch(/targetSource\s+String\?\s+@map\("target_source"\)\s+@db\.VarChar\(20\)/);
  });

  it('migratsiya ikki ustunni ham qo`shadi', () => {
    expect(sealSql).toMatch(/ALTER TABLE "employee_daily_kpi_metrics"[\s\S]*"target_value" BIGINT/);
    expect(sealSql).toMatch(
      /ALTER TABLE "employee_daily_kpi_metrics"[\s\S]*"target_source" VARCHAR\(20\)/,
    );
  });

  it('manba lug`ati YOPIQ (CHECK) — noma`lum manba muhr sifatida o`qilmaydi', () => {
    expect(sealSql).toMatch(
      /CHECK\s*\(\s*"target_source" IS NULL OR "target_source" IN \('employee_target', 'target_override', 'profile', 'none'\)\s*\)/,
    );
  });

  it('muhr BUTUN — qiymat bor, manbasi yo`q holati CHECK bilan taqiqlanadi', () => {
    // Aks holda `target_value` to'ldirilgan, `target_source` NULL qator paydo
    // bo'lardi — o'quvchi uni «muhrlanmagan» deb o'qib profilga tushardi va
    // muhrdagi raqam JIMGINA e'tiborsiz qolardi.
    expect(sealSql).toMatch(
      /CHECK\s*\(\s*"target_value" IS NULL OR "target_source" IS NOT NULL\s*\)/,
    );
  });

  it('mavjud qatorlar BACKFILL QILINMAYDI — tarix qayta yozilmaydi', () => {
    // Eski kunlarga bugungi maqsadni muhrlash aynan o'sha «o'tgan oyni qayta
    // yozish» hodisasi bo'lardi. Ular muhrsiz qoladi va o'quvchi ular uchun
    // avvalgidek profil maqsadiga tushadi (xulq o'zgarmaydi).
    expect(sealSql).not.toMatch(/UPDATE "employee_daily_kpi_metrics"/);
  });
});

const WEIGHT_SEAL_MIGRATION = join(
  REPO_ROOT,
  'packages/db/prisma/migrations/20260810190000_daily_kpi_metric_weight_seal/migration.sql',
);

/**
 * KPI-05 sxema — KUNGA MUHRLANGAN OG'IRLIK.
 *
 * Og'irlik endi `EmployeeKpiTarget.weight` dan ham kelishi mumkin, u qatlam esa
 * VERSIYALANMAYDI. Ya'ni muhrsiz o'qilsa, menejerning bugungi og'irlik tahriri
 * o'tgan kunlarning ballini QAYTA YOZARDI — `kpi_profile_versions` aynan shuni
 * to'sish uchun bor edi. Maqsad tomonida bu kafolat KPI-03 muhrida; og'irlik
 * tomonida — shu ikki ustunda.
 */
describe('KPI-05 sxema — kunlik ko`rsatkichga MUHRLANGAN og`irlik', () => {
  const model = modelBlock('EmployeeDailyKpiMetric');
  const sql = stripSqlComments(
    existsSync(WEIGHT_SEAL_MIGRATION) ? readFileSync(WEIGHT_SEAL_MIGRATION, 'utf8') : '',
  );

  it('`weightApplied Decimal?` — o`sha kunga qo`llangan og`irlik qator ICHIDA', () => {
    // Prisma `Decimal(5,2)` — `employee_kpi_targets.weight` va
    // `kpi_profile_metrics.weight` bilan AYNAN bir xil aniqlik (yaxlitlash
    // farqi ikki manbani bir kun kelib ajratib yuborardi).
    expect(model).toMatch(/weightApplied\s+Decimal\?\s+@map\("weight_applied"\)/);
    expect(model).toMatch(/weightApplied[\s\S]{0,60}@db\.Decimal\(5, 2\)/);
  });

  it('`weightSource` NULLABLE — NULL = MUHR YO`Q (eski qator profilga tushadi)', () => {
    // 🔴 NULL ≠ 0: muhrlangan «og'irlik qo'yilmagan» (`weight_applied` NULL,
    // manba `employee_target`) va umuman muhrlanmagan qatorni faqat shu ustun
    // farqlaydi. NOT NULL qilinsa eski kunlar «og'irliksiz» bo'lib, ballari
    // NULLga tushardi.
    expect(model).toMatch(/weightSource\s+String\?\s+@map\("weight_source"\)\s+@db\.VarChar\(20\)/);
  });

  it('migratsiya ikki ustunni ham qo`shadi', () => {
    expect(sql).toMatch(
      /ALTER TABLE "employee_daily_kpi_metrics"[\s\S]*"weight_applied" DECIMAL\(5,\s*2\)/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "employee_daily_kpi_metrics"[\s\S]*"weight_source" VARCHAR\(20\)/,
    );
  });

  it('manba lug`ati YOPIQ (CHECK) — `kpi-target.ts` `WeightSource` bilan bir xil', () => {
    expect(sql).toMatch(
      /CHECK\s*\(\s*"weight_source" IS NULL OR "weight_source" IN \('employee_target', 'profile', 'none'\)\s*\)/,
    );
  });

  it('muhr BUTUN — og`irlik bor, manbasi yo`q holati taqiqlanadi', () => {
    expect(sql).toMatch(
      /CHECK\s*\(\s*"weight_applied" IS NULL OR "weight_source" IS NOT NULL\s*\)/,
    );
  });

  it('og`irlik oralig`i 0…100 (manbadagi CHECK bilan bir xil)', () => {
    // `employee_kpi_targets_weight_range` bilan bir xil chegara: manbada
    // ruxsat etilgan qiymat muhrda rad etilsa, kun hisoblash YIQILARDI.
    expect(sql).toMatch(
      /CHECK\s*\(\s*"weight_applied" IS NULL OR \("weight_applied" >= 0 AND "weight_applied" <= 100\)\s*\)/,
    );
  });

  it('mavjud qatorlar BACKFILL QILINMAYDI — eski kunlar balli o`zgarmaydi', () => {
    expect(sql).not.toMatch(/UPDATE "employee_daily_kpi_metrics"/);
  });
});
