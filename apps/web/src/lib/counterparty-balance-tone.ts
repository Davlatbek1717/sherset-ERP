/**
 * Counterparty balance → colour tone — single source of truth.
 *
 * WHY THIS EXISTS (2026-08-08, owner decision)
 * The inline balance line under the «Контрагент» field on every document form
 * ({@link ../components/counterparty-balance-inline}) is read as a *risk
 * signal*, not as an accounting sign: the operator receiving goods
 * («Qabullar» / Supply) wants to see at a glance whether this counterparty is
 * carrying an open debt TO US. So the colouring answers exactly one question —
 * "does this counterparty owe us money?" — and nothing else:
 *
 *   balance > 0  → the counterparty OWES US  → `debt`  (red — open exposure)
 *   balance ≤ 0  → nothing owed to us        → `clear` (green — clean account;
 *                  covers both a zero balance and «мы должны» / we owe them)
 *
 * DELIBERATE NON-PARITY WITH MOYSKLAD — DO NOT "FIX" IN A PARITY AUDIT.
 * moysklad.uz colours the same line by accounting sign (нам должны = green,
 * мы должны = red). The owner explicitly asked for the inverted, risk-oriented
 * rule above and for it to apply on ALL document forms, not just Supply. The
 * TEXT of the line stays at full parity (label, «(нам должны)» / «(мы
 * должны)» qualifiers, money formatting) — only the colour deviates.
 *
 * Sign convention of the underlying value is moysklad's and is enforced
 * server-side in `counterparty-balance.service.ts`:
 *   positive → counterparty owes us · negative → we owe the counterparty.
 *
 * NOT for: document FSM states ({@link ./document-state-tone}), archived flags
 * ({@link ./archived-tone}), or generic money-sign colouring (profit/margin
 * columns keep their own ± semantics — a negative profit is bad, whereas a
 * negative balance here is fine).
 */

export type BalanceTone = 'debt' | 'clear';

/**
 * Resolve a counterparty balance (in minor units) to its colour tone.
 *
 * @param balanceMinor balance in minor units, moysklad sign convention
 *   (positive ⇒ the counterparty owes us)
 */
export function counterpartyBalanceTone(balanceMinor: bigint): BalanceTone {
  return balanceMinor > 0n ? 'debt' : 'clear';
}

/** Tailwind text-colour class per tone. Kept next to the rule so the two can't drift. */
export const BALANCE_TONE_CLASS: Record<BalanceTone, string> = {
  debt: 'text-[var(--ms-text-destructive)]',
  clear: 'text-[var(--ms-text-success,#15803d)]',
};

/** Convenience: balance → class in one step (what the UI actually calls). */
export function counterpartyBalanceToneClass(balanceMinor: bigint): string {
  return BALANCE_TONE_CLASS[counterpartyBalanceTone(balanceMinor)];
}
