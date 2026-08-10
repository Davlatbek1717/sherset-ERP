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
