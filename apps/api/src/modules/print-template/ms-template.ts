import { formatAmountInWords } from './amount-to-words.util.js';
import { formatDocDate, formatMoneyMinor, formatQty } from './print-render.util.js';
import type { RawDocInput } from './print-render.util.js';

/**
 * moysklad-native print-template syntax. moysklad's engine is JXLS (Java Excel
 * templating) — see `docs/moysklad-print-template-syntax.md` for the syntax spec
 * and `docs/moysklad-reference/print-templates/report-PurchaseOrder.md` for a real
 * downloaded template used as ground truth. Constructs:
 *
 *   - data expressions  ${ expr }       — JEXL/Java-style, evaluated as JS. `o` =
 *       document (or `rows`/`filters`/`total` for list reports), `formatter` =
 *       helpers, plus loop vars in scope (e.g. `position`, `row`, `filter`).
 *   - conditional       <jx:if test="${expr}"> … </jx:if>
 *   - iteration         <jx:forEach items="${expr}" var="x" [varStatus="s"]> … </jx:forEach>
 *   - Excel formulas    $[ … ]           — left untouched here (xlsx path emits them).
 *
 * moysklad expressions use Java idioms that are not valid JS — `list.size()`,
 * `string.length()`, `x.isEmpty()`. `javaToJs()` rewrites them before eval, and
 * `getExcelDate`/`format` mirror moysklad's Java date formatting (`%1$td.%1$tm…`).
 *
 * SECURITY: ${…} is evaluated with `new Function` scoped to the template vars
 * only (moysklad's admin-upload trust model) — must move to isolated-vm before
 * production (tracked in the spec doc).
 */

type Scope = Record<string, unknown>;

/** Does this body use moysklad's `${…}` / `$[…]` / `<jx:…>` syntax (vs our `{tag}`)? */
export function isMoyskladSyntax(body: string): boolean {
  return /\$\{[^}]+\}|\$\[[^\]]+\]|<jx:\w+/.test(body);
}

/**
 * Rewrite moysklad's Java idioms into equivalent JS so `new Function` can run them:
 *   - `x.isEmpty()`  → `__isEmpty(x)`   (works for String and List/array)
 *   - `s.length()`   → `s.length`        (Java String.length())
 *   - `c.size()`     → `c.length`        (Java Collection.size(); our collections
 *                                          are arrays, and getPositions() returns one)
 * `.length` (property, no parens) is left untouched. `__isEmpty` is injected into
 * the eval prelude (see `evalMsExpr`).
 */
export function javaToJs(expr: string): string {
  // A receiver = an identifier chain with optional single-level method calls,
  // e.g. `filter.getDisplayName()`, `filters`, `filtersText`, `o.getPositions()`.
  const recv = '[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*(?:\\([^()]*\\))?)*';
  return expr
    .replace(new RegExp(`(${recv})\\.isEmpty\\(\\)`, 'g'), '__isEmpty($1)')
    .replace(/\.length\(\)/g, '.length')
    .replace(/\.size\(\)/g, '.length');
}

/** A moysklad-shaped view of the document `o`, built from our RawDocInput. */
export function buildMsDocObject(raw: RawDocInput): Scope {
  const positions = (raw.positions ?? []).map((p, i) => {
    const priceMinor = toNum(p.priceMinor);
    const sumMinor = toNum(p.sumMinor);
    return {
      idx: i + 1,
      printName: p.name,
      name: p.name,
      assortment: { name: p.name },
      quantity: Number(String(p.qty ?? 0)) || 0,
      good: { uom: { name: p.unit ?? '' }, weight: 0, volume: 0, type: 'Product' },
      goodPack: { uom: { name: '' }, quantity: 0 },
      price: { sumInCurrency: priceMinor, sum: priceMinor },
      basePrice: { sumInCurrency: priceMinor, sum: priceMinor },
      sum: { sumInCurrency: sumMinor, sum: sumMinor },
      discount: 0,
      vat: 0,
      nullableVat: null,
      reserve: 0,
    };
  });
  return {
    name: raw.number,
    moment: raw.date ?? null,
    description: raw.description ?? '',
    externalCode: '',
    id: '',
    applicable: true,
    state: { name: '' },
    sum: { sum: toNum(raw.sumMinor), sumInCurrency: toNum(raw.sumMinor) },
    currency: { name: raw.currency ?? 'UZS' },
    agent: { name: raw.counterpartyName ?? '' },
    organization: { name: raw.organizationName ?? '', phone: raw.organizationPhone ?? '' },
    getOwnerName: () => '',
    getGroupName: () => '',
    getShared: () => false,
    // Return the array itself: `o.getPositions().size()` → (via javaToJs) `.length`.
    getPositions: () => positions,
    positions,
  };
}

