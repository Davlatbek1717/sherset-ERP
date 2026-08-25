import { vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';

/**
 * Q2 — `post()` ning UNDIRISH REYESTRI yozuvchisi uchun tranzaksiya-mock'i.
 *
 * NEGA UMUMIY FAYL: Q2 dan keyin qarzli chek post qilinganda `post()` uchta
 * yangi delegatga tegadi (`$queryRaw` balans qulfi · `debt` · `debtNote`) va
 * ular ILGARI hech bir harness'da yo'q edi. Har testda qo'lda yozilsa oltita
 * nusxa paydo bo'lardi va Q3 (`refund()` simmetriyasi) ularni yana bir marta
 * ko'chirardi — shuning uchun bitta manba (`document-sequence.mock.ts` odati).
 *
 * Mock HOLATLI: `debt.createMany` qatorni saqlaydi, `findFirst` esa uni
 * `sourceDocId` bo'yicha qaytaradi — ya'ni IDEMPOTENTLIK yo'li (ikkinchi
 * urinishda qator qo'shilmasligi) haqiqiy shaklda sinaladi.
 *
 * Q4 (2026-08-25) da yana KENGAYTIRILDI — `companySettings.findUnique`
 * (kassa qarzi muddati). Default `undefined` ⇒ sozlama qatori YO'Q, ya'ni
 * mavjud testlarning hammasi 14 kunlik default bilan AVVALGIDEK ishlaydi.
 *
 * Q3 (2026-08-25) da KENGAYTIRILDI — `refund()`/`edit()` simmetriyasi uchun:
 * `debt.update` (qatorni harakatlantirish), `$queryRaw` ning ikkinchi shakli
 * (`debts … FOR UPDATE` qulfi) va kontragent kesimidagi balans. Bashorat
 * to'g'ri chiqdi: Q2 bu faylni ochmaganda Q3 oltita harness'ga nusxa
 * yozardi.
 *
 * @param balanceBeforeMinor `FOR UPDATE` bilan o'qiladigan «balansOldin».
 *   `null` ⇒ balans qatori YO'Q (o'lchanmagan) — `$queryRaw` bo'sh massiv
 *   qaytaradi, bu §2.2 jadvalining 5-qatori.
 */
export function mockSaleDebtRegistryTx(
  balanceBeforeMinor: bigint | null = 0n,
  /**
   * Q3 — KONTRAGENT KESIMIDA balans. Chek tahrirlanganda bitta chekda IKKI
   * mijoz qatnashishi mumkin (mijoz almashtirilgan tahrir) va ularning
   * balansi har xil bo'ladi, ya'ni bitta son yetmaydi. Berilmasa — hamma
   * kontragent uchun `balanceBeforeMinor`.
   */
  balanceByCounterparty?: Map<string, bigint | null>,
  /**
   * Q4 — akkauntning `company_settings.sale_debt_term_days` qiymati.
   *
   * `undefined` (default) ⇒ **sozlama qatori umuman YO'Q** (`findUnique`
   * `null` qaytaradi), ya'ni Q1/Q2/Q3 testlari AVVALGIDEK 14 kunlik
   * default bilan ishlaydi va kutilmalari o'zgarmaydi. `null` ⇒ qator BOR,
   * lekin ustun sozlanmagan — bu IKKI HAR XIL holat va Q4 testi ikkalasini
   * ham alohida o'lchaydi.
   */
  saleDebtTermDays?: number | null,
) {
  const debtRows: Array<Record<string, unknown>> = [];

  // Q4 — muddat sozlamasi. `writeSaleDebtRegistryRow` va Q3 ning «qayta
  // ochilgan qator» tarmog'i AYNAN shu delegatdan o'qiydi.
  const companySettings = {
    findUnique: vi.fn(async () => (saleDebtTermDays === undefined ? null : { saleDebtTermDays })),
  };

  /**
   * `$queryRaw` IKKI xil so'rovga xizmat qiladi (Prisma tagged-template:
   * birinchi argument — matn bo'laklari, qolganlari — qiymatlar):
   *   · Q2 — `SELECT balance_minor FROM counterparty_balances … FOR UPDATE`;
   *   · Q3 — `SELECT id FROM debts WHERE source_doc_id = … FOR UPDATE`.
   * Ajratish SQL matni bo'yicha — haqiqiy chaqiruv ham aynan shu shaklda.
   */
  const queryRaw = vi.fn(
    async (strings: TemplateStringsArray | readonly string[], ...values: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
      if (sql.includes('FROM debts')) {
        // Q3 qulfi — chek id'si `values` ichida keladi.
        return debtRows
          .filter((r) => r.sourceDocId !== undefined && values.some((v) => v === r.sourceDocId))
          .map((r) => ({ id: r.id }));
      }
      // Q2 balans qulfi — `values` = [accountId, counterpartyId, currency].
      const cpId = values[1];
      const scoped =
        balanceByCounterparty !== undefined && typeof cpId === 'string'
          ? balanceByCounterparty.get(cpId)
          : undefined;
      const balance = scoped === undefined ? balanceBeforeMinor : scoped;
      return balance === null ? [] : [{ balance_minor: balance }];
    },
  );

  const matches = (where: Record<string, unknown>, row: Record<string, unknown>): boolean => {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.sourceDocId !== undefined && row.sourceDocId !== where.sourceDocId) return false;
    if (where.sourceDocType !== undefined && row.sourceDocType !== where.sourceDocType) {
      return false;
    }
    // `name: { startsWith }` — raqam allokatorining seed o'qishi.
    const name = where.name as { startsWith?: string } | undefined;
    if (name?.startsWith !== undefined) {
      return typeof row.name === 'string' && row.name.startsWith(name.startsWith);
    }
    return true;
  };

  const debt = {
    findFirst: vi.fn(
      async (args: { where: Record<string, unknown> }) =>
        debtRows.find((r) => matches(args.where, r)) ?? null,
    ),
    findFirstOrThrow: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const row = debtRows.find((r) => matches(args.where, r));
      if (!row) throw new Error('Debt topilmadi (mock)');
      return row;
    }),
    // `skipDuplicates` — haqiqiy `ON CONFLICT DO NOTHING` kabi: bir xil
    // (sourceDocType, sourceDocId) ikkinchi marta qator QO'SHMAYDI.
    createMany: vi.fn(async (args: { data: Array<Record<string, unknown>> }) => {
      let count = 0;
      for (const row of args.data) {
        const dup = debtRows.some(
          (r) =>
            r.sourceDocType === row.sourceDocType &&
            r.sourceDocId === row.sourceDocId &&
            row.sourceDocId !== undefined,
        );
        if (dup) continue;
        debtRows.push({ id: `debt-${debtRows.length + 1}`, ...row });
        count += 1;
      }
      return { count };
    }),
    // Q3 — qatorni HARAKATLANTIRISH (`totalMinor`/`status`/`closedAt`/
    // `counterpartyId`). Mock holatli bo'lgani uchun test yozilgan qiymatni
    // AYNAN o'sha qatorda ko'radi — «yozdik» bilan «o'zgardi» orasida yana
    // bir taxmin qolmaydi.
    update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = debtRows.find((r) => r.id === args.where.id);
      if (!row) throw new Error(`Debt ${args.where.id} topilmadi (mock)`);
      Object.assign(row, args.data);
      return row;
    }),
  };

  const debtNote = { create: vi.fn(async (args: { data: unknown }) => args.data) };

  return {
    /** Harness'ning `tx` obyektiga yoyiladi (`...mockSaleDebtRegistryTx()` emas — `.tx`). */
    tx: {
      $queryRaw: queryRaw,
      debt,
      debtNote,
      companySettings,
      documentSequence: mockDocumentSequence(),
    },
    /** Yozilgan reyestr qatorlari — test AYNAN shularni tekshiradi. */
    debtRows,
    queryRaw,
    debtNote,
    companySettings,
  };
}
