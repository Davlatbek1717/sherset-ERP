import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * List «Сумма от/до» (sum range) filters use <MoneyInput> — permanent guard.
 *
 * Bug-class (sibling of the 2026-06-10c money-entry rollout): every list page's
 * sum-range filter bound the raw minor (tiyin) value to a `type="number"` input
 * and sent it to the API as `sumMinorFrom/To`. So a user filtering "≥ 300 000
 * сум" had to type "30000000" (tiyin), and typing "300000" silently filtered by
 * 3 000,00 сум — a 100× scale trap. money-input-rollout.test.ts deferred these
 * as "a separate, lower-risk surface"; this is that follow-up.
 *
 * The fix routes each sum filter through `<MoneyInput allowEmpty …>`: it
 * DISPLAYS/ACCEPTS som while storing minor, and `allowEmpty` makes a cleared
 * field drop the bound (emit '' → undefined) instead of collapsing to a
 * match-everything `≥ 0` filter (majorToMinorInput('') === '0').
 *
 * Each negative assertion below (`value={…sumMinorFrom…}`) matched the raw-minor
 * binding BEFORE the sweep, so the guard is non-vacuous.
 */

const SRC = join(__dirname, '..');
const FE = (...p: string[]) => join(SRC, 'app', '(app)', ...p, 'page.tsx');

// The 25 list pages with an inline sum-range filter …
const PAGES = [
  'cash-in',
  'cash-out',
  // 'commission-reports' / 'demands' / 'invoices-in' / 'invoices-out' / 'losses' /
  // 'purchase-returns' / 'supplies' — their filter panels were re-grounded 1:1 on
  // moysklad, whose filters have NO «Сумма» field for these lists, so the pages
  // dropped the sum-range filter (e.g. 8298eb39 «drop Заказ/Сумма», 59d32c10
  // 24-field demands filter). Entries retired 2026-07-17 alongside enters/moves.
  'counterparty-adjustments',
  'customer-orders',
  // 'enters' — moysklad's #enter list filter has NO «Сумма» field (live-grounded
  // 2026-06-21), so the enters page intentionally dropped its sum-range filter.
  'factures-in',
  'factures-out',
  // 'internal-orders' — moysklad's #internalorder list filter has NO «Сумма»
  // field (owner screenshots 2026-07-14: 14 fields, Период…Кто изменил), so the
  // page dropped its sum-range filter for parity.
  'inventories',
  // 'moves' — moysklad's #move list filter also has NO «Сумма» field (removed
  // upstream for parity; see moves/page.tsx «There is NO «Сумма» filter»). The
  // test entry was left stale → removed here alongside enters.
  'payments-in',
  'payments-out',
  'prepayment-returns',
  'prepayments',
  'processing-orders',
  'processings',
  'productions',
  'sales-returns',
];

// … plus the shared filter hook file (same pattern, off the rendered path today
// but kept consistent so a future consumer can't reintroduce the raw-minor bug).
const FILES: Array<{ label: string; path: string }> = [
  ...PAGES.map((p) => ({ label: p, path: FE(p) })),
  {
    label: 'components/filters/moysklad-doc-filter',
    path: join(SRC, 'components', 'filters', 'moysklad-doc-filter.tsx'),
  },
];

describe('list «Сумма от/до» filters use <MoneyInput allowEmpty> (som entry, not raw minor)', () => {
  for (const { label, path } of FILES) {
    describe(label, () => {
      const src = readFileSync(path, 'utf8');

      it('binds both sum bounds through <MoneyInput valueMinor=…>', () => {
        expect(src).toContain('data-test-id="filter-sum-from"');
        expect(src).toContain('data-test-id="filter-sum-to"');
        expect(src).toMatch(/valueMinor=\{[^}]*sumMinorFrom/);
        expect(src).toMatch(/valueMinor=\{[^}]*sumMinorTo/);
      });

      it('uses allowEmpty so a cleared filter drops the bound (not ≥0)', () => {
        // Both sum MoneyInputs must opt into allowEmpty.
        const allowEmptyCount = (src.match(/allowEmpty/g) ?? []).length;
        expect(allowEmptyCount).toBeGreaterThanOrEqual(2);
      });

      it('has no raw-minor sum input left (non-vacuous — matched before the sweep)', () => {
        expect(src).not.toMatch(/value=\{[^}]*sumMinor(From|To)/);
      });
    });
  }
});
