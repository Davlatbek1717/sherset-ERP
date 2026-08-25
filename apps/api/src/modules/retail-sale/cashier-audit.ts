/**
 * Kassa TZ §9 — what a POS action leaves behind in `CashierAuditEvent`.
 *
 * The owner's model is «kassirga ishonch + keyingi nazorat»: the cashier may
 * type any price, sell below cost, cancel and refund freely, and NONE of it is
 * blocked (Q8/Q11/Q16). This module is the other half — it decides, from facts
 * the server already holds, which of those freedoms actually got used.
 *
 * Pure on purpose. The decision «was this below cost» is exactly the kind of
 * rule that must be unit-testable without a Prisma mock, and exactly the kind
 * that would rot if it lived inline in a 1000-line service.
 *
 * Two invariants run through everything here:
 *
 *  1. **The server decides, not the client.** Cost, retail and wholesale all
 *     come from the product card as read on the server. A POS that reported its
 *     own «this was below cost» flag could simply not report it — the audit
 *     trail would then be written by the person it audits.
 *
 *  2. **An unknown price raises no event.** A missing cost is `null`, never 0
 *     (see `price-snapshot.ts`). Treating it as 0 would file every sale of a
 *     card-less product as a below-cost sale, and a log full of false alarms
 *     gets ignored — which is the same as having no log.
 */

import { scaleMinorByQty } from '@moysklad/money';

/** Money crosses the JSON boundary as a decimal string: BigInt is not JSON-safe. */
type MinorString = string;

export const CASHIER_EVENT = {
  priceChanged: 'PRICE_CHANGED',
  soldBelowWholesale: 'SOLD_BELOW_WHOLESALE',
  soldBelowCost: 'SOLD_BELOW_COST',
  saleCancelled: 'SALE_CANCELLED',
  refund: 'REFUND',
  shiftOutOfSchedule: 'SHIFT_OUT_OF_SCHEDULE',
  soldOnCredit: 'SOLD_ON_CREDIT',
  /**
   * A2 (2026-08-25) — chek mijozning AVANSIDAN to'landi. Kassa yashig'iga
   * pul kirmagani uchun bu amal `MoneyOperation` lentasida KO'RINMAYDI:
   * yagona izi shu hodisa va `RetailSalePayment` ning `PREPAY` qatori.
   * A1 ning kirim tomonidagi `CUSTOMER_PREPAY` hodisasi bilan juftlik.
   */
  paidFromPrepay: 'PAID_FROM_PREPAY',
  // G2 (2026-08-24) — kontrol oqimi: katta omborchi yig'ilgan chekni ko'z
  // bilan tekshirib «To'liq» dedi yoki tarkibini o'zgartirdi. `employeeId`
  // ustuni «KIM tekshirgani chek tarixida qolsin» talabini beradi.
  controlApproved: 'CONTROL_APPROVED',
  controlEdited: 'CONTROL_EDITED',
} as const;

export type CashierEventType = (typeof CASHIER_EVENT)[keyof typeof CASHIER_EVENT];

export interface CashierAuditEventInput {
  type: CashierEventType;
  docId: string | null;
  payload: Record<string, unknown>;
}

/** One sold line, with the floors resolved server-side. NULL = card has no such price. */
export interface AuditLineInput {
  productId: string;
  productName?: string | null;
  /**
   * Quantity as the raw decimal string from the row (scale 6 in the schema).
   * NOT a bigint: rounding it to whole units here would under-report the loss
   * on anything sold by weight or length, and the loss amount is the number the
   * owner reads first.
   */
  quantity: string;
  /** Price per unit actually charged, before any cart-level discount. */
  priceMinor: bigint;
  costMinor: bigint | null;
  basePriceMinor: bigint | null;
  wholesaleMinor: bigint | null;
}

function line(l: AuditLineInput): Record<string, unknown> {
  return {
    productId: l.productId,
    ...(l.productName ? { productName: l.productName } : {}),
    quantity: l.quantity,
    priceMinor: l.priceMinor.toString() satisfies MinorString,
  };
}

/**
 * Percent the price sits below the card's retail tier, one decimal, as a
 * number. Positive = discounted. Kept in BigInt until the last step so a large
 * receipt can't drift, and rounded rather than truncated (the same one-sided
 * error the cart had before browser QA).
 *
 * 🔴 `null` = kartada narx 0, ya'ni foiz ANIQLANMAGAN. Nolga bo'lish
 * `RangeError: Division by zero` otardi va u `post()` ichida ushlanmasdi —
 * 2026-08-16 da prodda kassirlar chekni yopa olmay qoldi (500). Prodda
 * chakana narxi qo'yilmagan 488 tovar bor, ya'ni bu chekka hol emas.
 * 0 qaytarish YARAMAYDI — u «chegirma yo'q» degan yolg'on bo'lardi.
 */
