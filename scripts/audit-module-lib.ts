/**
 * audit-module-lib.ts — pure, unit-tested logic for the `pnpm audit:module`
 * composite parity-audit CLI (Q1.2).
 *
 * Kept separate from the orchestrator `audit-module.ts` so the diff/normalize/
 * parse logic can be tested with `node --test` without launching a browser or
 * spawning child processes. Mirrors the capture-moysklad-{lib,references} split.
 *
 * The comparison is between:
 *   - moysklad reference dropdown items (from docs/moysklad-reference/<m>/states/
 *     metadata.json -> states['03-edit-dropdown'].domDump.items)
 *   - OUR dropdown items (dumped live from the running app, or parsed statically
 *     from the component source as a fallback)
 */

/** A single dropdown menu entry: visible label + whether it's disabled. */
export interface Item {
  label: string;
  disabled: boolean;
}

/** Result of comparing one dropdown (the Изменить / Печать menu) moysklad vs ours. */
export interface DropdownDiff {
  /** count of labels present on BOTH sides (regardless of disabled state) */
  matched: number;
  /** in moysklad, absent from ours */
  missing: Item[];
  /** in ours, absent from moysklad */
  extra: Item[];
  /** same label both sides, but disabled flag differs */
  disabledMismatch: Array<{ label: string; moysklad: boolean; ours: boolean }>;
  /** same label set, different relative order of the common labels */
  orderMismatch: boolean;
}

export interface TodoReport {
  dropdowns: Record<string, DropdownDiff>;
  totals: {
    missing: number;
    extra: number;
    disabledMismatch: number;
    orderMismatch: number;
  };
}

export type Verdict = 'exact' | 'delta';

/**
 * Normalize a menu label for comparison. Zero-width format chars
 * (ZWSP U+200B / ZWNJ U+200C / ZWJ U+200D) are stripped; every whitespace run —
 * JS `\s` already covers NBSP (U+00A0) and BOM (U+FEFF) — collapses to one
 * space, then trim. Case is preserved on purpose: "Удалить" vs "удалить" is a
 * real parity delta, not noise.
 *
 * The zero-width chars use an alternation of `\u` escapes rather than a
 * character class: biome's noMisleadingCharacterClass flags a ZWJ inside
 * `[...]` (it can compose adjacent glyphs into one), and `\u` escapes keep the
 * source ASCII-only (no invisible bytes in the file).
 */
export function normalizeLabel(s: string): string {
  return s.replace(/​|‌|‍/g, '').replace(/\s+/g, ' ').trim();
}

/** Build a set of the normalized labels present in `items`. */
function labelSet(items: Item[]): Set<string> {
  return new Set(items.map((i) => normalizeLabel(i.label)));
}

/**
 * Diff one dropdown: which items moysklad has that we don't (missing), which we
 * have that it doesn't (extra), disabled-state mismatches on shared labels, and
 * whether the shared labels appear in the same order.
 */
export function diffDropdown(moysklad: Item[], ours: Item[]): DropdownDiff {
  const msSet = labelSet(moysklad);
  const ourSet = labelSet(ours);

  const missing = moysklad.filter((i) => !ourSet.has(normalizeLabel(i.label)));
  const extra = ours.filter((i) => !msSet.has(normalizeLabel(i.label)));

  // Map normalized label -> disabled, for the disabled-state comparison.
  const ourDisabled = new Map(ours.map((i) => [normalizeLabel(i.label), i.disabled]));
  const disabledMismatch: DropdownDiff['disabledMismatch'] = [];
  for (const i of moysklad) {
    const key = normalizeLabel(i.label);
    if (!ourDisabled.has(key)) continue;
    const oursDis = ourDisabled.get(key) as boolean;
    if (oursDis !== i.disabled) {
      disabledMismatch.push({ label: key, moysklad: i.disabled, ours: oursDis });
    }
  }

  // Order: compare the subsequence of common labels as they appear on each side.
  const common = (items: Item[], other: Set<string>) =>
    items.map((i) => normalizeLabel(i.label)).filter((l) => other.has(l));
  const msCommon = common(moysklad, ourSet);
  const ourCommon = common(ours, msSet);
  const orderMismatch =
    msCommon.length === ourCommon.length && msCommon.some((l, idx) => l !== ourCommon[idx]);

  return {
    matched: msCommon.length,
    missing,
    extra,
    disabledMismatch,
    orderMismatch,
  };
}

