import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * /cashier-sessions/current response-shape contract (2026-06-08k).
 *
 * The /retail POS register header renders `session.cashier.name` (and the FE
 * `CurrentSession` type declares `cashier: { id; name }`). `findCurrentForCashier`
 * is the ONLY session read that backs `/cashier-sessions/current`, and it was the
 * one method (vs list/findOne/open/close, which all include `cashier`) that
 * OMITTED the `cashier` include — so the endpoint returned only `cashierId`,
 * `session.cashier` was `undefined`, and the whole POS register crashed with a
 * client-side `Cannot read properties of undefined (reading 'name')` the moment a
 * cashier had an open session.
 *
 * No typechecker caught it: the FE type *claims* `cashier` exists, and Prisma's
 * untyped-by-default result let the missing include through. This guard pins the
 * include so the contract can't silently regress again. Browser-verified live
 * (the POS register loads + the header shows the cashier name, 2026-06-08k).
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Slice the body of an `async <name>(` method up to the next `async ` declaration. */
function methodBody(src: string, name: string): string {
  const start = src.indexOf(`async ${name}(`);
  if (start === -1) throw new Error(`method ${name} not found`);
  const rest = src.slice(start + `async ${name}(`.length);
  const next = rest.indexOf('\n  async ');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('cashier-session current() response contract', () => {
  const src = read('./cashier-session.service.ts');

  it('findCurrentForCashier includes `cashier` (POS register renders session.cashier.name)', () => {
    const body = methodBody(src, 'findCurrentForCashier');
    expect(body).toMatch(/cashier:\s*\{\s*select:\s*\{[^}]*name:\s*true/);
  });

  it('findCurrentForCashier still includes cashDesk/store/organization (unchanged)', () => {
    const body = methodBody(src, 'findCurrentForCashier');
    expect(body).toContain('cashDesk:');
    expect(body).toContain('store:');
    expect(body).toContain('organization:');
  });
});