function discountPercent(basePriceMinor: bigint, priceMinor: bigint): number | null {
  if (basePriceMinor === 0n) return null;
  const diff = (basePriceMinor - priceMinor) * 1000n;
  const half = basePriceMinor / 2n;
  const rounded = diff >= 0n ? (diff + half) / basePriceMinor : (diff - half) / basePriceMinor;
  return Number(rounded) / 10;
}

/**
 * Events raised by posting a receipt.
 *
 * A single line can raise several: a price under both floors is both a
 * below-wholesale and a below-cost sale, and both are separately interesting —
 * one is «broke the negotiated floor», the other «we lost money». They are NOT
 * collapsed into a worst-case event, because the manager filters by type.
 */
export function planSaleAuditEvents(
  saleId: string,
  lines: ReadonlyArray<AuditLineInput>,
): CashierAuditEventInput[] {
  const events: CashierAuditEventInput[] = [];

  for (const l of lines) {
    // A price the cashier did not touch is not an event — only a real deviation
    // from the card is. Selling ABOVE the card price is reported too: it is
    // rarer, but it is still the cashier overriding the price list.
    if (l.basePriceMinor != null && l.priceMinor !== l.basePriceMinor) {
      // Foiz aniqlanmasa maydon UMUMAN qo'shilmaydi — o'quvchi
      // (`daily-kpi-drilldown.service.ts`) pul hissasini `diffMinor` dan
      // oladi, foiz esa faqat ko'rsatish uchun.
      const pct = discountPercent(l.basePriceMinor, l.priceMinor);
      events.push({
        type: CASHIER_EVENT.priceChanged,
        docId: saleId,
        payload: {
          ...line(l),
          basePriceMinor: l.basePriceMinor.toString(),
          diffMinor: (l.priceMinor - l.basePriceMinor).toString(),
          ...(pct != null ? { discountPercent: pct } : {}),
        },
      });
    }

    if (l.wholesaleMinor != null && l.priceMinor < l.wholesaleMinor) {
      events.push({
        type: CASHIER_EVENT.soldBelowWholesale,
        docId: saleId,
        payload: {
          ...line(l),
          wholesaleMinor: l.wholesaleMinor.toString(),
          belowByMinor: (l.wholesaleMinor - l.priceMinor).toString(),
        },
      });
    }

    if (l.costMinor != null && l.priceMinor < l.costMinor) {
      events.push({
        type: CASHIER_EVENT.soldBelowCost,
        docId: saleId,
        payload: {
          ...line(l),
          costMinor: l.costMinor.toString(),
          // The number the owner actually asks for: how much this line lost,
          // across the whole quantity, not per unit. Scaled through the shared
          // money primitive so a fractional quantity (weight, length) rounds
          // exactly the way the line total itself does.
          lossMinor: scaleMinorByQty(l.costMinor - l.priceMinor, l.quantity).toString(),
        },
      });
    }
  }

  return events;
}

/** Receipt cancelled. The stage matters: a cancelled `ready` receipt means the
 *  warehouse already picked the goods and someone has to put them back. */
export function planCancelAuditEvent(
  saleId: string,
  args: {
    stage: string;
    name: string;
    sumMinor: bigint;
    lines: ReadonlyArray<{ productId: string | null; quantity: string }>;
  },
): CashierAuditEventInput {
  return {
    type: CASHIER_EVENT.saleCancelled,
    docId: saleId,
    payload: {
      name: args.name,
      stage: args.stage,
      sumMinor: args.sumMinor.toString(),
      lineCount: args.lines.length,
      lines: args.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    },
  };
}

/** Refund issued. `docId` points at the MIRROR receipt (the document created),
 *  with the original carried in the payload — the mirror is what the money
 *  moved through. */
export function planRefundAuditEvent(
  refundSaleId: string,
  args: {
    originalId: string;
    originalName: string;
    sumMinor: bigint;
    cashMinor: bigint;
    cardMinor: bigint;
    lines: ReadonlyArray<{ productId: string; quantity: string; priceMinor: bigint }>;
  },
): CashierAuditEventInput {
  return {
    type: CASHIER_EVENT.refund,
    docId: refundSaleId,
    payload: {
      originalId: args.originalId,
      originalName: args.originalName,
      sumMinor: args.sumMinor.toString(),
      cashMinor: args.cashMinor.toString(),
      cardMinor: args.cardMinor.toString(),
      lines: args.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        priceMinor: l.priceMinor.toString(),
      })),
    },
  };
}

/**
 * Qarzga sotildi (kassa TZ §9). Kassir qarz berishda erkin (Q4) — limit
 * tekshiruvi yo'q — shuning uchun har holat izga tushadi.
 *
 * Payload'da mijozning YANGI balansi ham bor: «kimning qarzi tez o'sadi»
 * degan savolga javob berish uchun har hodisada o'sha ondagi holat kerak,
 * aks holda faqat hozirgi balansni ko'rib, o'sish tezligini bilib bo'lmaydi.
 */
