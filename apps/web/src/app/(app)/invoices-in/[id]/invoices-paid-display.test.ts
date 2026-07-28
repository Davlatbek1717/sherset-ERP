import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Invoice «Оплачено» money-display guard.
 *
 * ── Why this file was rewritten (MASTER-TODO #3, 2026-07-28) ────────────────
 * The original suite asserted `value={formatMoney(paidBig)}` and
 * `value={formatMoney(remainingMinor)}` on the invoice DETAIL pages. Those
 * bindings have never existed in this repository — `git log -S` over the full
 * history of `invoices-in/[id]/page.tsx` returns nothing. The suite arrived
 * with the «Sherset snapshot» import (shallow history, another checkout) and
 * described that repo's page, not this one.
 *
 * Building the fields to satisfy it would have been a PARITY REGRESSION. This
 * repo made the opposite call, grounded and written down in the page itself
 * (`invoices-in/[id]/page.tsx`):
 *
 *   «moysklad does NOT show a «Не оплачено»/«Оплачено» pill in the doc editor
 *    header (payment status lives only in the LIST «Оплачено» column)»
 *
 * — and indeed `fields.payed_sum` is wired on the LIST pages only.
 *
 * So the money-display invariant is preserved, but pinned where the value is
 * actually rendered:
 *   1. LIST money cells format minor units through formatMoney with the ROW's
 *      currency — never a hardcoded one, never raw.
 *   2. The CSV `cellText` twin does the same. This caught a live bug: the
 *      invoices-out export called `formatMoney(x)` bare, so every row got the
 *      DEFAULT «сум» suffix (a USD invoice exported as "1 000,00 сум") and the
 *      CSV disagreed with the suffix-less on-screen cell.
 *   3. The DETAIL pages never render a raw `payedSumMinor` / `paidBig` string —
 *      the field's absence is deliberate, but if someone adds it back it must
 *      not arrive as raw minor units (the original 100×-overstated bug-class).
 */

const APP = join(__dirname, '..', '..');
const LIST = {
  'invoices-in': join(APP, 'invoices-in', 'page.tsx'),
  'invoices-out': join(APP, 'invoices-out', 'page.tsx'),
};
const DETAIL = {
  'invoices-in': join(APP, 'invoices-in', '[id]', 'page.tsx'),
  'invoices-out': join(APP, 'invoices-out', '[id]', 'page.tsx'),
};

/** Money columns whose cells + cellText must both be currency-aware. */
const MONEY_FIELDS = ['sumMinor', 'payedSumMinor'];

/**
 * Scan CODE only. Comments legitimately quote the old broken call shapes to
 * explain why they were wrong — without this the guard fails on its own
 * documentation (it did, first run).
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

for (const [name, file] of Object.entries(LIST)) {
  describe(`${name} list — money cells are currency-aware`, () => {
    const src = code(file);

    for (const field of MONEY_FIELDS) {
      it(`${field}: no hardcoded currency in formatMoney`, () => {
        // `formatMoney(i.payedSumMinor, 'UZS', …)` — the row carries a real
        // `currency`, and the list even shows a «Валюта» column next to it.
        expect(src).not.toMatch(new RegExp(`formatMoney\\(\\w+\\.${field},\\s*['"][A-Z]{3}['"]`));
      });

      it(`${field}: rendered through formatMoney (never a raw minor string)`, () => {
        expect(src).toMatch(new RegExp(`formatMoney\\(\\w+\\.${field}`));
        expect(src).not.toMatch(new RegExp(`\\{\\w+\\.${field}\\}`));
        expect(src).not.toMatch(new RegExp(`\\w+\\.${field}\\.toString\\(\\)`));
      });

      it(`${field}: the CSV cellText passes the row currency (export must not say «сум» for USD)`, () => {
        // Bare `formatMoney(r.payedSumMinor)` falls back to the UZS suffix.
        expect(src).not.toMatch(new RegExp(`formatMoney\\(\\w+\\.${field}\\)`));
      });
    }
  });
}

for (const [name, file] of Object.entries(DETAIL)) {
  describe(`${name} detail — no raw minor leaks`, () => {
    const src = code(file);

    it('does not render raw payedSumMinor / paidBig', () => {
      expect(src).not.toMatch(/\{paidBig\.toString\(\)\}/);
      expect(src).not.toMatch(/value=\{data\.payedSumMinor\}/);
    });

    it('does not render a raw balance either (moved here from money-input-rollout)', () => {
      // money-input-rollout.test.ts used to own this, phrased as «must render
      // formatMoney(remainingMinor)» — a binding this repo never had. The
      // durable half of that rule is the ban, kept here so the invariant has
      // exactly one owner. MASTER-TODO #3/#5.
      expect(src).not.toMatch(/value=\{remainingMinor\}/);
      expect(src).not.toMatch(/\{remainingMinor\.toString\(\)\}/);
    });

    it('NON-VACUOUS: paidBig is still derived (the guard has something to guard)', () => {
      expect(src).toMatch(/const paidBig = BigInt\(data\.payedSumMinor/);
    });
  });
}

describe('the «no «Оплачено» field on the detail editor» grounding stays documented', () => {
  it('invoices-in/[id] keeps the moysklad rationale in source', () => {
    // Without this note a future refactor "restores" the field and silently
    // re-breaks parity — the exact trap this suite fell into.
    const src = readFileSync(DETAIL['invoices-in'], 'utf8');
    expect(src).toMatch(/moysklad does NOT show a «Не оплачено»\/«Оплачено» pill/);
  });
});
