import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Catalog History audit-write lock (2026-06-06, + variant 2026-06-08).
 *
 * bom / processing-process / processing-stage / variant wrote ZERO auditLog rows,
 * so their detail-page History (Tarix) tab — which fetches GET /audit-logs?entity=
 * <slug>&entityId=<id> (exact-match on entity) — was always vacuously empty. They
 * now call a private logAudit on create/update/archive/restore (+ component/stage
 * edits / delete). This locks two things that typecheck/lint cannot see:
 *   1. the entity string EXACTLY matches the web auditEntity prop (a casing
 *      drift would silently re-empty the tab), and
 *   2. the helper is actually called on the mutating paths (≥4×).
 * variant additionally runtime-verified live (create/update[bigint-safe diff]/
 * no-op-guard/archive/restore/delete → exact History order, 2026-06-08).
 */
const MODULES: Array<{ dir: string; slug: string; minCalls: number }> = [
  { dir: 'bom', slug: 'bom', minCalls: 5 }, // create/update/archive/restore/setComponents
  { dir: 'processing-process', slug: 'processingprocess', minCalls: 5 }, // + setStages
  { dir: 'processing-stage', slug: 'processingstage', minCalls: 4 },
  // slug 'Variant' (PascalCase) matches web variants/[id] auditEntity="Variant".
  { dir: 'variant', slug: 'Variant', minCalls: 5 }, // create/update/archive/restore/delete
];

describe('catalog services write auditLog so the History tab is not vacuously empty', () => {
  for (const m of MODULES) {
    it(`${m.dir}.service.ts logs entity '${m.slug}' on its mutating paths`, () => {
      const src = readFileSync(
        fileURLToPath(new URL(`../${m.dir}/${m.dir}.service.ts`, import.meta.url)),
        'utf8',
      );
      // Exact-match contract with the web auditEntity prop.
      expect(src).toContain(`entity: '${m.slug}'`);
      // The helper is wired into the mutating paths.
      const calls = src.match(/this\.logAudit\(/g) ?? [];
      expect(calls.length).toBeGreaterThanOrEqual(m.minCalls);
    });
  }
});