/** Who/when is printing — fills moysklad's `formatter.currentUser` / `currentMoment`. */
export interface MsFormatterContext {
  currentUser?: { firstName?: string; secondName?: string; uid?: string } | null;
  currentMoment?: Date | string | null;
}

/** A date that prints as `dd.MM.yyyy` but also feeds `formatter.format(pattern, …)`. */
interface MsDate {
  __date: Date | null;
  toString(): string;
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'object' && '__date' in (v as MsDate)) return (v as MsDate).__date;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * moysklad uses Java `Formatter` time conversions: `%1$td` day, `%1$tm` month,
 * `%1$tY` 4-digit year, `%1$ty` 2-digit year, `%1$tH` hour24, `%1$tM` minute,
 * `%1$tS` second (all zero-padded, UTC to match `formatDocDate`).
 */
function formatJavaDate(fmt: string, value: unknown): string {
  const date = toDate(value);
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const part: Record<string, string> = {
    d: pad(date.getUTCDate()),
    m: pad(date.getUTCMonth() + 1),
    Y: String(date.getUTCFullYear()),
    y: pad(date.getUTCFullYear() % 100),
    H: pad(date.getUTCHours()),
    M: pad(date.getUTCMinutes()),
    S: pad(date.getUTCSeconds()),
  };
  return fmt.replace(/%(?:\d+\$)?t([a-zA-Z])/g, (full, conv: string) => part[conv] ?? full);
}

const JAVA_TIME_FMT = /%(?:\d+\$)?t[a-zA-Z]/;

/** The `formatter` helper object (subset of moysklad's JXLS formatter). */
export function buildMsFormatter(ctx: MsFormatterContext = {}): Scope {
  const total = (o: { positions?: Array<{ quantity?: number }> }) =>
    (o.positions ?? []).reduce((a, p) => a + (Number(p.quantity) || 0), 0);
  return {
    currentUser: {
      firstName: ctx.currentUser?.firstName ?? '',
      secondName: ctx.currentUser?.secondName ?? '',
      uid: ctx.currentUser?.uid ?? '',
    },
    currentMoment: ctx.currentMoment ?? null,
    // Returns a date-like: prints dd.MM.yyyy on its own, or feeds `format(pattern, …)`.
    getExcelDate: (d: unknown): MsDate => {
      const date = toDate(d);
      return { __date: date, toString: () => formatDocDate(date) };
    },
    // moysklad's `format(pattern, value)` — Java printf. We support time conversions
    // (the only kind moysklad's templates use); other patterns fall back to the value.
    format: (fmt: unknown, v: unknown) =>
      typeof fmt === 'string' && JAVA_TIME_FMT.test(fmt) ? formatJavaDate(fmt, v) : String(v ?? ''),
    printIf: (cond: unknown, text: unknown) => (cond ? String(text ?? '') : ''),
    printIfElse: (cond: unknown, a: unknown, b: unknown) =>
      cond ? String(a ?? '') : String(b ?? ''),
    // moysklad's printAmount is printAmount(currency, minor); also tolerate (minor).
    printAmount: (a: unknown, b?: unknown) => formatMoneyMinor(toNum(b === undefined ? a : b)),
    printNumber: (n: unknown) => formatAmountInWords(BigInt(Math.trunc(toNum(n)))),
    round: (x: unknown) => Math.round(toNum(x)),
    roundToCents: (x: unknown) => Math.round(toNum(x) * 100) / 100,
    cost: () => 0,
    shipped: () => 0,
    calcVat: () => 0,
    getCurrency: (o: Scope) => o.currency,
    calcTotalQuantity: (o: Parameters<typeof total>[0]) => formatQty(total(o)),
    calcTotalGoodsQuantity: (o: Parameters<typeof total>[0]) => formatQty(total(o)),
    getGoods: (o: { positions?: unknown[] }) => o.positions ?? [],
    getServices: () => [],
    printNameList: () => '',
    empty: (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0),
  };
}

/** `__isEmpty` is injected so javaToJs's `x.isEmpty()` → `__isEmpty(x)` resolves. */
const EVAL_PRELUDE =
  'const __isEmpty = (x) => x == null || ' +
  "(typeof x === 'string' || Array.isArray(x) ? x.length === 0 : " +
  "(x && typeof x.size === 'function' ? x.size() === 0 : !x));";

