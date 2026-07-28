import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FE↔BE HTTP-contract guard (app-wide regression lock).
 *
 * The FE api-client sends string paths (`api.get('/users')`); the NestJS
 * backend declares routes with method decorators (`@Get(':id')`). There is NO
 * type-level link between the two, so a path/method mismatch is invisible to
 * typecheck, lint and every unit test — it only 404/405s at runtime (which a
 * structural audit never exercises). Two such silent bugs were found live in
 * separate browser-QA sessions:
 *   - api.delete sending a Content-Type undici rejects → 400 on every delete
 *   - api.put('/products/:id') hitting a @Patch-only route → silent 404
 * and a third whole class on 2026-06-06: list-page filter pickers calling dead
 * endpoints (/users, /organizations/:id/accounts, /counterparties/:id/accounts)
 * → 63 silent 404s, each leaving a filter picker empty in the browser.
 *
 * This test cross-references every statically-resolvable FE `api.*` call-site
 * against the controller route table and fails if any call hits a path that
 * exists only under a different method (METHOD_MISMATCH) or no route at all
 * (NO_ROUTE). It supersedes the narrow catalog-api-method.test.ts (4 pages).
 *
 * Irreducibly-dynamic calls (complex template paths, generic `/${entity}/bulk-*`
 * hooks) are skipped — they can't be statically resolved and are verified at
 * runtime. The two id/action routes below ARE reachable (the dynamic 2nd segment
 * is a literal action like /close or /approve at runtime, confirmed live 2xx);
 * the static matcher can't see that, so they are explicitly allow-listed.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const API_SRC = join(REPO_ROOT, 'apps', 'api', 'src');
const WEB_SRC = join(REPO_ROOT, 'apps', 'web', 'src');

/** Normalised `METHOD /path` strings the static matcher can't resolve but are live-verified. */
const DYNAMIC_SEGMENT_ALLOWLIST = new Set([
  'POST /cashier-sessions/:P/:P', // retail drawer ops — /${id}/close|drawer-in|drawer-out (live 2xx)
  'POST /analitika/counts/:P/:P', // inventory count — /${id}/approve|reject (live 2xx)
  // HR employee bulk bar — `/hr/employees/${action}` where action is a union of
  // three LITERALS, and all three are declared on the controller:
  // @Post('bulk-archive') · @Post('bulk-restore') · @Post('bulk-delete')
  // (hr-employee.controller.ts). The static matcher turns `${action}` into a
  // param segment, which cannot match a literal route — same limitation the two
  // entries above document. Verified by reading the controller, 2026-07-28.
  'POST /hr/employees/:P',
]);

function walk(dir: string, pred: (f: string) => boolean, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist') continue;
      walk(full, pred, out);
    } else if (pred(full)) {
      out.push(full);
    }
  }
  return out;
}

const lineOf = (text: string, idx: number) => text.slice(0, idx).split('\n').length;
const relOf = (p: string) => p.replace(REPO_ROOT, '').replace(/\\/g, '/').replace(/^\//, '');

function toSegs(path: string): string[] {
  return path
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? 'P' : s));
}

function beSegs(raw: string): string[] {
  const noQuery = raw.split('?')[0] ?? raw;
  return toSegs(noQuery.replace(/\$\{[^}]*\}/g, ':P'));
}

/** FE call path → segment tokens, or null when too dynamic to statically verify. */
function feSegs(raw: string): string[] | null {
  let p = raw.replace(/\$\{[^{}]*\}/g, ':P');
  const qi = p.indexOf('?');
  if (qi >= 0) p = p.slice(0, qi);
  if (!/^\/(?:[A-Za-z0-9_-]+|:P)(?:\/(?:[A-Za-z0-9_-]+|:P))*\/?$/.test(p)) return null;
  const segs = p
    .split('/')
    .filter(Boolean)
    .map((s) => (s === ':P' ? 'P' : s));
  if (segs[0] === 'P') return null; // generic hook with dynamic resource segment
  return segs;
}

