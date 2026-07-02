import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Convention 4 — Filter-bar composition (docs/audits/_UI-CONVENTIONS.md).
 *
 * The last UI-uniformity axis. moysklad renders list filters as an INLINE
 * expandable grid above the row table (Найти/Очистить in the first cell,
 * saved-filter pills, fields across N columns) — NOT a sidebar drawer. Our
 * DS primitive `InlineFilterPanel` (packages/design-system) encodes this, and
 * the toolbar «Фильтр» toggle is the shared `FilterToggleButton`.
 *
 * Section A pins the STRUCTURAL convention: every filter-bearing list page
 * renders via InlineFilterPanel + FilterToggleButton, so no page can drift to
 * a bespoke `<div>`/Sheet filter. (Field-level moysklad parity — which fields,
 * how many — is tracked as a per-entity coverage map in _UI-CONVENTIONS.md
 * §Conv-4, not locked here; that is incremental feature work, not uniformity.)
 *
 * Sections B/C are FUNCTIONAL regression locks for the two dead/mis-wired
 * filters the 2026-06-11 Conv-4 recon found (FE→BE contract drift, the
 * money-kind/abc-report bug class — a filter that renders but does not filter
 * end-to-end). tc/biome can't see these (a conditional-spread bypasses
 * excess-property checks; an unhandled enum value just no-ops), so they need
 * a source-scan.
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const page = (slug: string) => read(`apps/web/src/app/(app)/${slug}/page.tsx`);

// Every list page that ships a filter bar. Discovery-grounded (the 2026-06-11
// recon over all ListView pages); the no-filter settings/retail tables are
// intentionally excluded. Adding a new filtered list page → add it here.
const FILTER_LIST_PAGES = [
  'cash-in',
  'cash-out',
  'counterparties',
  'customer-orders',
  'demands',
  'invoices-out',
  'payments-in',
  'payments-out',
  'products',
  'settings/projects',
  'enters',
  'inventories',
  'invoices-in',
  'losses',
  'moves',
  'purchase-orders',
  'supplies',
  'bundles',
  'calls',
  'commission-reports',
  'contact-persons',
  'counterparty-adjustments',
  'discounts',
  'money',
  'opportunities',
  'payrolls',
  'pipelines',
  'prepayment-returns',
  'prepayments',
  'production/boms',
  'production/processes',
  'production/stages',
  'production/work-orders',
  'productions',
  'sales-returns',
  'services',
  'settings/expense-items',
  'settings/task-types',
  'settings/task-statuses',
  'settings/tax-rates',
  'tasks',
  'tracking-codes',
  'variants',
  'factures-in',
  'factures-out',
  'internal-orders',
  'price-lists',
  'processing-orders',
  'processings',
  'purchase-returns',
] as const;

describe('Convention 4 — filter-bar structural lock', () => {
  it('covers a non-trivial set of filter-bearing list pages', () => {
    // Non-vacuity floor: keeps the convention meaningful if the list is gutted.
    expect(FILTER_LIST_PAGES.length).toBeGreaterThanOrEqual(45);
  });

  it.each(FILTER_LIST_PAGES)('%s renders its filter via the DS InlineFilterPanel', (slug) => {
    expect(page(slug)).toContain('InlineFilterPanel');
  });

  it.each(FILTER_LIST_PAGES)('%s toggles the filter via the shared FilterToggleButton', (slug) => {
    expect(page(slug)).toContain('FilterToggleButton');
  });
});

describe('Convention 4 — functional filter regression locks (2026-06-11 recon)', () => {
  // B. variants «Ниже минимума»: built `where.stockMinor`, a column that does
  //    NOT exist on the Variant model (conditional-spread hid it from tc) →
  //    GET /variants threw PrismaClientValidationError (500). Removed because
  //    variant stock isn't denormalized and moysklad has no variant list.
  it('variant service never builds a where-clause on the phantom Variant.stockMinor column', () => {
    // Scan for the where-key usage `stockMinor:`, not the bare word, so the
    // explanatory comment documenting the removed bug doesn't trip the guard.
    expect(read('apps/api/src/modules/variant/variant.service.ts')).not.toMatch(/stockMinor\s*:/);
  });

  it('VariantFilterSchema no longer exposes the unbackable belowMinimum filter', () => {
    expect(read('apps/api/src/modules/variant/variant.schema.ts')).not.toMatch(/belowMinimum\s*:/);
  });

  it('variants page no longer renders the crashing below-minimum control', () => {
    const src = page('variants');
    expect(src).not.toContain('filter-below-minimum');
    expect(src).not.toMatch(/belowMinimum/);
  });

  // C. tasks ownership «Командные»/team: the pill sent ownership=team but the
  //    service only branched on 'mine' → the param fell through to an empty
  //    where (== 'all'), so the pill rendered, was selectable, and filtered
  //    NOTHING. Now resolved via Employee.department (the OWN_GROUP scope).
  it('task service honours ownership=team (department-scoped), not just mine', () => {
    const svc = read('apps/api/src/modules/task/task.service.ts');
    expect(svc).toContain('resolveTeamAssigneeIds');
    expect(svc).toMatch(/ownership === 'team'/);
    // department is the grounding for "team" (OWN_GROUP vocabulary)
    expect(svc).toContain('department');
  });

  it('task schema still accepts the team ownership value the pill sends', () => {
    expect(read('apps/api/src/modules/task/task.schema.ts')).toMatch(
      /ownership:\s*z\.enum\(\[[^\]]*'team'/,
    );
  });
});
