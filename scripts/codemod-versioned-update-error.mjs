/**
 * Deterministic codemod (11ac): route every locked-update P2025 catch through
 * the new `mapVersionedUpdateError` helper so a bad nested `connect` maps to 400
 * bad-reference instead of a misleading 409 "modified by another user, reload".
 *
 * Per *.service.ts that contains the exact one-liner:
 *   - `if (isRecordNotFound(e)) throw new OptimisticLockException('<Entity>');`
 *       → `mapVersionedUpdateError(e, '<Entity>');`   (indentation preserved)
 *   - rewrite the optimistic-lock import: drop the now-unused
 *     `OptimisticLockException` / `isRecordNotFound`, add `mapVersionedUpdateError`,
 *     preserving the file's relative import depth.
 *
 * Behaviour-preserving for the non-bad-connect case (the helper throws the SAME
 * OptimisticLockException for a version-guard miss). Idempotent: re-running on an
 * already-migrated file is a no-op. Skips the helper, employee-unique JSDoc, and
 * tests by globbing *.service.ts only.
 *
 * Run: node scripts/codemod-versioned-update-error.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'apps/api/src/modules');
const ONE_LINER = /if \(isRecordNotFound\(e\)\) throw new OptimisticLockException\((['"][^'"]+['"])\);/g;
const IMPORT_RE =
  /import\s*\{([^}]*)\}\s*from\s*('((?:\.\.\/)+)shared\/optimistic-lock\.js')\s*;/;

/** @param {string} dir */
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.service.ts')) yield p;
  }
}

let changed = 0;
const touched = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes('throw new OptimisticLockException(')) continue;
  if (!ONE_LINER.test(src)) continue;
  ONE_LINER.lastIndex = 0;

  // 1) body: one-liner → helper call (keep entity arg verbatim)
  let out = src.replace(ONE_LINER, (_m, entity) => `mapVersionedUpdateError(e, ${entity});`);

  // 2) import: rebuild the named specifiers from optimistic-lock.js
  out = out.replace(IMPORT_RE, (_m, names, _fromClause, depth) => {
    const kept = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      // drop the two now-unused symbols; preserve anything else (none expected)
      .filter((n) => n !== 'OptimisticLockException' && n !== 'isRecordNotFound');
    if (!kept.includes('mapVersionedUpdateError')) kept.push('mapVersionedUpdateError');
    return `import { ${kept.join(', ')} } from '${depth}shared/optimistic-lock.js';`;
  });

  if (out !== src) {
    writeFileSync(file, out, 'utf8');
    changed++;
    touched.push(file.replace(`${process.cwd()}\\`, '').replace(`${process.cwd()}/`, ''));
  }
}

console.log(`codemod: ${changed} service file(s) migrated`);
for (const f of touched.sort()) console.log(`  ${f}`);