interface Route {
  method: string;
  segs: string[];
}
function buildRoutes(): Route[] {
  const routes: Route[] = [];
  for (const file of walk(API_SRC, (f) => f.endsWith('.controller.ts'))) {
    const src = readFileSync(file, 'utf8');
    const ctrls: { idx: number; prefix: string }[] = [];
    const ctrlRe =
      /@Controller\(\s*(?:(['"`])([^'"`]*)\1|\{[^}]*?path:\s*(['"`])([^'"`]*)\3[^}]*\}|)\s*\)/g;
    for (const cm of src.matchAll(ctrlRe)) {
      ctrls.push({ idx: cm.index ?? 0, prefix: (cm[2] ?? cm[4] ?? '').trim() });
    }
    if (!ctrls.length) ctrls.push({ idx: -1, prefix: '' });
    const prefixFor = (idx: number) => {
      let best = ctrls[0] ?? { idx: -1, prefix: '' };
      for (const c of ctrls) if (c.idx <= idx && c.idx >= best.idx) best = c;
      return best.prefix;
    };
    const methRe =
      /@(Get|Post|Put|Patch|Delete)\(\s*(['"`])([^'"`]*)\2\s*\)|@(Get|Post|Put|Patch|Delete)\(\s*\)/g;
    for (const mm of src.matchAll(methRe)) {
      const method = (mm[1] ?? mm[4] ?? '').toUpperCase();
      const sub = mm[3] ?? '';
      const full = `/${[prefixFor(mm.index ?? 0), sub].filter(Boolean).join('/')}`;
      routes.push({ method, segs: beSegs(full) });
    }
  }
  return routes;
}

const METHOD_OF: Record<string, string | undefined> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  download: 'GET',
  postDownload: 'POST',
};

/** literal seg matches literal-or-param; param seg matches param only. */
function matches(callSegs: string[], routeSegs: string[]): boolean {
  if (callSegs.length !== routeSegs.length) return false;
  for (let i = 0; i < callSegs.length; i++) {
    const c = callSegs[i];
    const r = routeSegs[i];
    if (r === 'P') continue;
    if (c === 'P' || c !== r) return false;
  }
  return true;
}

describe('FE api.* call-sites resolve to a BE route with the same method', () => {
  const routes = buildRoutes();
  const feFiles = walk(
    WEB_SRC,
    (f) =>
      (f.endsWith('.ts') || f.endsWith('.tsx')) &&
      !f.endsWith('.test.ts') &&
      !f.endsWith('.test.tsx'),
  );
  const offenders: string[] = [];
  const callRe =
    /\bapi\.(get|post|put|patch|delete|download|postDownload)\s*(?:<[^>]*>)?\(\s*(['"`])([^'"`]*)\2/g;

  for (const file of feFiles) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(callRe)) {
      const fe = m[1];
      const raw = m[3];
      if (!fe || !raw || !raw.startsWith('/')) continue;
      const segs = feSegs(raw);
      if (!segs) continue; // too dynamic — verified at runtime
      const method = METHOD_OF[fe];
      if (!method) continue;
      const matched = routes.filter((r) => matches(segs, r.segs));
      if (matched.some((r) => r.method === method)) continue; // OK
      const norm = `${method} /${segs.map((s) => (s === 'P' ? ':P' : s)).join('/')}`;
      if (DYNAMIC_SEGMENT_ALLOWLIST.has(norm)) continue;
      const others = [...new Set(matched.map((r) => r.method))];
      const why = others.length
        ? `path exists only as ${others.join('/')} (silent 404/405)`
        : 'no matching route (silent 404)';
      offenders.push(`${relOf(file)}:${lineOf(src, m.index ?? 0)}  api.${fe}('${raw}')  → ${why}`);
    }
  }

  it('has no FE→BE method/path mismatch (silent 404/405)', () => {
    expect(routes.length).toBeGreaterThan(500); // sanity: route table actually built
    expect(offenders, `FE↔BE HTTP-contract violations:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * The allowlist above suppresses a whole `METHOD /path/:P` shape, so it also
   * hides a REAL break if the concrete literal routes behind it ever go away.
   * These pin the literals so the allowlist can't rot into a blind spot.
   */
  describe('allowlisted dynamic segments still resolve to real literal routes', () => {
    const has = (method: string, path: string) =>
      routes.some((r) => r.method === method && r.segs.join('/') === path.replace(/^\//, ''));

    for (const action of ['bulk-archive', 'bulk-restore', 'bulk-delete']) {
      it(`POST /hr/employees/${action} exists on the controller`, () => {
        expect(has('POST', `/hr/employees/${action}`)).toBe(true);
      });
    }

    for (const action of ['close', 'drawer-in', 'drawer-out']) {
      it(`POST /cashier-sessions/:id/${action} exists on the controller`, () => {
        expect(has('POST', `/cashier-sessions/P/${action}`)).toBe(true);
      });
    }

    for (const action of ['approve', 'reject']) {
      it(`POST /analitika/counts/:id/${action} exists on the controller`, () => {
        expect(has('POST', `/analitika/counts/P/${action}`)).toBe(true);
      });
    }
  });
});
