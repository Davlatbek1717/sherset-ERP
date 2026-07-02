#!/usr/bin/env tsx
/**
 * i18n string extraction from captured DOM files — FAST VERSION.
 *
 * Reads all *.html files under docs/moysklad-reference/visual-captures/,
 * extracts visible UI strings, categorizes them, and writes JSON outputs.
 *
 * Optimization: avoids catastrophic regex backtracking by using bounded
 * length matches and processing tag-by-tag with simple substring search.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const CAPTURES_DIR = path.join(REPO_ROOT, 'docs/moysklad-reference/visual-captures');
const OUT_DIR = path.join(REPO_ROOT, 'docs/moysklad-reference/i18n');

type Category =
  | 'button'
  | 'label'
  | 'heading'
  | 'placeholder'
  | 'tooltip'
  | 'menu-item'
  | 'tab'
  | 'cell'
  | 'message'
  | 'other';

const STRING_MAP = new Map<string, { cat: Category; count: number; files: Set<string> }>();

function record(text: string, cat: Category, file: string): void {
  if (!isUseful(text)) return;
  const existing = STRING_MAP.get(text);
  if (existing) {
    existing.count++;
    if (existing.files.size < 5) existing.files.add(file);
    if (existing.cat === 'other' && cat !== 'other') existing.cat = cat;
  } else {
    STRING_MAP.set(text, { cat, count: 1, files: new Set([file]) });
  }
}

function isUseful(s: string): boolean {
  if (!s || s.length < 2 || s.length > 200) return false;
  if (/^[\d\s.,:/—-]+$/.test(s)) return false;
  if (/^[a-f0-9-]{20,}$/i.test(s)) return false;
  if (/^https?:\/\//.test(s)) return false;
  if (!/[a-zA-Zа-яА-Я]/.test(s)) return false;
  if (/^[\s\W]+$/.test(s)) return false;
  return true;
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract text content of a specific tag by walking with substring search.
 * Bounded — only finds first <tag> ... </tag> pairs at top level.
 */
function* extractTagContents(html: string, tag: string): Generator<string> {
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;
  let pos = 0;
  while (true) {
    const openIdx = html.indexOf(openTag, pos);
    if (openIdx < 0) break;
    // Find end of opening tag (>)
    const tagEnd = html.indexOf('>', openIdx);
    if (tagEnd < 0) break;
    // Find matching close (simple — works for non-nested or shallow nesting)
    const closeIdx = html.indexOf(closeTag, tagEnd);
    if (closeIdx < 0) {
      pos = tagEnd + 1;
      continue;
    }
    const content = html.substring(tagEnd + 1, closeIdx);
    // Strip nested tags
    const text = decode(content.replace(/<[^>]+>/g, ' '));
    yield text;
    pos = closeIdx + closeTag.length;
  }
}

/** Extract attribute values matching given attr name */
function* extractAttrValues(html: string, attr: string): Generator<string> {
  const re = new RegExp(`${attr}=("([^"]*)"|'([^']*)')`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    yield decode(m[2] ?? m[3] ?? '');
  }
}

/** Extract ALL text content between tags via fast token walk. Catches GWT/React-rendered divs/spans. */
function* extractAllVisibleText(html: string): Generator<string> {
  // Strip script/style first
  let cleaned = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, ' ');

  let pos = 0;
  while (true) {
    const open = cleaned.indexOf('>', pos);
    if (open < 0) break;
    const close = cleaned.indexOf('<', open + 1);
    if (close < 0) break;
    const text = decode(cleaned.substring(open + 1, close));
    if (text.length >= 2 && text.length <= 200) {
      yield text;
    }
    pos = close;
  }
}

function processFile(html: string, file: string): void {
  // 1) Headings
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    for (const text of extractTagContents(html, tag)) {
      record(text, 'heading', file);
    }
  }
  // 2) Buttons
  for (const text of extractTagContents(html, 'button')) {
    record(text, 'button', file);
  }
  // 3) Labels
  for (const text of extractTagContents(html, 'label')) {
    record(text, 'label', file);
  }
  // 4) <th> column headers
  for (const text of extractTagContents(html, 'th')) {
    record(text, 'label', file);
  }
  // 5) Placeholder
  for (const text of extractAttrValues(html, 'placeholder')) {
    record(text, 'placeholder', file);
  }
  // 6) title / aria-label
  for (const text of extractAttrValues(html, 'title')) {
    record(text, 'tooltip', file);
  }
  for (const text of extractAttrValues(html, 'aria-label')) {
    record(text, 'tooltip', file);
  }
  // 7) <td> cells (short)
  for (const text of extractTagContents(html, 'td')) {
    if (text.length < 50) record(text, 'cell', file);
  }
  // 8) <a> links (nav items)
  for (const text of extractTagContents(html, 'a')) {
    if (text.length < 80) record(text, 'menu-item', file);
  }
  // 9) Catch-all: any visible text in <div>/<span>/etc. as 'other'
  // This catches GWT/React-rendered content
  for (const text of extractAllVisibleText(html)) {
    if (!STRING_MAP.has(text)) {
      record(text, 'other', file);
    } else {
      const existing = STRING_MAP.get(text)!;
      existing.count++;
      if (existing.files.size < 5) existing.files.add(file);
    }
  }
}

async function findHtmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findHtmlFiles(full)));
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log(`Scanning ${CAPTURES_DIR}...`);
  const htmlFiles = await findHtmlFiles(CAPTURES_DIR);
  console.log(`Found ${htmlFiles.length} HTML files`);

  let processed = 0;
  for (const file of htmlFiles) {
    try {
      const html = await readFile(file, 'utf8');
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      processFile(html, rel);
      processed++;
      if (processed % 100 === 0) {
        process.stdout.write(`\r  processed ${processed}/${htmlFiles.length}...`);
      }
    } catch (e) {
      console.warn(`\n  failed ${file}: ${(e as Error).message}`);
    }
  }
  console.log(`\nProcessed ${processed} files in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Unique strings: ${STRING_MAP.size}`);

  await mkdir(OUT_DIR, { recursive: true });

  const sorted = [...STRING_MAP.entries()]
    .map(([text, data]) => ({
      text,
      category: data.cat,
      occurrences: data.count,
      files: [...data.files].slice(0, 5),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  await writeFile(path.join(OUT_DIR, 'strings.json'), JSON.stringify(sorted, null, 2), 'utf8');

  const byCategory: Record<string, typeof sorted> = {};
  for (const item of sorted) {
    (byCategory[item.category] ??= []).push(item);
  }
  await writeFile(
    path.join(OUT_DIR, 'by-category.json'),
    JSON.stringify(byCategory, null, 2),
    'utf8',
  );

  const stats = {
    capturedFiles: htmlFiles.length,
    processedFiles: processed,
    uniqueStrings: STRING_MAP.size,
    totalOccurrences: sorted.reduce((s, x) => s + x.occurrences, 0),
    perCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length])),
    topMostFrequent: sorted.slice(0, 30).map((s) => ({
      text: s.text,
      cat: s.category,
      count: s.occurrences,
    })),
  };
  await writeFile(path.join(OUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');

  console.log(`\nWrote 3 files to ${OUT_DIR}`);
  console.log(`\nTop 15 most-frequent strings:`);
  for (const s of sorted.slice(0, 15)) {
    console.log(
      `  ${s.occurrences.toString().padStart(5)}× [${s.category.padEnd(11)}] ${s.text.substring(0, 80)}`,
    );
  }
  console.log(`\nPer-category counts:`);
  for (const [cat, count] of Object.entries(stats.perCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(5)} ${cat}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
