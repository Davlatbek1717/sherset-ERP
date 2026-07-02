/**
 * Cashier-shift cash reconciliation — pure, exact BigInt money math.
 *
 * moysklad «Кассовая смена» close reconciliation. Until §100 the
 * expected-cash formula OMITTED drawer Внесение/Изъятие
 * (cashier-session.service close() ⇒ opening + salesCash − returnsCash),
 * so any mid-shift drawer cash-in/out produced a WRONG discrepancy
 * (false shortage/surplus). The correct formula is:
 *
 *   expectedCash = opening + salesCash + drawerIn − drawerOut − returnsCash
 *   discrepancy  = closingCash − expectedCash
 *
 * All values are tiyin (BigInt) — no floating point. Extracted as a pure
 * function so the money invariant is adversarially tested (the §74
 * pattern), not just asserted "by construction".
 *
 * Invariants (proven in cashier-session-reconciliation.test.ts):
 *  1. drawerIn raises expected by exactly drawerIn; drawerOut lowers it
 *     by exactly drawerOut (the §100 bug-fix invariant).
 *  2. drawerIn = drawerOut = 0n ⇒ formula === the old
 *     opening+sales−returns (byte-identical; zero regression).
 *  3. discrepancy = closing − expected, exact (sign = surplus/shortage).
 *  4. exact past Number.MAX_SAFE_INTEGER (BigInt); negative expected is
 *     allowed (over-withdrawal) and must NOT be clamped.
 */

export interface ShiftCashInputs {
  /** Cash float the drawer started the shift with. */
  openingCashMinor: bigint;
  /** Σ cash portion of posted retail sales in the shift. */
  salesCashMinor: bigint;
  /** Σ Внесение (drawer cash-in) during the shift. */
  drawerInMinor: bigint;
  /** Σ Изъятие (drawer cash-out) during the shift. */
  drawerOutMinor: bigint;
  /** Σ cash portion of posted refunds in the shift. */
  returnsCashMinor: bigint;
}

/** Cash that SHOULD be in the drawer at close. */
export function expectedCashMinor(i: ShiftCashInputs): bigint {
  return (
    i.openingCashMinor + i.salesCashMinor + i.drawerInMinor - i.drawerOutMinor - i.returnsCashMinor
  );
}

/**
 * closingCash − expectedCash. Positive = surplus (излишек),
 * negative = shortage (недостача). Never clamped.
 */
export function shiftDiscrepancyMinor(closingCashMinor: bigint, i: ShiftCashInputs): bigint {
  return closingCashMinor - expectedCashMinor(i);
}
