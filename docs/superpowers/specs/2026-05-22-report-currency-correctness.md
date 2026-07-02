# Report multi-currency correctness — audit + fix log (2026-05-22)

> Measure-first audit of every `apps/api/src/modules/report/*.service.ts`
> for the currency-blind aggregation bug: summing `sum_minor` (or derived
> money) across documents of **different currencies** without converting to
> the account base (валюта учёта). For a single-currency tenant this is a
> no-op; for a multi-currency tenant the totals are meaningless
> (100 USD-cent + 100 UZS-tiyin ≠ 200 of anything).

## Shared mechanism

- `report-rate-ctx.util.ts`
  - `loadRateContext(client, accountId)` → `{ baseCode, rates }` (one
    currency-table read; default-currency = base; empty tenant ⇒ UZS).
  - `consolidateToBase(amountMinor, code, ctx, seen)` → exact-BigInt
    `toBaseMinor` conversion; identity for base/zero; unknown currency ⇒
    face value + recorded in `seen` (never silently dropped).
- `cash-flow-consolidate.util.ts` — `foldCurrencyRows` (per-key fold used by
  cash-flow's date/FK groupings).
- Pattern: SQL carries `currency`, `GROUP BY …, currency`; JS folds each
  `(key, currency)` bucket to base; response gains `currency` (base code) +
  `mixedCurrency` flag.

## Tier 1 — FIXED (report-layer, live-verified vs PG :5433)

| Report | Money source | Commit | Live check |
|---|---|---|---|
| cash-flow | cash_in/out, payments_in/out `sum_minor` | `befdf368` `bb8725e4` | ✓ |
| aging | invoices_out/in `sum_minor − payed_sum_minor` | `7a0b7068` | ✓ |
| sales-by-channel | demands `sum_minor` per channel | (this) | ✓ |
| sales-by-hour | demands `sum_minor` per hour | (this) | ✓ |
| average-basket | demands `sum_minor` per bucket | (this) | ✓ |
| purchase-management | purchase_orders 4 money cols, ranked | (this) | ✓ |
| dashboard | overdue invoices total · org cash balance · 6-mo cash trend | (this) | ✓ (via cash/invoice seed) |

All are clean conversions: the aggregated amount is a **document total in the
document's own currency**, so converting by that document's currency is
correct. `verify-cashflow-multicurrency.ts` proves each against a throwaway
multi-currency tenant (UZS + USD@12000).

> **UPDATE 2026-05-23:** Tier 2 is now UNBLOCKED and fixed — the
> cost-currency normalization sprint landed (steps D/A/C/E, see
> `plans/2026-05-23-cost-currency-normalization.md`). This audit was also
> found INCOMPLETE: it omitted `counterparty-balance` (a real currency-blind
> bug) and `stock-balance` (safe), and left `slow-movers` carrying a separate
> `FROM stock` runtime bug. All closed — see the Addendum at the bottom.

## Tier 2 — BLOCKED → FIXED 2026-05-23 (cost normalized, then report-patched)

These reports aggregate **COGS / cost** (`costSumMinor`, `costMinor`,
`costBalanceMinor`), not just a document sale total:

| Report | Cost field |
|---|---|
| pnl | demand `costSumMinor` (gross profit = revenue − COGS) |
| report.service | demand `costSumMinor` (P&L summary) |
| profitability | demand_positions cost (per-product margin) |
| slow-movers | stock `costBalanceMinor` (dead-stock value) |

**Why blocked:** COGS is FIFO-consumed from `supply_positions.cost_minor`,
which is stored in the **supply's document currency** (verified in
`supply.service.ts` — `priceMinor` is used raw, no rate multiply at post).
So within ONE demand, `sumMinor` (sale) and `costSumMinor` (cost) can be in
**two different currencies**, and the demand does NOT store the supply's
rate. The report layer therefore **cannot** correctly convert COGS — the
fix belongs at supply-post time (normalize `cost_minor` to base, or snapshot
the cost rate on the demand position).

A naive "convert sumMinor and costSumMinor by the demand's rate" would be a
**worse** bug (costSumMinor isn't in the demand's currency). Per the §128
measure-first lesson, these are deliberately left UNCHANGED with this note
rather than fake-fixed.

**Recommended follow-up sprint:** "Cost-currency normalization" — store
`supply_positions.cost_minor` in base currency at post (using the supply's
rate), then COGS is always base and Tier-2 reports become correct with the
same `consolidateToBase` treatment applied to revenue only.

## Tier 3 — NOT a bug (quantity / base-only)

| Report | Why safe |
|---|---|
| abc-analysis | ranks by quantity; the lone `sumMinor` is per-row display |
| returns-ratio | returns ÷ sales by **quantity** |
| inventory-variance | qty variance × base-currency stock cost |
| unit-economics | per-product margin (position-level, not cross-currency aggregate) |

These were reviewed and need no change. (unit-economics/profitability
overlap Tier-2 if/when per-product cost currency is normalized — revisit
together.)

## Verification

```
cd apps/api
node --env-file=../../.env.local --import tsx scripts/verify-cashflow-multicurrency.ts
```
Seeds a throwaway UZS+USD tenant, exercises every Tier-1 report end-to-end
against real Postgres, asserts base-consolidated figures, cascade-cleans.

---

## Addendum (2026-05-23) — completeness sweep + gap closure

Re-running the audit against the full `*.service.ts` glob (17 files) exposed
three reports the original pass had missed or deferred. All fixed and
live-verified via `verify-report-gaps-multicurrency.ts` (23/23 vs PG :5433).

| Report | Defect | Fix |
|---|---|---|
| **slow-movers** | `FROM stock` — real table is `stocks` ⇒ the report **threw at runtime** when called (only `*.schema.test.ts` existed, so SQL was never executed in tests). Plus tied capital was Tier-2 cost. | `FROM stocks`; cost is now base (step A/C) so tied capital is correct; added `currency` (base code). |
| **counterparty-balance** | Never audited. `computeSummaries` + `collapseByCounterparty` summed `balanceMinor` across currencies (USD cents + UZS tiyin). | Base-consolidate each row via `consolidateToBase` before summing; collapsed rows now carry base code (not `MIX`); added `summaries.currency` + `mixedCurrency`. |
| **unit-economics** | Tier-2 overlap. `revenue_minor` summed across demand currencies; `currency:'UZS'` hardcoded. | `GROUP BY …, d.currency`; fold per product converting revenue→base (COGS already base); minQty/rank/limit moved to JS (per-product, not per-(product,currency)); `currency` + `mixedCurrency`. |
| stock-balance | Never audited — but aggregates **quantity only** (qty/reserved/inTransit), no money. | No change (Tier-3). |

**Lesson logged:** the original audit trusted "report enumeration" without
running each report's SQL. The `FROM stock` bug is the canonical
"green gates ≠ works" case — schema-only tests + an un-exercised query path.
Future report audits must run the live harness over the **full glob**, not a
hand-picked list.

Now-correct Tier-2 reports (pnl, report.service, profitability, slow-movers)
and unit-economics all treat COGS/cost as base (post step A/C) and convert
only revenue — identical `consolidateToBase` contract as Tier-1.
