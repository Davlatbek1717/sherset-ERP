#!/usr/bin/env node
// Capture quality audit — measures the actual signal in
// docs/moysklad-reference/visual-captures/ by hashing every PNG and
// reporting unique vs duplicate counts.
//
// Run before/after a scrape-app pass to verify dedup is working.
// Output: docs/moysklad-reference/_capture-quality.md

import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CAPTURES = path.join(ROOT, 'docs/moysklad-reference/visual-captures');
const OUT_MD = path.join(ROOT, 'docs/moysklad-reference/_capture-quality.md');

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
  const hashes = new Map(); // hash → { firstSeen, count, paths[] }
  let total = 0;

  try {
    await stat(CAPTURES);
  } catch {
    console.log('No visual-captures directory yet — nothing to audit.');
    return;
  }

  for await (const file of walkPng(CAPTURES)) {
    total++;
    const buf = await readFile(file);
    const hash = createHash('sha256').update(buf).digest('hex');
    const rel = path.relative(CAPTURES, file).replace(/\\/g, '/');
    if (!hashes.has(hash)) {
      hashes.set(hash, { firstSeen: rel, count: 0, paths: [] });
    }
    const entry = hashes.get(hash);
    entry.count++;
    entry.paths.push(rel);
  }

  const ranked = [...hashes.values()].sort((a, b) => b.count - a.count);
  const unique = ranked.length;
  const duplicates = total - unique;
  const dupPct = total === 0 ? 0 : Math.round((duplicates / total) * 100);

  const md = [
    '# Capture quality audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Total PNG files: **${total}**`,
    `- Unique screenshots (by SHA256): **${unique}**`,
    `- Duplicate copies: **${duplicates} (${dupPct}%)**`,
    `- **Signal-to-noise ratio: ${Math.round(((unique || 1) / (total || 1)) * 100)}%**`,
    '',
    '## Top duplicate clusters (likely stuck modals / paywall banners)',
    '',
    '| Copies | First-seen route | Hash |',
    '|---:|---|---|',
  ];
  for (const entry of ranked.slice(0, 15)) {
    md.push(
      `| ${entry.count} | \`${entry.firstSeen}\` | \`${entry.paths.length > 0 ? hashShort(entry) : '?'}\` |`,
    );
  }

  md.push('');
  md.push('## Verdict');
  md.push('');
  if (dupPct >= 50) {
    md.push(
      `❌ **Capture corpus is unreliable** — ${dupPct}% duplicates means the scrape session was likely stuck on a modal/paywall and most route screenshots are not real captures of those routes. Re-run \`scrape-app\` after the modal-fix landed.`,
    );
  } else if (dupPct >= 15) {
    md.push(
      `⚠️ **Capture has noise** — ${dupPct}% duplicates is higher than expected. Check the top clusters above; common culprits are paywall banners, generic empty states, or stale auth.`,
    );
  } else {
    md.push(`✅ **Capture corpus is clean** — only ${dupPct}% duplicates.`);
  }

  await writeFile(OUT_MD, md.join('\n'));
  console.log(`Wrote ${OUT_MD}`);
  console.log(`Total ${total} | Unique ${unique} | Duplicates ${duplicates} (${dupPct}%)`);
}

function hashShort(entry) {
  // We didn't keep the hash on the entry; recompute from first path is wasteful,
  // so just expose count for now. (The audit MD already groups by hash.)
  return `${entry.count}×`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
