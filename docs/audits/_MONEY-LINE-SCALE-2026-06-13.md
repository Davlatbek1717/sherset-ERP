# Position line-total money-integrity fix — `scaleMinorByQty` (2026-06-13)

> Flagship for demands Phase-2 QA HIGH #1 (the app-wide 3-decimal money truncation),
> `_DEMANDS-PHASE2-QA-2026-06-13.md` #1. Found independently by 3 lenses.

## The bug (class)

Every place that computed a money line total `minorPerUnit × qty` (billing gross **and**
cost-of-goods lines) used the idiom

```
(minorPerUnit * BigInt(Math.round(qty * 1000))) / 1000n
```

which has two money-integrity defects:

1. **3-decimal qty truncation.** `Math.round(qty * 1000)` rounds the quantity to **3** decimals
   before multiplying, while the schema (`/^\d+(\.\d{1,6})?$/`), the stock ledger (`toMicro`) and
   FIFO (`parseDecimalScaled`, SCALE 1e6) all keep **6** decimals. The billed line total therefore
   silently diverged from the physically shipped/costed quantity:
   - qty `0.0004` billed **0** but shipped & cost 0.0004 units;
   - qty `100.0005` over/under-billed the 4th–6th decimal.
2. **Float coercion.** `Number(qty)` round-trips the Decimal(20,6) string through a JS float,
   drifting on fractions and near the Decimal ceiling.

It also truncated toward zero on the final divide (inconsistent with FIFO's round-half-up).

## The fix

A single canonical primitive in `@moysklad/money` (`packages/money/src/position.ts`):

```ts
export function scaleMinorByQty(minorPerUnit: bigint, qty: string): bigint {
  const qtyScaled = parseDecimalToScaled(qty, 6);     // 6-dp, no float
  return roundHalfUp(minorPerUnit * qtyScaled, 1_000_000n);  // half-up to tiyin
}
```

Every site now calls `scaleMinorByQty(minorPerUnit, <original decimal STRING>)` — sourcing the
position quantity string (`p.quantity` / `row.quantity` / `p.shippedQty` / `p.quantity || '0'`),
**never** `String(Number(qty))` (which would re-introduce the float drift).

### 27 sites swept

- **Backend services (authoritative — what the DB stores):** demand, supply (×7),
  invoice-out, invoice-in, sales-return (×4), purchase-return (×5), purchase-order,
  customer-order (×2, incl. the partial-shipment `shippedQty` line), **internal-order**, loss (×3),
  enter, move, overhead-distribution, retail-sale/compute-positions, print-template/print-render.util.
- **Frontend `/new` editors (live preview totals):** demands, customer-orders, invoices-out,
  invoices-in, supplies, sales-returns, purchase-returns, purchase-orders, internal-orders, enters.
- **Shared design-system editors:** `document-editor/PositionTable`, `patterns/PositionEditor`.

### Packaging change (required, low-risk)

`@moysklad/money` consumed its own source with `.ts` import specifiers, which NodeNext packages
(the api) cannot resolve. Aligned the package's internal specifiers to `.js` (the repo convention
proven by `@moysklad/db`) so the api can import the shared primitive. `@moysklad/money` added as a
workspace dependency of `@moysklad/ui` (design-system) so the two document-editor components use the
same primitive instead of a 4th hand-rolled copy.

## Guards (non-vacuous)

- `packages/money/src/position.test.ts` (+5 cases) — `scaleMinorByQty`: legacy-parity for ≤3-dp
  "nice" quantities, keeps the 4th–6th decimal the legacy path dropped (`0.0004 → 100n`, legacy `0n`),
  rounds half-up (`0.335 → 34n`, legacy `33n`), negatives + Decimal-ceiling.
- `packages/design-system/src/patterns/PositionEditor.test.ts` (+1) — 6-dp line total in the DS
  editor (`0.0004 × 2500.00 → 100n`, would be `0n` under the legacy path).
- `apps/api/src/modules/shared/position-scale-class.test.ts` (NEW, 55 assertions) — class-lock
  scanning all 27 sites: each calls `scaleMinorByQty(` and contains **no** legacy `Math.round(qty *
  1000)` / `/ 1000n` (the negative regex tolerates nested parens + the `1_000` underscore separator,
  the two ways internal-order hid from the first grep). Non-vacuous (every file had the inverse before).
