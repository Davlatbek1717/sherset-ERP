# Cost-currency normalization — implementation plan (Tier-2 unblocker)

> **Status:** PLAN — awaiting informed go-ahead. Touches the §117 FIFO
> cost ledger (marked "sacred / UNTOUCHED" in RESUME.md). Money-critical;
> needs a data migration. NOT a blind continuation — this doc exists so the
> change is reviewed before any sacred-engine edit.

## Problem (measured)

COGS / stock cost is stored in the **supply's document currency**, never
normalized to the account base (валюта учёта):

- `supply.service.ts` post(): `cost_minor` per unit = `priceAfterDiscOf(p)`
  = raw `priceMinor` (supply currency). The supply's `rateValue` is on the
  document but **not applied**.
- Flows to: `StockDelta.costDeltaMinor` → `stock.costBalanceMinor`
  (supply currency), and `SupplyPosition.costMinor` → demand FIFO consume
  → `demand.costSumMinor` (supply currency).
- Tier-2 reports (pnl, report.service, profitability, slow-movers) treat
  `costSumMinor` / `costBalanceMinor` as base → wrong for multi-currency.

Within ONE demand, `sumMinor` (sale, demand currency) and `costSumMinor`
(cost, supply currency) can differ, and the demand doesn't store the supply
rate — so the **report layer cannot** convert COGS. The fix must happen at
supply-post.

## Key safety property

For a single-currency tenant (every supply `rateValue = 1e8`,
`multiplicity = 1`, `indirect = false`), base conversion is the identity:
`cost × 1e8 / 1e8 = cost`. So the change is **byte-identical / zero-impact
for the 99% UZ single-currency case** — both new posts and the migration
backfill are no-ops there. Risk is confined to multi-currency supplies.

## Change set

### A. Forward fix — supply.service post()

At cost computation, convert per-unit + line cost to base using the
supply's rate (exact BigInt `toBaseMinor` from `currency-convert.ts`):

```ts
const rate: CurrencyRate = { rateValue: supply.rateValue, multiplicity: 1n, indirect: false };
// per-unit + line cost → base before building StockDelta + SupplyPosition.costMinor
costPerUnitBase = toBaseMinor(priceAfterDiscOf(p), rate);
```

Result: `SupplyPosition.costMinor` and `stock.costBalanceMinor` become base.
Reversal (unpost/cancel) reads back the STORED (now base) cost → still
exactly zero-sum (symmetric). Overhead path (`costSumMinor` recompute) uses
the same base figures.

> Open question to confirm in impl: does Supply store `multiplicity` /
> `indirect`? If only `rateValue`, the supply rate is direct-by-construction
> (rateValue = base per 1 foreign × 1e8) → the simple `toBaseMinor` form
> applies. Verify against currency-convert semantics before coding.

### B. demand.service FIFO

No logic change — it reads `sp.cost_minor` which is now base. `costSumMinor`
becomes base automatically. (Verify no place re-applies a demand rate to
cost.)

### C. Migration — backfill existing data

`prisma/migrations/<ts>_normalize_cost_to_base/`:

1. `supply_positions.cost_minor`: for each posted supply with
   `rate_value <> 1e8`, set `cost_minor = round(cost_minor * rate_value / 1e8)`.
   Single-currency rows (rate_value = 1e8) untouched.
2. `supplies.cost_sum_minor`: same factor per supply.
3. `stock.cost_balance_minor`: **cannot** be a simple per-row factor (it's an
   aggregate across supplies of different rates). Recompute from the
   normalized `supply_positions` remaining-qty × cost_minor, OR from the
   stock-cost ledger if one exists. Design: recompute per (store, assortment)
   from normalized supply lots. **This is the riskiest step** — needs a
   verification query (sum before vs after for single-currency = unchanged).
4. `demand` historical `cost_sum_minor`: already-posted demands consumed
   old-currency cost. Backfill = re-derive from consumed lots if tracked,
   else document as "historical COGS pre-normalization left as-is" (report
   caveat for the cutover window).

