import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * demands/[id] payment-chip lock (1:1 plan §2.3).
 *
 * The demand detail header must surface the payment status moysklad shows,
 * derived from `payedSumMinor` (populated by the PaymentIn cascade).
 *
 * ── Rewritten 2026-07-28 (MASTER-TODO #7) ──────────────────────────────────
 * The previous version pinned an OLDER, WEAKER shape: a `pillsSlot` carrying a
 * `detail-header-unpaid` badge rendered only while unpaid, plus the literal
 * identifier `isPaid`. The header has since been unified into the shared
 * `DocumentHeader`, which renders ONE pill in ALL THREE states — its own
 * source says «moysklad shows the pill in ALL THREE states, not just while
 * unpaid» — driven by `paymentLabel` + `paymentTone`. Neither demands nor its
 * invoices-out sibling has used `pillsSlot` since.
 *
 * So the old assertions reported the feature as missing while it was in fact
 * present and more complete. Pinned here against the CURRENT contract, and by
 * shape rather than by one variable spelling.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const page = readFileSync(join(REPO, 'apps/web/src/app/(app)/demands/[id]/page.tsx'), 'utf8');
const header = readFileSync(
  join(REPO, 'packages/design-system/src/document-editor/DocumentHeader.tsx'),
  'utf8',
);

describe('demands/[id] payment chip (1:1 §2.3)', () => {
  it('reads payedSumMinor off the detail type', () => {
    expect(page).toMatch(/payedSumMinor: string/);
    expect(page).toMatch(/const paidBig = BigInt\(data\.payedSumMinor/);
  });

  it('derives the payment state by comparing paid against the SAVED sum', () => {
    // Shape, not spelling: the page calls its persisted total `savedSumBig`
    // (there is also a live editor total, which must NOT drive payment state —
    // unsaved position edits would flip the chip).
    expect(page).toMatch(/BigInt\(data\.sumMinor/);
    expect(page).toMatch(/paidBig >= \w*[sS]umBig/);
    expect(page).toMatch(/paidBig > 0n && paidBig < \w*[sS]umBig/);
  });

  it('feeds the shared header (label + tone), covering all three states', () => {
    expect(page).toMatch(/paymentLabel=\{/);
    expect(page).toMatch(/paymentTone=\{/);
    // Every tone the header understands must be reachable from the page.
    for (const tone of ['paid', 'partial', 'unpaid']) {
      expect(page, `tone '${tone}' unreachable`).toMatch(new RegExp(`'${tone}'`));
    }
  });

  it('the shared header actually renders the pill (guard is not vacuous)', () => {
    expect(header).toMatch(/paymentTone\?: 'unpaid' \| 'partial' \| 'paid'/);
    expect(header).toMatch(/data-test-id="doc-header-payment"/);
    expect(header).toMatch(/data-payment-tone=\{paymentTone\}/);
  });

  it('labels come from i18n, not hardcoded «Не оплачено»', () => {
    expect(page).toMatch(/tDetailHeader\('not_paid'\)/);
    expect(page).toMatch(/tDetailHeader\('partially_paid'\)/);
    expect(page).toMatch(/tDetailHeader\('paid'\)/);
  });
});
