#!/usr/bin/env tsx
/**
 * progress-report.ts — read-only scanner that prints honest coverage
 * numbers for the moysklad 1:1 parity effort.
 *
 * Run: `pnpm progress`
 *
 * Output: stdout summary + writes `docs/progress.json` (machine-readable).
 *
 * The numbers come from filesystem facts, not maintained-by-hand prose:
 *   - list_pages.dedicated  = count of `apps/web/src/components/*\/bulk-actions-dropdown.tsx`
 *   - list_pages.shared     = count of pages reusing assortment/ shared dropdowns
 *   - list_pages.inline     = count of pages with inline BulkActionDropdown in page.tsx
 *   - detail_pages.audited  = count of `docs/audits/*-detail.audit.md` files
 *   - mass_edit.endpoints   = count of @Post('mass-edit') across api modules
 *   - mass_edit.live_smoke  = pass count from latest `pnpm smoke:all` log (if present)
 *
 * The NEXT.md inflation issue (sessions counting different qualities as the
 * same "X/56") motivated this script — progress numbers come from grep, not
 * from optimistic prose.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function listDirs(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path).filter((n) => {
    try {
      return statSync(join(path, n)).isDirectory();
    } catch {
      return false;
    }
  });
}

function listFilesRecursive(path: string, depth = 3): string[] {
  if (!existsSync(path) || depth < 0) return [];
  const out: string[] = [];
  for (const n of readdirSync(path)) {
    const full = join(path, n);
    try {
      const s = statSync(full);
      if (s.isDirectory()) out.push(...listFilesRecursive(full, depth - 1));
      else out.push(full);
    } catch {}
  }
  return out;
}

function grepCount(path: string, pattern: RegExp): number {
  if (!existsSync(path)) return 0;
  try {
    const body = readFileSync(path, 'utf-8');
    const m = body.match(pattern);
    return m ? m.length : 0;
  } catch {
    return 0;
  }
}

function countMatchingFiles(dir: string, predicate: (full: string) => boolean, depth = 8): number {
  let n = 0;
  for (const f of listFilesRecursive(dir, depth)) {
    try {
      if (predicate(f)) n++;
    } catch {}
  }
  return n;
}

// ---- List pages ----------------------------------------------------------

// `allListPages` is the RAW count of every top-level route under (app) that has
// a `page.tsx` (57 as of 2026-06-02). It is reported as `actual_routes_in_app`
// for context ONLY — it is deliberately BROADER than the parity denominator.
// It includes ~13 dashboard / landing / settings routes that are NOT moysklad
// catalog "list pages" (home/getting-started, settings, hr, money, analitika,
// reports, retail, production, ecommerce, apps, files, korzina, pipelines).
// Therefore `actual_routes_in_app` (57) is EXPECTED to differ from
// `TOTAL_LIST_PAGES_TARGET` (56, the curated moysklad list-page surface) — the
// two measure different things and must not be reconciled. `phase2_pct` is
// computed against the 56 parity target, which is the correct denominator.
const listPagesDir = join(ROOT, 'apps/web/src/app/(app)');
const allListPages = listDirs(listPagesDir)
  .filter((n) => !n.startsWith('_') && !n.startsWith('('))
  .filter((n) => {
    const f = join(listPagesDir, n, 'page.tsx');
    return existsSync(f);
  });

const componentsDir = join(ROOT, 'apps/web/src/components');
const dedicatedDirs = listDirs(componentsDir).filter((d) => {
  const f = join(componentsDir, d, 'bulk-actions-dropdown.tsx');
  return existsSync(f);
});
const sharedAssortmentReuse = (() => {
  // pages that import from components/assortment
  let n = 0;
  for (const p of allListPages) {
    const pageFile = join(listPagesDir, p, 'page.tsx');
    if (!existsSync(pageFile)) continue;
    if (grepCount(pageFile, /from '@\/components\/assortment\//g) > 0) n++;
  }
  return n;
})();
const inlineDropdownPages = (() => {
  let n = 0;
  for (const p of allListPages) {
    const pageFile = join(listPagesDir, p, 'page.tsx');
    if (!existsSync(pageFile)) continue;
    // page has inline BulkActionDropdown component (purchase-orders pattern)
    if (grepCount(pageFile, /^function BulkActionDropdown\b/gm) > 0) n++;
  }
  return n;
})();

// ---- Detail pages --------------------------------------------------------

// Detail-page count = files ending EXACTLY in `[id]/page.tsx` (one main detail
// screen per entity route). Scanned with depth=8 so deeply-nested routes are not
// dropped — an earlier default depth=3 silently missed
// `analitika/sozlamalar/rollar/[id]/page.tsx` (4 levels deep), reporting 62
// instead of the true 63.
//
// Intentionally EXCLUDED (3 routes): `hr/employees/[id]/permissions`,
// `hr/employees/[id]/salary`, `settings/webhooks/[id]/deliveries`. These are
// sub-tabs / sub-lists of a parent entity detail (not standalone `[id]/page.tsx`
// screens) and are audited *within* their parent's `.audit.md` — so they are not
// separate audit units and must not enter the denominator (else the numerator,
// which is one `.audit.md` per entity, could never reach 100%).
const detailPages = countMatchingFiles(
  listPagesDir,
  (f) => f.endsWith('\\[id]\\page.tsx') || f.endsWith('/[id]/page.tsx'),
);

// ---- Audit files ---------------------------------------------------------
//
// Content gate (2026-05-31 drift-prevention layer 4): a `.audit.md` file
// only counts toward `audited_pct` if it actually contains the protocol
// v2.2 sections A (Structural) AND B (Interactive). Empty files or
// placeholders don't inflate the count. Without this gate a developer
// could `touch docs/audits/foo-detail.audit.md` 36 times and hit "100%
// detail audited" trivially — which is exactly the inflation pattern
// the drift-fix sessiya tried to retire.

const AUDIT_MIN_SECTIONS = [/^##\s+A\.\s+Structural/m, /^##\s+B\.\s+Interactive/m];

function hasAuditContent(path: string): boolean {
  try {
    const body = readFileSync(path, 'utf-8');
    return AUDIT_MIN_SECTIONS.every((re) => re.test(body));
  } catch {
    return false;
  }
}

const auditsDir = join(ROOT, 'docs/audits');
const auditDetailFiles = existsSync(auditsDir)
  ? readdirSync(auditsDir)
      .filter((f) => f.endsWith('-detail.audit.md'))
      .filter((f) => hasAuditContent(join(auditsDir, f)))
  : [];
const auditListFiles = existsSync(auditsDir)
  ? readdirSync(auditsDir)
      .filter((f) => f.endsWith('-list.audit.md'))
      .filter((f) => hasAuditContent(join(auditsDir, f)))
  : [];

// ---- Mass-edit endpoints -------------------------------------------------

const apiModulesDir = join(ROOT, 'apps/api/src/modules');
const massEditEndpoints = (() => {
  let n = 0;
  for (const f of listFilesRecursive(apiModulesDir, 5)) {
    if (!f.endsWith('.controller.ts')) continue;
    if (grepCount(f, /@Post\(['"]mass-edit['"]\)/g) > 0) n++;
  }
  return n;
})();

// ---- moysklad reference captures ----------------------------------------

const refDir = join(ROOT, 'docs/moysklad-reference');
const capturedModules = listDirs(refDir).filter((d) => {
  const f = join(refDir, d, 'states/metadata.json');
  return existsSync(f);
});
// `captured_modules` counts ANY capture (incl. list-state-only screenshots).
// `detail_captured_modules` is the subset with an edit-form `detail/` capture —
// the ones actually grounded for UI-LABEL purposes. The two differ when a module
// renders its list but its edit form is unreachable (e.g. data-empty / option-
// gated account), so a high `captured_modules` must NOT be read as label-coverage.
const detailCapturedModules = capturedModules.filter((d) => existsSync(join(refDir, d, 'detail')));

// ---- Phase-2 cohorts (machine-checkable runtime-QA counter) -------------
//
// Phase-2 = runtime browser + adversarial QA, organised into cohorts (see
// docs/audits/_PHASE2-100-PLAN.md). Until now the "7/7 (100%)" figure lived
// ONLY in NEXT.md / plan prose with nothing machine-checkable — exactly the
// staleness bug-class this whole script exists to kill (a future session could
// read "100%" and trust it long after the underlying state regressed). The
// pre-push hook even referenced a `list_pages.phase2_pct` field that never
// existed here, so it silently printed `undefined%`.
//
// This manifest is the single CODE-side source of truth for the cohort
// decomposition. It is curated (the cohort→page→proof grouping is a plan
// decision, not a filesystem fact) but FALSIFIABLE: a cohort only counts as
// `done` when EVERY proof doc it cites still exists on disk. Renaming/deleting
// a proof doc drops the count below 7/7; adding a NEW cohort here without proof
// docs shows up as `done:false` — forcing explicit accounting in code review
// instead of silent prose inflation.
//
// Two cohorts (production-config, money/returns) were verified inline across
// several smoke sessions rather than via one dedicated battery run.
// `verifiedInline:true` flags this. Both now point at dedicated CONSOLIDATION
// docs naming their evidence in one place: money/returns originally cited
// `_PHASE2-retail-register.audit.md` (which only MENTIONS P1/P2/P3 in passing
// — flagged by the 2026-06-11 session-start audit) → consolidated into
// `_PHASE2-money-returns-cohort.audit.md`; production-config originally cited
// two lateral docs (08l i18n fix + 08o retail fix) — the same
// existence-vs-relevance class, flagged 2026-06-11b → consolidated into
// `_PHASE2-production-config-cohort.audit.md`.
//
// NOT production-ready: Phase-2 is QA only. Phase-3 (staging) and Phase-4
// (gradual rollout) of the global 4-phase model are NOT started — the
// `not_production_ready` flag keeps that caveat machine-visible too.

interface Phase2Cohort {
  name: string;
  pages: string[]; // detail-route slugs in this cohort (informational)
  proofDocs: string[]; // audit docs under docs/audits/ recording the Phase-2 QA
  verifiedInline?: boolean;
}

const PHASE2_COHORTS: Phase2Cohort[] = [
  {
    name: 'Hujjat-detail (Cohort A)',
    pages: [
      'customer-orders',
      'demands',
      'supplies',
      'cash-in',
      'cash-out',
      'moves',
      'payments-in',
      'payments-out',
      'invoices-in',
      'invoices-out',
      'sales-returns',
      'purchase-returns',
      'purchase-orders',
    ],
    proofDocs: [
      '_PHASE2-cohortA-session2-clearfield.audit.md',
      '_PHASE2-cohortA-session3-returns-cogs.audit.md',
    ],
  },
  {
    name: 'Katalog (Cohort B)',
    pages: ['counterparties', 'products', 'projects', 'stores', 'uoms'],
    proofDocs: ['_PHASE2-katalog-cohort.audit.md'],
  },
  {
    name: 'Stock + internal',
    pages: ['enters', 'losses', 'inventories', 'internal-orders'],
    proofDocs: ['_PHASE2-stock-internal-cohort.audit.md'],
  },
  {
    name: 'Production-config',
    pages: [
      'production/boms',
      'production/processes',
      'production/stages',
      'production/work-orders',
    ],
    proofDocs: ['_PHASE2-production-config-cohort.audit.md'],
    verifiedInline: true,
  },
  {
    name: 'Money / returns',
    pages: ['prepayments', 'prepayment-returns', 'counterparty-adjustments'],
    proofDocs: ['_PHASE2-money-returns-cohort.audit.md'],
    verifiedInline: true,
  },
  {
    name: 'Retail',
    pages: ['retail/sales', 'retail/sessions'],
    proofDocs: ['_PHASE2-retail-cash-scale.audit.md', '_PHASE2-retail-register.audit.md'],
  },
  {
    name: 'Catalog items',
    pages: ['bundles', 'services', 'variants', 'tracking-codes'],
    proofDocs: ['_PHASE2-catalog-cohort.audit.md'],
  },
];

const phase2Cohorts = PHASE2_COHORTS.map((c) => {
  const missingProof = c.proofDocs.filter((d) => !existsSync(join(auditsDir, d)));
  return {
    name: c.name,
    page_count: c.pages.length,
    pages: c.pages,
    proof_docs: c.proofDocs,
    verified_inline: c.verifiedInline ?? false,
    done: c.proofDocs.length > 0 && missingProof.length === 0,
    missing_proof_docs: missingProof,
  };
});
const phase2Done = phase2Cohorts.filter((c) => c.done).length;
const phase2Issues = phase2Cohorts
  .filter((c) => !c.done)
  .map((c) => `${c.name}: missing proof doc(s) — ${c.missing_proof_docs.join(', ')}`);
const phase2PagesTotal = phase2Cohorts.reduce((n, c) => n + c.page_count, 0);

// ---- UI-uniformity conventions (machine-checkable, drift-locked) --------
//
// The UI-uniformity track (docs/audits/_UI-CONVENTIONS.md) consolidates
// repeated UI decisions (status→tone, archived→tone, button variant, …) onto
// single shared helpers, each LOCKED by a source-scan guard so drift can't
// reappear. Like the phase2 block, this is curated (the convention list is a
// design decision) but FALSIFIABLE: a convention only counts as `locked` when
// its guard test still exists on disk — delete/rename the guard and it flips to
// `locked:false`, surfacing in code review instead of going stale in prose.
// (Added 2026-06-10 — the session-start audit flagged that the UI track had no
// machine-checkable representation, exactly the staleness class this file kills.)

interface UiConvention {
  num: number;
  name: string;
  guardTest: string; // file under apps/web/src/__tests__/
  surfaces: number; // informational: surfaces consolidated onto the shared helper
}

const UI_CONVENTIONS: UiConvention[] = [
  {
    num: 1,
    name: 'Document state → Badge tone (documentStateTone)',
    guardTest: 'document-state-tone.test.ts',
    surfaces: 55,
  },
  {
    num: 2,
    name: 'Action → Button variant (FilterToggleButton ×49 + 44 raw action sites → DS Button; census map + 6 drift fixes; DS link-cva fix)',
    guardTest: 'button-conventions.test.tsx',
    surfaces: 93,
  },
  {
    num: 3,
    name: 'Toolbar composition & order (moyskladToolbar slot canon: createPosition/onRefresh/FilterToggleButton-slot/no-dead-end-selection + DocumentEditor label spread ×26)',
    guardTest: 'toolbar-conventions.test.ts',
    surfaces: 83,
  },
  {
    num: 4,
    name: 'Filter-bar structure (InlineFilterPanel + FilterToggleButton ×49 filter-bearing list pages) + 2 functional-filter regression locks (variants stockMinor-crash removed; tasks ownership=team department-scoped). Field-parity enrichment = incremental backlog, see _CONV4-FILTER-AUDIT-2026-06-11.md',
    guardTest: 'filter-conventions.test.ts',
    surfaces: 49,
  },
  {
    num: 5,
    name: 'Detail-header layout (DetailToolbar+DetailHeader composite pairing ×43 + record-pager lock + analitika h1)',
    guardTest: 'header-conventions.test.ts',
    surfaces: 43,
  },
  {
    num: 6,
    name: 'Domain-status → tone (domain-status-tone: ~20 vocabularies — calls/CRM/HR/settings/reports)',
    guardTest: 'domain-status-tone.test.ts',
    surfaces: 41,
  },
  {
    num: 7,
    name: 'Archived/active record → tone (archivedTone)',
    guardTest: 'archived-tone.test.ts',
    surfaces: 40,
  },
  {
    num: 8,
    name: 'Raw form elements → DS primitives (select→NativeSelect ×137 · textarea→Textarea ×31 · checkbox→Checkbox ×41 · input→Input ×54; EXEMPT registries in guard: rate-micro ×8 · POS ×5 · pills ×2 · radio ×9 · file ×5)',
    guardTest: 'raw-element-conventions.test.ts',
    surfaces: 263,
  },
];

const webTestsDir = join(ROOT, 'apps/web/src/__tests__');
const uiConventions = UI_CONVENTIONS.map((c) => ({
  num: c.num,
  name: c.name,
  guard_test: c.guardTest,
  surfaces: c.surfaces,
  locked: existsSync(join(webTestsDir, c.guardTest)),
}));
const uiConventionsLocked = uiConventions.filter((c) => c.locked).length;
const uiConventionsIssues = uiConventions
  .filter((c) => !c.locked)
  .map((c) => `Convention ${c.num} (${c.name}): missing guard test ${c.guard_test}`);

// ---- Build payload ------------------------------------------------------

const TOTAL_LIST_PAGES_TARGET = 56; // moysklad's surface (captured from MEMORY.md scope rule)
// Detail-page denominator is the ACTUAL number of `[id]/page.tsx` routes in the
// app (a filesystem fact) — NOT a hand-set estimate. An earlier hardcoded "36"
// had drifted ~42% below the real count of detail routes, which would have
// inflated any future `audited_pct` by ~1.7x (e.g. 10 audited would read
// 10/36 = 28% instead of the honest 10/62 = 16%). Deriving the target from the
// filesystem keeps the denominator self-correcting as detail pages are added —
// the same anti-inflation philosophy this whole script enforces (see header).
const TOTAL_DETAIL_PAGES_TARGET = detailPages;

// NOTE: this counts list pages that have a STRUCTURAL toolbar/bulk-action
// component built (dedicated dir + shared-assortment reuse + inline page-level).
// It is NOT browser Phase-2 QA coverage — true Phase-2 QA = 0% (no page has been
// browser-smoked). The old field names (`phase2_covered`/`phase2_pct`) implied QA
// coverage and were misleading; renamed to reflect what they actually measure.
const listToolbarComponentsBuilt =
  dedicatedDirs.length + sharedAssortmentReuse + inlineDropdownPages;

const payload = {
  generatedAt: new Date().toISOString(),
  list_pages: {
    total_target: TOTAL_LIST_PAGES_TARGET,
    actual_routes_in_app: allListPages.length,
    toolbar_components_built: listToolbarComponentsBuilt,
    toolbar_components_pct: Math.round(
      (listToolbarComponentsBuilt / TOTAL_LIST_PAGES_TARGET) * 100,
    ),
    dedicated_components: dedicatedDirs.length,
    shared_assortment_reuse: sharedAssortmentReuse,
    inline_page_level: inlineDropdownPages,
    dedicated_list: dedicatedDirs.sort(),
  },
  detail_pages: {
    total_target: TOTAL_DETAIL_PAGES_TARGET,
    actual_in_app: detailPages,
    audited: auditDetailFiles.length,
    audited_pct: Math.round((auditDetailFiles.length / (TOTAL_DETAIL_PAGES_TARGET || 1)) * 100),
    files: auditDetailFiles.sort(),
  },
  list_audits: {
    audited: auditListFiles.length,
    files: auditListFiles.sort(),
  },
  mass_edit: {
    backend_endpoints: massEditEndpoints,
    smoke_log_hint: 'Run `pnpm smoke:all` and parse the tail for live-smoke + adversarial counts',
  },
  moysklad_reference: {
    captured_modules: capturedModules.length,
    detail_captured_modules: detailCapturedModules.length,
    modules: capturedModules.sort(),
  },
  phase2: {
    cohorts_total: PHASE2_COHORTS.length,
    cohorts_done: phase2Done,
    pct: Math.round((phase2Done / (PHASE2_COHORTS.length || 1)) * 100),
    pages_total: phase2PagesTotal,
    // Phase-2 = runtime QA only. 100% here is NOT "production-ready": Phase-3
    // (staging) and Phase-4 (gradual rollout) are not started, and a handful of
    // grounding-gated items are excluded (see _PHASE2-100-PLAN.md §6).
    not_production_ready: true,
    note: 'Phase-2 = runtime browser+adversarial QA per cohort. cohorts_done is COMPUTED from proof-doc existence (docs/audits/_PHASE2-*.audit.md) — not hand-set. 100% means QA cohorts verified, NOT production-ready (Phase-3/4 not started). Source of truth: docs/audits/_PHASE2-100-PLAN.md + scripts/progress-report.ts manifest.',
    cohorts: phase2Cohorts,
    issues: phase2Issues,
  },
  ui_conventions: {
    total: UI_CONVENTIONS.length,
    locked: uiConventionsLocked,
    pct: Math.round((uiConventionsLocked / (UI_CONVENTIONS.length || 1)) * 100),
    note: 'UI-uniformity track (docs/audits/_UI-CONVENTIONS.md). `locked` is COMPUTED from each guard test existing under apps/web/src/__tests__/ — not hand-set. All 8 conventions (1-8) now locked. Conv-4 (2026-06-11) locks the filter-bar STRUCTURE (InlineFilterPanel + FilterToggleButton across 49 pages) + 2 functional-filter regression locks; per-entity field-parity enrichment is incremental backlog (_CONV4-FILTER-AUDIT-2026-06-11.md), not part of the lock.',
    conventions: uiConventions,
    issues: uiConventionsIssues,
  },
};

// Stdout report (biome-ignore noConsole — this is a CLI reporter script).

console.info('============================================================');

console.info('Moysklad 1:1 parity — honest progress report');

console.info('============================================================\n');

console.info('List pages (structural toolbar components built — NOT browser QA):');

console.info(`  Dedicated component   : ${payload.list_pages.dedicated_components}`);

console.info(`  Shared assortment     : ${payload.list_pages.shared_assortment_reuse}`);

console.info(`  Inline page-level     : ${payload.list_pages.inline_page_level}`);

console.info('  -------------------------');

console.info(
  `  Built / target        : ${listToolbarComponentsBuilt}/${TOTAL_LIST_PAGES_TARGET} = ${payload.list_pages.toolbar_components_pct}%`,
);

console.info(`  (Total routes in /app : ${payload.list_pages.actual_routes_in_app})\n`);

console.info('Detail pages:');

console.info(`  Actual in /app        : ${payload.detail_pages.actual_in_app}`);

console.info(
  `  Audited (.audit.md)   : ${payload.detail_pages.audited}/${TOTAL_DETAIL_PAGES_TARGET} = ${payload.detail_pages.audited_pct}%\n`,
);

console.info(`Mass-edit endpoints: ${payload.mass_edit.backend_endpoints}`);

console.info(
  `Captured moysklad metadata.json: ${payload.moysklad_reference.captured_modules} modules\n`,
);

console.info('Phase-2 cohorts (runtime QA — NOT production-ready):');

console.info(
  `  Cohorts done / total : ${payload.phase2.cohorts_done}/${payload.phase2.cohorts_total} = ${payload.phase2.pct}%  (${payload.phase2.pages_total} pages)`,
);
if (payload.phase2.issues.length > 0) {
  for (const issue of payload.phase2.issues) {
    console.info(`  ! ${issue}`);
  }
}
console.info('');

console.info('UI-uniformity conventions (drift-locked):');

console.info(
  `  Locked / total       : ${payload.ui_conventions.locked}/${payload.ui_conventions.total} = ${payload.ui_conventions.pct}%`,
);
for (const c of payload.ui_conventions.conventions) {
  console.info(
    `  - #${c.num} ${c.name} — ${c.locked ? 'LOCKED' : 'MISSING GUARD'} (${c.surfaces} surfaces)`,
  );
}
console.info('');

console.info('Dedicated dropdown modules:');
for (const d of payload.list_pages.dedicated_list) {
  console.info(`  - ${d}`);
}

const out = join(ROOT, 'docs/progress.json');
writeFileSync(out, JSON.stringify(payload, null, 2));

console.info('\nWrote: docs/progress.json');