/** Aggregate per-dropdown diffs into a single report with totals. */
export function buildTodo(dropdowns: Record<string, DropdownDiff>): TodoReport {
  const totals = { missing: 0, extra: 0, disabledMismatch: 0, orderMismatch: 0 };
  for (const d of Object.values(dropdowns)) {
    totals.missing += d.missing.length;
    totals.extra += d.extra.length;
    totals.disabledMismatch += d.disabledMismatch.length;
    totals.orderMismatch += d.orderMismatch ? 1 : 0;
  }
  return { dropdowns, totals };
}

/** 'exact' when every total is zero, otherwise 'delta'. */
export function verdict(todo: TodoReport): Verdict {
  const { missing, extra, disabledMismatch, orderMismatch } = todo.totals;
  return missing + extra + disabledMismatch + orderMismatch === 0 ? 'exact' : 'delta';
}

/**
 * Number of items the moysklad reference contributed across all dropdowns
 * (matched + missing — i.e. everything captured on the moysklad side).
 *
 * Guards the false-exact trap: if BOTH the moysklad capture and our live dump
 * come back empty (e.g. a double capture failure), every total is zero and
 * `verdict` alone would report "exact". The orchestrator treats
 * `referenceItemCount === 0` as "nothing to compare" and refuses to claim
 * parity, surfacing the failure instead of silently passing.
 */
export function referenceItemCount(todo: TodoReport): number {
  let n = 0;
  for (const d of Object.values(todo.dropdowns)) {
    n += d.matched + d.missing.length;
  }
  return n;
}

/**
 * Best-effort STATIC fallback: extract dropdown items from a component's TSX
 * source when the live app can't be reached. Resolves each `{t('key')}` label
 * through the supplied RU message catalog, mapping the translation-hook variable
 * to its namespace.
 *
 * Disabled semantics (reference state = "a row is selected", matching the
 * moysklad S3 capture):
 *   - bare `disabled`                -> true  (always disabled placeholder)
 *   - `disabled={true}`              -> true
 *   - `disabled={false}` / no attr   -> false
 *   - `disabled={<expr>}` (selection-conditional) -> false (enabled when selected)
 *
 * This is intentionally regex-based and brittle — it exists only so the tool
 * degrades gracefully without `pnpm dev`. The orchestrator always tags
 * static-sourced results so an "exact" verdict reached this way is flagged for
 * live verification.
 */
export function parseStaticOurs(tsxSource: string, ruMessages: Record<string, unknown>): Item[] {
  // var name -> i18n namespace, e.g. `const tBulk = useTranslations('bulk')`
  const nsByVar = new Map<string, string>();
  for (const m of tsxSource.matchAll(
    /const\s+(\w+)\s*=\s*useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g,
  )) {
    nsByVar.set(m[1] as string, m[2] as string);
  }

  const resolve = (varName: string, key: string): string => {
    const ns = nsByVar.get(varName);
    const dict = ns ? (ruMessages[ns] as Record<string, unknown> | undefined) : undefined;
    const val = dict?.[key];
    return typeof val === 'string' ? val : key; // fall back to key so a delta surfaces
  };

  const items: Item[] = [];
  // Match each <DropdownMenu.Item ...attrs...> {tvar('key')} </...>
  const itemRe = /<DropdownMenu\.Item\b([^>]*)>\s*\{?\s*(\w+)\(\s*['"]([^'"]+)['"]\s*[),]/g;
  for (const m of tsxSource.matchAll(itemRe)) {
    const attrs = m[1] as string;
    const tVar = m[2] as string;
    const key = m[3] as string;
    items.push({ label: resolve(tVar, key), disabled: parseDisabled(attrs) });
  }
  return items;
}

/** Interpret the `disabled` attribute on a JSX tag's attribute string. */
function parseDisabled(attrs: string): boolean {
  const expr = attrs.match(/\bdisabled\s*=\s*\{([^}]*)\}/);
  if (expr) {
    const body = (expr[1] as string).trim();
    if (body === 'true') return true;
    if (body === 'false') return false;
    // selection-conditional (hasSelection / isPending / onMassEdit ...) -> enabled
    return false;
  }
  // bare `disabled` with no value -> always disabled
  return /\bdisabled\b(?!\s*=)/.test(attrs);
}
