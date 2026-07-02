import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Schema-absence + code-absence guard for the retired `inTransitQty` columns
 * (`Stock.inTransitQty` + `PurchaseOrderPosition.inTransitQty`, both
 * `@map("in_transit_qty")`), DROPPED 2026-06-12.
 *
 * Both were designed-but-unwired denormalisations: NOTHING ever wrote them
 * (every upsert created them as `0`, no increment/decrement anywhere), so they
 * sat at their migration DEFAULT 0 forever. The stock-balance report's
 * «Ожидание» column now derives expected-incoming at QUERY TIME from active
 * supplier-order positions (2026-06-12, `_IN-TRANSIT-OZHIDANIE-IMPL-…`), so the
 * always-0 columns had no remaining purpose — yet `StockService.getBalances` /
 * `lockBalances` still surfaced the permanent `'0'` to the UI-facing `/stocks`
 * endpoint (Demand/Loss/Inventory/Move stock badges). That is the exact
 * silent-wrong-0 bug-class the 11h «Ниже минимума» / 11s `Product.stock_minor`
 * audits removed. This guard pins the drop so the dead denormalisation cannot
 * be re-introduced and tempt a future reader.
 *
 * Scope note: the stock-balance REPORT legitimately retains the `inTransitQty`
 * identifier — it is the report's OUTPUT field (the query-time «Ожидание»
 * value) and the `getInTransitMap` helper, NOT a read of the dropped column.
 * The dropped Stock column reads inside the report (`_sum`, `where`) are guarded
 * structurally instead: once the schema field is gone and the client regen'd,
 * any `Stock` `_sum: { inTransitQty }` / `where: { inTransitQty }` fails to
 * typecheck — so this guard does not scan the report file (a token-ban there
 * would false-positive on the surviving output field).
 */

// Strip comments before the banned-token scans — the schema and service retain
// doc-comments that name the dropped columns to explain the removal, so a raw
// scan would match the explanation, not a live declaration.
const stripTsComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const stripPrismaComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/^\s*\/\/\/.*$/gm, '');

const SCHEMA = join(__dirname, '..', '..', '..', '..', '..', 'packages/db/prisma/schema.prisma');

describe('the vestigial in_transit_qty columns are dropped from the schema', () => {
  const schema = stripPrismaComments(readFileSync(SCHEMA, 'utf8'));

  it('no model declares the snake-case in_transit_qty column', () => {
    // After dropping Stock + PurchaseOrderPosition, `in_transit_qty` is used by
    // no model, so a whole-schema absence scan is unambiguous.
    expect(schema).not.toMatch(/\bin_transit_qty\b/);
  });

  it('no model declares the camelCase inTransitQty field', () => {
    expect(schema).not.toMatch(/\binTransitQty\b/);
  });
});

describe('StockService no longer reads or surfaces the dead in-transit column', () => {
  const src = readFileSync(join(__dirname, 'stock.service.ts'), 'utf8');
  const code = stripTsComments(src);

  it('the StockBalance shape + balance reads drop inTransitQty', () => {
    // Surfacing it (always 0) is the silent-wrong-0 trap.
    expect(code).not.toMatch(/\binTransitQty\b/);
  });

  it('the lockBalances raw SQL no longer SELECTs the dropped column', () => {
    // CRITICAL: the raw-SQL path is NOT typechecked — a leftover
    // `in_transit_qty` here would throw "column does not exist" on every
    // posting once the DB column is dropped.
    expect(code).not.toMatch(/\bin_transit_qty\b/);
  });
});

describe('the /stocks UI endpoint no longer returns a permanently-0 inTransitQty', () => {
  const code = stripTsComments(readFileSync(join(__dirname, 'stock.controller.ts'), 'utf8'));

  it('the response shape drops inTransitQty', () => {
    expect(code).not.toMatch(/\binTransitQty\b/);
  });
});
