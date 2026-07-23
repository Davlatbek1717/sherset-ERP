import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Button } from '@moysklad/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Convention 2 — Action → Button variant (docs/audits/_UI-CONVENTIONS.md).
 *
 * Locks:
 *  1. DS Button `variant="link"` geometry: cva emits the size axis AFTER the
 *     variant axis and cn/twMerge keeps the last conflict, so without the
 *     compound variant a bare link rendered as a 36px padded box (h-9 px-4
 *     from the default md size). The compound variant must keep winning.
 *  2. FilterToggleButton is THE list-toolbar «Фильтр» toggle — no page may
 *     re-declare the raw <button data-test-id="filter-toggle"> copy.
 *  3. Census drift-locks: the six WRONG deviations found by the 2026-06-11
 *     census stay fixed (modal-footer cancel=secondary; inline
 *     add-to-collection=secondary; entity-level destructive uninstall;
 *     combined archive/restore toggle=secondary; archive is never
 *     destructive).
 *  4. Shared-slot locks: DetailToolbar save=success/close=tertiary/menu
 *     triggers=secondary; ConfirmDialog confirm honours tone.
 */

const WEB_SRC = join(__dirname, '..');
const DS_SRC = join(__dirname, '../../../../packages/design-system/src');
const read = (rel: string, root = WEB_SRC) => readFileSync(join(root, rel), 'utf8');

describe('DS Button — link variant geometry (cva-ordering lock)', () => {
  it('bare variant="link" renders inline geometry — h-auto px-0 must win over the size axis', () => {
    render(
      <Button variant="link" data-test-id="b">
        x
      </Button>,
    );
    const cls = (screen.getByTestId('b') as HTMLButtonElement).className;
    expect(cls).toContain('h-auto');
    expect(cls).toContain('px-0');
    expect(cls).not.toMatch(/\bh-9\b/);
    expect(cls).not.toMatch(/\bpx-4\b/);
  });

  it('variant="link" with an explicit size still keeps inline geometry', () => {
    render(
      <Button variant="link" size="sm" data-test-id="b2">
        x
      </Button>,
    );
    const cls = (screen.getByTestId('b2') as HTMLButtonElement).className;
    expect(cls).toContain('h-auto');
    expect(cls).toContain('px-0');
    expect(cls).not.toMatch(/\bh-8\b/);
  });
});

// ─── FilterToggleButton — the canonical list-toolbar «Фильтр» toggle ────────

const FILTER_TOGGLE_FILES = [
  'app/(app)/bundles/page.tsx',
  'app/(app)/calls/page.tsx',
  'app/(app)/cash-in/page.tsx',
  'app/(app)/cash-out/page.tsx',
  'app/(app)/commission-reports/page.tsx',
  'app/(app)/contact-persons/page.tsx',
  'app/(app)/counterparties/page.tsx',
  'app/(app)/counterparty-adjustments/page.tsx',
  'app/(app)/customer-orders/page.tsx',
  'app/(app)/demands/page.tsx',
  'app/(app)/discounts/page.tsx',
  'app/(app)/enters/page.tsx',
  'app/(app)/factures-in/page.tsx',
  'app/(app)/factures-out/page.tsx',
  'app/(app)/internal-orders/page.tsx',
  'app/(app)/inventories/page.tsx',
  'app/(app)/invoices-in/page.tsx',
  'app/(app)/invoices-out/page.tsx',
  'app/(app)/losses/page.tsx',
  'app/(app)/money/page.tsx',
  'app/(app)/moves/page.tsx',
  'app/(app)/opportunities/page.tsx',
  'app/(app)/payments-in/page.tsx',
  'app/(app)/payments-out/page.tsx',
  'app/(app)/payrolls/page.tsx',
  'app/(app)/pipelines/page.tsx',
  'app/(app)/prepayment-returns/page.tsx',
  'app/(app)/prepayments/page.tsx',
  'app/(app)/price-lists/page.tsx',
  'app/(app)/processing-orders/page.tsx',
  'app/(app)/processings/page.tsx',
  'app/(app)/production/boms/page.tsx',
  'app/(app)/production/processes/page.tsx',
  'app/(app)/production/stages/page.tsx',
  'app/(app)/production/work-orders/page.tsx',
  'app/(app)/productions/page.tsx',
  'app/(app)/products/page.tsx',
  'app/(app)/purchase-orders/page.tsx',
  'app/(app)/purchase-returns/page.tsx',
  // round 2 — the 9 copies one recon agent mis-classified keepRaw; the
  // drift-lock scan below caught them (fan-out inconsistency bug-class)
  'app/(app)/sales-returns/page.tsx',
  'app/(app)/services/page.tsx',
  'app/(app)/settings/expense-items/page.tsx',
  'app/(app)/settings/projects/page.tsx',
  // round 3 — the prefixed-test-id clone the exact-match regex missed
  // (task-types-filter-toggle); regex made prefix-tolerant 2026-06-11
  'app/(app)/settings/task-types/page.tsx',
  'app/(app)/settings/task-statuses/page.tsx',
  'app/(app)/settings/tax-rates/page.tsx',
  'app/(app)/supplies/page.tsx',
  'app/(app)/tasks/page.tsx',
  'app/(app)/tracking-codes/page.tsx',
  'app/(app)/variants/page.tsx',
  'components/filters/moysklad-doc-filter.tsx',
];

