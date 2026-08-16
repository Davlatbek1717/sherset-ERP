import type { ReceiptSaleInput } from './receipt-model';
import type { ReceiptPaymentRow } from './receipt-payments';

/**
 * QARZ TO'LOVI CHEKI → TOVAR CHEKI modeli (2026-08-16, egasi).
 *
 * Ilgari qarz cheki ALOHIDA «PKO» dizaynida edi va POS undan keyin
 * `window.open` bilan brauzer oynasi ochardi — kassa.exe'da chek ekranga
 * chiqib qolardi. Egasi talabi: chek tovar cheki shablonida bo'lsin va
 * to'lov tasdiqlanishi bilan JIM chop etilsin.
 *
 * Bu mapper server chekini (`GET /debts/pos/receipt/:batchId`) tayyor
 * `ReceiptSaleInput` ga o'giradi — shunda UCHALA mavjud renderer (ESC/POS
 * matn · Electron HTML · brauzer `TovarChek`) hech qanday yangi dizayn
 * kodisiz ishlayveradi (xotira: `ombor-chek-uch-renderer`). Farqlar
 * `variant: 'debtPayment'` orqali modelda hal bo'ladi: sarlavha
 * «QARZ TO'LOVI» va «Sizning qarzingiz» 0 bo'lsa ham chiziladi.
 */

/** `GET /debts/pos/receipt/:batchId` javobi (chek uchun kerakli qismi). */
export interface DebtReceiptPayload {
  batchId: string;
  counterparty: { id: string; name: string; phone: string | null } | null;
  organization: { name: string; legalTitle: string | null; phone?: string | null } | null;
  cashier: { id: string; name: string } | null;
  paidAt: string | null;
  method: string;
  currency: string;
  /** F6 — mijoz bergan ASL summa (USD → sent); so'm to'lovda `null`. */
  originalMinor: string | null;
  /** F6 — muzlatilgan kurs, kanonik ×10^8; so'm to'lovda `null`. */
  exchangeRate: string | null;
  paidMinor: string;
  outstandingAfterMinor: string;
  lines: Array<{ debtId: string; debtName: string; amountMinor: string; reversed: boolean }>;
}

/** Chekdagi qator nomi — tovar nomi o'rnida (egasi talabi, 2026-08-16). */
export const DEBT_ROW_NAME = "Qarz to'lovi";

export function debtReceiptToSaleInput(r: DebtReceiptPayload): ReceiptSaleInput {
  // Storno qilingan qator chekka KIRMAYDI: server `paidMinor` ni ham faqat
  // tirik qatorlardan yig'adi — qatorlar jamisi «Jami summa» bilan mos qolsin.
  const live = r.lines.filter((l) => !l.reversed);

  // To'lov qatori — savdo chekining o'z lug'ati/tartibi (`receiptPaymentLines`)
  // orqali chiziladi, shu yerda faqat kanal tanlanadi. USD'da kurs yo'q buzuq
  // qatorda `receiptPaymentLines` foreign'ni o'zi tushiradi — chek yo'qolmaydi.
  const isUsd = r.currency !== 'UZS';
  const payment: ReceiptPaymentRow = {
    method: r.method === 'terminal' ? 'TERMINAL' : isUsd ? 'CASH_USD' : 'CASH_UZS',
    amountMinor: isUsd ? (r.originalMinor ?? r.paidMinor) : r.paidMinor,
    currency: isUsd ? r.currency : 'UZS',
    rateMinor: isUsd ? r.exchangeRate : null,
    // 🔴 So'm ekvivalenti SERVERNIKI — FE kursdan qayta hisoblamaydi.
    amountBaseMinor: r.paidMinor,
  };

  return {
    variant: 'debtPayment',
    // Chek raqami — PKO chekidagi bilan bir xil qisqartma (qayta chop etishda
    // ham AYNI raqam ko'rinadi).
    name: r.batchId.slice(0, 8).toUpperCase(),
    moment: r.paidAt ?? '',
    sumMinor: r.paidMinor,
    payments: [payment],
    cashAmountMinor: '0',
    cardAmountMinor: '0',
    changeMinor: '0',
    description: null,
    agent: r.counterparty
      ? { id: r.counterparty.id, name: r.counterparty.name, legalTitle: null }
      : null,
    // «Sizning qarzingiz» — to'lovdan KEYINGI qoldiq. Chek moliyaviy hujjat:
    // qiymat server chekidan olinadi, qayta so'ralmaydi (reprint'da ham AYNI).
    debtAfterMinor: BigInt(r.outstandingAfterMinor || '0'),
    session: {
      cashier: { name: r.cashier?.name ?? '—' },
      organization: {
        name: r.organization?.name || (r.organization?.legalTitle ?? '—'),
        legalTitle: r.organization?.legalTitle ?? null,
        phone: r.organization?.phone ?? null,
      },
    },
    // Bir to'lov FIFO bo'yicha bir necha qarzga bo'linadi — har qarzga qancha
    // tushgani alohida qator (mijoz chekni tekshira oladi). Bitta qarzda
    // qavs shart emas: shunchaki «Qarz to'lovi».
    positions: live.map((l) => ({
      quantity: '1',
      priceMinor: l.amountMinor,
      sumMinor: l.amountMinor,
      product: {
        name: live.length > 1 ? `${DEBT_ROW_NAME} (${l.debtName})` : DEBT_ROW_NAME,
        uom: '—',
      },
    })),
  };
}
