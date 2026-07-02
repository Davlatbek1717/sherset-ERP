/**
 * Retail-sale ↔ loyalty integration — pure decision logic (§109).
 *
 * §108 found the gap: loyalty.service has the API (computeEarnedPoints
 * pure + createOperation EARNING/SPENDING) but RetailSale.post()/
 * refund() never call it. This module is the pure, adversarially-tested
 * DECISION layer (the §101/§105/§107 pattern); the service does the IO
 * via the injected LoyaltyService's existing public methods only
 * (loyalty module is NOT edited — DO NOT respected).
 *
 * `bonusValue` is an integer POINT count (BonusOperation.bonusValue Int),
 * NOT tiyin — points are whole units, never fractional money.
 *
 * Invariants (proven in retail-loyalty.test.ts):
 *  1. accrual is SKIPPED when there is no customer (agentId null — a
 *     walk-in sale earns nothing), no active program, or 0 earned
 *     points. Never a 0-value / orphan bonus op.
 *  2. accrual points come from loyalty's own pure computeEarnedPoints
 *     (not re-implemented here) → single source of truth.
 *  3. refund REVERSES THE EXACT recorded earned value (the §105
 *     discipline — reverse what was applied, never recompute; a
 *     program-rule change between sale and return must not change the
 *     clawback). Reversal is null when nothing was earned.
 */

export interface LoyaltyAccrualContext {
  /** The sale's customer Counterparty, or null for an anonymous sale. */
  agentId: string | null;
  /** The account's selected active bonus program, or null if none. */
  program: { id: string; earnRateRulesJson: unknown } | null;
  /** The posted sale total in tiyin (BigInt). */
  saleSumMinor: bigint;
}

export interface LoyaltyAccrualPlan {
  agentId: string;
  bonusProgramId: string;
  /** Whole points to EARN (always > 0 when a plan is returned). */
  points: number;
}

/**
 * Decide whether/what to accrue. `computeEarned` is loyalty.service's
 * pure `computeEarnedPoints` (injected so this stays pure + faithful —
 * the points formula is loyalty's, not duplicated here).
 */
export function planLoyaltyAccrual(
  ctx: LoyaltyAccrualContext,
  computeEarned: (program: { earnRateRulesJson: unknown }, amountMinor: bigint) => number,
): LoyaltyAccrualPlan | null {
  if (!ctx.agentId || !ctx.program) return null;
  const points = computeEarned(ctx.program, ctx.saleSumMinor);
  if (!Number.isFinite(points) || points <= 0) return null;
  return { agentId: ctx.agentId, bonusProgramId: ctx.program.id, points };
}

/**
 * Decide the refund clawback. `earnedOp` is the original sale's
 * recorded EARNING op (or null if none / already reversed). Returns the
 * EXACT positive point count to claw back — the caller writes it as a
 * SPENDING / categoryType RETURN op with bonusValue = -points. Never
 * recomputes from program rules (rule could have changed; §105).
 */
export function planLoyaltyReversal(
  earnedOp: { bonusValue: number } | null,
): { points: number } | null {
  if (!earnedOp) return null;
  if (!Number.isFinite(earnedOp.bonusValue) || earnedOp.bonusValue <= 0) return null;
  return { points: earnedOp.bonusValue };
}
