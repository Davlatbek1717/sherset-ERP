/**
 * ApiToken scope model for the `/api/remap/1.2` compat router (`INT-07`).
 *
 * Until Faza 24 `ApiToken.scopes` was stored, listed in the admin UI and
 * never read: `ApiTokenGuard` handed every token `permissions: ['*']`. An
 * admin who created a "product read-only" token actually handed out full
 * account access (orders, counterparties, prices).
 *
 * Scope grammar (one entry per line, lowercase):
 *   `*`              — everything
 *   `<slug>`         — read + write on that compat slug
 *   `<slug>:read`    — read only (all compat routes are GET today)
 *   `<slug>:write`   — write, and implies read
 *
 * `<slug>` is a moysklad entity slug exactly as it appears in the URL
 * (`product`, `customerorder`, `retaildemand`, …).
 *
 * DOCUMENTED BEHAVIOUR — an EMPTY scope list means FULL ACCESS. Every
 * token minted before this phase has `scopes: []`, and silently locking
 * them out would break live 1C / CLIMART-proxy integrations. To restrict a
 * token you must name its scopes; there is no "deny by default" for the
 * empty list. Everything else is fail-closed: an unknown or misspelled
 * slug matches nothing.
 */

import { compatSlugSet } from './compat-slugs.js';

export type CompatAction = 'read' | 'write';

const SCOPE_RE = /^(?:\*|[a-z][a-z0-9_]*(?::(?:read|write))?)$/;

/** Lowercase + trim + drop empties + dedupe, order preserved. */
export function normalizeScopes(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of raw) {
    const s = entry.trim().toLowerCase();
    if (s.length === 0) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Syntax only — slug membership is NOT checked (a typo simply grants nothing). */
export function isScopeSyntaxValid(scope: string): boolean {
  return SCOPE_RE.test(scope);
}

/**
 * Membership: does this scope name a slug the compat router actually serves?
 *
 * Faza 24 checked grammar only, which made `prodcut:read` a valid-looking
 * scope that granted nothing — the admin discovered it from the first 403.
 * `known` is injectable so this module stays a leaf (the default is the
 * canonical registry).
 */
export function isScopeSlugKnown(
  scope: string,
  known: ReadonlySet<string> = compatSlugSet(),
): boolean {
  if (scope === '*') return true;
  const slug = scope.split(':')[0];
  return !!slug && known.has(slug);
}

/** Empty list (legacy tokens) or an explicit `*`. */
export function scopesGrantFullAccess(scopes: readonly string[]): boolean {
  return scopes.length === 0 || scopes.includes('*');
}

/**
 * Entity slug of a compat request, or null when the URL is not an
 * `entity/<slug>` route (`_compat/slugs` discovery, anything else).
 *
 * Reads the URL rather than `req.params` because guards must not depend on
 * how the router happens to expose params — and because the compat router
 * is mounted under a global prefix (`/api/v1/api/remap/1.2/...`) in prod
 * but not in tests.
 */
export function slugFromRemapUrl(url: string): string | null {
  const path = (url.split('?')[0] ?? '').toLowerCase();
  const parts = path.split('/').filter(Boolean);
  const entityIdx = parts.indexOf('entity');
  if (entityIdx === -1) return null;
  const slug = parts[entityIdx + 1];
  return slug && slug.length > 0 ? slug : null;
}

/** HTTP method → compat action. Reads are GET/HEAD; everything else writes. */
export function actionFromMethod(method: string): CompatAction {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? 'read' : 'write';
}

/** Does this scope list allow `action` on `slug`? */
export function isCompatActionAllowed(
  scopes: readonly string[],
  slug: string,
  action: CompatAction,
): boolean {
  if (scopesGrantFullAccess(scopes)) return true;
  const wanted = slug.toLowerCase();
  for (const scope of scopes) {
    const [scopeSlug, scopeAction] = scope.split(':');
    if (scopeSlug !== wanted) continue;
    // Bare slug = read+write; `:write` implies read; `:read` never writes.
    if (scopeAction === undefined || scopeAction === 'write') return true;
    if (scopeAction === 'read' && action === 'read') return true;
  }
  return false;
}

/**
 * `AuthenticatedUser.permissions` for a token.
 *
 * Scoped tokens deliberately get `compat:`-namespaced strings that match
 * NOTHING in the internal permission namespace (`entity.action`): the
 * compat router enforces scopes in the guard, and if a future controller
 * ever puts `PermissionsGuard` in front of a scoped token, it must fail
 * closed rather than inherit a wildcard.
 */
export function scopesToPermissions(scopes: readonly string[]): string[] {
  if (scopesGrantFullAccess(scopes)) return ['*'];
  const out: string[] = [];
  for (const scope of scopes) {
    const [slug, action] = scope.split(':');
    if (!slug) continue;
    const actions: CompatAction[] =
      action === 'read' ? ['read'] : action === 'write' ? ['read', 'write'] : ['read', 'write'];
    for (const a of actions) {
      const perm = `compat:${slug}:${a}`;
      if (!out.includes(perm)) out.push(perm);
    }
  }
  return out;
}