export function planCreditSaleAuditEvent(
  saleId: string,
  args: {
    agentId: string;
    saleName: string;
    debtMinor: bigint;
    totalMinor: bigint;
    /** Qarz yozilgandan KEYINGI balans; noma'lum bo'lsa null. */
    newBalanceMinor: bigint | null;
  },
): CashierAuditEventInput {
  return {
    type: CASHIER_EVENT.soldOnCredit,
    docId: saleId,
    payload: {
      agentId: args.agentId,
      saleName: args.saleName,
      debtMinor: args.debtMinor.toString(),
      totalMinor: args.totalMinor.toString(),
      newBalanceMinor: args.newBalanceMinor == null ? null : args.newBalanceMinor.toString(),
    },
  };
}

/**
 * A2 — avansdan to'lov (kassa TZ §9 ruhida: yashiqqa tegmaydigan, lekin
 * mijozning puliga tegadigan har amal izga tushadi).
 *
 * Payload'da avansning OLDINGI va YANGI qoldig'i ham bor: «mijozning avansi
 * qayerga ketdi» degan savolga keyin faqat shu hodisalar zanjiri javob
 * beradi — pul daftarida (`/money`) bu amal umuman ko'rinmaydi.
 */
export function planPrepaySaleAuditEvent(
  saleId: string,
  args: {
    agentId: string;
    saleName: string;
    prepayMinor: bigint;
    totalMinor: bigint;
    /** Avans yeyilishidan OLDINGI balans; `null` = o'lchanmagan (qator yo'q). */
    balanceBeforeMinor: bigint | null;
    /** Avans yeyilgandan KEYINGI balans; noma'lum bo'lsa null. */
    newBalanceMinor: bigint | null;
  },
): CashierAuditEventInput {
  return {
    type: CASHIER_EVENT.paidFromPrepay,
    docId: saleId,
    payload: {
      agentId: args.agentId,
      saleName: args.saleName,
      prepayMinor: args.prepayMinor.toString(),
      totalMinor: args.totalMinor.toString(),
      balanceBeforeMinor:
        args.balanceBeforeMinor == null ? null : args.balanceBeforeMinor.toString(),
      newBalanceMinor: args.newBalanceMinor == null ? null : args.newBalanceMinor.toString(),
    },
  };
}

/** G2 — kontrol «To'liq»: chek KIM tomonidan tekshirilib tayyor deb topilgani.
 *  Stage har doim `picking` (FSM shuni talab qiladi) — payload'da holat emas,
 *  TARKIB turadi: keyin «nima tasdiqlangan edi» degan savolga javob shu. */
export function planControlApproveAuditEvent(
  saleId: string,
  args: {
    name: string;
    sumMinor: bigint;
    lines: ReadonlyArray<{ productId: string | null; quantity: string }>;
  },
): CashierAuditEventInput {
  return {
    type: CASHIER_EVENT.controlApproved,
    docId: saleId,
    payload: {
      name: args.name,
      sumMinor: args.sumMinor.toString(),
      lineCount: args.lines.length,
      lines: args.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    },
  };
}

/** G2 — kontrol tahriri: qaysi qatorlar o'chdi/kamaydi va summa qanday
 *  o'zgardi. Kassir keyin «nega summa boshqa» desa, javob shu yozuvda. */
export function planControlEditAuditEvent(
  saleId: string,
  args: {
    name: string;
    oldSumMinor: bigint;
    newSumMinor: bigint;
    removed: ReadonlyArray<{
      productId: string | null;
      productName: string | null;
      quantity: string;
    }>;
    changed: ReadonlyArray<{
      productId: string | null;
      productName: string | null;
      oldQuantity: string;
      quantity: string;
    }>;
  },
): CashierAuditEventInput {
  return {
    type: CASHIER_EVENT.controlEdited,
    docId: saleId,
    payload: {
      name: args.name,
      oldSumMinor: args.oldSumMinor.toString(),
      newSumMinor: args.newSumMinor.toString(),
      removed: args.removed.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
      })),
      changed: args.changed.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        oldQuantity: l.oldQuantity,
        quantity: l.quantity,
      })),
    },
  };
}

/** Shift opened outside its schedule. 2026-08-16 (egasi qarori): sabab endi
 *  IXTIYORIY — `reason: null` = «sababsiz ochildi», hodisaning o'zi esa doim
 *  yoziladi (menejer «kim qancha marta vaqtdan tashqari ochadi» hisoboti
 *  sababsiz ochilishlarni ham ko'rishi shart). */
export function planOutOfScheduleAuditEvent(
  sessionId: string,
  args: { smenaId: string; smenaName: string; reason: string | null },
): CashierAuditEventInput {
  return {
    type: CASHIER_EVENT.shiftOutOfSchedule,
    docId: sessionId,
    payload: { smenaId: args.smenaId, smenaName: args.smenaName, reason: args.reason },
  };
}
