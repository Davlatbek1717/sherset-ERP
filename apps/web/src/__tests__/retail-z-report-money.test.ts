import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * retail/z-report money-currency + «Смены»-column parity lock (1:1 plan §2.5).
 *
 * The z-report list reuses the sessions-list money cells but, having no audit
 * doc, never received the cohort-L10 money fix: it rendered the sales/returns/
 * discrepancy cells with `formatMoney(BigInt(x))` — no currency, hardcoded «сум»
 * suffix — ignoring the per-row `cashDesk.currency`, and it omitted the «Склад»/
 * «Организация» «Смены» columns the BE already returns. Lock the fix so it can't
 * regress and so z-report can't silently diverge from its sessions sibling again.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const src = readFileSync(join(REPO, 'apps/web/src/app/(app)/retail/z-report/page.tsx'), 'utf8');

describe('retail/z-report money + column parity (1:1 §2.5)', () => {
  it('money cells thread cashDesk.currency (no bare formatMoney(BigInt)/formatMoney(d))', () => {
    expect(src).not.toMatch(/formatMoney\(BigInt\(row\.\w+SumMinor\)\)/);
    expect(src).not.toMatch(/formatMoney\(d\)/);
    const threaded = src.match(/row\.cashDesk\.currency, \{ displayAs: 'none' \}/g) ?? [];
    expect(threaded.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the «Склад» + «Организация» «Смены» columns', () => {
    expect(src).toMatch(/key: 'store'/);
    expect(src).toMatch(/key: 'organization'/);
    expect(src).toMatch(/organization: \{ id: string; name: string \}/);
  });
});
