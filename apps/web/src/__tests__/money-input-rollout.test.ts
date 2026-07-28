import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Money-input rollout gate (permanent regression guard).
 *
 * Bug-class (found in the 2026-06-10c Phase-2 QA, escalated + approved by the
 * user): money was entered app-wide in raw minor units (tiyin) — every price /
 * sum / allocation input bound the raw `*Minor` string, so a user typing
 * "300000" booked a 3 000,00 сум document (100× too small). The fix is the
 * shared `<MoneyInput>` (packages/design-system) which DISPLAYS/ACCEPTS major
 * (som) while storing/emitting minor (tiyin); the caller's minor state, totals
 * math, and save payload are unchanged (value→valueMinor, onChange→onChangeMinor).
 *
 * Browser-proven E2E: a draft customer-order position stored at priceMinor
 * 10000000 shows "100000" and saving "200000" → priceMinor 20000000; a draft
 * cash-out sumMinor 5000 shows "50" and saving "250000" → sumMinor 25000000.
 *
 * Each `not.toMatch(value={<money>})` below matched the raw-minor binding BEFORE
 * the fix (non-vacuous). Scope NOTE: list-page «Сумма от/до» filters
 * (filterValues.sumMinorFrom/To, 25 list pages + the shared doc-filter) were the
 * deferred follow-up — now swept to <MoneyInput allowEmpty> and guarded by their
 * own file: sum-filter-money-input.test.ts (2026-06-10).
 */

const FE = (...p: string[]) => join(__dirname, '..', 'app', '(app)', ...p);
const CMP = (...p: string[]) => join(__dirname, '..', 'components', ...p);

// Each entry: the page + the money state-bindings that must now flow through
// <MoneyInput valueMinor=…> and must NOT remain as a raw editable `value={…}`.
//
// `alsoScan` (MASTER-TODO #5, 2026-07-28): a page may DELEGATE its money editing
// to an extracted component — the count then has to follow the composition, not
// the file. products/[id] renders `pricesEditor={<ProductPriceEditor …/>}`, so
// its three MoneyInputs (buy / min / sale prices) live in that component. A
// file-only scan reported 0 and read as "the rollout regressed" when it hadn't.
const PAGES: Array<{
  file: string;
  minMoneyInputs: number;
  bannedRaw: string[];
  alsoScan?: string[];
}> = [
  {
    file: FE('cash-in', '[id]', 'page.tsx'),
    minMoneyInputs: 2,
    bannedRaw: ['value={form.sumMinor}', 'value={op.amountMinor}'],
  },
  {
    file: FE('cash-out', '[id]', 'page.tsx'),
    minMoneyInputs: 2,
    bannedRaw: ['value={form.sumMinor}', 'value={op.amountMinor}'],
  },
  {
    file: FE('payments-in', '[id]', 'page.tsx'),
    minMoneyInputs: 2,
    bannedRaw: ['value={form.sumMinor}', 'value={op.amountMinor}'],
  },
  {
    file: FE('payments-out', '[id]', 'page.tsx'),
    minMoneyInputs: 2,
    bannedRaw: ['value={form.sumMinor}', 'value={op.amountMinor}'],
  },
  { file: FE('cash-in', 'new', 'page.tsx'), minMoneyInputs: 2, bannedRaw: ['value={sumMinor}'] },
  { file: FE('cash-out', 'new', 'page.tsx'), minMoneyInputs: 2, bannedRaw: ['value={sumMinor}'] },
  {
    file: FE('payments-in', 'new', 'page.tsx'),
    minMoneyInputs: 2,
    bannedRaw: ['value={sumMinor}'],
  },
  {
    file: FE('payments-out', 'new', 'page.tsx'),
    minMoneyInputs: 2,
    bannedRaw: ['value={sumMinor}'],
  },
  {
    file: FE('counterparty-adjustments', '[id]', 'page.tsx'),
    minMoneyInputs: 1,
    bannedRaw: ['value={form.sumMinor}'],
  },
  {
    file: FE('counterparty-adjustments', 'new', 'page.tsx'),
    minMoneyInputs: 1,
    bannedRaw: ['value={sumMinor}'],
  },
  {
    file: FE('prepayments', '[id]', 'page.tsx'),
    minMoneyInputs: 4,
    bannedRaw: [
      'value={form.sumMinor}',
      'value={form.cashSumMinor}',
      'value={form.noCashSumMinor}',
      'value={form.qrSumMinor}',
    ],
  },
  {
    file: FE('prepayments', 'new', 'page.tsx'),
    minMoneyInputs: 4,
    bannedRaw: [
      'value={sumMinor}',
      'value={cashSumMinor}',
      'value={noCashSumMinor}',
      'value={qrSumMinor}',
    ],
  },
  {
    file: FE('prepayment-returns', '[id]', 'page.tsx'),
    minMoneyInputs: 4,
    bannedRaw: [
      'value={form.sumMinor}',
      'value={form.cashSumMinor}',
      'value={form.noCashSumMinor}',
      'value={form.qrSumMinor}',
    ],
  },
  {
    file: FE('prepayment-returns', 'new', 'page.tsx'),
    minMoneyInputs: 4,
    bannedRaw: [
      'value={sumMinor}',
      'value={cashSumMinor}',
      'value={noCashSumMinor}',
      'value={qrSumMinor}',
    ],
  },
  {
    file: FE('hr', 'payroll', 'page.tsx'),
    minMoneyInputs: 2,
    bannedRaw: ['value={cfg.monthlySalesTargetMinor}', 'value={cfg.monthlyKpiBudgetMinor}'],
  },
  {
    file: FE('products', '[id]', 'page.tsx'),
    minMoneyInputs: 3,
    bannedRaw: [],
    // buyPrice / minPrice / salePrices — extracted out of the page.
    alsoScan: [CMP('products', 'product-price-editor.tsx')],
  },
  { file: FE('payrolls', 'new', 'page.tsx'), minMoneyInputs: 1, bannedRaw: [] },
  { file: FE('payrolls', '[id]', 'page.tsx'), minMoneyInputs: 1, bannedRaw: [] },
];

