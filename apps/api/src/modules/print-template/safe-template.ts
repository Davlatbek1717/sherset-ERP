/**
 * Eval-free template engine for print templates.
 *
 * Why this exists: PrintTemplate.bodyHtml is authored by account admins and
 * rendered server-side. The previous eta-based renderer compiled templates
 * with `new Function(...)`, so a bare `{{ ... }}` tag executed arbitrary
 * JavaScript in the API process — `{{ process.exit() }}`,
 * `{{= process.env.DATABASE_URL }}`, `{{ require('fs')... }}` — a critical
 * RCE / cross-tenant exfiltration / DoS surface in a multi-tenant service.
 *
 * This engine NEVER evaluates JS. It supports only:
 *   - `{{= path }}` or `{{ path }}` — HTML-escaped interpolation of a dotted
 *     property path resolved against the render context (e.g. `doc.number`,
 *     `counterparty.name`). No function calls, operators, or globals.
 *   - `{{#each path}} ... {{/each}}` — iterate a context array; inside the
 *     block the array item becomes the innermost scope.
 *   - `{{#if path}} ... {{else}} ... {{/if}}` — conditional on a path's
 *     truthiness.
 *
 * Property resolution walks own-enumerable keys only and blocks `__proto__`
 * / `prototype` / `constructor`, so `{{= constructor.constructor(...) }}`
 * and prototype-pollution escapes resolve to nothing. Loops iterate only
 * finite context arrays, so a template cannot spin forever or allocate
 * unboundedly. The result: admin-authored templates are pure data, never
 * code.
 */

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

/** Keys that must never be traversed — prototype-pollution / escape vectors. */
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Resolve a dotted path against a scope stack (innermost last). The first
 * segment is looked up in the nearest scope that owns it; subsequent
 * segments descend by own-property only. Any miss / blocked key / non-object
 * descent yields `undefined`. Never invokes a function.
 */
function resolvePath(path: string, scopes: unknown[]): unknown {
  const segments = path
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return undefined;

  const [head, ...rest] = segments;
  if (head === undefined || BLOCKED_KEYS.has(head)) return undefined;

  let current: unknown;
  let found = false;
  for (let i = scopes.length - 1; i >= 0; i--) {
    const frame = scopes[i];
    if (frame != null && typeof frame === 'object' && Object.hasOwn(frame, head)) {
      current = (frame as Record<string, unknown>)[head];
      found = true;
      break;
    }
  }
  if (!found) return undefined;

  for (const segment of rest) {
    if (BLOCKED_KEYS.has(segment)) return undefined;
    if (current == null || typeof current !== 'object') return undefined;
    if (!Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isTruthy(value: unknown): boolean {
  if (value == null || value === false || value === '' || value === 0) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

type TplNode =
  | { t: 'text'; v: string }
  | { t: 'interp'; path: string }
  | { t: 'each'; path: string; body: TplNode[] }
  | { t: 'if'; path: string; thenNodes: TplNode[]; elseNodes: TplNode[] };

interface Token {
  kind: 'text' | 'tag';
  val: string;
}

function tokenize(src: string): Token[] {
  const re = /\{\{([\s\S]*?)\}\}/g;
  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(src))) {
    if (m.index > last) tokens.push({ kind: 'text', val: src.slice(last, m.index) });
    tokens.push({ kind: 'tag', val: (m[1] ?? '').trim() });
    last = re.lastIndex;
  }
  if (last < src.length) tokens.push({ kind: 'text', val: src.slice(last) });
  return tokens;
}

/** Parse tokens into a node tree. Lenient: unclosed blocks render best-effort. */
function parse(src: string): TplNode[] {
  const tokens = tokenize(src);
  let i = 0;

  function parseNodes(stops: string[]): { nodes: TplNode[]; stop: string | null } {
    const nodes: TplNode[] = [];
    while (i < tokens.length) {
      const tk = tokens[i];
      if (tk === undefined) break;
      if (tk.kind === 'text') {
        nodes.push({ t: 'text', v: tk.val });
        i++;
        continue;
      }
      const tag = tk.val;
      if (stops.includes(tag)) return { nodes, stop: tag };
      i++; // consume the tag

      if (tag.startsWith('#each ')) {
        const path = tag.slice(6).trim();
        const inner = parseNodes(['/each']);
        if (tokens[i]?.val === '/each') i++;
        nodes.push({ t: 'each', path, body: inner.nodes });
      } else if (tag.startsWith('#if ')) {
        const path = tag.slice(4).trim();
        const thenPart = parseNodes(['else', '/if']);
        let elseNodes: TplNode[] = [];
        if (thenPart.stop === 'else') {
          i++; // consume {{else}}
          elseNodes = parseNodes(['/if']).nodes;
        }
        if (tokens[i]?.val === '/if') i++;
        nodes.push({ t: 'if', path, thenNodes: thenPart.nodes, elseNodes });
      } else if (tag.startsWith('=')) {
        nodes.push({ t: 'interp', path: tag.slice(1).trim() });
      } else {
        // Bare `{{ path }}` is interpolation here (NOT code execution).
        nodes.push({ t: 'interp', path: tag });
      }
    }
    return { nodes, stop: null };
  }

  return parseNodes([]).nodes;
}

function renderNodes(nodes: TplNode[], scopes: unknown[]): string {
  let out = '';
  for (const node of nodes) {
    switch (node.t) {
      case 'text':
        out += node.v;
        break;
      case 'interp': {
        const v = resolvePath(node.path, scopes);
        out += v == null ? '' : escapeHtml(String(v));
        break;
      }
      case 'each': {
        const arr = resolvePath(node.path, scopes);
        if (Array.isArray(arr)) {
          for (const item of arr) out += renderNodes(node.body, [...scopes, item]);
        }
        break;
      }
      case 'if': {
        const v = resolvePath(node.path, scopes);
        out += isTruthy(v)
          ? renderNodes(node.thenNodes, scopes)
          : renderNodes(node.elseNodes, scopes);
        break;
      }
    }
  }
  return out;
}

/**
 * Render a template body against a context object. Pure data substitution —
 * no code execution. Returns the rendered HTML fragment.
 */
export function renderSafeTemplate(body: string, ctx: Record<string, unknown>): string {
  return renderNodes(parse(body), [ctx]);
}
