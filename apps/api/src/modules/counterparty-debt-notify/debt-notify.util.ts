import type { CounterpartyBalanceChangeSource } from '../hr/hr-shared/hr-events.types.js';
import { formatMinor } from '../hr/hr-telegram-bridge/template-render.util.js';

/**
 * Pure, Telegram-free message builder for the OWNER-facing counterparty
 * debt/payment alerts. Side-effect-free so a unit test pins the exact Uzbek
 * wording without a bot; the notifier service handles I/O (name lookup + doc
 * lookup + Bot API) and delegates all text rendering here.
 *
 * Format redesign (2026-07-25, owner request: «aniqroq hisobot»): every message
 * is now a compact RECEIPT/REPORT — document title + date + number, WHO, how
 * much this operation moved (delta), and the resulting total («kim kimga
 * qarzdor»). InvoiceIn (we owe supplier) vs InvoiceOut (customer owes us) stay
 * separate headers. Date + number come from the source document (fetched by the
 * notifier from docType+docId); when unavailable those header parts are omitted.
 */

/** Absolute tiyin amount → "12 345 so'm" (UZS) / "12 345 USD" (other ISO). */
function fmtAmount(minor: bigint, currency: string): string {
  const abs = minor < 0n ? -minor : minor;
  return `${formatMinor(abs)} ${currency === 'UZS' ? "so'm" : currency}`;
}

/**
 * Escape the characters legacy Telegram Markdown treats as formatting, so a
 * counterparty name / doc number containing `_ * [ \`` cannot 400 the send.
 */
function escapeMd(s: string): string {
  return s.replace(/([_*[\]`])/g, '\\$1');
}

/** Document `moment` → "25.07.2026" (Asia/Tashkent), or '' when absent/invalid. */
function fmtDate(m?: Date | string | null): string {
  if (!m) return '';
  const d = typeof m === 'string' ? new Date(m) : m;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
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
  /** Source document number/name (e.g. "СЧ-2026-00123"); omitted from header if absent. */
  docNumber?: string | null;
  /** Source document date; omitted from header if absent. */
  docMoment?: Date | string | null;
}

const WARN_LINE = '⚠️ Diqqat: qarz belgilangan chegaradan oshdi.';

/** Per-source report title + the "this operation" amount line (owner framing). */
function ownerHead(
  source: CounterpartyBalanceChangeSource,
  amt: string,
): { title: string; amountLine: string } | null {
  switch (source) {
    case 'invoiceIn': // we received goods → we owe the supplier more
      return { title: 'Kirim (xarid)', amountLine: `📥 Qarzga tovar olindi: *${amt}*` };
    case 'invoiceOut': // we sold → the customer owes us more
      return { title: 'Sotuv', amountLine: `📤 Qarzga sotildi: *${amt}*` };
    case 'paymentOut':
    case 'cashOut': // we paid the counterparty
      return { title: "To'lov (chiqim)", amountLine: `💸 Biz to'ladik: *${amt}*` };
    case 'paymentIn':
    case 'cashIn': // the counterparty paid us
      return { title: "To'lov (kirim)", amountLine: `💵 Kontragent to'ladi: *${amt}*` };
    default:
      return null;
  }
}

/**
 * The unambiguous "who owes whom" total line. Sign convention (moysklad.uz):
 *   > 0 → counterparty owes us · < 0 → we owe the counterparty · 0 → settled.
 * `escapedName` is already Markdown-escaped by the caller.
 */
function ownerTotal(newBalanceMinor: bigint, escapedName: string, currency: string): string {
  const amt = fmtAmount(newBalanceMinor, currency);
  if (newBalanceMinor > 0n) return `💰 Jami: «${escapedName}» bizga ${amt} qarzdor`;
  if (newBalanceMinor < 0n) return `💰 Jami: biz «${escapedName}»ga ${amt} qarzdormiz`;
  return "💰 Jami: hisob teng (qarz yo'q)";
}

/**
 * Owner-facing Telegram report for a counterparty balance change, or null when
 * the source is not a real posting (reversals / rebalances leave source
 * unmatched ⇒ no owner alert).
 */
export function buildDebtMessage(ctx: DebtMessageContext): string | null {
  const head = ownerHead(ctx.source, fmtAmount(ctx.deltaMinor, ctx.currency));
  if (!head) return null;
  const name = escapeMd(ctx.name);
  const date = fmtDate(ctx.docMoment);
  const num = (ctx.docNumber || '').trim();

  const lines: string[] = [];
  // Report header: 📄 title — date · doc number
  let hdr = `📄 *${head.title}*`;
  if (date) hdr += ` — ${date}`;
  if (num) hdr += ` · №${escapeMd(num)}`;
  lines.push(hdr);
  lines.push(`👤 «${name}»`);
  lines.push(head.amountLine);
  lines.push(ownerTotal(ctx.newBalanceMinor, name, ctx.currency));
  if (ctx.overThreshold) lines.push(WARN_LINE);
  return lines.join('\n');
}
