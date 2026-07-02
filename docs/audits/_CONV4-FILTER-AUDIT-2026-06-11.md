# Convention 4 — Filter-bar audit (2026-06-11)

> The last UI-uniformity axis (`_UI-CONVENTIONS.md` roadmap). This session
> did the **structural lock + functional-bug hunt**, and **quantified** the
> per-entity field-parity gap as a coverage map (not a blind build). Method:
> a 49-page recon Workflow (1 agent per filter-bearing list page → adversarial
> verify), `wf_df9670ea-80b`.

## TL;DR

- **2 confirmed functional bugs fixed + RUNTIME-VERIFIED** (live API):
  - 🔴 **variants «Ниже минимума» → GET /variants 500 crash** (referenced a
    non-existent `Variant.stockMinor` column; a conditional-spread hid it from
    `tsc`). **Removed** (variant stock isn't denormalized; moysklad has no
    standalone variant list). Live: `/variants`, `?belowMinimum=true`,
    `?belowMinimum=false` all **200** now.
  - 🟡 **tasks ownership «Командные»/team → silently filtered nothing** (sent
    `ownership=team`; the service only branched on `'mine'`, so it fell through
    to an empty where == `all`). **Implemented** via `Employee.department` (the
    existing `OWN_GROUP` scope). Live: `team` total 3 vs `all` 603 (no longer
    ==all); department-mate widening proven 3→4→3 (self-reverting probe).
- **1 documented finding (NOT blind-fixed — needs grounding):**
  - 🟠 **`Product.stock_minor` is never maintained** (no app write, no trigger,
    no seed — permanently `DEFAULT 0`). So the whole «Ниже минимума» / re-order
    filter is **non-functional** on products/bundles/services (queries a dead
    column) — a real feature gap that needs the qty↔minor scale grounded + a
    Stock-ledger denormalization. Left as backlog (see §Backlog).
- **Conv-4 structural convention LOCKED**: all **49** filter-bearing list pages
  render the DS `InlineFilterPanel` (inline expandable grid, not a drawer) +
  the shared `FilterToggleButton`. Guard
  `apps/web/src/__tests__/filter-conventions.test.ts` (104 tests).
- **Field-parity gap quantified** (per-entity capture coverage map below) — it
  is **moderate and incremental**, not the "6-of-26" cliff a grep misread first
  suggested (the shared 6-field hook is referenced in comments to say it is
  intentionally NOT used; pages hand-roll rich bespoke panels).

## Method

`scripts`-free recon Workflow over the 49 list pages that ship a filter bar
(the no-filter settings/retail tables were excluded). Each agent: read the page
→ classify the filter impl → list every control → trace each control's value
into the list request → check the api list endpoint honours that param in its
where-clause → (for the 17 capture-grounded entities) read the moysklad
`02-filter-applied.png` and count the field gap. Every functional-bug candidate
was then handed to a fresh **refute-default** verifier (both FE and BE ends
re-checked independently). Only `real` verdicts were fixed.

## The convention (grounded)

moysklad renders list filters as an **inline expandable grid** above the row
table — `Найти`/`Очистить` in the first grid cell, a saved-filter bookmark +
gear, fields across N columns, optional `вч·сег·нед·мес` date presets — **not** a
right-side drawer. Our DS `InlineFilterPanel`
(`packages/design-system/src/patterns/InlineFilterPanel.tsx`) encodes exactly
this; the toolbar «Фильтр» toggle is the shared `FilterToggleButton`
(Convention 2 surface). **All 49 filter-bearing list pages already use both** —
the structural convention is uniform by construction and now guard-locked.

## Functional bugs

### 🔴 variants «Ниже минимума» — 500 crash (HIGH) — FIXED

`variant.service.ts` built `where.stockMinor: { lt: fields.minimumBalanceMinor }`.
`stockMinor` is **not a column on the Variant model** (Variant has
`minimumBalanceMinor` but no denormalized stock; only `Product.stock_minor`
exists, on a different model). The literal sat inside a conditional-spread
(`...(cond ? { stockMinor } : {})`), which bypasses TypeScript excess-property
checking — so `tsc` passed, but at runtime Prisma threw
`PrismaClientValidationError: Unknown argument stockMinor` → **GET /variants 500**
whenever the filter was set. No test covered it; the page comment falsely
claimed it was "backed by ... Prisma field-reference stock comparison".

**Fix** = remove the filter (FE control + state + param wiring; BE where-clause;
schema field). Rationale: it crashed, moysklad has no standalone variant list
(no parity requirement), and a correct re-order view would need a Stock-ledger
aggregation (`assortmentKind='variant'`) with a grounded qty scale — a future
feature, not a blind hack.

**Runtime proof** (live API): `GET /variants`, `?belowMinimum=true`,
`?belowMinimum=false` → all **200** (param now schema-stripped). The pre-fix 500
was adversarially verified by the recon (both ends, file:line); not re-run live
to avoid reverting the fix.

### 🟡 tasks ownership «Командные»/team — dead filter (MEDIUM) — FIXED

The toolbar ownership pill `team` sent `ownership=team` into the request, the
schema accepted it (`z.enum(['mine','team','all'])`, no 400), but
`buildListWhere` only branched on `ownership === 'mine'` — so `team` fell
through to an empty clause and returned the **same set as `all`**. The pill
rendered, was selectable, and filtered nothing.

