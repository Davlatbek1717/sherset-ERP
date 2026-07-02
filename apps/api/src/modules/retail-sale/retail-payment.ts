/**
 * Retail-sale payment split — pure, exact BigInt money math.
 *
 * Faithfully extracted from RetailSaleService.post() (the inline
 * cash+card / insufficient / change block) so the mixed-payment money
 * rule is adversarially tested, not just asserted "by construction"
 * (the §101/§105 pattern). Behaviour is byte-identical to the original
 * inline logic — same insufficient rule, same change formula.
 *
 * Mixed payment: a sale can be settled cash-only, card-only, terminal-only,
 * or any combination. `paid = cash + card + terminal` must cover `total`;
 * the excess is change (cash drawer gives change). All tiyin (BigInt) — no
 * float, so 33_33 + 66_67 == 100_00 exactly, at any magnitude.
 *
 * Invariants (proven in retail-payment.test.ts):
 *  1. paid === cash + card + terminal, exact (incl. past Number.MAX_SAFE_INTEGER).
 *  2. paid < total ⇒ insufficient (rejected); never silently posts an
 *     underpaid sale.
 *  3. paid >= total ⇒ change === paid − total, exact (0 when exact).
 *  4. negative cash/card/terminal/total ⇒ rejected (defensive; the Zod schema
 *     already enforces `^\d+$` upstream, but the pure fn is total).
 */

export interface RetailPaymentInput {
  cashMinor: bigint;
  cardMinor: bigint;
  terminalMinor: bigint;
  totalMinor: bigint;
}

export type RetailPaymentResult =
  | { ok: true; paidMinor: bigint; changeMinor: bigint }
  | { ok: false; reason: 'insufficient'; paidMinor: bigint; totalMinor: bigint }
  | { ok: false; reason: 'negative-input' };

export function computeRetailPayment(i: RetailPaymentInput): RetailPaymentResult {
  if (i.cashMinor < 0n || i.cardMinor < 0n || i.terminalMinor < 0n || i.totalMinor < 0n) {
    return { ok: false, reason: 'negative-input' };
  }
  const paidMinor = i.cashMinor + i.cardMinor + i.terminalMinor;
  if (paidMinor < i.totalMinor) {
    return { ok: false, reason: 'insufficient', paidMinor, totalMinor: i.totalMinor };
  }
  return { ok: true, paidMinor, changeMinor: paidMinor - i.totalMinor };
}