// a raw <button …data-test-id="…filter-toggle"> within one JSX tag.
// The test-id is PREFIX-TOLERANT: settings/task-types survived the 2026-06-11
// Conv-2 migration because its clone used data-test-id="task-types-filter-toggle"
// and the exact-match regex missed it — found by the Conv-3 recon.
const RAW_FILTER_TOGGLE = /<button[\s\S]{0,400}?data-test-id="[^"]*filter-toggle"/;

import { readdirSync, statSync } from 'node:fs';

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walkTsx(p, acc);
    } else if (p.endsWith('.tsx') && !p.includes('.test.')) {
      acc.push(p);
    }
  }
  return acc;
}

describe('Convention 2 — FilterToggleButton canonical lock', () => {
  it('the shared component is built on DS Button secondary/sm with the canonical attributes', () => {
    const src = read('components/filters/filter-toggle-button.tsx');
    expect(src).toContain('variant="secondary"');
    expect(src).toContain('size="sm"');
    expect(src).toContain('type="button"');
    expect(src).toContain('aria-expanded={open}');
    expect(src).toContain('data-test-id="filter-toggle"');
  });

  it.each(FILTER_TOGGLE_FILES)('%s renders the toggle via <FilterToggleButton>', (rel) => {
    expect(read(rel)).toContain('<FilterToggleButton');
  });

  it('drift-lock: no file re-declares a raw <button data-test-id="filter-toggle">', () => {
    const offenders: string[] = [];
    for (const p of walkTsx(WEB_SRC)) {
      if (RAW_FILTER_TOGGLE.test(readFileSync(p, 'utf8'))) offenders.push(p);
    }
    expect(offenders).toEqual([]);
  });

  it('drift-lock regex is non-vacuous (catches a synthetic offender)', () => {
    const offender = `<button
      type="button"
      onClick={() => setFilterOpen((v) => !v)}
      aria-expanded={filterOpen}
      className="whatever"
      data-test-id="filter-toggle"
    >`;
    expect(RAW_FILTER_TOGGLE.test(offender)).toBe(true);
  });
});

// ─── Census drift-locks — the six WRONG deviations stay fixed ───────────────

describe('Convention 2 — census drift-locks', () => {
  it('webhook-dialog modal-footer cancel = secondary', () => {
    expect(read('app/(app)/settings/webhooks/webhook-dialog.tsx')).toMatch(
      /<Button type="button" variant="secondary" onClick=\{props\.onClose\}>/,
    );
  });

  it('attribute-metadata-dialog modal-footer cancel = secondary', () => {
    expect(read('app/(app)/settings/attributes/attribute-metadata-dialog.tsx')).toMatch(
      /<Button type="button" variant="secondary" onClick=\{props\.onClose\}>/,
    );
  });

  it('reason-codes inline add-to-collection = secondary (not the primary default)', () => {
    expect(read('app/(app)/analitika/sozlamalar/_components/reason-codes-view.tsx')).toMatch(
      /variant="secondary"\s+onClick=\{\(\) => addReason\.mutate\(\)\}/,
    );
  });

  it('apps uninstall = destructive variant, hand-rolled red utility classes banned', () => {
    const src = read('app/(app)/apps/[appKey]/page.tsx');
    expect(src).toContain('variant="destructive"');
    expect(src).not.toContain('border-red-200 text-red-600');
  });

  it('ecommerce channel combined archive/restore toggle = secondary', () => {
    expect(read('app/(app)/ecommerce/channels/[id]/page.tsx')).toMatch(
      /variant="secondary"\s+onClick=\{\(\) => archiveMut\.mutate\(\)\}/,
    );
  });

  it('label-templates archive is tertiary — archive is never destructive', () => {
    const src = read('app/(app)/settings/label-templates/[id]/page.tsx');
    expect(src).toMatch(/<Button variant="tertiary" onClick=\{\(\) => archiveMut\.mutate\(\)\}>/);
    expect(src).not.toMatch(/variant="destructive"[^>]*>\s*\{tCommon\('archive'\)\}/);
  });
});

// ─── Shared-slot locks (enforced conventions in shared components) ──────────

