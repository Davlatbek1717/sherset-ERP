/**
 * F11 — «bir raqamni ikki manbadan tekshir» qoidasining KOD darajasidagi
 * qulfi (brauzer solishtiruvi QA sessiyasiga qoldirildi — parallel to'lqinda
 * portlar band).
 *
 * Ikki tekshiruv:
 *  A. **Sahifa ↔ sahifa**: chop sahifasi va `/retail/sessions/[id]` ekrani
 *     AYNAN bir endpointdan (`/cashier-sessions/:id/z-report`) va AYNAN bir
 *     maydon nomlaridan o'qiydi. Biri raqamni o'zi hisoblay boshlasa yoki
 *     maydon nomi siljisa — shu test yiqiladi.
 *  B. **FE ↔ server**: chop sahifasi kutayotgan har bir maydon serverning
 *     `zReport()` javobida HAQIQATAN bor. Xotira «FE fixture server maydonini
 *     o'zi to'qiydi»: yashil FE testi server javobi haqida hech narsa
 *     aytmaydi — shuning uchun grounding manba fayl bilan qilinadi.
 *
 * 🔴 Fayllar topilmasa test YIQILADI (jim o'tmaydi) — xotira «moysklad-reference
 * dir yo'q»: mavjud bo'lmagan manbani o'qigan qo'riqchi vakuum bo'lib qoladi.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** `apps/web/src/app/print/z-report/[id]/__tests__` → repo ildizi. */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..', '..', '..');

const PRINT_PAGE = join(__dirname, '..', 'page.tsx');
const RECEIPT_MODEL = join(REPO_ROOT, 'apps/web/src/lib/z-report-receipt.ts');
const SESSIONS_PAGE = join(REPO_ROOT, 'apps/web/src/app/(app)/retail/sessions/[id]/page.tsx');
const API_SERVICE = join(
  REPO_ROOT,
  'apps/api/src/modules/cashier-session/cashier-session.service.ts',
);

function read(path: string): string {
  expect(existsSync(path), `Manba fayl topilmadi: ${path}`).toBe(true);
  return readFileSync(path, 'utf8');
}

/**
 * Ikkala sahifa ham ko'rsatadigan ko'rsatkichlar. USD qatorlari ATAYLAB
 * ro'yxatda YO'Q: `/retail/sessions/[id]` ning `ZFull` interfeysi dollar
 * maydonlarini (`countedUsdCashMinor`, `varianceUsdMinor`, …),
 * `unconvertedByMethod` va `openingCashMinor` ni umuman e'lon qilmaydi —
 * ya'ni ekran ularni KO'RSATMAYDI, chop qog'ozi esa ko'rsatadi. Bu — F11
 * o'lchagan, ATAYLAB tuzatilmagan farq (ekran F11 fayli emas), hisobotda
 * qarz sifatida yozilgan.
 */
const SHARED_FIELDS = [
  'revenueByMethod',
  'revenueMinor',
  'salesCount',
  'averageReceiptMinor',
  'grossProfitMinor',
  'discountMinor',
  'creditSoldMinor',
  'debtPaidMinor',
  'returnsMinor',
  'expenseMinor',
  'collectionMinor',
  'expenseByItem',
  'expectedCashMinor',
  'countedCashMinor',
  'varianceMinor',
];

