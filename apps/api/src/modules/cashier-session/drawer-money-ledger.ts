import type { MoneyDelta } from '../money/money.service.js';

/**
 * POS yashiq amalining PUL DAFTARI tomoni — yagona qoida.
 *
 * NEGA BU MODUL BOR (2026-08-12 auditi): Внесение / Изъятие / xarajat /
 * inkassatsiya `RetailDrawerCashIn|Out` qatorini yozardi-yu, `CashDesk`
 * qoldig'iga ham, `MoneyOperation` ga ham TEGMASDI. Kirim yo'llari (chek naqdi,
 * qarz to'lovi, ПКО) esa tegardi ⇒ ustun monoton shishardi va
 * `money.service.ts:184-186` dagi «every till movement has always gone through
 * this ledger» shartnomasi YOLG'ON edi. Lokal bazada o'lchangan: yashiq
 * chiqimlari daftardagi qoldiqdan ~8500 barobar katta edi.
 *
 * ⚠️ `allowNegative` ATAYLAB berilmaydi: yashiqdan jismonan yo'q pulni
 * chiqarib bo'lmaydi. Qo'riqchi `money.service.ts:128` da ishlaydi va aynan
 * shu yo'l uni bugungacha chetlab o'tardi.
 *
 * Ishorani FAQAT shu modul qo'yadi: uchta chaqiruvchi (`drawerCashIn`,
 * `drawerCashOut`, `posCashOut`) bir xil qoidaga bo'ysunadi, ya'ni «bittasida
 * ishora teskari» klassidagi xato bitta joyda qulflangan.
 */
export interface DrawerOp {
  /** `in` — Внесение · `out` — Изъятие / xarajat / inkassatsiya. */
  kind: 'in' | 'out';
  cashDeskId: string;
  /** Yashiq valyutasi (`CashierSession.cashDesk.currency`, doim BASE). */
  currency: string;
  /** Hujjat summasi (musbat), minor. Ishorani bu modul qo'yadi. */
  sumMinor: bigint;
  /** `RetailDrawerCashIn|Out.id` — daftardan hujjatga qaytish yo'li. */
  documentId: string;
  description?: string;
}

/**
 * Slug'lar TERNAR ichida emas, har shoxda LITERAL yozilgan — `/money`
 * shartnoma qulfi (`apps/web/src/__tests__/money-kind-contract.test.ts`)
 * yozuvchilarni «kalit + qo'shtirnoqli slug» naqshi bo'yicha skanlaydi.
 * Ternarga yashirilgan slug o'sha skandan ko'rinmay qolardi va lentaning
 * marshrut/yorlig'i jimgina to'liqsiz qolardi (aynan 08k bug-klassi).
 * Umumiy maydonlar `base` da — «nusxa bir shoxni yo'qotadi» xavfi yo'q.
 */
export function drawerMoneyDeltas(op: DrawerOp): MoneyDelta[] {
  if (op.sumMinor === 0n) return [];
  const base = {
    sourceKind: 'cash_desk',
    sourceId: op.cashDeskId,
    currency: op.currency,
    documentId: op.documentId,
    description: op.description,
  } satisfies Omit<MoneyDelta, 'deltaMinor' | 'documentKind'>;

  if (op.kind === 'in') {
    return [{ ...base, deltaMinor: op.sumMinor, documentKind: 'drawer_cash_in' }];
  }
  return [{ ...base, deltaMinor: -op.sumMinor, documentKind: 'drawer_cash_out' }];
}
