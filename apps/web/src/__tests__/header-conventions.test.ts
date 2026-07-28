import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Convention 5 — Detail-header layout (registry: docs/audits/_UI-CONVENTIONS.md).
 *
 * The document/catalog detail family renders its header + toolbar through the
 * shared composite: `<DetailToolbar/>` (Save success · Close tertiary · record
 * pager · Изменить/Создать документ/Печать/Отправить) directly above
 * `<DetailHeader/>` (title № name от date · state pill · Проведено · author).
 * Measured 2026-06-11: 43 pages, perfectly paired (no page has one without
 * the other). Other families (settings EditForm, DocumentEditor /new shells,
 * analitika/hr sub-apps, read-only POS/report views) are deliberate,
 * documented in the registry — NOT failures of this guard.
 *
 * Locks:
 *  1. PAIRING — any (app) page using DetailToolbar must use DetailHeader and
 *     vice versa (derived scan: catches future half-adoptions).
 *  2. ADOPTION — the 43 known composite pages keep the composite (explicit,
 *     falsifiable list; removing the composite from a page must fail here).
 *  3. PAGER — every document [id] composite page passes the record pager
 *     (position/onPrev/onNext). Exempt: opportunities/[id] + pipelines/[id]
 *     (CRM detail — no list-pager in their captures; grounding-flagged in the
 *     registry, promote when a capture decides it).
 *  4. ANALITIKA H1 — the analitika sub-app's [id] headers share one h1 shape
 *     (font-semibold text-xl; the xodimlar drift was fixed 2026-06-11).
 */

const APP = join(__dirname, '..', 'app', '(app)');

function walkPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPages(full));
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

const read = (f: string) => readFileSync(f, 'utf8');

// --- 2. ADOPTION ---------------------------------------------------------

const COMPOSITE_ID_PAGES = [
  'bundles',
  'cash-in',
  'cash-out',
  'contact-persons',
  // counterparties/[id] dropped 2026-06-20: its 2-column card rebuild promotes the
  // name to a full-width «* Наименование» input + a minimal author block (no DetailHeader
  // title/state row — moysklad's counterparty card has none). Custom shell → PAIRING_EXEMPT.
  'counterparty-adjustments',
  'customer-orders',
  'demands',
  'enters',
  'internal-orders',
  'inventories',
  'invoices-in',
  'invoices-out',
  'losses',
  'moves',
  'opportunities',
  'payments-in',
  'payments-out',
  'payrolls',
  'pipelines',
  'prepayment-returns',
  'prepayments',
  'price-lists',
  'processing-orders',
  'processings',
  'productions',
  // products/[id] dropped 2026-07-28 (MASTER-TODO #11): it was rebuilt onto the
  // SAME shell as products/new — «Shares the EXACT form of /products/new» — and
  // moysklad's product editor has NO title band. The «Изменения: <name>
  // <datetime>» + author avatar sit on the TOOLBAR's right edge, and the page
  // goes straight from toolbar to a bold full-width «Наименование» input.
  // Demanding the composite here would add a header row moysklad does not show.
  // Custom shell → PAIRING_EXEMPT + its own structural assertion below.
  'purchase-orders',
  'purchase-returns',
  'sales-returns',
  'services',
  'supplies',
  'variants',
] as const;

// products/new dropped 2026-06-19: its 2-column moysklad rebuild (flagship 1)
// promotes the name to a full-width «* Наименование товара» title input in
// place of the DetailHeader title/state/author row — moysklad's product create
// form has no such row. It keeps DetailToolbar (the Сохранить/Закрыть/Печать
// bar) but intentionally has no DetailHeader, so it is a custom /new shell
// (see PAIRING_EXEMPT + the docstring's acknowledged exceptions).
const COMPOSITE_NEW_PAGES = [
  'bundles',
  'calls',
  'contact-persons',
  // counterparties/new dropped 2026-06-21: rebuilt as the same 2-column shell as
  // counterparties/[id] (top «* Наименование» input + left cards + right activity tabs),
  // so the create form has no DetailHeader title/state row either. Custom shell → PAIRING_EXEMPT.
  'opportunities',
  'pipelines',
  'services',
  'tasks',
  'variants',
] as const;

// CRM detail pages without the record pager (grounding-flagged divergence).
const PAGER_EXEMPT = new Set(['opportunities', 'pipelines']);

// Pages that deliberately use DetailToolbar WITHOUT DetailHeader (custom shell).
// products/new + counterparties/{new,[id]}: moysklad's product/counterparty card has
// no title/state/author header row — the name is a full-width «* Наименование» input —
// so the toolbar stands alone above the 2-column form shell.
const PAIRING_EXEMPT = [
  join('products', 'new', 'page.tsx'),
  // products/[id] shares that exact shell (MASTER-TODO #11).
  join('products', '[id]', 'page.tsx'),
  join('counterparties', 'new', 'page.tsx'),
  join('counterparties', '[id]', 'page.tsx'),
];