describe('money inputs use <MoneyInput> (som display), not raw minor <Input>', () => {
  for (const { file, minMoneyInputs, bannedRaw, alsoScan } of PAGES) {
    const rel = file.split(/[/\\]\(app\)[/\\]/)[1] ?? file;
    describe(rel, () => {
      const src = readFileSync(file, 'utf8');
      // The composed surface: the page plus any component it delegates money
      // editing to. `bannedRaw` still applies to the PAGE only — those bindings
      // are page-local state.
      const composed = [src, ...(alsoScan ?? []).map((f) => readFileSync(f, 'utf8'))].join('\n');
      it(`renders ≥${minMoneyInputs} <MoneyInput>`, () => {
        const count = (composed.match(/<MoneyInput/g) ?? []).length;
        expect(count).toBeGreaterThanOrEqual(minMoneyInputs);
      });
      for (const raw of bannedRaw) {
        it(`no raw-minor editable input: ${raw}`, () => {
          // Non-vacuous: this exact binding existed before the rollout.
          expect(src).not.toContain(raw);
        });
      }
    });
  }
});

/**
 * The «invoices balance display» block that used to live here required
 * `value={formatMoney(remainingMinor)}` on the invoice detail pages. That
 * binding has never existed in this repository (`git log -S` is empty) — it
 * came from the other Sherset checkout via the snapshot import, and this repo
 * deliberately keeps payment status OFF the doc editor (moysklad grounding
 * quoted in `invoices-in/[id]/page.tsx`). See MASTER-TODO #3.
 *
 * The surviving invariant — invoice money is never rendered as raw minor units —
 * is now enforced where the values are actually rendered, by
 * `app/(app)/invoices-in/[id]/invoices-paid-display.test.ts` (17 tests: list
 * cells + CSV cellText currency-aware, detail pages free of raw-minor leaks).
 * Removed here rather than duplicated, so there is one owner per invariant.
 */
