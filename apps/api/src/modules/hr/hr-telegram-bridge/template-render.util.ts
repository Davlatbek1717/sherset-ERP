import { Eta } from 'eta';

/**
 * Notification template renderer. Eta with custom `{{ ... }}` delimiters
 * (matches the master spec syntax in `2026-05-20-hr-module-master-design.md`
 * § 8). Interpolation uses the `=` prefix: `{{= name }}` — bare `{{ name }}`
 * is computed but not output (logic tag).
 *
 * `autoEscape: false` because Telegram messages are plain text — HTML
 * escaping would corrupt apostrophes and Cyrillic punctuation.
 *
 * Context shape (always available to templates):
 *   counterparty.{name, phone}
 *   demand.{number, totalFormatted, link?}
 *   payment.{number, sumFormatted}
 *   order.{number, totalFormatted}
 *   supply.{number, totalFormatted}
 *   returnDoc.{number, totalFormatted}
 *   balance.{formatted}
 *
 * Money fields are pre-formatted via `formatMinor()` (so'm with ASCII
 * space grouping); raw BigInt never reaches the template engine.
 */
const eta = new Eta({
  tags: ['{{', '}}'],
  autoEscape: false,
  autoTrim: false, // preserve newlines around tags — Telegram messages are multi-line
  cache: false,
  useWith: true, // lets templates read top-level keys directly
});

/** One pre-formatted line for the supplier «qabul cheki» (all money already
 * run through {@link formatMinor}, so no BigInt reaches the template engine). */
export interface SupplyReceiptItem {
  name: string;
  quantity: string;
  uom?: string | null;
  priceFormatted: string;
  sumFormatted: string;
}

export interface NotificationRenderContext {
  counterparty: { name: string; phone?: string | null };
  demand?: { number?: string | null; totalFormatted: string; link?: string };
  payment?: { number?: string | null; sumFormatted: string };
  order?: { number?: string | null; totalFormatted: string };
  supply?: {
    number?: string | null;
    totalFormatted: string;
    /** Local (Asia/Tashkent) date «DD.MM.YYYY» of the posting. */
    dateFormatted?: string | null;
    /** Received lines, in document order — drives the itemized receipt. */
    items?: SupplyReceiptItem[];
  };
  returnDoc?: { number?: string | null; totalFormatted: string };
  balance?: { formatted: string };
}

/**
 * Render a template with the given context. Returns the rendered text
 * (string) or throws if the template has a syntax error / runtime issue —
 * caller (listener) is expected to log and swallow so a broken template
 * never blocks the source document operation.
 */
export function renderNotificationTemplate(
  templateText: string,
  ctx: NotificationRenderContext,
): string {
  const result = eta.renderString(templateText, ctx as unknown as Record<string, unknown>);
  if (typeof result !== 'string') {
    throw new Error('renderNotificationTemplate: Eta returned non-string');
  }
  return result;
}

const GROUP_SEPARATOR = ' '; // ASCII space — see note below

/**
 * Format a BigInt-in-tiyin (minor units) as a human so'm string with ASCII
 * space (U+0020) thousand separators. Returns "—" for null/0.
 *
 *   100n          → "1"            (1 so'm = 100 tiyin)
 *   1_234_500n    → "12 345"       (12 345 so'm)
 *   100_000_000n  → "1 000 000"
 *
 * Why ASCII space, not thin-NBSP (U+202F): Telegram mobile clients render
 * the latter inconsistently (Android often drops it), so we trade
 * typographic neatness for delivery legibility.
 */
export function formatMinor(v: bigint | string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  let big: bigint;
  try {
    big = typeof v === 'bigint' ? v : BigInt(v);
  } catch {
    return '—';
  }
  if (big === 0n) return '0';
  const negative = big < 0n;
  const abs = negative ? -big : big;
  const som = abs / 100n; // truncate tiyin
  const grouped = som.toString().replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
  return negative ? `-${grouped}` : grouped;
}

const RECEIPT_RULE = '━━━━━━━━━━━━━━━━━━━━';

/**
 * Build the supplier «qabul cheki» (goods-received receipt) — the itemized
 * second message sent after the short confirmation. Pure + deterministic so a
 * unit test pins the exact wording; all money is already pre-formatted by the
 * caller (listener), so this function never touches BigInt.
 *
 * Returns an empty string when there are no lines, so the dispatcher's
 * extra-message loop skips enqueuing a blank receipt (defensive — a posted
 * Supply always has ≥1 position, but the guard keeps a malformed payload from
 * sending an empty Telegram message).
 */
export function buildSupplyReceipt(ctx: NotificationRenderContext): string {
  const s = ctx.supply;
  if (!s || !s.items || s.items.length === 0) return '';

  const lines = s.items.map((it, i) => {
    const qtyUnit = it.uom ? `${it.quantity} ${it.uom}` : it.quantity;
    return `${i + 1}. ${it.name}\n   ${qtyUnit} × ${it.priceFormatted} = ${it.sumFormatted} so'm`;
  });

  const head = [
    '🧾 QABUL CHEKI',
    s.number ? `Hujjat: № ${s.number}` : null,
    s.dateFormatted ? `Sana: ${s.dateFormatted}` : null,
    `Yetkazib beruvchi: ${ctx.counterparty.name}`,
  ].filter((l): l is string => l !== null);

  return [
    ...head,
    RECEIPT_RULE,
    lines.join('\n'),
    RECEIPT_RULE,
    `Jami: ${s.totalFormatted} so'm`,
    '',
    'Hamkorligingiz uchun rahmat! 🤝',
  ].join('\n');
}
