import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the `HrAttendance` soft-delete filter (HR-13, Faza Q7).
 *
 * `delete()` used to HARD-delete the row. Faza Q7 turned it into a soft-delete
 * (`deletedAt`/`deletedById`) + `auditLog` + `auto_late` fine storno — which
 * only holds if EVERY reader excludes the deleted rows. Miss one and the
 * deleted attendance silently keeps showing up in a report, a dashboard, an
 * export or a KPI aggregate; nothing else in the tree would notice.
 *
 * There are 23 such call sites across 12 files today (attendance, attendance-geo,
 * hr-attendance-notify, hr-employee, manager/kpi, manager/live). A hardcoded
 * per-file list would only catch shrinkage, so this scan is derived from the
 * FILESYSTEM: every `hrAttendance.<readMethod>(` in `apps/api/src` must carry
 * `deletedAt` inside its call argument. A new reader added without the filter
 * fails here the day it lands.
 *
 * Non-vacuous: before Faza Q7 the string `deletedAt` did not appear next to a
 * single one of these calls (the column did not exist).
 */

/** Prisma read methods — these are the ones that can leak a deleted row. */
const READ_METHODS = [
  'findMany',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
] as const;

/**
 * Conditional writes keyed on a filter (not on a unique id alone). A
 * soft-deleted row must not be auto-closed / re-closed by a background path.
 * `update()` is deliberately NOT scanned: Prisma requires a unique `where`
 * there and every such call in this tree is preceded by a guarded read.
 */
const WRITE_METHODS = ['updateMany'] as const;

const API_SRC = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'generated' || name === 'node_modules') continue;
      walk(p, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** Text of the call's argument list, from `(` to its matching `)`. */
function callArgs(src: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(openParenIndex, i + 1);
    }
  }
  return src.slice(openParenIndex);
}

interface Site {
  file: string;
  method: string;
  line: number;
  args: string;
}

function collect(methods: readonly string[]): Site[] {
  const sites: Site[] = [];
  for (const file of walk(API_SRC)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('hrAttendance.')) continue;
    const re = new RegExp(`hrAttendance\\.(${methods.join('|')})\\(`, 'g');
    let m: RegExpExecArray | null = re.exec(src);
    while (m !== null) {
      const open = m.index + m[0].length - 1;
      sites.push({
        file: file.slice(API_SRC.length + 1).replace(/\\/g, '/'),
        method: m[1] as string,
        line: src.slice(0, m.index).split('\n').length,
        args: callArgs(src, open),
      });
      m = re.exec(src);
    }
  }
  return sites;
}

describe('HrAttendance soft-delete class-lock (HR-13, Faza Q7)', () => {
  const readers = collect(READ_METHODS);
  const writers = collect(WRITE_METHODS);

  it('the scan actually finds the readers (guard against a broken scan)', () => {
    // 23 reader sites at the time of Faza Q7. Lower bound, not equality: adding
    // a correctly-filtered reader must not turn this red.
    expect(readers.length, 'scan found no hrAttendance readers — walk/regex broke').toBeGreaterThan(
      0,
    );
    expect(readers.length).toBeGreaterThanOrEqual(23);
    // …spread over the whole tree, not just this module.
    const modules = new Set(readers.map((s) => s.file.split('/').slice(0, 3).join('/')));
    expect(modules.size).toBeGreaterThanOrEqual(4);
  });

  it('EVERY hrAttendance reader filters out soft-deleted rows', () => {
    const missing = readers
      .filter((s) => !/\bdeletedAt\b/.test(s.args))
      .map((s) => `${s.file}:${s.line} — hrAttendance.${s.method}()`)
      .sort();
    expect(
      missing,
      "a hrAttendance reader has no `deletedAt: null` filter — a deleted attendance row would keep showing up in reports/aggregates. Add it (or, if the reader intentionally wants deleted rows too, say so in a comment containing 'deletedAt').",
    ).toEqual([]);
  });

  it('conditional writes (updateMany) also skip soft-deleted rows', () => {
    expect(writers.length, 'scan found no hrAttendance updateMany calls').toBeGreaterThanOrEqual(4);
    const missing = writers
      .filter((s) => !/\bdeletedAt\b/.test(s.args))
      .map((s) => `${s.file}:${s.line} — hrAttendance.${s.method}()`)
      .sort();
    expect(
      missing,
      'a conditional hrAttendance write can hit a soft-deleted row (e.g. the nightly auto-checkout cron re-closing a deleted record)',
    ).toEqual([]);
  });

  it('no hard delete survives anywhere in the tree', () => {
    const hard = collect(['delete', 'deleteMany'] as const);
    expect(
      hard.map((s) => `${s.file}:${s.line}`),
      'HrAttendance is soft-deleted — a hard delete destroys the audit trail and orphans the auto_late fine',
    ).toEqual([]);
  });
});
