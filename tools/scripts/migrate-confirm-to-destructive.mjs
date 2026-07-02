#!/usr/bin/env node
// Codemod: replace `if (confirm(MSG)) deleteMut.mutate()` with the
// useDestructiveMutation hook + runDestructive() call.
//
// Three variants observed in the codebase:
//   if (confirm(`"${data.name}" o'chirilsinmi?`)) deleteMut.mutate();
//   if (confirm(tCommon('delete_confirm', { name: data.name }))) deleteMut.mutate();
//   if (confirm(<msg>)) { deleteMut.mutate(); ... }   (multi-line)
//
// We handle the single-line cases automatically; multi-line cases are
// flagged for manual review (see report at end).
//
// Side effects per file:
//   1. Add `import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';`
//      (after the api-client import line, alphabetised section).
//   2. Add `const { runDestructive } = useDestructiveMutation();` after
//      the deleteMut declaration.
//   3. Replace the confirm(...) call.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const APP_ROOT = path.join(ROOT, 'apps/web/src/app');

const HOOK_IMPORT = "import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';";

async function* walkTsx(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTsx(full);
    else if (entry.isFile() && entry.name.endsWith('.tsx')) yield full;
  }
}

const SINGLE_LINE_PATTERNS = [
  // "name" o'chirilsinmi
  {
    rx: /(\s*)if \(confirm\(`"\$\{([^}]+)\}" o'chirilsinmi\?`\)\) (\w+)\.mutate\(\);/g,
    replace: (_m, indent, nameExpr, mut) =>
      `${indent}runDestructive({ title: \`"\${${nameExpr}}" o'chirilsinmi?\`, run: () => ${mut}.mutateAsync() });`,
  },
  // tCommon('delete_confirm', { name: data.name })
  {
    rx: /(\s*)if \(confirm\(tCommon\('delete_confirm', \{ name: ([^}]+) \}\)\)\) (\w+)\.mutate\(\);/g,
    replace: (_m, indent, nameExpr, mut) =>
      `${indent}runDestructive({ title: tCommon('delete_confirm', { name: ${nameExpr} }), run: () => ${mut}.mutateAsync() });`,
  },
  // tCommon('confirm_delete')
  {
    rx: /(\s*)if \(confirm\(tCommon\('confirm_delete'\)\)\) (\w+)\.mutate\(\);/g,
    replace: (_m, indent, mut) =>
      `${indent}runDestructive({ title: tCommon('confirm_delete'), run: () => ${mut}.mutateAsync() });`,
  },
];

function ensureHookImport(src) {
  if (src.includes(HOOK_IMPORT)) return src;
  // Insert after `from '@/lib/api-client'` line if present, else after the
  // last `from '@/components/...'` import, else after first blank line in
  // import block.
  const apiLineIdx = src.indexOf("from '@/lib/api-client'");
  if (apiLineIdx !== -1) {
    const lineEnd = src.indexOf('\n', apiLineIdx);
    return `${src.slice(0, lineEnd + 1)}${HOOK_IMPORT}\n${src.slice(lineEnd + 1)}`;
  }
  // Fallback — after first import statement
  const firstImportEnd = src.indexOf('\n', src.indexOf('import '));
  return `${src.slice(0, firstImportEnd + 1)}${HOOK_IMPORT}\n${src.slice(firstImportEnd + 1)}`;
}

function ensureHookCall(src) {
  if (src.includes('runDestructive') === false) return src; // no use, no need
  if (src.includes('useDestructiveMutation()')) return src;
  // Insert after `const deleteMut = useMutation({...});`
  // We match the closing brace+) of the deleteMut block. The block always
  // ends with `});\n`. Use a regex that matches the deleteMut declaration
  // and captures its closing.
  const re = /(const deleteMut = useMutation\(\{[\s\S]*?^\s*\}\);)/m;
  const m = re.exec(src);
  if (!m) {
    return src; // can't safely add — flagged in report
  }
  const insertPoint = m.index + m[0].length;
  return `${src.slice(0, insertPoint)}\n\n  const { runDestructive } = useDestructiveMutation();${src.slice(insertPoint)}`;
}

async function main() {
  const skipped = [];
  const migrated = [];

  for await (const file of walkTsx(APP_ROOT)) {
    const before = await readFile(file, 'utf8');
    if (!/if \(confirm\(/.test(before)) continue;

    let after = before;
    let totalReplaced = 0;
    for (const { rx, replace } of SINGLE_LINE_PATTERNS) {
      const next = after.replace(rx, (...args) => {
        totalReplaced += 1;
        return replace(...args);
      });
      after = next;
    }

    if (totalReplaced > 0) {
      after = ensureHookImport(after);
      after = ensureHookCall(after);
    }

    if (/if \(confirm\(/.test(after)) {
      // Some confirm calls remain — multi-line variants. Flag for manual
      // review but still write the partial migration.
      skipped.push({ file: path.relative(ROOT, file), reason: 'multi-line confirm remains' });
    }

    if (after !== before) {
      await writeFile(file, after);
      migrated.push({ file: path.relative(ROOT, file), replacements: totalReplaced });
    }
  }

  console.log(`\n=== Migrated ${migrated.length} files ===`);
  for (const m of migrated) console.log(`  ${m.file}  (${m.replacements} replacements)`);
  if (skipped.length) {
    console.log(`\n=== ${skipped.length} files need manual review (multi-line confirm) ===`);
    for (const s of skipped) console.log(`  ${s.file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
