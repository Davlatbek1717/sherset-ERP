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
    expect(demands).toMatch(/const costSumBig = BigInt\(data\.costSumMinor/);
    expect(demands).toMatch(/costSumBig > 0n \? \(sumBig - costSumBig\)\.toString\(\) : undefined/);
    expect(demands).toMatch(/profitMinor=\{profitMinor\}/);
  });
});
