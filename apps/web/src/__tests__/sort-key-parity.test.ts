import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FE↔BE sort-key parity lock (1:1 plan §1.6).
 *
 * A list column with `sortable: true` sends `sortBy = (sortField ?? key)`
 * (`DataTable.tsx`: `const sortFieldName = col.sortField ?? col.key`). If that
 * value is not in the backend Zod `sortBy` enum, the header click is rejected by
 * validation → 400 / no-op (the user clicks and nothing sorts). typecheck/lint
 * cannot see this FE↔BE gap, so this source scan pins it.
 *
 * Two were broken (found by the 2026-06-13 1:1 inventory, fixed §1.6):
 *   - consignments «Код» sent sortBy='code' — absent from the BE enum.
 *   - commission-reports «Контрагент» sent sortBy='agent' — absent from the enum
 *     (and `agent` is a relation, so the service maps it to a nested orderBy).
 *
 * ── Rewritten 2026-07-28 (MASTER-TODO #4) ──────────────────────────────────
 * The FE side used to be a HAND-CURATED key list, and it had drifted: it
 * claimed commission-reports sorts by `sumMinor` / `rewardSumMinor` /
 * `payedSumMinor`. The page sends no such thing — its sortable columns are
 * keyed `sum` / `commission` / `payed` … and every one of them IS in the BE
 * enum. (Those *Minor names belong to the other Sherset checkout the snapshot
 * import came from — the same stale-registry class as the invoices «Оплачено»
 * guard.) A curated list that describes a different repo reports phantom
 * breakage while hiding real breakage.
 *
 * The FE keys are now DERIVED from the page source, so the registry cannot rot:
 * add a sortable column and this test checks it automatically. Only the
 * (page → BE schema) pairing stays curated.
 */
const REPO = join(__dirname, '..', '..', '..', '..');

function beSortEnum(schemaRelPath: string): string[] {
  const src = readFileSync(join(REPO, schemaRelPath), 'utf8');
  const m = src.match(/sortBy:\s*z[\s\S]{0,120}?\.enum\(\[([^\]]+)\]\)/);
  if (!m?.[1]) throw new Error(`no sortBy enum found in ${schemaRelPath}`);
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);
}

/**
 * Effective `sortBy` of every `sortable: true` column on a list page.
 *
 * Column literals are `{ key: 'x', …, sortable: true, sortField?: 'y' }`, so we
 * slice the source at each `key:` and inspect the window up to the next one.
 */
function feSortKeys(pageRelPath: string): string[] {
  const src = readFileSync(join(REPO, pageRelPath), 'utf8');
  const marks = [...src.matchAll(/key:\s*'([A-Za-z0-9_]+)'/g)].map((m) => ({
    key: m[1] as string,
    idx: m.index as number,
  }));
  const out: string[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i]?.idx ?? 0;
    const end = marks[i + 1]?.idx ?? src.length;
    const win = src.slice(start, end);
    if (!/sortable:\s*true/.test(win)) continue;
    const sortField = win.match(/sortField:\s*'([A-Za-z0-9_]+)'/)?.[1];
    out.push(sortField ?? (marks[i]?.key as string));
  }
  return [...new Set(out)];
}

/** Curated: which BE schema each list talks to. Keys are derived, not listed. */
const CASES: Array<{ name: string; page: string; schema: string; minSortable: number }> = [
  {
    name: 'consignments',
    page: 'apps/web/src/app/(app)/consignments/page.tsx',
    schema: 'apps/api/src/modules/consignment/consignment.schema.ts',
    minSortable: 3,
  },
  {
    name: 'commission-reports',
    page: 'apps/web/src/app/(app)/commission-reports/page.tsx',
    schema: 'apps/api/src/modules/commission-report/commission-report.schema.ts',
    minSortable: 8,
  },
];

describe('FE sortable columns send a BE-accepted sortBy (1:1 §1.6)', () => {
  for (const c of CASES) {
    const allowed = beSortEnum(c.schema);
    const keys = feSortKeys(c.page);

    it(`${c.name}: NON-VACUOUS — sortable columns were actually found`, () => {
      expect(keys.length).toBeGreaterThanOrEqual(c.minSortable);
    });

    it(`${c.name}: NON-VACUOUS — the BE enum was actually parsed`, () => {
      expect(allowed.length).toBeGreaterThan(2);
    });

    it(`${c.name}: every sortable column's sortBy is in the BE enum`, () => {
      const rejected = keys.filter((k) => !allowed.includes(k));
      expect(
        rejected,
        `${c.name}: these header clicks would 400 — FE sends [${rejected.join(', ')}], BE accepts [${allowed.join(', ')}]`,
      ).toEqual([]);
    });
  }
});
