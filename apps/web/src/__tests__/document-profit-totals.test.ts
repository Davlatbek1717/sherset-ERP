import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Document «Прибыль» (gross profit) totals-row lock (1:1 plan §1.5).
 *
 * The shared DetailTotalsSidebar gained an optional `profitMinor` prop so goods
 * docs can show moysklad's «Прибыль» row. It is rendered ONLY when provided, and
 * callers pass it solely once COGS is known (posted doc) — a draft has
 * costSumMinor=0 and must NOT show full revenue as profit. Lock both halves so a
 * refactor can't (a) drop the row or (b) leak draft profit.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const sidebar = readFileSync(
  join(REPO, 'apps/web/src/components/document-detail/detail-totals-sidebar.tsx'),
  'utf8',
);
const demands = readFileSync(join(REPO, 'apps/web/src/app/(app)/demands/[id]/page.tsx'), 'utf8');

describe('document «Прибыль» totals row (1:1 §1.5)', () => {
  it('sidebar renders the profit row only when profitMinor is provided', () => {
    expect(sidebar).toMatch(/profitMinor\?: string/);
    expect(sidebar).toMatch(/profitMinor !== undefined &&/);
    expect(sidebar).toMatch(/t\('profit'\)/);
  });

  it('demands computes profit = sale − COGS, gated on cost>0 (no draft full-revenue)', () => {
    // COGS is read from the API field…
    expect(demands).toMatch(/const costSumBig = BigInt\(data\.costSumMinor/);
    // …and profit is (sum − cost), emitted ONLY when cost is known.
    //
    // Matched by SHAPE, not by one identifier: the page names its persisted
    // total `savedSumBig` (there is also a live editor total, and cost must be
    // paired with the saved one). The previous literal pinned `sumBig` and so
    // reported breakage for a spelling difference — MASTER-TODO #6.
    expect(demands).toMatch(
      /costSumBig > 0n \? \(\w*[sS]umBig - costSumBig\)\.toString\(\) : undefined/,
    );
    expect(demands).toMatch(/profitMinor=\{profitMinor\}/);
  });

  it('NON-VACUOUS: the draft gate is a real conditional, not a constant', () => {
    // If someone drops the `costSumBig > 0n ?` guard, a draft (cost = 0) shows
    // the whole revenue as profit. Pin that the undefined branch exists.
    expect(demands).toMatch(/const profitMinor = [^;]*: undefined;/);
  });
});
