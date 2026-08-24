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
 * @param balanceBeforeMinor `FOR UPDATE` bilan o'qiladigan «balansOldin».
 *   `null` ⇒ balans qatori YO'Q (o'lchanmagan) — `$queryRaw` bo'sh massiv
 *   qaytaradi, bu §2.2 jadvalining 5-qatori.
 */
export function mockSaleDebtRegistryTx(balanceBeforeMinor: bigint | null = 0n) {
  const debtRows: Array<Record<string, unknown>> = [];

  const queryRaw = vi.fn(async () =>
    balanceBeforeMinor === null ? [] : [{ balance_minor: balanceBeforeMinor }],
  );

  const matches = (where: Record<string, unknown>, row: Record<string, unknown>): boolean => {
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
  };

  const debtNote = { create: vi.fn(async (args: { data: unknown }) => args.data) };

  return {
    /** Harness'ning `tx` obyektiga yoyiladi (`...mockSaleDebtRegistryTx()` emas — `.tx`). */
    tx: {
      $queryRaw: queryRaw,
      debt,
      debtNote,
      documentSequence: mockDocumentSequence(),
    },
    /** Yozilgan reyestr qatorlari — test AYNAN shularni tekshiradi. */
    debtRows,
    queryRaw,
    debtNote,
  };
}
