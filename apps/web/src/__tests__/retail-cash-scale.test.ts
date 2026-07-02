import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Retail register cash-entry scale gate (permanent regression guard).
 *
 * Bug-class (caught in the retail Phase-2 browser-QA, 2026-06-08o — the
 * follow-through of the 08k POS-register *drawer* fix): the register's
 * open-shift (`openingCashMinor`) and close-shift (`closingCashMinor`) cash
 * entries converted major→minor with a hardcoded `Number.parseInt(x, 10) * 100`.
 * That is wrong two ways:
 *   1. `parseInt` TRUNCATES a decimal entry — "150.50" → 150 → 15000, silently
 *      dropping the 50 tiyin (a live data-integrity bug on every 2-decimal /
 *      UZS desk; both inputs are free-form `type="number"` that accept decimals).
 *   2. The hardcoded `*100` assumes a 2-decimal currency — a 0-decimal desk
 *      (JPY) is inflated 100× ("150" → 15000 instead of 150).
 *
 * The fix mirrors the already-hardened register drawer (line ~334,
 * `Money.fromMajor(drawerAmount, tillCurrency)`): both shift-cash entries now go
 * through `Money.fromMajor(<entry>, <deskCurrency>).toMinor()`, where the
 * currency is the *selected/active desk's* currency (not a constant). Verified
 * live in the browser: closing "150.50" UZS → closingCashMinor 15050 (decimal
 * preserved); opening "150" on a JPY desk → openingCashMinor 150 (not 15000).
 *
 * (The POS `payment-dialog.tsx` is deliberately NOT in this class: its keypad is
 * integer-only — no decimal entry is possible — and the design-system
 * `formatMoney` itself hardcodes `/100`, so non-2-decimal desks are not yet
 * displayable anywhere. Full non-2-decimal currency support is a separate,
 * grounding-gated DS effort, documented in NEXT.md.)
 */

const REGISTER = join(__dirname, '..', 'app', '(app)', 'retail', 'page.tsx');

describe('retail register cash entries are currency-aware (no parseInt*100)', () => {
  const src = readFileSync(REGISTER, 'utf8');

  it('open-shift opening cash uses Money.fromMajor with the selected desk currency', () => {
    expect(src).toMatch(/openingCashMinor: Money\.fromMajor\(openingCash/);
    // currency derived from the SELECTED desk, not a hardcoded constant
    expect(src).toMatch(/isCurrencyCode\(deskCurrency\)/);
  });

  it('close-shift closing cash uses Money.fromMajor with the till currency', () => {
    expect(src).toMatch(/closingCashMinor: Money\.fromMajor\(closingCash[\s\S]*?tillCurrency\)/);
  });

  it('the buggy parseInt(...)*100 cash conversion is gone (both entries)', () => {
    // Non-vacuous: these matched before the fix and must never come back.
    expect(src).not.toMatch(/parseInt\(openingCash[^)]*\)\s*\*\s*100/);
    expect(src).not.toMatch(/parseInt\(closingCash[^)]*\)\s*\*\s*100/);
  });
});
