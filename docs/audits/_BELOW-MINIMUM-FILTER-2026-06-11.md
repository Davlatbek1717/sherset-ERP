# «Ниже минимума» re-order filter — live-stock fix (2026-06-11h)

> Follow-up to the Convention-4 filter audit (11g), which **documented** this
> as a backlog item (`Product.stock_minor` never maintained) rather than
> blind-build it. This session **grounded the scale + source** and fixed it —
> runtime-verified, no FE change.

## TL;DR

The «Ниже минимума» (below-minimum / re-order) filter on the
**products / bundles / services** lists was **actively wrong**, not merely
missing:

- It compared the denormalised `Product.stock_minor` column against
  `minimum_balance_minor`. `stock_minor` is a **designed-but-unwired**
  denormalisation — no application write, no DB trigger, no seed — so it is
  permanently its migration `DEFAULT 0`.
- ⇒ `belowMinimum=true` ran `0 < minimum_balance_minor`, which is **TRUE for
  every product that has any minimum configured**, regardless of real stock.
  The "re-order suggestions" view listed products that were fully stocked.
- ⇒ `belowMinimum=false` («Достаточно») hit a falsy `if (filter.belowMinimum)`
  guard and **fell through to no-filter**, returning everything.

**Fix** (one choke point — `product.repository.ts`, serving all three lists):
aggregate the **live `Stock` ledger** per product instead of the dead column,
in the grounded ×1000 milliunit scale, with both tri-state branches honoured.

## Grounding (why this is not a guess)

| Fact | Source |
|---|---|
| `stock_minor` scale = `Position.quantity` units, **1 piece = 1000** | `schema.prisma` Product comment (line ~4309) |
| `minimumBalanceMinor` is stored as **user units × 1000** | `products/new/page.tsx:126-132` (`BigInt(whole) * 1000n + …`) |
| Real stock lives in `Stock.qty` (`Decimal(20,6)`, per store×assortment), maintained with `FOR UPDATE` locking | `stock.service.ts` `applyDeltas` / `lockBalances` |
| Cross-store total = `SUM(Stock.qty)` grouped by `(assortmentKind, assortmentId)` | `stock-balance.service.ts:168-177` (the established pattern) |
| `Product.stockMinor` has **no other consumer** (declared on the detail type but never rendered; no report reads it) | repo-wide grep |

So `SUM(Stock.qty) × 1000 < minimum_balance_minor` is scale-consistent (both
sides in milliunits) and reads the authoritative, already-maintained table.

## Why query-time aggregation (not wire the denormalisation)

`Product.stockMinor/reserveMinor/inTransitMinor` were designed as a per-product
cross-store rollup but never wired. Two ways to fix:

1. **Denormalise** — write `stockMinor` in `applyDeltas` (+ the separate
   reservation path) + a backfill migration. Adds a deadlock-prone Product-row
   write to every stock movement and a permanent drift risk — for a field
   nothing displays.
2. **Query-time aggregate** (chosen) — the `Stock` table is *already* a
   maintained materialisation with locking; sum it on demand. Always
   live-correct, zero backfill, zero concurrency surface, zero drift.

The filter runs only when the user sets it, so a single `GROUP BY` over the
account's `stocks` (then join to products) is cheap. The dead columns are kept
(reserved for a future per-product «Остаток» list column) but their schema
comment is corrected to stop claiming they're maintained.

## The fix

`product.repository.ts` — `belowMinimum` block:

```sql
SELECT p.id
FROM products p
LEFT JOIN (
  SELECT assortment_id, SUM(qty) AS total_qty
  FROM stocks
  WHERE account_id = $accountId
  GROUP BY assortment_id
) s ON s.assortment_id = p.id
WHERE p.account_id = $accountId
  AND p.deleted_at IS NULL
  AND p.minimum_balance_minor > 0          -- 0 = disabled sentinel
  AND COALESCE(s.total_qty, 0) * 1000 <cmp> p.minimum_balance_minor
```

