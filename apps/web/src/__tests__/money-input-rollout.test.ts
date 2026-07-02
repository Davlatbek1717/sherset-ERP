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

// Each entry: the page + the money state-bindings that must now flow through
// <MoneyInput valueMinor=…> and must NOT remain as a raw editable `value={…}`.
const PAGES: Array<{ file: string; minMoneyInputs: number; bannedRaw: string[] }> = [
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
  { file: FE('products', '[id]', 'page.tsx'), minMoneyInputs: 3, bannedRaw: [] },
  { file: FE('payrolls', 'new', 'page.tsx'), minMoneyInputs: 1, bannedRaw: [] },
  { file: FE('payrolls', '[id]', 'page.tsx'), minMoneyInputs: 1, bannedRaw: [] },
];

describe('money inputs use <MoneyInput> (som display), not raw minor <Input>', () => {
  for (const { file, minMoneyInputs, bannedRaw } of PAGES) {
    const rel = file.split(/[/\\]\(app\)[/\\]/)[1] ?? file;
    describe(rel, () => {
      const src = readFileSync(file, 'utf8');
      it(`renders ≥${minMoneyInputs} <MoneyInput>`, () => {
        const count = (src.match(/<MoneyInput/g) ?? []).length;
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

describe('invoices balance display uses formatMoney (not raw minor)', () => {
  for (const f of ['invoices-in', 'invoices-out']) {
    it(`${f} field-remaining is formatted`, () => {
      const src = readFileSync(FE(f, '[id]', 'page.tsx'), 'utf8');
      expect(src).toMatch(/value=\{formatMoney\(remainingMinor\)\}/);
      expect(src).not.toMatch(/value=\{remainingMinor\}/);
    });
  }
});