describe('Convention 5 — detail-header composite (DetailToolbar + DetailHeader)', () => {
  const pages = walkPages(APP);

  it('1. pairing: DetailToolbar and DetailHeader always co-occur', () => {
    const broken: string[] = [];
    for (const p of pages) {
      const src = read(p);
      const hasToolbar = src.includes('<DetailToolbar');
      // Converged detail pages (customer-orders/[id], purchase-orders/[id]) render
      // the EDITABLE shared <DocumentHeader> in place of the static <DetailHeader>
      // (same «№ … от … status · Проведено · owner» row, now editable + owner
      // popover). Accept either as the detail header — dropping BOTH still fails.
      const hasHeader = src.includes('<DetailHeader') || src.includes('<DocumentHeader');
      const exempt = PAIRING_EXEMPT.some((e) => p.endsWith(e));
      if (hasToolbar !== hasHeader && !exempt) broken.push(p.replace(APP, '(app)'));
    }
    expect(broken, `Half-adopted composite (toolbar XOR header):\n${broken.join('\n')}`).toEqual(
      [],
    );
  });

  it.each(COMPOSITE_ID_PAGES)('2. adoption: %s/[id] keeps the composite', (route) => {
    const file = join(APP, route, '[id]', 'page.tsx');
    expect(existsSync(file), `${route}/[id]/page.tsx missing`).toBe(true);
    const src = read(file);
    expect(src).toContain('<DetailToolbar');
    // Either the static <DetailHeader> or the converged editable <DocumentHeader>
    // (customer-orders/[id] + purchase-orders/[id] use the latter — same composite).
    expect(src).toMatch(/<(DetailHeader|DocumentHeader)/);
  });

  /**
   * The PAIRING_EXEMPT pages must not become "untested" — an exemption that
   * asserts nothing is how a real regression hides. products/[id] keeps its
   * grounded custom shell: toolbar present, NO header band, and the
   * «Изменения» + author block living on the toolbar's rightSlot.
   * (MASTER-TODO #11.)
   */
  it('2b. products/[id] keeps its grounded custom shell (no title band)', () => {
    const src = read(join(APP, 'products', '[id]', 'page.tsx'));
    expect(src).toContain('<DetailToolbar');
    expect(src).not.toMatch(/<(DetailHeader|DocumentHeader)/);
    // The author/updated block moysklad puts on the toolbar edge.
    expect(src).toContain('data-test-id="detail-header-updated"');
    expect(src).toContain('data-test-id="detail-header-author-avatar"');
    // …and it is passed as the toolbar's rightSlot, not rendered as its own row.
    expect(src).toMatch(/rightSlot=\{/);
  });

  it.each(COMPOSITE_NEW_PAGES)('2. adoption: %s/new keeps the composite', (route) => {
    const file = join(APP, route, 'new', 'page.tsx');
    expect(existsSync(file), `${route}/new/page.tsx missing`).toBe(true);
    const src = read(file);
    expect(src).toContain('<DetailToolbar');
    expect(src).toContain('<DetailHeader');
  });

  it('3. pager: every non-exempt composite [id] page passes position/onPrev/onNext', () => {
    const missing: string[] = [];
    for (const route of COMPOSITE_ID_PAGES) {
      if (PAGER_EXEMPT.has(route)) continue;
      const src = read(join(APP, route, '[id]', 'page.tsx'));
      if (!(src.includes('position={') && src.includes('onPrev=') && src.includes('onNext='))) {
        missing.push(route);
      }
    }
    expect(missing, `Composite [id] pages without the record pager: ${missing.join(', ')}`).toEqual(
      [],
    );
  });

  it('3b. pager exemptions stay exempt-only (shrink the list when grounded)', () => {
    for (const route of PAGER_EXEMPT) {
      const src = read(join(APP, route, '[id]', 'page.tsx'));
      expect(
        src.includes('position={'),
        `${route}/[id] grew a pager — remove it from PAGER_EXEMPT`,
      ).toBe(false);
    }
  });

  it('4. analitika [id] h1 shape is uniform (font-semibold text-xl)', () => {
    const offenders: string[] = [];
    for (const route of [
      'analitika/buyurtmalar',
      'analitika/kontragentlar',
      'analitika/xodimlar',
    ]) {
      const file = join(APP, route, '[id]', 'page.tsx');
      const src = read(file);
      const h1 = src.match(/<h1[^>]*className="([^"]*)"/)?.[1];
      if (h1 === undefined) {
        offenders.push(`${route}: no h1 with className`);
        continue;
      }
      if (!(h1.includes('font-semibold') && h1.includes('text-xl'))) {
        offenders.push(`${route}: h1 className "${h1}"`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