`<cmp>` is `<` for `belowMinimum=true`, `>=` for `false` (a `Prisma.sql`
fragment chosen from the boolean — injection-free). The guard is
`if (filter.belowMinimum !== undefined)` so the `false` branch runs (the old
falsy `if (filter.belowMinimum)` dropped it). `COALESCE(…,0)` makes a product
with **no** stock rows read as 0 (→ below any positive minimum).

No FE change: the products/bundles/services pages already sent both
`belowMinimum=true` and `=false` (the string `'false'` is truthy in their
`...(belowMinimum ? {belowMinimum} : {})`); only the BE was wrong.

## Runtime proof — live API + self-reverting DB probe (Phase-2)

`tools/scripts/verify-below-minimum-smoke.mjs` (dev api :4000 + dev DB),
**13/13 PASS**. Sets up 5 products under a unique name prefix, then asserts:

| Product | minimum | stock | `=true` | `=false` |
|---|---|---|---|---|
| below | 5 (5000) | 2 @ store1 | ✅ in | ❌ out |
| zerostock | 5 | (no rows → 0) | ✅ in | ❌ out |
| suff | 5 | 10 @ store1 | ❌ out | ✅ in |
| **split** | 5 | **3 @ store1 + 3 @ store2 = 6** | ❌ out | ✅ in |
| nomin | 0 (disabled) | 1 @ store1 | ❌ out | ❌ out |

- **`split` proves the cross-store SUM**: one-store logic would have read 3 < 5
  and wrongly flagged it "below"; summed to 6 it is correctly sufficient.
- The `true`/`false` result sets are **disjoint**, and a no-filter query returns
  all 5 (sanity). All test rows + any created store are deleted at the end.

## Guard

`apps/api/src/modules/product/product-below-minimum.test.ts` (6, source-scan,
comment-stripped so the fix's own explanatory comment isn't matched):

- aggregates live `Stock` (`SUM(qty) AS total_qty`, `FROM stocks`,
  `GROUP BY assortment_id`, joined `s.assortment_id = p.id`);
- compares in the ×1000 scale; gates on `minimum_balance_minor > 0`;
- runs for **both** tri-state branches (`!== undefined`, both `<` and `>=`);
- **non-vacuous negatives**: the dead `stock_minor < minimum_balance_minor`
  query and the falsy `if (filter.belowMinimum) {` guard are GONE.

## Gate

web **untouched** · api **tc0** · biome **0** (changed api files; the CLI
smoke script carries the usual accepted `noConsoleLog` warnings) · api Vitest
**2851 (+6, 0 regress)** · runtime battery **13/13** · prisma client
regenerated (comment-only schema change; `index.d.ts` unchanged ⇒ no type
impact; battery re-run green on the regenerated client).

## Honest status

**Phase-2 (runtime-verified)** for the filter logic — live API + self-reverting
DB probe across two stores. The fix is BE-only; the FE filter controls were
**not** re-clicked in a browser this session (they were already sending the
right params, proven by the battery). The denormalised `stockMinor` columns
remain unused-but-present (reserved for a future list «Остаток» column).

## Backlog (unchanged from 11g §Backlog)

- **Filter-field parity enrichment** — per-entity coverage gaps (counterparties
  5→38, products 8→19, …), capture-grounded, incremental.
- **Per-product «Остаток» list column** — moysklad shows stock on the assortment
  list; we don't. If/when built, that's the right moment to wire
  `stockMinor`/`reserveMinor` in `applyDeltas` for an O(1) rollup.
- **Variant re-order view** — removed in 11g (no moysklad standalone variant
  list); would need a `Stock(assortmentKind='variant')` aggregation if ever
  wanted.

## Phase-2 QA flag

Exact moysklad «Ниже минимума» semantics — **on-hand** vs **available**
(qty − reserved), and whether a parent product's threshold should consider its
variants' stock — are not capture-grounded. This fix uses **on-hand, own-
assortment** stock (faithful to the existing `stockMinor` field's documented
meaning). Confirm against moysklad in a Phase-2 QA pass.
