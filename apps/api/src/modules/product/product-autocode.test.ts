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

describe('product «Код» auto-allocation', () => {
  it('service imports the shared atomic document-number allocator', () => {
    expect(svc).toMatch(
      /import\s+\{\s*allocateDocumentNumber\s*\}\s+from\s+'\.\.\/\.\.\/prisma\/document-number\.js'/,
    );
  });

  it('create allocates a product code race-safely, only when the form supplied none', () => {
    expect(svc).toMatch(/if \(!parsed\.code\)/);
    expect(svc).toMatch(
      /allocateDocumentNumber\(\s*this\.prisma\.client,\s*accountId,\s*'product'/,
    );
  });

  it('seeds the counter from the MAX existing numeric code, not the row count', () => {
    // `code` is UNIQUE per account; a count()-based seed lands inside the existing
    // range and 409s, so the seed must be maxProductCode() (max numeric code).
    expect(svc).toMatch(/private async maxProductCode/);
    expect(svc).toMatch(/this\.maxProductCode\(accountId\)/);
    // the 'product' allocation must NOT be seeded by product.count(...)
    expect(svc).not.toMatch(/'product',\s*\(\)\s*=>\s*[\s\S]{0,60}\.count\(/);
  });

  it('exposes POST /products/allocate-code so the create form can pre-fill «Код»', () => {
    expect(ctrl).toMatch(/@Post\('allocate-code'\)/);
    expect(ctrl).toMatch(/allocateCode/);
  });
});
