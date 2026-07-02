import { computePositionTotal } from '@moysklad/money';
import { formatAmountInWords } from './amount-to-words.util.js';
import { renderSafeTemplate } from './safe-template.js';

const GROUP_SEPARATOR = ' '; // ASCII space — consistent with HR money formatting

/**
 * Format a BigInt-in-tiyin (minor units) as a human so'm string with ASCII
 * space thousand separators. `null`/`undefined`/unparseable → "—", 0 → "0".
 *
 *   100n         → "1"
 *   1_234_500n   → "12 345"
 *   100_000_000n → "1 000 000"
 *
 * Accepts string so callers can pass BigInt-as-string without precision
 * loss (sums exceed Number.MAX_SAFE_INTEGER on large documents).
 */
export function formatMoneyMinor(v: bigint | string | number | null | undefined): string {
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

/** Format a Date as DD.MM.YYYY (moysklad locale). Null → "—". */
export function formatDocDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Format a decimal-string quantity, trimming trailing zeros.
 *   "3.000"  → "3"
 *   "1.500"  → "1.5"
 *   "10"     → "10"
 */
export function formatQty(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v);
  if (!s.includes('.')) return s;
  const trimmed = s.replace(/\.?0+$/, '');
  return trimmed === '' ? '0' : trimmed;
}

/**
 * Per-line net sum in tiyin (minor units), discount applied, VAT excluded.
 *
 * Mirrors the authoritative server formula in
 * `customer-order.service.ts#computeTotals` exactly so the printed line
 * "Summa" column cannot drift from the stored document total:
 *   lineGross   = priceMinor * round(qty * 1000) / 1000
 *   afterDisc   = disc > 0 ? lineGross * round((100 - disc) * 100) / 10000 : lineGross
 *
 * All arithmetic in BigInt tiyin. `qty`/`discount` arrive as Prisma Decimal
 * (passed as string/number) — quantities are bounded ~1e6 so the ×1000
 * scaling stays within safe-integer range before the BigInt conversion.
 */
export function computeLineSumMinor(
  priceMinor: bigint | string | number,
  qty: string | number | null | undefined,
  discount: string | number | null | undefined,
): bigint {
  const q = Number(String(qty ?? 0));
  if (!Number.isFinite(q) || q <= 0) return 0n;
  // Single-round per-line sum via the shared primitive — matches the stored
  // sumMinor (the services now use the same computePositionTotal).
  return computePositionTotal(
    {
      quantity: String(qty ?? 0),
      priceMinor: typeof priceMinor === 'bigint' ? priceMinor.toString() : String(priceMinor),
      discount: String(discount ?? 0),
      vat: null,
    },
    false,
    false,
  ).totalMinor;
}

/** One line item as templates see it (all values pre-formatted strings). */
export interface RenderPosition {
  idx: number;
  name: string;
  unit: string;
  qty: string;
  price: string;
  sum: string;
}

/** Raw line item a controller supplies before formatting. */
export interface RawPosition {
  name: string;
  unit?: string | null;
  qty?: string | number | null;
  priceMinor?: bigint | string | number | null;
  sumMinor?: bigint | string | number | null;
}

/** Raw document a controller supplies; the service formats it into context. */
export interface RawDocInput {
  title: string;
  number: string;
  date?: Date | string | null;
  sumMinor?: bigint | string | number | null;
  currency?: string | null;
  description?: string | null;
  counterpartyName?: string | null;
  organizationName?: string | null;
  organizationPhone?: string | null;
  positions?: RawPosition[];
}

/** Fully-formatted context exposed to templates. */
export interface DocRenderContext {
  doc: {
    title: string;
    number: string;
    date: string;
    sum: string;
    currency: string;
    description: string | null;
  };
  counterparty: { name: string } | null;
  organization: { name: string; phone: string | null } | null;
  positions: RenderPosition[];
  /** True when at least one line item is present (templates branch on this). */
  hasPositions: boolean;
  /** Sum of line quantities (formatted), shown in the "Jami" row's Soni cell. */
  positionsQtyTotal: string;
  /**
   * Sum of the displayed line "Summa" values (formatted). Used as the
   * positions-table total so the printed lines always reconcile with the
   * "Jami" row — unlike the document's stored grand total, which on
   * VAT-excluded documents adds VAT on top of the net line sums and would
   * visibly exceed the column sum.
   */
  positionsTotal: string;
  /**
   * The payable total spelled out in Uzbek words ("Jami to'lov" line) —
   * mirrors moysklad's «Итого к оплате: <сумма прописью>». Reflects the
   * displayed total (positions sum when there are line items, else doc sum).
   */
  totalInWords: string;
}

/** Map a raw controller document into the formatted template context. */
function toBigIntSafe(v: bigint | string | number | null | undefined): bigint {
  if (v == null) return 0n;
  try {
    return typeof v === 'bigint' ? v : BigInt(v);
  } catch {
    return 0n;
  }
}

export function buildDocContext(raw: RawDocInput): DocRenderContext {
  const rawPositions = raw.positions ?? [];
  const positions: RenderPosition[] = rawPositions.map((p, i) => ({
    idx: i + 1,
    name: p.name,
    unit: p.unit ?? '',
    qty: formatQty(p.qty),
    price: formatMoneyMinor(p.priceMinor),
    sum: formatMoneyMinor(p.sumMinor),
  }));
  const positionsTotalMinor = rawPositions.reduce((acc, p) => acc + toBigIntSafe(p.sumMinor), 0n);
  const totalMinor = positions.length > 0 ? positionsTotalMinor : toBigIntSafe(raw.sumMinor);
  const qtyTotal = rawPositions.reduce((acc, p) => {
    const n = Number(String(p.qty ?? 0));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  return {
    positionsTotal: formatMoneyMinor(positionsTotalMinor),
    positionsQtyTotal: formatQty(qtyTotal),
    totalInWords: formatAmountInWords(totalMinor),
    doc: {
      title: raw.title,
      number: raw.number,
      date: formatDocDate(raw.date),
      sum: formatMoneyMinor(raw.sumMinor),
      currency: raw.currency ?? 'UZS',
      description: raw.description?.trim() ? raw.description.trim() : null,
    },
    counterparty: raw.counterpartyName?.trim() ? { name: raw.counterpartyName.trim() } : null,
    organization: raw.organizationName?.trim()
      ? { name: raw.organizationName.trim(), phone: raw.organizationPhone?.trim() || null }
      : null,
    positions,
    hasPositions: positions.length > 0,
  };
}

/**
 * Render a template body against a document context using the eval-free
 * engine (see safe-template.ts). Account-authored templates are pure data
 * substitution — never executed as code — so a custom PrintTemplate cannot
 * run JS in the API process. Returns the rendered HTML fragment.
 */
export function renderDocTemplate(body: string, ctx: DocRenderContext): string {
  return renderSafeTemplate(body, ctx as unknown as Record<string, unknown>);
}