describe('A. chop sahifasi ↔ /retail/sessions/[id] — bir manba, bir maydon nomlari', () => {
  const printSrc = read(PRINT_PAGE);
  const modelSrc = read(RECEIPT_MODEL);
  const sessionsSrc = read(SESSIONS_PAGE);

  it('ikkala sahifa ham z-report endpointini chaqiradi', () => {
    expect(printSrc).toContain('/z-report');
    expect(printSrc).toContain('/cashier-sessions/');
    expect(sessionsSrc).toContain('/cashier-sessions/${id}/z-report');
  });

  it('qaytarishlar SONI ikkala sahifada ham eski endpointdan olinadi', () => {
    expect(printSrc).toContain('/retail-sales/z-report?sessionId=');
    expect(sessionsSrc).toContain('/retail-sales/z-report?sessionId=');
  });

  it('umumiy ko‘rsatkichlar ikkala tomonda ham AYNI maydon nomlaridan o‘qiladi', () => {
    const printSide = `${printSrc}\n${modelSrc}`;
    const missingOnPrint = SHARED_FIELDS.filter((f) => !printSide.includes(f));
    const missingOnScreen = SHARED_FIELDS.filter((f) => !sessionsSrc.includes(f));
    expect(missingOnPrint, 'chop sahifasida yo‘q maydonlar').toEqual([]);
    expect(missingOnScreen, 'ekranda yo‘q maydonlar').toEqual([]);
  });

  it('chop sahifasi raqamlarni O‘ZI hisoblamaydi (arifmetika yo‘q)', () => {
    // Faqat formatlash va serverdan kelgan qiymatlar. Qo'shish/ayirish
    // paydo bo'lsa — bu ikkinchi haqiqat manbai demakdir.
    expect(printSrc).not.toMatch(/BigInt\([^)]*\)\s*[-+*/]\s*BigInt\(/);
  });
});

describe('B. FE kutgan maydonlar serverning javobida bor (grounding)', () => {
  const modelSrc = read(RECEIPT_MODEL);
  const apiSrc = read(API_SERVICE);

  /** `ZReportPayload` interfeysidagi maydon nomlari. */
  function payloadFields(): string[] {
    const start = modelSrc.indexOf('export interface ZReportPayload');
    expect(start, 'ZReportPayload interfeysi topilmadi').toBeGreaterThan(-1);
    // Interfeysning oxiri — birinchi ustunda turgan yopuvchi qavs.
    const end = modelSrc.indexOf('\n}', start);
    expect(end, 'ZReportPayload oxiri topilmadi').toBeGreaterThan(start);
    const block = modelSrc.slice(start, end);
    const names = new Set<string>();
    for (const m of block.matchAll(/^\s{2,}([a-zA-Z][a-zA-Z0-9]*)[?]?:/gm)) {
      const name = m[1];
      if (name) names.add(name);
    }
    return [...names];
  }

  it('ZReportPayload maydonlari serverning zReport() manbasida uchraydi', () => {
    const fields = payloadFields();
    // Qo'riqchi vakuum bo'lib qolmasin: interfeys bo'shab qolsa ham
    // «hammasi topildi» deb yashil chiqmasin.
    expect(fields.length).toBeGreaterThan(20);

    const zStart = apiSrc.indexOf('async zReport(');
    expect(zStart, 'zReport() metodi topilmadi').toBeGreaterThan(-1);
    const zEnd = apiSrc.indexOf('\n  /**', zStart);
    const zSrc = apiSrc.slice(zStart, zEnd > zStart ? zEnd : undefined);

    const missing = fields.filter((f) => !zSrc.includes(`${f}:`) && !zSrc.includes(`${f} `));
    expect(missing, 'serverning javobida yo‘q maydonlar').toEqual([]);
  });

  it('server sanalmagan naqdni `null` qaytaradi (0 emas) — chek shu shartnomaga tayanadi', () => {
    expect(apiSrc).toContain('countedCashMinor: z.countedCashMinor?.toString() ?? null');
    expect(apiSrc).toContain('varianceMinor: z.varianceMinor?.toString() ?? null');
    expect(apiSrc).toContain('countedUsdCashMinor: z.countedUsdCashMinor?.toString() ?? null');
    expect(apiSrc).toContain('varianceUsdMinor: z.varianceUsdMinor?.toString() ?? null');
    expect(apiSrc).toContain('grossProfitMinor: z.grossProfitMinor?.toString() ?? null');
  });
});
