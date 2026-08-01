/**
 * GUARD — DocumentEditor must FORWARD every DocumentHeader prop it accepts.
 *
 * Why this exists (real bug, twice on 2026-07-31):
 *   `DocumentEditorProps extends Omit<DocumentHeaderProps, 'testId'>`, but
 *   DocumentEditor destructures its props EXPLICITLY and passes them to
 *   <DocumentHeader> one by one. Adding a prop to DocumentHeader therefore
 *   type-checks at every call site while silently never reaching the header —
 *   the control simply does not render.
 *   - `reserve*` (customer-orders «Резерв» checkbox): worked on the detail page
 *     which uses DocumentHeader directly, silently did nothing on /new.
 *   - the date/time caption props hit the same hole independently.
 *   No compiler or lint rule catches this: the inherited type makes the prop
 *   *acceptable*, not *forwarded*.
 *
 * The check is static (source text), like the other guard tests here: parse the
 * DocumentHeaderProps interface, then assert each prop name appears BOTH in
 * DocumentEditor's destructuring parameter list AND in its <DocumentHeader/> JSX.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'design-system', 'src');
const headerSrc = readFileSync(join(DS, 'document-editor', 'DocumentHeader.tsx'), 'utf8');
const editorSrc = readFileSync(join(DS, 'document-editor', 'DocumentEditor.tsx'), 'utf8');

/** Props DocumentEditor legitimately does not forward (it owns them itself). */
const NOT_FORWARDED = new Set([
  'testId', // Omit<…, 'testId'> — the editor stamps its own
  'className', // editor wrapper's own class
  'rightSlot', // DocumentToolbar's slot on /new, not the header's
]);

/** Extract the property names declared in `export interface DocumentHeaderProps`. */
function headerPropNames(src: string): string[] {
  const start = src.indexOf('export interface DocumentHeaderProps');
  expect(start, 'DocumentHeaderProps interface not found').toBeGreaterThan(-1);
  // Walk braces from the interface's opening `{` to its matching `}`.
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open + 1, end);
  // Strip comments so `/** … prop: … */` text can't masquerade as a declaration.
  const noComments = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // Only top-level members: a nested object type would indent further, but the
  // interface has none today; depth-tracking keeps it honest if that changes.
  const names: string[] = [];
  let d = 0;
  for (const line of noComments.split('\n')) {
    const opens = (line.match(/[{[(]/g) ?? []).length;
    const closes = (line.match(/[}\])]/g) ?? []).length;
    if (d === 0) {
      const m = /^\s*([A-Za-z_$][\w$]*)\??\s*:/.exec(line);
      if (m?.[1]) names.push(m[1]);
    }
    d += opens - closes;
  }
  return names;
}

const props = headerPropNames(headerSrc).filter((p) => !NOT_FORWARDED.has(p));

/** DocumentEditor's destructuring parameter list, i.e. `function DocumentEditor({ … })`. */
const destructureBlock = (() => {
  const i = editorSrc.indexOf('export function DocumentEditor({');
  expect(i, 'DocumentEditor function not found').toBeGreaterThan(-1);
  return editorSrc.slice(i, editorSrc.indexOf('}: DocumentEditorProps'));
})();

/** The `<DocumentHeader … />` JSX element inside DocumentEditor.
 *  The tag name must be followed by whitespace or `>` — a bare `indexOf` also
 *  matched `Omit<DocumentHeaderProps, …>` in the interface declaration, which
 *  sliced the wrong region and made every prop look unforwarded. */
const headerJsx = (() => {
  const m = /<DocumentHeader[\s>]/.exec(editorSrc);
  expect(m, '<DocumentHeader> not rendered by DocumentEditor').not.toBeNull();
  const i = m?.index ?? 0;
  const end = editorSrc.indexOf('/>', i);
  expect(end, '<DocumentHeader> element is not self-closing').toBeGreaterThan(i);
  return editorSrc.slice(i, end);
})();

describe('DocumentEditor forwards every DocumentHeader prop', () => {
  it('finds a non-trivial set of header props to check', () => {
    // Sanity: if the parser silently returns [] the whole suite would pass empty.
    expect(props.length).toBeGreaterThan(20);
    expect(props).toContain('applicable');
    expect(props).toContain('reserve');
  });

  it.each(props)('destructures "%s"', (prop) => {
    expect(
      new RegExp(`(^|[\\s,{])${prop}\\s*(,|=|$)`, 'm').test(destructureBlock),
      `DocumentEditor does not destructure "${prop}" — it will be dropped before reaching DocumentHeader.`,
    ).toBe(true);
  });

  it.each(props)('passes "%s" to <DocumentHeader>', (prop) => {
    expect(
      new RegExp(`${prop}=\\{`).test(headerJsx),
      `DocumentEditor never passes "${prop}" to <DocumentHeader> — the prop type-checks at call sites but silently does nothing.`,
    ).toBe(true);
  });
});