describe('Convention 2 — shared-slot locks', () => {
  it('DetailToolbar: save=success, close + 4 menu triggers=secondary', () => {
    // 2026-07 parity pass made «Закрыть» a BORDERED secondary button (moysklad
    // ground: bordered, not borderless tertiary — see the comment in the file),
    // so the lock is now: 1 success save + ≥5 secondary (close + 4 dropdowns).
    const src = read('components/document-detail/detail-toolbar.tsx');
    expect(src).toContain('variant="success"');
    expect(src).not.toContain('variant="tertiary"');
    expect(src.match(/variant="secondary"/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('ConfirmDialog confirm honours tone (destructive rule lives in the DS)', () => {
    const src = read('feedback/ConfirmDialog.tsx', DS_SRC);
    expect(src).toMatch(/tone === 'destructive' \? 'destructive' : 'primary'/);
  });
});

// ─── Migrated-site adoption (cluster-2 fan-out, 44 sites / 31 files) ────────

const MIGRATED: Array<[string, string[]]> = [
  [
    'app/(app)/analitika/sozlamalar/_components/reason-codes-view.tsx',
    ['variant="ghost"', 'size="icon-sm"'],
  ],
  ['app/(app)/apps/page.tsx', ['variant="primary"', 'loading={isBusy}']],
  ['app/(app)/bank-import/page.tsx', ['variant="link"']],
  // «Метки»/tag-add dropped in the 2026-06-21 regroup; the inline status-gear + group-create
  // buttons dropped in the 2026-06-25 cp-card pixel-1:1 pass (moysklad's card has neither), so
  // /[id] no longer hosts a DS Button of its own — only /new keeps the surviving contact-add.
  ['app/(app)/counterparties/new/page.tsx', ['variant="secondary"', 'data-test-id="contact-add"']],
  // link-variant sites left co/new in the 2026-07 shell refactors; the surviving
  // DS Buttons are the secondary toolbar/tab set.
  ['app/(app)/customer-orders/new/page.tsx', ['variant="secondary"']],
  ['app/(app)/demands/new/page.tsx', ['variant="link"']],
  ['app/(app)/factures-in/page.tsx', ['variant="primary"', 'data-test-id="generate-facture-in"']],
  ['app/(app)/factures-out/page.tsx', ['variant="primary"', 'data-test-id="generate-facture-out"']],
  ['app/(app)/hr/attendance/_components/edit-attendance-modal.tsx', ['variant="ghost"']],
  ['app/(app)/hr/employees/page.tsx', ['size="icon-sm"']],
  [
    'app/(app)/hr/employees/_components/role-multi-select.tsx',
    ['variant="primary"', 'variant="secondary"'],
  ],
  ['app/(app)/hr/settings/roles/page.tsx', ['size="icon-sm"']],
  ['app/(app)/internal-orders/new/page.tsx', ['variant="link"']],
  [
    'app/(app)/opportunities/[id]/page.tsx',
    ['variant="destructive"', 'data-test-id="lost-confirm"'],
  ],
  ['app/(app)/page.tsx', ['variant="ghost"']],
  ['app/(app)/price-lists/[id]/page.tsx', ['size="icon-sm"']],
  ['app/(app)/price-lists/new/page.tsx', ['size="icon-sm"']],
  ['app/(app)/processing-orders/new/page.tsx', ['variant="link"']],
  ['app/(app)/processings/new/page.tsx', ['variant="link"']],
  // /products/[id] AND /new now share the form via these components (which carry
  // the DS Button markers); each page asserts it renders the shared form
  // (drift-lock). /new also keeps its own variant="secondary" inert-tab buttons.
  ['app/(app)/products/[id]/page.tsx', ['ProductFormLeftCards', 'ProductPriceEditor']],
  ['app/(app)/products/new/page.tsx', ['variant="secondary"', 'ProductPriceEditor']],
  [
    'components/products/product-form-left-cards.tsx',
    ['variant="secondary"', 'data-test-id="barcode-add"'],
  ],
  ['app/(app)/purchase-orders/new/page.tsx', ['variant="link"']],
  // filter-state-multi-clear died when PO filters moved into the shared
  // FilterToggleButton/SavedFiltersPills components — lock the shared adoption.
  ['app/(app)/purchase-orders/page.tsx', ['FilterToggleButton', 'SavedFiltersPills']],
  ['app/(app)/purchase-returns/new/page.tsx', ['variant="link"']],
  ['app/(app)/retail/page.tsx', ['variant="link"', 'asChild']],
  ['components/command-palette.tsx', ['size="icon"']],
  ['components/customer-orders/show-totals-link.tsx', ['variant="link"']],
  ['components/help-drawer.tsx', ['size="icon-sm"']],
  ['components/notification-bell.tsx', ['variant="link"']],
  ['components/theme-toggle.tsx', ['size="icon"']],
];

describe('Convention 2 — migrated-site adoption', () => {
  it.each(MIGRATED)('%s keeps its DS Button migration markers', (rel, markers) => {
    const src = read(rel as string);
    for (const m of markers as string[]) {
      expect(src, `${rel} must contain ${m}`).toContain(m);
    }
  });
});
