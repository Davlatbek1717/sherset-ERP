import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the position line-total money-integrity fix (2026-06-13).
 *
 * Every place that computes a money line total `minorPerUnit × qty` (billing
 * gross AND cost-of-goods lines) used the legacy idiom
 *
 *   (minorPerUnit * BigInt(Math.round(qty * 1000))) / 1000n
 *
 * which rounded the QUANTITY to 3 decimals before multiplying, while the
 * schema, the stock ledger (`toMicro`) and FIFO (`parseDecimalScaled`) keep
 * 6 decimals. The billed amount therefore silently diverged from the
 * physically shipped/costed quantity (qty `0.0004` billed 0 but shipped &
 * cost 0.0004 units; `Number(qty)` also drifted near the Decimal(20,6)
 * ceiling). Found by the demands Phase-2 adversarial QA, independently by
 * 3 lenses (_DEMANDS-PHASE2-QA-2026-06-13.md HIGH #1).
 *
 * The fix routes every site through the shared `scaleMinorByQty` primitive
 * (`@moysklad/money`), which parses qty at the full 6 decimals and rounds
 * half-up to the nearest tiyin.
 *
 * Non-vacuous: before the fix EVERY file below contained
 * `BigInt(Math.round(<qty> * 1000))` and did NOT call `scaleMinorByQty`, so
 * both assertions would have failed.
 */

// apps/api/src/modules/shared/ -> repo root
const REPO = join(__dirname, '..', '..', '..', '..', '..');

// Drop comments so the explanatory comment in some files (which mentions the
// removed `Math.round(qty * 1000)` idiom) does not masquerade as live code.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every site that turns a per-unit minor amount + a qty into a tiyin total. */
const SITES = [
  // --- Backend services (authoritative — what the database stores) ---
  'apps/api/src/modules/demand/demand.service.ts',
  'apps/api/src/modules/supply/supply.service.ts',
  'apps/api/src/modules/supply/overhead-distribution.ts',
  'apps/api/src/modules/invoice-out/invoice-out.service.ts',
  'apps/api/src/modules/invoice-in/invoice-in.service.ts',
  'apps/api/src/modules/sales-return/sales-return.service.ts',
  'apps/api/src/modules/purchase-return/purchase-return.service.ts',
  'apps/api/src/modules/purchase-order/purchase-order.service.ts',
  'apps/api/src/modules/customer-order/customer-order.service.ts',
  'apps/api/src/modules/internal-order/internal-order.service.ts',
  'apps/api/src/modules/loss/loss.service.ts',
  'apps/api/src/modules/enter/enter.service.ts',
  'apps/api/src/modules/move/move.service.ts',
  'apps/api/src/modules/retail-sale/compute-positions.ts',
  'apps/api/src/modules/print-template/print-render.util.ts',
  // --- Frontend /new editors (live preview totals) ---
  'apps/web/src/app/(app)/demands/new/page.tsx',
  'apps/web/src/app/(app)/customer-orders/new/page.tsx',
  'apps/web/src/app/(app)/invoices-out/new/page.tsx',
  'apps/web/src/app/(app)/invoices-in/new/page.tsx',
  'apps/web/src/app/(app)/supplies/new/page.tsx',
  'apps/web/src/app/(app)/sales-returns/new/page.tsx',
  'apps/web/src/app/(app)/purchase-returns/new/page.tsx',
  'apps/web/src/app/(app)/purchase-orders/new/page.tsx',
  'apps/web/src/app/(app)/internal-orders/new/page.tsx',
  'apps/web/src/app/(app)/enters/new/page.tsx',
  // --- Shared design-system editors ---
  'packages/design-system/src/document-editor/PositionTable.tsx',
  'packages/design-system/src/patterns/PositionEditor.tsx',
] as const;

describe('position line-total class uses scaleMinorByQty (6-dp, no 3-dp truncation)', () => {
  it('resolves the repo root', () => {
    expect(existsSync(join(REPO, 'pnpm-workspace.yaml'))).toBe(true);
  });

  for (const rel of SITES) {
    describe(rel, () => {
      const raw = readFileSync(join(REPO, rel), 'utf8');
      const code = stripComments(raw);

      it('routes price/cost × qty through a shared 6-dp primitive', () => {
        // Cost lines use scaleMinorByQty; billing totals use computePositionTotal
        // (single-round) — both live in @moysklad/money and keep qty at 6 dp.
        expect(code.includes('scaleMinorByQty(') || code.includes('computePositionTotal(')).toBe(
          true,
        );
      });

      it('no legacy 3-dp qty scaling (`Math.round(qty * 1000)` or `/ 1000n`)', () => {
        // Tolerant of nested parens (Math.round(Number(p.quantity) * 1_000)) and
        // the underscore digit-group separator (1_000 / 1_000n) — the two ways
        // internal-order's miss hid from the first grep + first guard regex.
        expect(code).not.toMatch(/Math\.round\([^;\n]*\*\s*1_?000\b/);
        expect(code).not.toMatch(/\/\s*1_?000n\b/);
      });
    });
  }
});
