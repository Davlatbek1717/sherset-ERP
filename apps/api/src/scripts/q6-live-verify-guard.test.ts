/**
 * Q6 — jonli verify SKRIPTINING kod-shakl qo'riqchisi.
 *
 * Skriptning O'ZINI test bilan yugurtirib bo'lmaydi (u ishlab turgan API va
 * jonli bazani talab qiladi), lekin uning SHAKLI — nima qilishi va nima
 * QILMASLIGI — matndan o'lchanadi. Q5 ning `q5-backfill-scripts-guard.test.ts`
 * naqshi: izohlar olib tashlangan holda skanerlash (izohdagi so'z dalil emas).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Blok va satr izohlarini olib tashlaydi — da'vo KODda bo'lishi shart. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SCRIPT = read('./ops-q6-live-verify.ts');
const SCRIPT_CODE = stripComments(SCRIPT);
const PLAN = read('./q6-verify-plan.ts');
const PLAN_CODE = stripComments(PLAN);

describe('ops-q6-live-verify — xavfsizlik shakli', () => {
  it('🔴 DRY default: yozish FAQAT `--live` bilan ochiladi', () => {
    expect(SCRIPT_CODE).toContain("process.argv.includes('--live')");
    expect(SCRIPT_CODE).toMatch(/if \(!LIVE\)/);
  });

  it('🔴 DRY yo`lida `prisma.$disconnect` va ERTA QAYTISH bor (yozuvga tushmaydi)', () => {
    const dryBlock = SCRIPT_CODE.slice(SCRIPT_CODE.indexOf('if (!LIVE)'));
    expect(dryBlock.slice(0, 400)).toContain('return;');
  });

  it('🔴 migratsiya/kod to`liq bo`lmasa `--live` TO`XTAYDI (jimgina yiqilmaydi)', () => {
    expect(SCRIPT_CODE).toContain('isLiveVerifyPossible(probe)');
    expect(SCRIPT_CODE).toMatch(
      /if \(!isLiveVerifyPossible\(probe\)\)[\s\S]{0,200}throw new Error/,
    );
  });

  it('🔴 hukmni SKRIPT emas, SOF MODUL chiqaradi', () => {
    expect(SCRIPT_CODE).toContain('planDebtChainVerdicts');
    expect(SCRIPT_CODE).toContain('planPrepayChainVerdicts');
    expect(SCRIPT_CODE).toContain('summarizeVerdicts');
  });

  it('🔴 yiqilgan hukm CHIQISH KODINI 1 qiladi (CI/box «o`tdi» deb o`qimasin)', () => {
    expect(SCRIPT_CODE).toMatch(/process\.exit\(sum\.ok \? 0 : 1\)/);
  });
});

describe('ops-q6-live-verify — HTTP orqali, Nest konteksti EMAS', () => {
  it('🔴 `NestFactory` UMUMAN ishlatilmaydi (prodda cron ikki marta ketardi)', () => {
    expect(SCRIPT_CODE).not.toContain('NestFactory');
    expect(SCRIPT_CODE).not.toContain('createApplicationContext');
  });

  it('marshrutlar HTTP `fetch` orqali chaqiriladi', () => {
    expect(SCRIPT_CODE).toContain('await fetch(');
    expect(SCRIPT_CODE).toContain("'/retail-sales'");
    expect(SCRIPT_CODE).toContain('/post');
    expect(SCRIPT_CODE).toContain('/refund');
    expect(SCRIPT_CODE).toContain("'/debts/pos/pay'");
    expect(SCRIPT_CODE).toContain('/customer-prepay');
    expect(SCRIPT_CODE).toContain('/customer-prepay-refund');
    expect(SCRIPT_CODE).toContain('/manager/collection');
  });

  it('🔴 ro`yxat KESILGANini SEZADI — «topilmadi» ni «yo`q» deb yozmaydi', () => {
    // `COLLECTION_ROW_CAP = 500`. Q5 backfill'idan keyin ro'yxat undan
    // oshadi, ya'ni kesim sinov qatorini yashira oladi. Skript `truncated`
    // ni o'qib uchinchi qiymat (`null` = O'LCHANMADI) berishi SHART.
    expect(SCRIPT_CODE).toContain('truncated');
    expect(SCRIPT_CODE).toMatch(/inCollection: boolean \| null/);
    expect(SCRIPT_CODE).toMatch(/truncated === true \? null : false/);
  });

  it('🔴 ro`yxat Q4 MANBA filtri bilan so`raladi (filtrning o`zi ham o`lchansin)', () => {
    expect(SCRIPT_CODE).toContain('source=retailsale');
  });

  it('🔴 undirish ro`yxati HTTP dan o`qiladi (Prisma `debt.findMany` bilan EMAS)', () => {
    // Ro'yxat sof modul + filtr + servis bilan birga o'lchansin: to'g'ridan-to'g'ri
    // bazadan o'qilsa Q4 filtri va `buildCollectionList` umuman sinalmasdi.
    expect(SCRIPT_CODE).toMatch(/call\([^)]*'\/manager\/collection/);
  });
});

describe('ops-q6-live-verify — MA`LUMOTGA munosabat', () => {
  it('🔴 balansga QO`LDA yozilmaydi (`applyDelta` / `counterpartyBalance.update` yo`q)', () => {
    expect(SCRIPT_CODE).not.toContain('applyDelta');
    expect(SCRIPT_CODE).not.toMatch(/counterpartyBalance\.(update|upsert|create)/);
  });

  it('🔴 `Debt` reyestriga QO`LDA yozilmaydi — faqat o`qiladi', () => {
    expect(SCRIPT_CODE).not.toMatch(/prisma\.debt\.(create|update|delete|deleteMany|createMany)/);
    expect(SCRIPT_CODE).toMatch(/prisma\.debt\.(findFirst|count)/);
  });

  it('🔴 sinov izi O`ZI tozalanadi: har chek vozvrat qilinadi', () => {
    expect(SCRIPT_CODE).toContain('refundSaleFully');
    // qarz zanjiri + avans zanjirining ikki cheki = kamida uch chaqiruv
    expect(SCRIPT_CODE.match(/refundSaleFully\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('🔴 ATAYLAB rad etilgan chekning CHERNOVIGI ham bekor qilinadi', () => {
    // Invariant 5 ni o'lchash chernovik yaratadi, post esa 400 beradi — chek
    // `draft` bo'lib qoladi. `draft` smenani yopishga TO'SQINLIK qiladi
    // (`unresolved-sales.ts`, F5), ya'ni verify kassirni bloklab qo'yardi.
    expect(SCRIPT_CODE).toContain('expectPostRejected');
    expect(SCRIPT_CODE).toMatch(/finally \{[\s\S]{0,300}\/cancel/);
  });

  it('🔴 tozalash `finally` da — hukm QIZIL bo`lganda ham yuguradi', () => {
    const fn = SCRIPT_CODE.slice(SCRIPT_CODE.indexOf('async function expectPostRejected'));
    expect(fn.slice(0, 1400)).toContain('} finally {');
  });

  it('🔴 qolgan avans ham qaytariladi (mijozning puli osilib qolmasin)', () => {
    expect(SCRIPT_CODE).toContain('customer-prepay-refund');
  });

  it('sinov summalari KICHIK (jonli kassaga sezilarli ta`sir qilmaydi)', () => {
    const m = SCRIPT_CODE.match(/const PREPAY_MINOR = ([\d_]+)n/);
    expect(m).not.toBeNull();
    expect(BigInt((m?.[1] ?? '0').replace(/_/g, ''))).toBeLessThanOrEqual(1_000_000n);
  });
});

describe('q6-verify-plan — sof qatlam shartnomasi', () => {
  it('🔴 DB/Nest/HTTP import qilinmaydi', () => {
    expect(PLAN_CODE).not.toContain('@moysklad/db');
    expect(PLAN_CODE).not.toContain('@nestjs');
    expect(PLAN_CODE).not.toContain('fetch(');
  });

  it('🔴 `Date.now()` / `new Date()` yo`q (hukm takrorlanadigan bo`lsin)', () => {
    expect(PLAN_CODE).not.toContain('Date.now()');
    expect(PLAN_CODE).not.toMatch(/new Date\(\)/);
  });

  it('🔴 KESISHUV summasi Q1 ning sof qoidasidan olinadi — ikkinchi formula YO`Q', () => {
    expect(PLAN_CODE).toContain('receivablePortion');
    // «max(0, min(...))» ni qayta yozish — verify tekshirayotgan kodning
    // xatosini takrorlash demakdir.
    expect(PLAN_CODE).not.toMatch(/Math\.max\(0[\s\S]{0,40}Math\.min/);
  });

  it('bo`sh hukm ro`yxati «o`tdi» deb sanalmaydi', () => {
    expect(PLAN_CODE).toMatch(/verdicts\.length > 0/);
  });
});