**Fix** = `team` = tasks assigned to anyone in **my department** (the existing
`OWN_GROUP` permission scope = "my department's records", grounded by
`Employee.department`). New `resolveTeamAssigneeIds` resolves the department's
employee-id set; `buildListWhere` gains a `team` branch
(`assigneeId: { in: teamIds }`). No-department → fall back to just my own tasks
(non-widening). Exact moysklad «Командные» semantics are not capture-grounded
(no tasks filter capture) — department-membership is the best-grounded reading;
flagged for Phase-2 QA confirmation.

**Runtime proof** (live API): `team` total **3** vs `all` **603** (no longer
==all → the dead-filter bug is gone). Department-mate widening, self-reverting
probe: `team=3` → put admin + one employee in a test department, give the
employee 1 task → `team=4` (the mate's task is now included) → cleanup (delete
task, revert departments) → `team=3`.

### 🟠 «Ниже минимума» on products/bundles/services — dead column (DOCUMENTED, not fixed)

products/bundles/services share `product.repository.ts`, which filters via raw
SQL `stock_minor < minimum_balance_minor`. **`Product.stock_minor` is never
written** anywhere — no application code, no DB trigger, no seed; it is
permanently its migration `DEFAULT 0`. So the whole re-order filter does not
reflect real stock, and (separately) the tri-state `Нет`/`false` branch is also
dead (gated behind `if (filter.belowMinimum)`, which is falsy for `false`).

This is a genuine feature gap, **not** a one-line fix: a correct implementation
needs the qty↔"minor" scale convention grounded (Stock.qty is `Decimal`,
`minimumBalanceMinor` is `BigInt`) + a Stock-ledger denormalization (write
`stock_minor` on every `StockService.applyDeltas`, with a backfill). Left as
backlog rather than blind-built (global anti-guess discipline; money/quantity
scale must be grounded, not assumed).

## Field-parity coverage map (capture-grounded, agent-counted)

Per-entity filter-field count: ours vs the moysklad `02-filter-applied.png`
capture. Approximate (agent-read from the screenshot) — directionally accurate.

| Entity | ours | moysklad | missing | note |
|---|---:|---:|---:|---|
| purchase-orders | 24 | 24 | 0 | **full parity** (model page) |
| customer-orders | 24 | 29 | 8 | rich, all-wired |
| demands | 20 | 26 | 9 | exceeds moysklad on Сумма от/до |
| invoices-out | 19 | 24 | 8 | |
| supplies | 18 | 24 | 8 | |
| invoices-in | 18 | 25 | 9 | |
| cash-out | 16 | 25 | 12 | |
| cash-in | 14 | (n/r) | – | capture not machine-read |
| payments-in | 14 | 25 | 14 | |
| payments-out | 14 | 25 | 12 | |
| moves | 13 | 16 | 4 | 13/13 wired |
| enters | 12 | 14 | 3 | |
| inventories | 12 | 13 | 4 | |
| losses | 12 | 15 | 4 | |
| products | 8 | 19 | 15 | master-data, big filter in moysklad |
| counterparties | 5 | 38 | 34 | master-data, big filter in moysklad |
| settings/projects | 1 | 9 | 8 | reference catalog |

**Read:** doc-cohort pages are mostly 60–95% of moysklad's filter set (one,
purchase-orders, is at full parity); the bigger gaps are on master-data
(counterparties, products) and reference catalogs. Closing these is **gradual
per-field enrichment** (each field = FE control + BE where-clause + i18n +
label grounding), tracked as backlog — there is no single huge fork.

## Sibling consistency notes (from the recon)

Mostly consistent or deliberately-minimal. Genuine "poorer-than-sibling"
candidates worth enrichment later (not bugs): `money` (vs cash-in/payments-in),
`prepayments`/`prepayment-returns` (vs payments-in), `factures-in` (vs
invoices-in), `services` (vs products). Deliberately minimal (documented in
their page comments): `production/{boms,processes,stages,work-orders}`,
`settings/*` reference catalogs, `variants` (no moysklad variant list).

## Backlog (for the user to prioritise — not blind-built)

1. **Re-order / «Ниже минимума» feature** — wire `Product.stock_minor` to the
   Stock ledger (+ a variant equivalent) with the qty↔minor scale grounded;
   then products/bundles/services filter correctly and variants can regain the
   filter. Needs a product/grounding decision.
2. **Filter-field parity enrichment** — close the per-entity gaps in the
   coverage map (counterparties 5→38, products 8→19, payments 14→25, …),
   capture-grounded per entity. Incremental.

## Guards

- `apps/web/src/__tests__/filter-conventions.test.ts` (104):
  - A — structural: 49 pages × {InlineFilterPanel, FilterToggleButton} + a
    non-vacuity floor.
  - B — variants regression: no `where.stockMinor:`, no `belowMinimum` schema
    field, no `filter-below-minimum` control.
  - C — tasks regression: service honours `ownership === 'team'`
    (`resolveTeamAssigneeIds` + `department`); schema still accepts `team`.

## Honest status

Phase-2 (runtime-verified) for both functional fixes (live API + self-reverting
DB probe). The structural convention + regression locks are source-scan guards.
The parity coverage map is documentation, not a build. No browser pixel-sweep of
all 49 filter bars (structure was already uniform pre-session).
