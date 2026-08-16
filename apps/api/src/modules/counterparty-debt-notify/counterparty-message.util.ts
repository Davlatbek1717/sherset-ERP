import type { CounterpartyBalanceChangeSource } from '../hr/hr-shared/hr-events.types.js';
import { formatMinor } from '../hr/hr-telegram-bridge/template-render.util.js';

/**
 * Pure, Telegram-free message builder for the COUNTERPARTY-facing debt/payment
 * notices. Unlike {@link ./debt-notify.util.ts} (owner, Markdown), these are
 * addressed to the counterparty themselves and delivered plain-text over the
 * MTProto outbox (admin account → the counterparty's chat). No Markdown: the
 * MTProto worker sends plain text, so we neither escape nor style the name.
 *
 * Format redesign (2026-07-25, owner request «aniqroq hisobot»): a compact
 * receipt/report — document title + date + number, how much THIS operation
 * moved (added to the debt / paid), and the resulting total. Date + number come
 * from the source document; when unavailable those header parts are omitted.
 */

/** Render a signed tiyin amount as an absolute so'm/currency string. */
function fmtAmount(minor: bigint, currency: string): string {
  const abs = minor < 0n ? -minor : minor;
  const unit = currency === 'UZS' ? "so'm" : currency;
  return `${formatMinor(abs)} ${unit}`;
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
  /** Source document number/name; omitted from header if absent. */
  docNumber?: string | null;
  /** Source document date; omitted from header if absent. */
  docMoment?: Date | string | null;
}

/** Per-source report title + the "this operation" amount line (counterparty framing). */
function cpHead(
  source: CounterpartyBalanceChangeSource,
  amt: string,
  /** `true` ⇒ delta manfiy: mijozning qarzi KAMAYDI. */
  isDecrease: boolean,
): { title: string; amountLine: string } | null {
  switch (source) {
    case 'invoiceOut': // we sold to them → their debt to us grew
      return { title: 'Sotuv', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    case 'invoiceIn': // we bought from them → we owe them more
      return { title: 'Qabul (mahsulot)', amountLine: `📦 Mahsulot summasi: ${amt}` };
    case 'paymentIn':
    case 'cashIn': // they paid us
      return { title: "To'lov", amountLine: `✅ To'lovingiz qabul qilindi: ${amt}` };
    case 'paymentOut':
    case 'cashOut': // we paid them
      return { title: "To'lov (bizdan)", amountLine: `💸 Bizning to'lovimiz: ${amt}` };
    // ── Kassa oqimi (2026-08-16) — bitta manba, ikki yo'nalish ─────────────
    // Qaytarish/bekor uchun ALOHIDA manba turi ATAYLAB kiritilmadi: yo'nalish
    // `deltaMinor` ishorasida allaqachon bor, ikkinchi tur esa har yozuvchida
    // «qaysi turni tanlayman?» degan yangi xato manbaini ochardi.
    case 'retailsale':
      return isDecrease
        ? { title: 'Qaytarish', amountLine: `↩️ Qarzingizdan ayirildi: ${amt}` }
        : { title: 'Kassa savdosi', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    case 'debtpayment':
      return { title: "Qarz to'lovi", amountLine: `✅ To'lovingiz qabul qilindi: ${amt}` };
    case 'debt':
      return isDecrease
        ? { title: 'Qarz tuzatildi', amountLine: `↩️ Qarzingizdan ayirildi: ${amt}` }
        : { title: 'Qarz', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    default:
      return null;
  }
}

/** Resulting-total line from the counterparty's own perspective. */
function cpTotal(newBalanceMinor: bigint, currency: string, isPayment: boolean): string {
  const amt = fmtAmount(newBalanceMinor, currency);
  if (newBalanceMinor > 0n) {
    return `💰 ${isPayment ? 'Qolgan qarzingiz' : 'Jami qarzingiz'}: ${amt}`;
  }
  if (newBalanceMinor < 0n) return `💰 Sizga qarzimiz: ${amt} — tez orada to'lanadi`;
  return "💰 Hisob teng — qarzingiz yo'q";
}

/**
 * Pick + build the right counterparty-facing report, or return null when there
 * is nothing meaningful to tell them (a non-payment change that lands on a zero
 * balance). A payment is always acknowledged, even if it clears the balance.
 */
export function buildCounterpartyMessage(ctx: CounterpartyMessageContext): string | null {
  const isDecrease = ctx.deltaMinor < 0n;
  // To'lov = mijozning puli keldi. Kassa qarz to'lovi ham shu toifada.
  const isPayment =
    ctx.source === 'paymentIn' || ctx.source === 'cashIn' || ctx.source === 'debtpayment';
  // TUZATISH (qaytarish / qarz o'chirilishi): mijozga aytilishi SHART. Aks holda
  // u olgan oxirgi xabar «qarzga qo'shildi» bo'lib qoladi va uning qo'lidagi
  // raqam haqiqatdan uziladi (dizayn §4.3).
  const isCorrection = isDecrease && (ctx.source === 'retailsale' || ctx.source === 'debt');
  const head = cpHead(ctx.source, fmtAmount(ctx.deltaMinor, ctx.currency), isDecrease);
  if (!head) return null;
  // Non-payment change landing exactly on zero ⇒ nothing meaningful to say.
  if (!isPayment && !isCorrection && ctx.newBalanceMinor === 0n) return null;

  const date = fmtDate(ctx.docMoment);
  const num = (ctx.docNumber || '').trim();

  const lines: string[] = [`Hurmatli ${ctx.name},`];
  let hdr = `📄 ${head.title}`;
  if (date) hdr += ` — ${date}`;
  if (num) hdr += `, №${num}`;
  lines.push(hdr);
  lines.push(head.amountLine);
  lines.push('━━━━━━━━━━━━');
  lines.push(cpTotal(ctx.newBalanceMinor, ctx.currency, isPayment || isCorrection));
  return lines.join('\n');
}
