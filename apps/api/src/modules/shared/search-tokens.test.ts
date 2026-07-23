import { describe, expect, it } from 'vitest';
import { searchTokenGroups } from './search-tokens.js';

// Per-token clause builder mirroring how product.repository uses the helper
// (a small OR set of contains-clauses); the test only cares about the AND/OR
// SHAPE, not any Prisma model, so the field clauses are plain objects.
const clauses = (tok: string) => [
  { name: { contains: tok, mode: 'insensitive' as const } },
  { code: { contains: tok, mode: 'insensitive' as const } },
];

describe('searchTokenGroups (moysklad «содержит» tokenization)', () => {
  it('returns [] for empty / whitespace / nullish queries (search is a no-op)', () => {
    expect(searchTokenGroups(undefined, clauses)).toEqual([]);
    expect(searchTokenGroups(null, clauses)).toEqual([]);
    expect(searchTokenGroups('', clauses)).toEqual([]);
    expect(searchTokenGroups('   ', clauses)).toEqual([]);
  });

  it('single word → ONE OR-group over all fields', () => {
    const g = searchTokenGroups('кабель', clauses);
    expect(g).toHaveLength(1);
    expect(g[0]).toEqual({
      OR: [
        { name: { contains: 'кабель', mode: 'insensitive' } },
        { code: { contains: 'кабель', mode: 'insensitive' } },
      ],
    });
  });

  it('multi-word → one OR-group PER word (AND-ed by the caller), so words may match different fields', () => {
    const g = searchTokenGroups('иванов возврат', clauses);
    expect(g).toHaveLength(2);
    expect(g[0]?.OR[0]).toEqual({ name: { contains: 'иванов', mode: 'insensitive' } });
    expect(g[1]?.OR[0]).toEqual({ name: { contains: 'возврат', mode: 'insensitive' } });
  });

  it('collapses leading/trailing/inner extra whitespace (no empty tokens — the old trailing-space bug)', () => {
    const g = searchTokenGroups('  труба   круглая  ', clauses);
    expect(g).toHaveLength(2);
    // Each token is clean (no stray spaces that would break `contains`).
    expect(g[0]?.OR[0]).toEqual({ name: { contains: 'труба', mode: 'insensitive' } });
    expect(g[1]?.OR[0]).toEqual({ name: { contains: 'круглая', mode: 'insensitive' } });
  });
});