Rollback `_rollback.sql`: inverse factor (× 1e8 / rate_value).

### D. Money-engine regression tests (MANDATORY before merge)

- post→unpost→post zero-sum holds (existing test must stay green).
- Single-currency: cost values byte-identical pre/post change (identity).
- Multi-currency supply: cost_minor = base after post (new test).
- FIFO consume across mixed-rate lots → demand.costSumMinor in base (new).
- Stock cost balance after mixed-currency supplies = Σ base costs (new).

### E. Tier-2 report fixes (after cost is base)

Then pnl / profitability / slow-movers / report.service convert only
**revenue** to base (cost already base) via the existing
`consolidateToBase`. Add `currency` + `mixedCurrency`. Live-verify via the
existing harness (add a supply→demand→P&L multi-currency scenario).

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Break FIFO zero-sum for ALL tenants | HIGH | identity for single-currency; regression test gate |
| Stock cost-balance migration wrong | HIGH | recompute + before/after sum check; single-currency must be unchanged |
| Historical demand COGS inconsistency at cutover | MED | document caveat OR re-derive if lots tracked |
| Overhead allocation interaction | MED | re-run overhead idempotency test |

## Recommendation

Execute as a **dedicated sprint** in this order: D-tests-first (lock current
behavior) → A (forward fix) → C (migration) → E (reports) → live-verify.
Each step gated. The forward fix (A) is provably identity for single-currency
so it can land safely first; the migration (C) is the genuine risk and needs
the before/after verification queries.

**Do not** bundle with unrelated work; this is the one change allowed to
touch §117, and only with the regression suite green.

## Execution status (2026-05-23) — sprint COMPLETE

Executed in the recommended D→A→C→E order, each step gated and
live-verified against the real PostgreSQL dev DB (:5433), not mocks.

| Step | What | Commit | Verification |
|---|---|---|---|
| D | §117 cost-engine baseline lock | `e2a76cff` | `verify-cost-engine-baseline.ts` 12/12 live (NestFactory DI graph) |
| A | supply-post cost → base (`toBaseMinor`) | `c635e377` | identity for single-currency; USD@12000 normalization in baseline harness |
| C | historical backfill migration | _(this commit)_ | `verify-cost-migration.ts` 6/6 live (injected broken USD@12000 → all 5 cost fields base) |
| E | Tier-2 reports (pnl / sales / profitability) revenue→base | `14b25a5d`, `c6994c2c`, `38622484` | report harness; P&L COGS base-consolidated |

### Step C notes (migration `migrate-cost-to-base.ts`)

- **Idempotent**: `_cost_base_migration` marker row guards against the
  double-multiply that re-running would otherwise cause. Dry-run by default;
  `--apply` executes inside one transaction.
- **Scope guard proven**: every UPDATE is `WHERE rate_value <> 1e8`, so
  single-currency rows are provably untouched.
- **Ledger-derived COGS**: demand `cost_sum_minor` + `demand_positions.cost_minor`
  are re-derived from the now-base `DemandPositionCostConsumption` ledger
  (not re-multiplied), so historical COGS is reconstructed exactly — answering
  the plan's open question (§C.4) in favour of exact re-derivation over a caveat.
- **Step-4 stock recompute caveat**: `stock.cost_balance_minor` is recomputed
  as Σ(remaining_qty × cost_minor) over posted lots for touched
  (store, assortment) pairs. This assumes stock cost == Σ remaining FIFO lots.
  Environments with non-supply cost inflows (Enter/Inventory adjustments that
  carry cost) must verify with a before/after sum query before `--apply`.
- **Dev DB is a no-op**: dev has 0 foreign-currency posted supplies, so the
  migration changes nothing here. It is a **deploy-time step** for any
  environment that accumulated foreign-currency cost history before step A
  landed. Logic was therefore proven by `verify-cost-migration.ts`, which
  injects a broken USD@12000 state into a throwaway account and asserts all
  five cost fields normalize to base (cascade-cleaned in `finally`).
