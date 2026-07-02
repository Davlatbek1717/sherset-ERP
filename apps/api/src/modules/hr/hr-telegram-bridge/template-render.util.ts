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

export interface NotificationRenderContext {
  counterparty: { name: string; phone?: string | null };
  demand?: { number?: string | null; totalFormatted: string; link?: string };
  payment?: { number?: string | null; sumFormatted: string };
  order?: { number?: string | null; totalFormatted: string };
  supply?: { number?: string | null; totalFormatted: string };
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