/** Evaluate one expression against a scope (faithful moysklad eval — see SECURITY). */
export function evalMsExpr(expr: string, scope: Scope): unknown {
  const js = javaToJs(expr);
  const keys = Object.keys(scope);
  // `new Function` = faithful moysklad ${…} eval, scoped to template vars only. See
  // the SECURITY note above — move to isolated-vm before production.
  const fn = new Function(...keys, `"use strict"; ${EVAL_PRELUDE} return (${js});`) as (
    ...a: unknown[]
  ) => unknown;
  return fn(...keys.map((k) => scope[k]));
}

/** Replace every `${ expr }` with its evaluated value; nullish/error → "". */
export function renderMsExpressions(body: string, scope: Scope): string {
  return body.replace(/\$\{([^}]+)\}/g, (_full, expr: string) => {
    try {
      const v = evalMsExpr(expr, scope);
      return v == null ? '' : String(v);
    } catch {
      return '';
    }
  });
}

/** Read `attr="${EXPR}"` from a tag's attribute string, returning EXPR (inside `${}`). */
function attrExpr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"\\$\\{([\\s\\S]*?)\\}"`));
  return m?.[1] ?? '';
}

/** Read a plain `attr="VAL"` from a tag's attribute string. */
function attrPlain(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return m?.[1] ?? '';
}

/**
 * Find the matching `</jx:TAG>` for an opening tag, counting nested SAME-type tags.
 * `searchFrom` is the index just past the opening tag. Returns the close tag's start
 * index, or -1 if unbalanced. Other jx tag types are ignored (handled when the inner
 * body is recursed), so interleaved `<jx:if><jx:forEach>…</jx:forEach></jx:if>` works.
 */
function findMatchingClose(body: string, searchFrom: number, tag: string): number {
  // `(?:[^>"]|"[^"]*")*` lets a `>` live inside a quoted attribute, e.g.
  // `<jx:if test="${x.size()>0}">` — a bare `[^>]*` would stop at that inner `>`.
  const re = new RegExp(`<(/?)jx:${tag}\\b(?:[^>"]|"[^"]*")*>`, 'g');
  re.lastIndex = searchFrom;
  let depth = 1;
  let m: RegExpExecArray | null = re.exec(body);
  while (m) {
    if (m[1] === '/') {
      depth -= 1;
      if (depth === 0) return m.index;
    } else {
      depth += 1;
    }
    m = re.exec(body);
  }
  return -1;
}

/**
 * Render a moysklad template body against a scope: handles arbitrarily nested
 * `<jx:if>` / `<jx:forEach>` plus `${…}` substitution. Text outside any directive
 * is rendered with `renderMsExpressions`. This is the text/docx engine; the xlsx
 * path uses a row-based variant for grid templates.
 */
export function renderMsBody(body: string, scope: Scope): string {
  // Tolerate a `>` inside a quoted attribute (e.g. test="${x.size()>0}").
  const open = /<jx:(if|forEach)\b((?:[^>"]|"[^"]*")*)>/.exec(body);
  if (!open) return renderMsExpressions(body, scope);

  const tag = open[1] as 'if' | 'forEach';
  const attrs = open[2] ?? '';
  const openEnd = open.index + open[0].length;
  const closeStart = findMatchingClose(body, openEnd, tag);
  if (closeStart === -1) return renderMsExpressions(body, scope); // unbalanced → treat as text

  const before = body.slice(0, open.index);
  const inner = body.slice(openEnd, closeStart);
  const after = body.slice(closeStart + `</jx:${tag}>`.length);

  let middle = '';
  if (tag === 'if') {
    let ok = false;
    try {
      ok = Boolean(evalMsExpr(attrExpr(attrs, 'test'), scope));
    } catch {
      ok = false;
    }
    middle = ok ? renderMsBody(inner, scope) : '';
  } else {
    let items: unknown;
    try {
      items = evalMsExpr(attrExpr(attrs, 'items'), scope);
    } catch {
      items = [];
    }
    const list = Array.isArray(items) ? items : [];
    const varName = attrPlain(attrs, 'var');
    const statusName = attrPlain(attrs, 'varStatus');
    middle = list
      .map((item, i) => {
        const child: Scope = { ...scope, [varName]: item };
        if (statusName)
          child[statusName] = {
            index: i,
            count: i + 1,
            first: i === 0,
            last: i === list.length - 1,
          };
        return renderMsBody(inner, child);
      })
      .join('');
  }

  return renderMsExpressions(before, scope) + middle + renderMsBody(after, scope);
}

/** Render a single-document moysklad template against a RawDocInput. */
export function renderMsTemplate(body: string, raw: RawDocInput): string {
  const scope: Scope = { o: buildMsDocObject(raw), formatter: buildMsFormatter() };
  return renderMsBody(body, scope);
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  try {
    return typeof v === 'bigint' ? Number(v) : Number(v) || 0;
  } catch {
    return 0;
  }
}