- `apps/api/.../overhead-distribution.test.ts` — the post/unpost symmetry identity now asserts
  against `scaleMinorByQty` (was the legacy `/1000n` formula).

## Gate

- typecheck **0** — money · design-system · api · web.
- biome **0 errors** on changed files (fixed 3 pre-existing lint errors in the 3 touched
  money/DS files to keep them gate-clean: a template literal, a dead `fromUnit` var, a `forEach`).
- vitest: **money 50** · **design-system 128** (+1) · **api 3049 / 0 fail** (+55 class-lock) ·
  **web 2278 pass** (1 pre-existing failure — `product-detail-widget.test.ts`, a B5 stale test on
  HEAD after `a289e465`; confirmed unrelated to this change, not touched).

## Live cert (api:4000 + DB)

`scripts/verify-money-line-scale-smoke.mjs` — **3/3**. A draft demand AND an internal-order, each with
two fractional positions (qty `0.0004` × 250000 + qty `3.333333` × 100000), each store
`sumMinor = 333433` — exactly the 6-dp total, and provably **not** the legacy 3-dp `333300`
(non-vacuous). Proves the running api bills the full 6-dp quantity, and that the internal-order BE now
matches its migrated `/new` preview. Posts nothing, mutates zero stock; self-cleaning.

## Adversarial verification (workflow `wf_2415f8eb-090`, 5 lenses, 11 agents, blind-verify refute-default)

**6 raw findings → 1 confirmed (FIXED) / 5 refuted.**

- **missed-sites** — **caught a REAL miss → fixed:** `internal-order.service.ts` `computeTotals` still
  used the legacy idiom `BigInt(Math.round(Number(p.quantity) * 1_000)) ... / 1_000n`. The nested
  `Number(...)` paren + the `1_000` underscore separator hid it from both the first grep AND the first
  guard regex. Its `/new` preview WAS migrated, so the sweep had (temporarily) created a FE-preview-
  vs-BE-stored divergence. Fixed (→ `scaleMinorByQty(price, String(p.quantity))`), added to the
  class-lock, regex hardened, re-verified (api 3049, smoke case D). Two refuted siblings — EDO
  e-invoice + BOM standard-cost — also use a Number()-float multiply but at `* 1_000_000` (already
  6-dp, no truncation) and are informational-only / internally-consistent, so correctly out of scope.
- **float-restringify** — clean (no site passes `String(Number(qty))`).
- **reconciliation** — clean (post/unpost/cancel cost lines symmetric; cross-doc cascades intact).
- **primitive-correctness** — clean (negatives, >6-dp, no-decimal, large, zero all correct).
- **rounding-edges** — surfaced the double-round finding, verified **pre-existing / not introduced**
  (below; empirically the sweep makes 4644 discounted lines NEWLY agree, 0 newly diverge).

## Known pre-existing follow-up (NOT introduced by this sweep) — single-round unification

The BE `computeTotals` (+ server print template) **double-rounds** a discounted line: it rounds the
gross to tiyin (now via `scaleMinorByQty`, half-up), then truncates again on the discount divide
`(lineGross * round((100-disc)*100)) / 10000n`. The canonical `computePositionTotal`
(`packages/money`, used by the **React browser print** pages) keeps the gross unrounded in
micro-tiyin and rounds **once** after discount. → on a discounted line whose post-discount tiyin
fraction is ≥ 0.5 the browser-print total, the server-PDF total and the stored `sumMinor` can
disagree by **±1 tiyin (0.01 so'm) per line**.

This is **structural + pre-existing** (both formulas already coexisted under the legacy idiom).
Empirically (verify agent, fractional-qty matrix): this sweep causes **0 lines to newly diverge**
and makes **4644 lines newly agree** (the half-up gross matches the single-round path more often),
so the net effect on the divergence is neutral-to-positive. It surfaces only as display (no
strict recomputed-vs-stored reconciliation exists, so never a thrown error).

**Fix (separate flagship):** route BE `computeTotals` + `print-render.util.computeLineSumMinor`
through `computePositionTotal` (single-round) so BE storage == server PDF == browser print. This
changes stored `sumMinor` for some discounted lines, so it needs per-service test updates — a
deliberate behavioural change, out of scope for this precision fix.

## Honest status

**Phase-2 verified (api-level, money-integrity).** The qty-precision class is fixed app-wide,
gate-green, class-locked, and live-certified that the running api bills the 6-dp total. The
double-round display divergence is a documented, pre-existing, separate follow-up.
