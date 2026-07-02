import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Catalog detail-page HTTP-method gate (regression guard).
 *
 * The product-family update route is NestJS `@Patch(':id')` — there is NO
 * `@Put(':id')` on the products/variants controllers. A page that saves via
 * `api.put('/products/:id')` therefore 404s at runtime, and product-crud.spec
 * (the only e2e) covers create→archive→restore→delete but NEVER the edit/Save
 * path — so a PUT-vs-PATCH method mismatch is invisible to typecheck, lint and
 * every unit test. This locks the FE save call to PATCH on each page.
 *
 * (Bundles legitimately use `api.put('/bundles/:id/components')` — that route
 * IS declared `@Put(':id/components')` — so the scan is scoped to the
 * product/variant *update* endpoint only.)
 */
const APP = join(__dirname, '..', 'app', '(app)');
const read = (p: string) => readFileSync(join(APP, `${p}/page.tsx`), 'utf8');

describe('catalog product-update uses PATCH (matches @Patch controller, not @Put)', () => {
  for (const page of ['products/[id]', 'services/[id]', 'bundles/[id]']) {
    it(`${page} saves the product via api.patch('/products/:id')`, () => {
      const src = read(page);
      expect(src).toMatch(/api\.patch[^\n]*\/products\/\$\{id\}/);
      // api.put('/products/:id') hits a non-existent @Put route → silent 404.
      expect(src).not.toMatch(/api\.put[^\n]*\/products\/\$\{id\}/);
    });
  }

  it("variants/[id] saves the variant via api.patch('/variants/:id')", () => {
    const src = read('variants/[id]');
    expect(src).toMatch(/api\.patch[^\n]*\/variants\/\$\{id\}/);
    expect(src).not.toMatch(/api\.put[^\n]*\/variants\/\$\{id\}/);
  });
});
