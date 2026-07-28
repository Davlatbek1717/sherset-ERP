#!/usr/bin/env node
/**
 * MASTER-TODO #28 — product-code lint gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * `pnpm lint` is `biome check .`, which also covers `scripts/`, `tools/` and the
 * one-shot graveyard files — ~530 errors that nobody intends to fix. A command
 * that is permanently red is not a gate: the product-code count could grow from
 * 19 to 190 and no one would notice, because the output was already a wall of
 * red. (Same failure mode as the 133 silently-red guard tests that #29 closed.)
 *
 * So this script scopes biome to the code we actually ship — `apps/{api,web}/src`
 * and `packages/{*}/src` — and requires **zero errors** there.
 *
 * THE POLICY (decided 2026-07-28, MASTER-TODO #28)
 * ------------------------------------------------
 * error  = must be zero. Every remaining diagnostic in product scope was either
 *          FIXED (useOptionalChain, noUnusedTemplateLiteral, noUnusedVariables)
 *          or SUPPRESSED AT THE SITE with a written reason — read them, they are
 *          the record: ARIA range/separator roles that must not be focusable,
 *          the deliberate Safari `role="list"` restoration, `<output>` being a
 *          form-associated element that a toast is not, `delete process.env.X`
 *          being the only correct env cleanup, and 9 index-keys on lists that
 *          have no identity to key on (placeholders, parsed markdown, ReactNode
 *          labels). A blanket rule-downgrade was rejected: it would also mute
 *          the reorderable, stateful lists where the rules are right.
 *
 * warn   = allowed, deliberately NOT promoted to error:
 *          - useSortedClasses (295) is a NURSERY rule; its autofix reorders class
 *            strings, which can flip the cascade between equal-specificity
 *            utilities. Not stable enough to block a push on.
 *          - noNonNullAssertion (120) — mostly test fixtures and DS internals
 *            where the invariant is local and obvious. Converting each to a
 *            runtime guard is churn with no defect behind it.
 *          - noConsoleLog (46) — MEASURED: every single one is in a CLI entry
 *            point (`apps/api/src/scripts/*`, `packages/workflows/src/cli/*`)
 *            where printing to stdout is the job. Zero in server or UI runtime
 *            code, which is the invariant that actually matters — so this script
 *            asserts THAT instead of the raw count.
 *
 * Escape hatch: CHECK_LINT=0 (WIP branches only).
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Run biome's JS shim under the current node rather than through npx or the
// .bin wrapper: npx prints its own config warnings, and on Windows they land on
// stdout and corrupt the JSON payload (and a .CMD would force `shell: true`).
const BIOME = join(ROOT, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');

if (process.env.CHECK_LINT === '0') {
  console.log('-> lint gate skipped (CHECK_LINT=0)');
  process.exit(0);
}

const SCOPE = [
  'apps/api/src',
  'apps/web/src',
  'packages/design-system/src',
  'packages/money/src',
  'packages/workflows/src',
];

/** CLI entry points where stdout IS the interface. */
const CLI_OK = /(^|\/)(scripts|cli)\//;

let raw = '';
try {
  raw = execFileSync(
    process.execPath,
    [BIOME, 'check', '--max-diagnostics=2000', '--reporter=json', ...SCOPE],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
} catch (err) {
  // biome exits non-zero whenever diagnostics exist — that is the normal path
  // here, so the payload still comes back on stdout.
  raw = err.stdout ?? '';
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('X lint gate: could not parse biome JSON output. Run `pnpm lint:product` by hand.');
  process.exit(1);
}

const diagnostics = report.diagnostics ?? [];
const fileOf = (d) => ((d.location && d.location.path && d.location.path.file) || '?').replace(/\\/g, '/');

const errors = diagnostics.filter((d) => d.severity === 'error');
const strayConsole = diagnostics.filter(
  (d) => d.category === 'lint/suspicious/noConsoleLog' && !CLI_OK.test(fileOf(d)),
);

let failed = false;

if (errors.length > 0) {
  failed = true;
  console.error(`\nX lint gate: ${errors.length} error(s) in product code (must be 0).\n`);
  const byRule = new Map();
  for (const e of errors) {
    const key = e.category;
    if (!byRule.has(key)) byRule.set(key, []);
    byRule.get(key).push(fileOf(e));
  }
  for (const [rule, files] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.error(`  ${String(files.length).padStart(3)}  ${rule}`);
    for (const f of [...new Set(files)]) console.error(`       ${f}`);
  }
  console.error(
    '\n  Fix it, or suppress AT THE SITE with `biome-ignore <rule>: <reason>`.',
  );
  console.error('  A reason is mandatory — see the policy at the top of scripts/check-lint.mjs.\n');
}

if (strayConsole.length > 0) {
  failed = true;
  console.error(
    `\nX lint gate: ${strayConsole.length} console.log outside a CLI entry point.\n`,
  );
  for (const f of [...new Set(strayConsole.map(fileOf))]) console.error(`       ${f}`);
  console.error(
    '\n  Server/UI code logs through the app logger (pino / observability.ts), not stdout.\n',
  );
}

if (failed) process.exit(1);

const warnings = diagnostics.filter((d) => d.severity !== 'error').length;
console.log(`-> lint gate OK — product scope: 0 errors, ${warnings} warnings (policy: warnings allowed)`);
