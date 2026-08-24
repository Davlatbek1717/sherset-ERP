/**
 * Z-hisobot chek yorliqlari — TEST fikstura.
 *
 * Ishlab chiqarishda yorliqlar `useZReceiptLabels()` orqali i18n'dan keladi
 * (`pages.z_report.*`). Testda esa qiymatlar QAT'IY bo'lishi kerak — tarjima
 * o'zgarsa test yiqilmasin, chunki test tarjimani emas, NULL/0 mantig'ini
 * qulflaydi.
 *
 * ⚠️ Bu fayl `.test.ts` EMAS — vitest uni test sifatida yig'maydi.
 */

import type { ZReceiptLabels } from '../z-report-receipt';

export const Z_RECEIPT_LABELS_FIXTURE: ZReceiptLabels = {
  title: 'Z-HISOBOT',
  shiftNo: 'Smena',
  opened: 'Ochilgan',
  closed: 'Yopilgan',
  cashier: 'Kassir',
  tenders: "To'lov turlari",
  unconverted: "Kursi yo'q",
  summary: 'XULOSA',
  revenue: 'Tushum',
  receipts: 'Cheklar',
  avgReceipt: "O'rtacha chek",
  grossProfit: 'Yalpi foyda',
  discount: 'Chegirma',
  creditSold: 'Qarzga sotilgan',
  debtPaid: "Qarz to'lovlari",
  returns: 'Qaytarishlar',
  expense: 'Xarajatlar',
  collection: 'Inkassatsiya',
  returnPayout: 'Vozvrat puli',
  expenseByItem: 'Xarajat moddalari',
  expenseNoItem: '(moddasiz)',
  cashBlockUzs: 'NAQD (UZS)',
  cashBlockUsd: 'NAQD (USD)',
  opening: 'Ochilish qoldig‘i',
  expected: 'Kutilgan',
  counted: 'Sanalgan',
  variance: 'Farq',
  openingUsd: 'Ochilish qoldig‘i $',
  expectedUsd: 'Kutilgan $',
  countedUsd: 'Sanalgan $',
  varianceUsd: 'Farq $',
  notCounted: 'sanalmagan',
  notMeasured: "o'lchanmagan",
  unknown: '—',
  noVariance: "farq yo'q",
  shortage: 'kamomad',
  surplus: 'ortiqcha',
  pcs: 'dona',
  tender: {
    CASH_UZS: 'Naqd (so‘m)',
    CASH_USD: 'Naqd ($)',
    CARD: 'Karta',
    TERMINAL: 'Terminal',
    DEBT: 'Qarz',
  },
};
