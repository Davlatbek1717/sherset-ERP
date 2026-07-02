import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FE↔BE sort-key parity lock (1:1 plan §1.6).
 *
 * A list column with `sortable: true` sends `sortBy = (sortField ?? key)`. If
 * that value is not in the backend Zod `sortBy` enum, the column-header click is
 * rejected by validation → 400 / no-op (the user clicks and nothing sorts).
 * typecheck/lint cannot see this FE↔BE contract gap, so this curated scan pins
 * it: every sortable column's effective `sortBy` must be a member of the BE enum.
 *
 * Two were broken (found by the 2026-06-13 1:1 inventory, fixed §1.6):
 *   - consignments «Код» sent sortBy='code' — absent from the BE enum.
 *   - commission-reports «Контрагент» sent sortBy='agent' — absent from the enum
 *     (and `agent` is a relation, so the service maps it to a nested orderBy).
 *
 * Adding a new sortable column? Add its effective sortBy here AND to the BE enum
 * (and a nested-orderBy mapping in the service if it is a relation).
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

// Curated registry: (list, BE schema, the effective sortBy of every sortable column).
const CASES: Array<{ name: string; schema: string; sortKeys: string[] }> = [
  {
    name: 'consignments',
    schema: 'apps/api/src/modules/consignment/consignment.schema.ts',
    // «Код» (key=code), «Срок годности» (sortField=expiryDate)
    sortKeys: ['code', 'expiryDate'],
  },
  {
    name: 'commission-reports',
    schema: 'apps/api/src/modules/commission-report/commission-report.schema.ts',
    // «Наименование»(name) «Дата»(moment) «Контрагент»(agent) «Сумма»(sumMinor)
    // «Вознаграждение»(rewardSumMinor) «Оплачено»(payedSumMinor)
    sortKeys: ['name', 'moment', 'agent', 'sumMinor', 'rewardSumMinor', 'payedSumMinor'],
  },
];

describe('FE sortable columns send a BE-accepted sortBy (1:1 §1.6)', () => {
  for (const c of CASES) {
    const allowed = beSortEnum(c.schema);
    for (const key of c.sortKeys) {
      it(`${c.name}: sortBy='${key}' is accepted by the BE enum`, () => {
        expect(allowed).toContain(key);
      });
    }
  }
});
