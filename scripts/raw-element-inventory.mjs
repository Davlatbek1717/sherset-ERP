// One-shot inventory: every raw <select>/<textarea>/<input> JSX site in apps/web/src
// (excluding tests). Brace-aware opening-tag extraction so multi-line tags and
// arrow-function props don't break parsing. Output: JSON to stdout.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'apps/web/src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.|\.spec\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

// Extract the full opening tag starting at index i (which points at '<').
// Tracks {} depth and string/template literals; stops at the matching '>'.
function extractTag(src, i) {
  let depth = 0;
  let j = i;
  let inStr = null; // ', ", or `
  while (j < src.length) {
    const ch = src[j];
    if (inStr) {
      if (ch === '\\') j++;
      else if (ch === inStr) inStr = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    } else if (ch === '>' && depth === 0) {
      return src.slice(i, j + 1);
    }
    j++;
  }
  return src.slice(i, Math.min(i + 400, src.length));
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  if (m) return m[1];
  const dyn = tag.match(new RegExp(`${name}=\\{`));
  return dyn ? '(dynamic)' : null;
}

const families = { select: [], textarea: [], input: [], checkbox: [] };

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  for (const fam of ['select', 'textarea', 'input']) {
    const re = new RegExp(`<${fam}\\b`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const tag = extractTag(src, m.index);
      const line = src.slice(0, m.index).split('\n').length;
      const type = fam === 'input' ? attr(tag, 'type') : null;
      const site = {
        file: rel,
        line,
        type,
        className: attr(tag, 'className'),
        testId: attr(tag, 'data-test-id'),
        selfClosing: /\/>$/.test(tag.trim()),
        tag: tag.replace(/\s+/g, ' ').slice(0, 320),
      };
      if (fam === 'input' && type === 'checkbox') families.checkbox.push(site);
      else families[fam].push(site);
    }
  }
}

// Canonical shapes (operator ground-truthed)
const CANON_SELECT =
  'h-9 w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 text-[var(--ms-text-primary)] text-sm';
const CANON_TEXTAREA =
  'w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]';

const summary = {};
for (const [fam, sites] of Object.entries(families)) {
  const canon = fam === 'select' ? CANON_SELECT : fam === 'textarea' ? CANON_TEXTAREA : null;
  const canonical = canon ? sites.filter((s) => s.className === canon) : [];
  const classGroups = {};
  for (const s of sites) {
    const k = s.className ?? '(none)';
    classGroups[k] = (classGroups[k] ?? 0) + 1;
  }
  summary[fam] = {
    total: sites.length,
    files: new Set(sites.map((s) => s.file)).size,
    canonical: canonical.length,
    classGroups: Object.fromEntries(Object.entries(classGroups).sort((a, b) => b[1] - a[1])),
    inputTypes:
      fam === 'input'
        ? Object.fromEntries(
            Object.entries(
              sites.reduce((acc, s) => {
                acc[s.type ?? '(no type)'] = (acc[s.type ?? '(no type)'] ?? 0) + 1;
                return acc;
              }, {}),
            ).sort((a, b) => b[1] - a[1]),
          )
        : undefined,
    sites,
  };
}

console.log(JSON.stringify(summary, null, 1));
