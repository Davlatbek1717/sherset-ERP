import type { CounterpartyBalanceChangeSource } from '../hr/hr-shared/hr-events.types.js';
import { formatMinor } from '../hr/hr-telegram-bridge/template-render.util.js';

/**
 * Pure, Telegram-free message builders for the owner-facing counterparty
 * debt/payment alerts. Kept side-effect-free so a unit test can pin the exact
 * Uzbek wording without a bot. The notifier service handles I/O (Prisma name
 * lookup + Bot API fetch) and delegates all text rendering here.
 */

/** Render a signed tiyin amount as absolute so'm/currency string. */
function fmtAmount(minor: bigint, currency: string): string {
  const abs = minor < 0n ? -minor : minor;
  const unit = currency === 'UZS' ? "so'm" : currency;
  return `${formatMinor(abs)} ${unit}`;
}

/** Uzbek label for the document that moved the balance (debt-up case). */
function sourceLabel(source: CounterpartyBalanceChangeSource): string {
  switch (source) {
    case 'invoiceIn':
      return 'kirim';
    case 'invoiceOut':
      return 'sotuv';
    default:
      return source;
  }
}

/**
 * Escape the characters Telegram Markdown (legacy) treats as formatting, so a
 * counterparty name containing `_ * [ \`` cannot 400 the send. The admin
 * notifier does not escape; here names come straight from user data (supplier /
 * customer names), so we defend the send.
 */
function escapeMd(s: string): string {
  return s.replace(/([_*[\]`])/g, '\\$1');
}

export interface DebtMessageContext {
  /** Counterparty display name (raw; escaped internally). */
  name: string;
  /** ISO-3 currency of the moved balance row. */
  currency: string;
  /** Pre-signed delta applied (sign per applyDelta convention). */
  deltaMinor: bigint;
  /** Balance after applying the delta. */
  newBalanceMinor: bigint;
  /** Which document moved it. */
  source: CounterpartyBalanceChangeSource;
  /** True ⇒ append a ⚠️ warning line (abs(newBalance) over threshold). */
  overThreshold?: boolean;
}

const WARN_LINE = '⚠️ Diqqat: umumiy qarz belgilangan chegaradan oshdi.';

/** 🔴 Debt increased (invoiceIn / invoiceOut posting). */
export function buildDebtIncreasedText(ctx: DebtMessageContext): string {
  const name = escapeMd(ctx.name);
  let text =
    `🔴 *Qarz oshdi* — ${name}ga +${fmtAmount(ctx.deltaMinor, ctx.currency)} ` +
    `(${sourceLabel(ctx.source)}). Umumiy qarz: ${fmtAmount(ctx.newBalanceMinor, ctx.currency)}`;
  if (ctx.overThreshold) text += `\n${WARN_LINE}`;
  return text;
}

/** 🟢 We paid the counterparty (paymentOut / cashOut). */
export function buildPaymentOutText(ctx: DebtMessageContext): string {
  const name = escapeMd(ctx.name);
  let text =
    `🟢 *To'lov* — ${name}ga ${fmtAmount(ctx.deltaMinor, ctx.currency)} to'ladingiz. ` +
    `Qolgan: ${fmtAmount(ctx.newBalanceMinor, ctx.currency)}`;
  if (ctx.overThreshold) text += `\n${WARN_LINE}`;
  return text;
}

/** 🔵 Counterparty paid us (paymentIn / cashIn). */
export function buildPaymentInText(ctx: DebtMessageContext): string {
  const name = escapeMd(ctx.name);
  let text =
    `🔵 *Kontragent to'ladi* — ${name} ${fmtAmount(ctx.deltaMinor, ctx.currency)}. ` +
    `Qolgan: ${fmtAmount(ctx.newBalanceMinor, ctx.currency)}`;
  if (ctx.overThreshold) text += `\n${WARN_LINE}`;
  return text;
}

/**
 * Pick + build the right message for a balance change, or return null when the
 * source is not a "real" debt/payment posting (reversals / rebalances /
 * adjustments leave source undefined ⇒ no owner alert).
 */
export function buildDebtMessage(ctx: DebtMessageContext): string | null {
  switch (ctx.source) {
    case 'invoiceIn':
    case 'invoiceOut':
      return buildDebtIncreasedText(ctx);
    case 'paymentOut':
    case 'cashOut':
      return buildPaymentOutText(ctx);
    case 'paymentIn':
    case 'cashIn':
      return buildPaymentInText(ctx);
    default:
      return null;
  }
}
