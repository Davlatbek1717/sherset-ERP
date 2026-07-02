import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Convention 3 — Toolbar composition & order (registry: docs/audits/_UI-CONVENTIONS.md).
 *
 * Both toolbar composites are centralized (ListView `moyskladToolbar` for
 * lists, DocumentEditor/DetailToolbar for documents), so composition drift
 * can only enter through SLOT USAGE. The 2026-06-11 recon found a 13-page
 * "un-migrated tail" (createPosition/onRefresh missing), one FilterToggleButton
 * in the wrong slot, one raw filter-toggle clone evading the Conv-2 scan via a
 * prefixed test-id, and two lists with selection wired but NO bulk surface
 * (dead-end selection). All fixed; these locks keep them fixed.
 *
 * Locks (derived scans — new pages are covered automatically):
 *  1. DocumentEditor pages spread useDocumentEditorLabels() — the DS shell's
 *     prop defaults are hardcoded (Latin-uz toolbar, Russian header), so an
 *     unspread page leaks wrong-locale strings (RS1 bug-class).
 *  2. Every moyskladToolbar list with a create button pins createPosition="start".
 *  3. Every moyskladToolbar list passes onRefresh (↻ parity icon).
 *  4. FilterToggleButton lives in extraActionsLeft, never in extraActions.
 *  5. selectionCount implies a bulk surface (dropdowns, typed menus, or the
 *     floating bulkActionBar) — bans dead-end row selection.
 */

const APP = join(__dirname, '..', 'app', '(app)');

function walkPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPages(full));
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

const rel = (f: string) => f.replace(APP, '(app)').replace(/\\/g, '/');

/** Extract the balanced-brace value of a JSX prop (`name={...}`). */
function propBlock(src: string, name: string): string | null {
  const m = src.indexOf(`${name}={`);
  if (m === -1) return null;
  let i = m + name.length + 1;
  let depth = 0;
  const start = i;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
    i++;
  }
  return null;
}

const pages = walkPages(APP).map((f) => ({ file: f, src: readFileSync(f, 'utf8') }));
const moysklad = pages.filter((p) => p.src.includes('moyskladToolbar'));
const docEditors = pages.filter((p) => p.src.includes('<DocumentEditor'));

describe('Convention 3 — toolbar composition & order', () => {
  it('sanity: the two families are non-empty (scan is not vacuous)', () => {
    expect(moysklad.length).toBeGreaterThanOrEqual(57);
    expect(docEditors.length).toBeGreaterThanOrEqual(26);
  });

  it('1. every DocumentEditor page spreads useDocumentEditorLabels()', () => {
    const offenders = docEditors
      .filter(
        (p) =>
          !(p.src.includes('useDocumentEditorLabels(') && p.src.includes('{...docEditorLabels}')),
      )
      .map((p) => rel(p.file));
    expect(
      offenders,
      `DocumentEditor without the label spread (locale-leak class):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('2. moyskladToolbar lists with a create button pin createPosition="start"', () => {
    const offenders = moysklad
      .filter((p) => p.src.includes('onCreate=') || p.src.includes('createHref='))
      .filter((p) => !p.src.includes('createPosition="start"'))
      .map((p) => rel(p.file));
    expect(
      offenders,
      `Create button without createPosition="start":\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('3. every moyskladToolbar list passes onRefresh', () => {
    const offenders = moysklad.filter((p) => !p.src.includes('onRefresh=')).map((p) => rel(p.file));
    expect(
      offenders,
      `moyskladToolbar without onRefresh (↻ parity):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('4. FilterToggleButton never rides in extraActions (right slot)', () => {
    const offenders: string[] = [];
    for (const p of pages) {
      const block = propBlock(p.src, 'extraActions');
      if (block?.includes('FilterToggleButton')) offenders.push(rel(p.file));
    }
    expect(offenders, `FilterToggleButton in the wrong slot:\n${offenders.join('\n')}`).toEqual([]);
  });

  // Selection consumed by a dedicated primary CTA instead of bulk menus —
  // factures are GENERATED from the selected documents (justified, registry).
  const SELECTION_CONSUMER_EXEMPT = new Set([
    '(app)/factures-in/page.tsx',
    '(app)/factures-out/page.tsx',
  ]);

  it('5. live selection implies a bulk surface (no dead-end selection)', () => {
    const offenders = pages
      // literal selectionCount={0} = moysklad parity counter with no
      // selectable rows (consignments, commission-reports) — not a selection
      .filter((p) => p.src.includes('selectionCount=') && !p.src.includes('selectionCount={0}'))
      .filter((p) => !SELECTION_CONSUMER_EXEMPT.has(rel(p.file)))
      .filter(
        (p) =>
          !(
            /BulkActions?Dropdown/.test(p.src) ||
            p.src.includes('editMenu=') ||
            p.src.includes('bulkActionBar=')
          ),
      )
      .map((p) => rel(p.file));
    expect(
      offenders,
      `Rows selectable but no bulk surface rendered:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('6. typed toolbar menus always pass a localized label (DS defaults are Latin-uz)', () => {
    const offenders: string[] = [];
    for (const p of pages) {
      for (const m of p.src.matchAll(
        /(?:editMenu|printMenu|createDocMenu|sendMenu)=\{\{[^}]*\}\}/g,
      )) {
        if (!m[0].includes('label:')) offenders.push(`${rel(p.file)}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(
      offenders,
      `Typed menu without label (leaks the DS Latin-uz default):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
