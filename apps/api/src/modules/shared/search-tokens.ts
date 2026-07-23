/**
 * moysklad «Контекстный поиск» / «По умолчанию содержит» parity.
 *
 * moysklad's list search box does NOT match the raw query as one contiguous
 * substring. It splits the query on whitespace into words and AND-matches each
 * word, where each word may satisfy a DIFFERENT searched field. The API docs give
 * the canonical example: `search="120 возврат"` returns a row whose name contains
 * «120» AND whose description contains «возврат» (each word matched a different
 * field). Leading/trailing/inner extra whitespace is harmless because it tokenizes.
 *
 * Our previous behaviour passed the whole raw string into a single Prisma
 * `contains` per field inside one `OR`, so both words had to sit contiguously in
 * ONE column — which made partial/multi-word queries return nothing and forced
 * users to type the exact full name. See docs/audits/small-fn-parity-audit-2026-07-06.
 *
 * This helper turns a query into one OR-group PER WORD. AND-ing the groups (every
 * word must match some field) reproduces moysklad's behaviour. It returns an array
 * so callers compose it without clobbering an existing top-level `AND`:
 *
 *   // no other AND on the where:
 *   ...( (g = searchTokenGroups(q, tok => [{ name: { contains: tok, mode: 'insensitive' } }])).length
 *          ? { AND: g } : {} )
 *
 *   // merging with other AND groups (e.g. a characteristics filter):
 *   const and = [...searchTokenGroups(q, buildClauses), ...otherAndGroups];
 *   ...(and.length ? { AND: and } : {})
 *
 * `T` is left generic so this stays model-agnostic (no per-model WhereInput import).
 * A `{ OR: T[] }` object is itself a valid Prisma `*WhereInput`, so the returned
 * groups drop straight into an `AND: WhereInput[]`.
 */
export function searchTokenGroups<T>(
  search: string | undefined | null,
  clausesForToken: (token: string) => T[],
): Array<{ OR: T[] }> {
  if (!search) return [];
  const tokens = search
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  return tokens.map((token) => ({ OR: clausesForToken(token) }));
}
