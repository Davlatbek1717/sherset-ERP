#!/usr/bin/env node
// Prune duplicate captures — for every cluster of byte-identical PNGs,
// keep the FIRST occurrence (the canonical example) and delete the rest
// along with their sibling dom-default.html / capture.json. The capture
// directories themselves are kept (so the next scrape-app run can drop
// fresh files into the same paths).
//
// Run with --dry-run to see what would be removed without changing files.
//
// After pruning + a fresh scrape-app pass with the modal-fix:
//   - duplicate count drops to ~0
//   - signal-to-noise ratio approaches 100%

import { createHash } from 'node:crypto';
import { readFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CAPTURES = path.join(ROOT, 'docs/moysklad-reference/visual-captures');

const DRY_RUN = process.argv.includes('--dry-run');

async function* walkPng(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkPng(full);
    } else if (entry.isFile() && entry.name.endsWith('.png')) {
      yield full;
    }
  }
}

async function main() {
  try {
    await stat(CAPTURES);
  } catch {
    console.log('No visual-captures directory — nothing to prune.');
    return;
  }

  // Map hash → list of PNG paths
  const groups = new Map();
  let total = 0;

  for await (const file of walkPng(CAPTURES)) {
    total++;
    const buf = await readFile(file);
    const hash = createHash('sha256').update(buf).digest('hex');
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(file);
  }

  let toRemove = 0;
  let kept = 0;
  const removalLog = [];

  for (const [, paths] of groups) {
    paths.sort(); // deterministic — first wins
    if (paths.length === 1) {
      kept++;
      continue;
    }
    kept++; // keep first
    for (const dup of paths.slice(1)) {
      toRemove++;
      removalLog.push(dup);
    }
  }

  console.log(`Total PNGs: ${total}`);
  console.log(`Unique hashes (kept): ${kept}`);
  console.log(`To remove: ${toRemove}`);
  console.log(DRY_RUN ? '\n--dry-run — no files deleted.\n' : '');

  if (DRY_RUN) {
    for (const f of removalLog.slice(0, 10)) {
      console.log('  would remove:', path.relative(CAPTURES, f));
    }
    if (removalLog.length > 10) console.log(`  ... and ${removalLog.length - 10} more`);
    return;
  }

  for (const pngPath of removalLog) {
    // Sibling files in screenshots/ are typically only the PNG; the dom HTML
    // and capture.json live one level up. We only delete the duplicate PNG —
    // leaving the directory in place lets the next scrape-app drop a clean
    // 01-default.png at the same path.
    await unlink(pngPath).catch(() => undefined);
  }

  console.log(`Removed ${removalLog.length} duplicate PNGs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
