import type { CounterpartyBalanceChangeSource } from '../hr/hr-shared/hr-events.types.js';
import { formatMinor } from '../hr/hr-telegram-bridge/template-render.util.js';

/**
 * Pure, Telegram-free message builders for the COUNTERPARTY-facing debt/payment
 * notices. Unlike {@link ./debt-notify.util.ts} (which addresses the OWNER via
 * the Bot API in Markdown), these are addressed to the counterparty themselves
 * and delivered plain-text over the MTProto outbox (admin account → the
 * counterparty's chat). No Markdown: the MTProto worker sends plain text, so we
 * neither escape nor style the name.
 *
 * Direction / source → wording:
 *   - paymentIn | cashIn (they paid us)  → "to'lovingiz qabul qilindi …
 *     Qolgan qarz: …"  (a receipt, regardless of the resulting balance sign).
 *   - any other source, then by resulting balance:
 *       newBalance > 0 (they owe us)   → "Sherset'ga … qarzingiz bor."
 *       newBalance < 0 (we owe them)   → "Sherset sizga … qarzdor — tez orada
 *                                         to'lanadi."
 *       newBalance === 0               → null (nothing to tell them).
 *
 * All amounts are abs()'d and rendered in so'm (or the ISO code for non-UZS).
 */

/** Render a signed tiyin amount as an absolute so'm/currency string. */
function fmtAmount(minor: bigint, currency: string): string {
  const abs = minor < 0n ? -minor : minor;
  const unit = currency === 'UZS' ? "so'm" : currency;
  return `${formatMinor(abs)} ${unit}`;
}

export interface CounterpartyMessageContext {
  /** Counterparty display name (raw; used verbatim — plain text). */
  name: string;
  /** ISO-3 currency of the moved balance row. */
  currency: string;
  /** Pre-signed delta applied (sign per applyDelta convention). */
  deltaMinor: bigint;
  /** Balance after applying the delta (positive = they owe us). */
  newBalanceMinor: bigint;
  /** Which document moved the balance. */
  source: CounterpartyBalanceChangeSource;
}

/** 🧾 They paid us (paymentIn / cashIn) — a payment receipt with remaining debt. */
export function buildCounterpartyPaymentText(ctx: CounterpartyMessageContext): string {
  return `Hurmatli ${ctx.name}, to'lovingiz qabul qilindi: ${fmtAmount(ctx.deltaMinor, ctx.currency)}. Qolgan qarz: ${fmtAmount(ctx.newBalanceMinor, ctx.currency)}.`;
}

/** They owe us (newBalance > 0). */
export function buildCounterpartyOwesUsText(ctx: CounterpartyMessageContext): string {
  return `Hurmatli ${ctx.name}, Sherset'ga ${fmtAmount(ctx.newBalanceMinor, ctx.currency)} qarzingiz bor.`;
}

/** We owe them (newBalance < 0). */
export function buildWeOweCounterpartyText(ctx: CounterpartyMessageContext): string {
  return `Hurmatli ${ctx.name}, Sherset sizga ${fmtAmount(ctx.newBalanceMinor, ctx.currency)} qarzdor — tez orada to'lanadi.`;
}

/**
 * Pick + build the right counterparty-facing message, or return null when
 * there is nothing meaningful to tell them (a non-payment change that lands on
 * a zero balance). A payment (paymentIn/cashIn) is always acknowledged, even if
 * it clears the balance to zero ("Qolgan qarz: 0 so'm.").
 */
export function buildCounterpartyMessage(ctx: CounterpartyMessageContext): string | null {
  if (ctx.source === 'paymentIn' || ctx.source === 'cashIn') {
    return buildCounterpartyPaymentText(ctx);
  }
  if (ctx.newBalanceMinor > 0n) return buildCounterpartyOwesUsText(ctx);
  if (ctx.newBalanceMinor < 0n) return buildWeOweCounterpartyText(ctx);
  return null;
}
