import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Код» auto-allocation for products (moysklad parity — the new product form shows
 * a sequential code pre-filled). Source-level guards (mirroring
 * counterparty-autocode.test.ts) so the wiring + the unique-constraint collision
 * fix can't silently regress.
 */
const svc = readFileSync(join(__dirname, 'product.service.ts'), 'utf8');
const ctrl = readFileSync(join(__dirname, 'product.controller.ts'), 'utf8');
// Allocation moved out of the service into a util shared by the product create
// form, the variant module and the cut/remnant flow — all three write into the
// SAME `(account_id, code)` unique index off the SAME 'product' counter.
const util = readFileSync(join(__dirname, 'product-code.util.ts'), 'utf8');

describe('product «Код» auto-allocation', () => {
  it('service allocates through the shared assortment-code util', () => {
    expect(svc).toMatch(
      /import\s+\{\s*allocateAssortmentCode\s*\}\s+from\s+'\.\/product-code\.util\.js'/,
    );
    expect(util).toMatch(
      /import\s+\{\s*allocateDocumentNumber\s*\}\s+from\s+'\.\.\/\.\.\/prisma\/document-number\.js'/,
    );
  });

  it('create allocates a product code race-safely, only when the form supplied none', () => {
    expect(svc).toMatch(/if \(!parsed\.code\)/);
    expect(svc).toMatch(/allocateAssortmentCode\(this\.prisma\.client, accountId\)/);
    expect(util).toMatch(/allocateDocumentNumber\(\s*client,\s*accountId,\s*KEY,/);
  });

  it('seeds the counter from the MAX existing numeric code, not the row count', () => {
    // `code` is UNIQUE per account; a count()-based seed lands inside the existing
    // range and 409s, so the seed must be maxAssortmentCode() (max numeric code
    // across products AND variants — moysklad shares one sequence between them).
    expect(util).toMatch(/export async function maxAssortmentCode/);
    expect(util).toMatch(/\(\) => maxAssortmentCode\(client, accountId\)/);
    // the seed must NOT be a row count
    expect(util).not.toMatch(/\.count\(/);
  });

  /**
   * Stale-counter regression (prod 2026-08-22): the counter is seeded ONCE, so the
   * MoySklad catalog import — which wrote 5064 codes up to 05106 straight into the
   * table while the counter sat at 4953 — left every allocation colliding with an
   * imported row («Duplicate value on unique field: account_id, code»), 153 doomed
   * creates deep, and no product could be created for six days. The probe is what
   * makes the sequence self-heal after ANY such bulk write.
   */
  it('probes for collisions so a counter left behind by a bulk import self-heals', () => {
    expect(util).toMatch(/isTaken:\s*\(v\) => assortmentCodeTaken\(client, accountId, v\)/);
    // the probe must check BOTH tables that share the sequence
    expect(util).toMatch(/client\.product\.findFirst\(\{ where: \{ accountId, code \}/);
    expect(util).toMatch(/client\.variant\.findFirst\(\{ where: \{ accountId, code \}/);
    // and it must compare the PADDED form — that is what lands in the unique index
    expect(util).toMatch(/const code = padProductCode\(n\)/);
  });

  it('every writer of the shared «Код» index allocates through the same util', () => {
    const variant = readFileSync(join(__dirname, '..', 'variant', 'variant.service.ts'), 'utf8');
    const cut = readFileSync(join(__dirname, 'product-cut.service.ts'), 'utf8');
    for (const src of [variant, cut]) {
      expect(src).toMatch(/allocateAssortmentCode\(/);
      // no hand-rolled 'product' allocation may bypass the collision probe
      expect(src).not.toMatch(/allocateDocumentNumber\([^)]*'product'/);
    }
  });

  it('exposes POST /products/allocate-code so the create form can pre-fill «Код»', () => {
    expect(ctrl).toMatch(/@Post\('allocate-code'\)/);
    expect(ctrl).toMatch(/allocateCode/);
  });
});
