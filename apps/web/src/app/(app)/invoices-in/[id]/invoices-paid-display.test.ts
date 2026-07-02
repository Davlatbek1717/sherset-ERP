import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Invoice «Оплачено» money-display gate (permanent regression guard).
 *
 * Bug (Cohort-A Phase-2 Session-3 A-battery, 2026-06-10c — same money-display
 * class as the Session-2 Summa-input finding): the «Оплачено» (payedSumMinor)
 * meta field on invoices-in/[id] and invoices-out/[id] rendered the RAW minor
 * units via `paidBig.toString()`, while the adjacent «Остаток» field used
 * `formatMoney(remainingMinor)`. On any partially-paid invoice the paid amount
 * showed 100× overstated and unformatted (masked only because demo invoices have
 * payedSumMinor = 0, which renders identically as "0"). Fixed to `formatMoney(paidBig)`.
 */

const FILES = {
  'invoices-in': join(__dirname, 'page.tsx'),
  'invoices-out': join(__dirname, '..', '..', 'invoices-out', '[id]', 'page.tsx'),
};

for (const [name, file] of Object.entries(FILES)) {
  describe(`${name} «Оплачено» renders formatted money`, () => {
    const src = readFileSync(file, 'utf8');

    it('the paid field uses formatMoney(paidBig)', () => {
      expect(src).toMatch(/value=\{formatMoney\(paidBig\)\}/);
    });

    it('NON-VACUOUS: the raw `paidBig.toString()` binding is gone', () => {
      expect(src).not.toMatch(/value=\{paidBig\.toString\(\)\}/);
    });

    it('stays consistent with the sibling «Остаток» field (also formatMoney)', () => {
      expect(src).toMatch(/value=\{formatMoney\(remainingMinor\)\}/);
    });
  });
}
