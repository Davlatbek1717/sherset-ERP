import type { Prisma } from '@moysklad/db';
import type { MoneyDelta } from '../money/money.service.js';

/**
 * Qarz to'lovining KASSA (naqd yashiq) tomoni — YAGONA qoida (Faza 11, `M-05`).
 *
 * NEGA ALOHIDA MODUL: bu predikat TO'RT joyda kerak — POS to'lovi
 * (`pos-debt-payment.service`), kassir to'lovi (`debt.service.addCashPayment`)
 * va ikkala STORNO yo'li (`reversePayment`, `cancelCallNote`). Ikki nusxa
 * muqarrar bir-biridan uzoqlashadi, bu yerda esa har qanday farq = yashiqqa
 * kiritilib qaytarilmagan (yoki umuman kirmagan pul chiqarilgan) summa.
 *
 * QOIDA: yashiqqa FAQAT naqd tushadi va FAQAT kassa ko'rsatilgan bo'lsa.
 *  - `terminal` / `card_screenshot` / `account` — pul bankka/ekvayerga boradi,
 *    tortmaga emas;
 *  - kassasiz naqd — operator qo'ng'iroqda «to'ladi» deb qayd etgan holat:
 *    kreditlanadigan jismoniy yashiq yo'q.
 */
export interface DebtCashPaymentRow {
  method: string;
  cashDeskId: string | null;
  currency: string;
  /** HAR DOIM qarz valyutasida (`DebtPayment.amountMinor` sxema izohi). */
  amountMinor: bigint;
  /** Mijoz HAQIQATDA bergan summa, `currency` valyutasida (USD → sent). */
  amountOriginalMinor?: bigint | null;
}

/**
 * `deskCurrency` uchun sentinel: **kassa KO'RSATILMAGAN**.
 *
 * `debtCashDeskDeltas` `cashDeskId` yo'q bo'lgan holatda BIRINCHI shartda `[]`
 * qaytaradi, ya'ni bu qiymat solishtirishga hech qachon yetib bormaydi. Bo'sh
 * satr ATAYLAB: `CashDesk.currency` — `@db.VarChar(3)` va hech qachon bo'sh
 * bo'lolmaydi, demak qo'riqchi buzilib qolsa ham bu sentinel yolg'ondan «mos
 * keldi» bermaydi (fail-safe: daftarga noto'g'ri yozuvdan ko'ra yozmaslik).
 *
 * Ilgari chaqiruvchilar bu joyga `'UZS'` / `DEBT_LEDGER_CURRENCY` yozardi — bu
 * semantik xato edi: QARZ DAFTARI valyutasi (`DebtPayment.amountMinor` qaysi
 * valyutada yuritilishi) YASHIQ valyutasi bilan bir narsa emas.
 */
export const NO_CASH_DESK_CURRENCY = '';

export interface DebtCashDeltaOptions {
  /** `1n` — to'lov qabul qilindi · `-1n` — storno. */
  sign: 1n | -1n;
  /** `debtLedgerDocumentId` bergan qiymat. */
  documentId: string;
  /**
   * 🔴 YASHIQNING valyutasi (`CashDesk.currency`). MAJBURIY.
   *
   * `CashDesk.balanceMinor` — BITTA valyutadagi qoldiq va
   * `MoneyService.applyDeltas` boshqa valyutali deltani «Currency mismatch»
   * bilan RAD ETADI. Ilgari bu yerda to'lov valyutasi ko'r-ko'rona uzatilardi
   * ⇒ dollar qarz to'lovi HAR DOIM 400 bilan yiqilardi va butun tranzaksiya
   * orqaga qaytardi (kassir dollarni qabul qila olmasdi).
   *
   * Qaror `retail-sale.service.ts:1165-1172` bilan AYNI: chet valyutadagi naqd
   * bu daftarga TUSHMAYDI — u smena hisobida (`CashierSession.*CashUsdMinor`,
   * `collectUsdCashInputs`) yuritiladi.
   */
  deskCurrency: string;
  counterpartyId?: string;
  description?: string;
}

/**
 * Daftardagi hujjat havolasi: POS to'lovida PKO CHEKI (`batchId`), qolganda
 * to'lov qatorining o'zi.
 *
 * NEGA: POS'da mijoz bitta summa beradi, u FIFO bo'yicha N qarzga bo'linadi —
 * yashiqqa esa BITTA harakat tushadi va u chekka bog'lanadi. Storno bir
 * qatorni qaytarsa, teskari harakat AYNAN o'sha chek ostiga tushishi kerak,
 * aks holda kredit va debet daftarda bir-biriga ulanmay qoladi.
 */
export function debtLedgerDocumentId(payment: { id: string; batchId?: string | null }): string {
  return payment.batchId ?? payment.id;
}

/**
 * Bu to'lov uchun kassa daftariga YOZUV TUSHGANMI? (Faza 11 migratsiya-qo'riqchisi)
 *
 * Faza 11'gacha naqd qarz to'lovi yashiqni umuman kreditlamagan. Prod bazada
 * shunday YUZLAB qator bor. Ularning birini bugun storno qilsak, hech qachon
 * kirmagan pulni yashiqdan chiqarib yuborardik: qoldiq noto'g'ri kamayadi,
 * yomon holatda overdraft qo'riqchisi stornoni 400 bilan BLOKLAYDI (operator
 * xato to'lovni qaytara olmay qoladi).
 *
 * Shuning uchun teskari harakat FAQAT mos kredit topilsa yoziladi. Yangi
 * to'lovlar uchun bu doim rost, eskilar uchun doim yolg'on — daftar o'zi
 * o'zining chegarasini biladi, sana yoki migratsiya bayrog'i kerak emas.
 */
export async function debtCashLedgerWasWritten(
  tx: Prisma.TransactionClient,
  accountId: string,
  payment: { id: string; batchId?: string | null; cashDeskId: string | null },
): Promise<boolean> {
  if (!payment.cashDeskId) return false;
  const row = await tx.moneyOperation.findFirst({
    where: {
      accountId,
      documentKind: 'debtpayment',
      documentId: debtLedgerDocumentId(payment),
      cashDeskId: payment.cashDeskId,
      deltaMinor: { gt: 0n },
    },
    select: { id: true },
  });
  return row !== null;
}

export function debtCashDeskDeltas(
  payment: DebtCashPaymentRow,
  { sign, documentId, deskCurrency, counterpartyId, description }: DebtCashDeltaOptions,
): MoneyDelta[] {
  if (payment.method !== 'cash' || !payment.cashDeskId) return [];
  // Yashiq bitta valyutali — mos kelmasa bu daftar bu pulni umuman ko'rmaydi.
  if (payment.currency !== deskCurrency) return [];

  // Tortmaga tushgan JISMONIY pul: mijoz dollar bergan bo'lsa yashiqda dollar
  // yotadi, so'm ekvivalenti emas (`amountMinor` — qarz hisobi uchun).
  const physicalMinor = payment.amountOriginalMinor ?? payment.amountMinor;
  if (physicalMinor === 0n) return [];

  return [
    {
      sourceKind: 'cash_desk',
      sourceId: payment.cashDeskId,
      deltaMinor: physicalMinor * sign,
      currency: payment.currency,
      documentKind: 'debtpayment',
      documentId,
      counterpartyId,
      description,
      // `allowNegative` ATAYLAB berilmaydi: bank hisobidan farqli, kassa
      // qoldig'i har doim shu daftardan yig'ilgan va yashiqdan yo'q pulni
      // chiqarib bo'lmaydi — overdraft qo'riqchisi shu yerda o'rinli.
    },
  ];
}
