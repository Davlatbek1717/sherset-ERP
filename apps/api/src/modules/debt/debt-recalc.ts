import type { Prisma } from '@moysklad/db';
import type {
  ApplyDeltaMeta,
  CounterpartyBalanceService,
} from '../counterparty-balance/counterparty-balance.service.js';
import type { DebtStatus } from './debt.schema.js';

/**
 * Qarz denormalizatsiyasini QAYTA HISOBLASH — YAGONA kanonik yo'l.
 *
 * NEGA ALOHIDA MODUL (2026-08-08, `DUP-07`): bu mantiq ilgari faqat
 * `DebtService`ning private metodi edi, POS qarz-to'lovi esa o'zining
 * qisqartirilgan nusxasini ishlatardi (`paidMinor`ni increment bilan yozar,
 * `closedAt`ni umuman yozmasdi). Ikki nusxa darhol bir-biridan uzoqlashdi.
 * Endi ikkala yo'l ham shu funksiyani chaqiradi.
 *
 * ⚠️ `paidMinor` HAR DOIM to'lovlar yig'indisidan QAYTA O'QILADI (increment
 * emas): shu bilan denormalizatsiya haqiqatdan hech qachon ajralib qolmaydi —
 * storno qilingan to'lov, qo'lda tuzatish yoki parallel to'lov bo'lsa ham.
 */
export function deriveDebtStatus(totalMinor: bigint, paidMinor: bigint): DebtStatus {
  if (paidMinor >= totalMinor) return 'paid';
  if (paidMinor > 0n) return 'partial';
  return 'unpaid';
}

export interface RecalcDebtParams {
  accountId: string;
  debtId: string;
  /**
   * Keyingi aloqa sanasi. `undefined` ⇒ TEGILMAYDI (POS to'lovi jadvalni
   * o'zgartirmaydi); qarz to'liq yopilsa har holda `null`ga tushadi (§3.6).
   */
  nextContactAt?: Date | null;
  /**
   * Balans jurnalida (`CounterpartyBalanceEntry`) qaysi hujjat harakatga sabab
   * bo'lganini ko'rsatadi. Faza 9'dan beri MAJBURIY — recalc'ning balans
   * deltasi jurnalda hujjat-identifikatorisiz qolmasligi kerak.
   */
  meta: ApplyDeltaMeta;
}

export async function recalcDebt(
  tx: Prisma.TransactionClient,
  balances: Pick<CounterpartyBalanceService, 'applyDelta'>,
  { accountId, debtId, nextContactAt, meta }: RecalcDebtParams,
) {
  // QAYTARILGAN (reversedAt != null) to'lovlar yig'indiga KIRMAYDI (2026-07-16
  // storno) — shu bitta filtr orqali status/qoldiq/balans o'z-o'zidan tuzaladi.
  const agg = await tx.debtPayment.aggregate({
    where: { accountId, debtId, reversedAt: null },
    _sum: { amountMinor: true },
  });
  const paid = agg._sum.amountMinor ?? 0n;

  const debt = await tx.debt.findFirstOrThrow({
    where: { id: debtId, accountId },
    select: { totalMinor: true, paidMinor: true, currency: true, counterpartyId: true },
  });

  // 2026-07-13: qarz to'lovi KONTRAGENT BALANSINI ham kamaytiradi — mijoz
  // kartochkasidagi «Balans (bizga qarz)» qarz yopilganda 0 ga tushsin.
  // Delta = YANGI to'langan − ESKI to'langan (idempotent: recalc qayta
  // chaqirilsa qo'sha ketmaydi). Balans musbat = mijoz bizga qarzdor,
  // shuning uchun to'lov MANFIY delta. Valyuta — QARZNING valyutasi (to'lov
  // boshqa valyutada qabul qilingan bo'lsa ham qarz hisobi o'zinikida yuriladi).
  const paidDelta = paid - debt.paidMinor;
  if (paidDelta !== 0n) {
    await balances.applyDelta(tx, accountId, debt.counterpartyId, debt.currency, -paidDelta, meta);
  }

  const status = deriveDebtStatus(debt.totalMinor, paid);
  const closed = status === 'paid';

  return tx.debt.update({
    where: { id: debtId },
    data: {
      paidMinor: paid,
      status,
      // §3.6 — to'liq yopilganda keyingi aloqa sanasi kerak emas.
      nextContactAt: closed ? null : (nextContactAt ?? undefined),
      closedAt: closed ? new Date() : null,
    },
  });
}
