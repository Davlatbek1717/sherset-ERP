#!/usr/bin/env node
/**
 * Fast guard gate for pre-push (MASTER-TODO #29).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * pre-push ran ONLY `turbo run typecheck`. The full Vitest suites are ~10 min
 * combined, so the project rule "run the tests before you push" stayed prose —
 * and 133 guard tests went red without anyone noticing, across api and web.
 * Once a suite is broadly red, every NEW breakage hides in the noise: that is
 * exactly how the «Sklad»-field save bug and the missing debt permissions
 * survived.
 *
 * The compromise this script encodes: run only the SOURCE-SCAN guards — pure
 * filesystem reads, no jsdom render — which is where nearly every regression
 * caught this session actually lived. ~18s for ~370 assertions.
 *
 * ── Contract ────────────────────────────────────────────────────────────────
 * Blocks the push when a guard file fails that is NOT in
 * `scripts/guard-baseline.json`. Known-red files are listed there WITH a reason
 * and a MASTER-TODO ref, so the debt is visible instead of muted.
 *
 * It also nags in the other direction: if a baseline file now PASSES, it tells
 * you to delete the entry. The list can only shrink by hand, which is the point.
 *
 * Escape hatch: CHECK_GUARDS=0 skips it. Use that for a WIP branch, not to get
 * a red guard past review.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Pure source-scan guards: no rendering, so they stay fast. */
const GUARDS = [
  'src/__tests__/api-contract.test.ts',
  'src/__tests__/org-account-scope.test.ts',
  'src/__tests__/sort-key-parity.test.ts',
  'src/__tests__/domain-status-tone.test.ts',
  'src/__tests__/document-state-tone.test.ts',
  'src/__tests__/header-conventions.test.ts',
  'src/__tests__/raw-element-conventions.test.ts',
  'src/__tests__/money-input-rollout.test.ts',
  'src/__tests__/document-profit-totals.test.ts',
  'src/__tests__/demands-payment-chip.test.ts',
  'src/__tests__/counterparty-activity-widget.test.ts',
  'src/__tests__/error-boundaries.test.ts',
  'src/__tests__/i18n-no-hardcoded.test.ts',
  'src/__tests__/i18n-key-existence.test.ts',
  'src/__tests__/label-grounding.test.ts',
];

if (process.env.CHECK_GUARDS === '0') {
  console.info('-> guard gate skipped (CHECK_GUARDS=0)');
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(join(REPO, 'scripts/guard-baseline.json'), 'utf8'));
const known = new Map(baseline.knownRed.map((e) => [e.file, e]));

let out = '';
try {
  out = execFileSync(
    'pnpm',
    ['--filter', '@moysklad/web', 'exec', 'vitest', 'run', '--reporter=dot', ...GUARDS],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true },
  );
} catch (e) {
  // Non-zero exit is expected while any guard is red — the OUTPUT is the signal.
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
}

// ANSI colour codes, built without a literal control character in the source
// (biome bans those in regex literals).
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const plain = out.replace(ANSI, '');

// Vitest prints one `❯ <file> (N tests | M failed)` line per failing file.
const failing = new Map();
for (const m of plain.matchAll(/❯\s+(src\/[^\s]+\.tsx?)\s+\((\d+) tests \| (\d+) failed\)/g)) {
  failing.set(m[1].replace(/\\/g, '/'), Number(m[3]));
}

if (!/Test Files\s+\d/.test(plain)) {
  console.error('X guard gate: could not parse the vitest summary — refusing to pass silently.');
  console.error(plain.slice(-2000));
  process.exit(1);
}

const regressions = [...failing].filter(([f]) => !known.has(f));
const fixed = [...known.keys()].filter((f) => !failing.has(f));

if (fixed.length) {
  console.info('');
  console.info(
    '* These baseline guards now PASS — delete their entry in scripts/guard-baseline.json:',
  );
  for (const f of fixed) console.info(`    ${f}  (${known.get(f).todo})`);
}

if (regressions.length === 0) {
  const carried = [...failing].map(([f, n]) => `${f} (${n}, ${known.get(f)?.todo ?? '?'})`);
  console.info(
    `-> guard gate OK${carried.length ? ` — carrying known debt: ${carried.join(', ')}` : ''}`,
  );
  process.exit(0);
}

console.error('');
console.error('X pre-push blocked: a guard that was GREEN is now failing.');
for (const [f, n] of regressions) console.error(`    ${f} — ${n} failing`);
console.error('');
console.error('  These guards encode decisions that were grounded once (moysklad parity,');
console.error('  money display, RBAC, FE<->BE contracts). Fix the cause, or — if the guard');
console.error('  itself is describing older code — re-express it so it still catches the');
console.error('  ORIGINAL bug, and say why in the diff. Do not add it to the baseline to');
console.error('  get past this gate.');
console.error('');
process.exit(1);
