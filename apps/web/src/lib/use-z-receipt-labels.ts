'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ZReceiptLabels } from './z-report-receipt';

/**
 * Z-hisobot chekining yorliqlari — i18n'dan (`pages.z_report.*`).
 *
 * NEGA HOOK, sof modul ichida emas: `z-report-receipt.ts` ataylab SOF
 * (React'siz, i18n'siz) — uni Node testida ham, print-agent yo'lida ham
 * chaqirish mumkin. Yorliqlar esa React kontekstidan keladi. Ikkisini
 * ajratmasak, chek modelini test qilish uchun NextIntl provayderi kerak
 * bo'lardi.
 *
 * Ikki chaqiruvchi (chop sahifasi va `/sotuv` dagi «chop etish» tugmasi)
 * AYNAN shu yerdan oladi — yorliqlar ikki joyda ayri-ayri yozilsa, ular
 * vaqt o'tib bir-biridan uzoqlashardi.
 */
export function useZReceiptLabels(): ZReceiptLabels {
  const t = useTranslations('pages.z_report');
  const tp = useTranslations('pages.z_report.print');
  const tt = useTranslations('pages.z_report.print.tender');

  return useMemo<ZReceiptLabels>(
    () => ({
      title: tp('title'),
      shiftNo: tp('shift_no'),
      opened: tp('opened'),
      closed: tp('closed'),
      cashier: tp('cashier'),
      tenders: tp('tenders'),
      unconverted: tp('unconverted'),
      summary: tp('summary'),
      revenue: t('revenue'),
      receipts: t('receipts'),
      avgReceipt: t('avg_receipt'),
      grossProfit: t('gross_profit'),
      discount: t('discount'),
      creditSold: t('credit_sold'),
      debtPaid: t('debt_paid'),
      returns: t('returns'),
      expense: t('expense'),
      collection: t('collection'),
      returnPayout: t('return_payout'),
      prepay: t('prepay'),
      prepaySpent: t('prepay_spent'),
      prepayRefund: t('prepay_refund'),
      expenseByItem: t('expense_by_item'),
      expenseNoItem: t('expense_no_item'),
      cashBlockUzs: tp('cash_block_uzs'),
      cashBlockUsd: tp('cash_block_usd'),
      opening: tp('opening'),
      expected: tp('expected'),
      counted: tp('counted'),
      variance: tp('variance'),
      openingUsd: tp('opening_usd'),
      expectedUsd: tp('expected_usd'),
      countedUsd: tp('counted_usd'),
      varianceUsd: tp('variance_usd'),
      notCounted: tp('not_counted'),
      notMeasured: tp('not_measured'),
      unknown: tp('unknown'),
      noVariance: tp('no_variance'),
      shortage: t('shortage'),
      surplus: t('surplus'),
      pcs: tp('pcs'),
      // To'lov turi kodlari — `retail-tenders.ts#TENDER` bilan bir xil.
      // Noma'lum kod kelsa chek modeli kodning o'zini chiqaradi (jim
      // yo'qotmaydi).
      tender: {
        CASH_UZS: tt('CASH_UZS'),
        CASH_USD: tt('CASH_USD'),
        CARD: tt('CARD'),
        TERMINAL: tt('TERMINAL'),
        ACCOUNT: tt('ACCOUNT'),
        DEBT: tt('DEBT'),
      },
    }),
    [t, tp, tt],
  );
}
