import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ProvenanceSource } from '@moysklad/contracts';

/**
 * Static readers that answer one question about the server source: **does this
 * place actually produce this response key?**
 *
 * They back `contract-conformance.test.ts`, which ties every schema in
 * `@moysklad/contracts` to a real spot in `apps/api` / `schema.prisma`. Kept in
 * `src/` rather than inside the test file so their own behaviour can be unit
 * tested against fixtures — an extractor that silently returns an empty set
 * would turn the whole conformance suite into a no-op, so every function here
 * THROWS when its anchor is missing instead of returning nothing.
 *
 * These are deliberately test-only helpers: nothing in the running API imports
 * them, so the source-only contracts package never has to be built for
 * `tsc`'s emit (which excludes `*.test.ts`).
 */

/** `apps/api/src/modules/shared/` → repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** Read a file by its repo-root-relative path (as written in the provenance registry). */
export function readRepoFile(relPath: string): string {
  return readFileSync(new URL(relPath, `file://${REPO_ROOT.replaceAll('\\', '/')}`), 'utf8');
}

/**
 * Return the balanced `{ … }` block that starts at the first `{` at or after
 * `from`, braces included. Throws rather than guessing on an unbalanced source.
 */
function braceBlock(src: string, from: number): string {
  const open = src.indexOf('{', from);
  if (open === -1) throw new Error(`no opening brace found after offset ${from}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces starting at offset ${open}`);
}

/**
 * The body of `async <name>(` (or `private async <name>(`) up to the next
 * method declaration. Mirrors the slicer the original
 * `cashier-session-current-contract.test.ts` used, so the two agree on what a
 * "method" is.
 */
export function sliceMethod(src: string, name: string): string {
  // `<[^>]*>` covers generic methods such as
  // `private async attachStock<T extends { id: string }>(…)` — matching on the
  // bare `async name(` misses those entirely and would report a live method as
  // "renamed or removed".
  const decl = new RegExp(`async\\s+${name}\\s*(?:<[^>]*>)?\\s*\\(`);
  const m = decl.exec(src);
  if (!m) throw new Error(`method \`${name}\` not found — renamed or removed?`);
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\n\s{2}(?:private |public |protected )?async \w+/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every `key:` occurring anywhere in a source fragment, at any nesting depth. */
function objectKeysIn(fragment: string): Set<string> {
  const keys = new Set<string>();
  // A property key is an identifier preceded by `{`, `,` or a line start, and
  // followed by `:`. The `(?<![?.])` guard keeps ternaries and member accesses
  // from being read as keys.
  const re = /(?:^|[{,\n])\s*(?<![?.])([A-Za-z_$][\w$]*)\s*:/g;
  let m: RegExpExecArray | null = re.exec(fragment);
  while (m !== null) {
    if (m[1] !== undefined) keys.add(m[1]);
    m = re.exec(fragment);
  }
  return keys;
}

/**
 * Keys inside the `select:` / `include:` block of a named service method —
 * the precise check for endpoints that project explicit columns.
 */
export function selectBlockKeys(src: string, method: string): Set<string> {
  const body = sliceMethod(src, method);
  const anchor = body.search(/\b(?:include|select)\s*:/);
  if (anchor === -1) {
    throw new Error(`method \`${method}\` has no \`select\`/\`include\` block — restructured?`);
  }
  const keys = objectKeysIn(braceBlock(body, anchor));
  // `select`/`include` are Prisma's own structural keywords, not response keys —
  // nested selects would otherwise donate them to every contract. A response
  // field genuinely named `select` would need its own provenance source.
  keys.delete('select');
  keys.delete('include');
  return keys;
}

/**
 * Every object-literal key in a named method. Used for responses assembled by
 * hand rather than projected from columns (e.g. the live `stock` block).
 *
 * Weaker than {@link selectBlockKeys}: an unrelated key in the same method
 * counts as "provided". That over-permissiveness is the price of covering
 * hand-built blocks at all, and it still fails on the case we care about —
 * the key disappearing.
 */
export function methodObjectKeys(src: string, method: string): Set<string> {
  return objectKeysIn(sliceMethod(src, method));
}

/** Scalar + relation field names declared on a `model X { … }` in schema.prisma. */
export function prismaModelFields(schemaSrc: string, model: string): Set<string> {
  const re = new RegExp(`^model\\s+${model}\\s*\\{`, 'm');
  const at = schemaSrc.search(re);
  if (at === -1) throw new Error(`prisma model \`${model}\` not found — renamed or removed?`);
  const block = braceBlock(schemaSrc, at);
  const fields = new Set<string>();
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    // Skip comments, block-level attributes (@@index/@@map) and the braces.
    if (!line || line.startsWith('//') || line.startsWith('@@') || line === '{' || line === '}') {
      continue;
    }
    const m = /^([A-Za-z_][\w]*)\s+\S/.exec(line);
    if (m?.[1]) fields.add(m[1]);
  }
  return fields;
}

/** Keys of a named `export const X = z.object({ … })` in an apps/api Zod schema. */
export function zodObjectKeys(src: string, exportName: string): Set<string> {
  const re = new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*z\\.object\\s*\\(`);
  const m = re.exec(src);
  if (!m) {
    throw new Error(
      `zod schema \`${exportName}\` not found as a z.object — renamed or restructured?`,
    );
  }
  return objectKeysIn(braceBlock(src, m.index + m[0].length));
}

/** Union of every response key the declared provenance sources demonstrably produce. */
export function collectSourceKeys(sources: readonly ProvenanceSource[]): Set<string> {
  const keys = new Set<string>();
  const add = (from: Set<string>) => {
    for (const k of from) keys.add(k);
  };
  for (const source of sources) {
    switch (source.kind) {
      case 'model':
        add(prismaModelFields(readRepoFile('packages/db/prisma/schema.prisma'), source.model));
        break;
      case 'select':
        add(selectBlockKeys(readRepoFile(source.service), source.method));
        break;
      case 'method':
        add(methodObjectKeys(readRepoFile(source.service), source.method));
        break;
      case 'zod':
        add(zodObjectKeys(readRepoFile(source.file), source.name));
        break;
    }
  }
  return keys;
}
