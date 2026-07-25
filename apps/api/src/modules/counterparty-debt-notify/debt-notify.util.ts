import type { CounterpartyBalanceChangeSource } from '../hr/hr-shared/hr-events.types.js';
import { formatMinor } from '../hr/hr-telegram-bridge/template-render.util.js';

/**
 * Pure, Telegram-free message builder for the owner-facing counterparty
 * debt/payment alerts. Side-effect-free so a unit test pins the exact Uzbek
 * wording without a bot; the notifier service handles I/O (name lookup + Bot
 * API) and delegates all text rendering here.
 *
 * Wording redesign (2026-07-25, owner feedback: "tushunib bo'lmaydi"): the old
 * single "Qarz oshdi" line never said WHO owed WHOM. Every message is now
 * 3 lines — event+counterparty, amount, and an explicit `💰 Jami:` direction
 * line — and InvoiceIn (we owe supplier) vs InvoiceOut (customer owes us) are
 * separate headers ("Kirim" / "Sotuv") instead of one ambiguous "Qarz oshdi".
 */

/** Absolute tiyin amount → "12 345 so'm" (UZS) / "12 345 USD" (other ISO). */
function fmtAmount(minor: bigint, currency: string): string {
  const abs = minor < 0n ? -minor : minor;
  return `${formatMinor(abs)} ${currency === 'UZS' ? "so'm" : currency}`;
}

/**
 * Escape the characters legacy Telegram Markdown treats as formatting, so a
 * counterparty name containing `_ * [ \`` cannot 400 the send. Names come
 * straight from user data (supplier / customer names) → defend the send.
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

const WARN_LINE = '⚠️ Diqqat: qarz belgilangan chegaradan oshdi.';

/**
 * The unambiguous "who owes whom" total line. Sign convention (moysklad.uz):
 *   > 0 → counterparty owes us · < 0 → we owe the counterparty · 0 → settled.
 * `name` is already Markdown-escaped by the caller.
 */
function totalLine(newBalanceMinor: bigint, escapedName: string, currency: string): string {
  const amt = fmtAmount(newBalanceMinor, currency);
  if (newBalanceMinor > 0n) return `💰 Jami: «${escapedName}» bizga ${amt} qarzdor`;
  if (newBalanceMinor < 0n) return `💰 Jami: biz «${escapedName}»ga ${amt} qarzdormiz`;
  return "💰 Jami: hisob teng (qarz yo'q)";
}

/** First two lines (header + amount) per document source, or null if unknown. */
function headLines(
  source: CounterpartyBalanceChangeSource,
  name: string,
  amt: string,
): string[] | null {
  switch (source) {
    case 'invoiceIn': // we received goods → we owe the supplier more
      return [`📥 *Kirim* — «${name}»`, `Qarzga tovar olindi: *${amt}*`];
    case 'invoiceOut': // we sold → the customer owes us more
      return [`📤 *Sotuv* — «${name}»`, `Qarzga sotildi: *${amt}*`];
    case 'paymentOut':
    case 'cashOut': // we paid the counterparty
      return [`💸 *Biz to'ladik* — «${name}»`, `To'lov: *${amt}*`];
    case 'paymentIn':
    case 'cashIn': // the counterparty paid us
      return [`💵 *Kontragent to'ladi* — «${name}»`, `To'lov: *${amt}*`];
    default:
      return null;
  }
}

/**
 * Owner-facing Telegram message for a counterparty balance change, or null when
 * the source is not a real posting (reversals / rebalances leave source
 * unmatched ⇒ no owner alert).
 */
export function buildDebtMessage(ctx: DebtMessageContext): string | null {
  const name = escapeMd(ctx.name);
  const head = headLines(ctx.source, name, fmtAmount(ctx.deltaMinor, ctx.currency));
  if (!head) return null;
  const lines = [...head, totalLine(ctx.newBalanceMinor, name, ctx.currency)];
  if (ctx.overThreshold) lines.push(WARN_LINE);
  return lines.join('\n');
}
