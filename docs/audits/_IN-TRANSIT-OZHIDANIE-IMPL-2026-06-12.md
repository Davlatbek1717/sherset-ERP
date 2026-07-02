# «Ожидание» / in-transit — IMPLEMENTATION (Phase-2 VERIFIED, 2026-06-12, 11w)

> **STATUS: Phase-2 VERIFIED (api + live DB).** Implements §8 of the Phase-0 design
> doc [`_IN-TRANSIT-OZHIDANIE-DESIGN-2026-06-12.md`](./_IN-TRANSIT-OZHIDANIE-DESIGN-2026-06-12.md)
> (backlog **(B)**, deferred for grounding across 11s/11t/11u/11v). Commit `cdaa4190`.

## What landed

The stock-balance report's «Ожидание» (in-transit / `inTransitQty`) column — previously
**always 0** — is now computed **QUERY-TIME** from active supplier-order positions, and the
**displayed** «Доступно» follows moysklad's formula `Остаток − Резерв + Ожидание`.

**Files:**
- [`apps/api/src/modules/report/stock-balance.service.ts`](../../apps/api/src/modules/report/stock-balance.service.ts)
  - `getInTransitMap(accountId, {storeId?, assortmentIds?})` → `Map<storeKey, Decimal>` (flat mode)
  - `getInTransitByAssortment(...)` → `Map<assortmentKey, Decimal>` (grouped, summed across stores)
  - shared private `queryInTransitPositions`: `purchaseOrderPosition.findMany` with relation filter
    `purchaseOrder: { accountId, deletedAt: null, state IN ('confirmed','partially_received'), storeId? }`,
    per-position `MAX(0, quantity − receivedQty)` clamp.
  - flat + grouped row mappers now read the computed map; `available = qty − reserved + inTransit`
    (Decimal arithmetic, not `Number` → no float drift); summaries `totalInTransit`/`totalAvailable` likewise.
- [`apps/api/src/modules/stock/stock.service.ts`](../../apps/api/src/modules/stock/stock.service.ts)
  — **comment-only** clarification on `assertAvailable` (§6 landmine): posting sufficiency stays
  PHYSICAL `qty − reserved`; behaviour byte-unchanged (its 20 tests green).
- [`apps/api/src/modules/report/stock-balance.service.test.ts`](../../apps/api/src/modules/report/stock-balance.service.test.ts) — **+8** unit tests.
- [`scripts/verify-in-transit-stock-balance-smoke.mjs`](../../scripts/verify-in-transit-stock-balance-smoke.mjs) — live smoke (14/14).

## Grounding decisions (verified against source, not the handoff framing)

1. **State set = `confirmed`, `partially_received`** (grounded against the Sprint-4.4 receipt
   cascade `purchase-order.service.ts:applyReceipt`). `confirmed` always has `receivedQty=0`
   (a receipt bumps it to `partially_received`), so the clamp yields full qty for confirmed and
   the remainder for partial. `fully_received`/`closed`/`cancelled`/soft-deleted excluded.
2. **Per-position clamp, NOT `Σqty − Σreceived`** — an over-received line must contribute 0, never a
   negative that erodes another line's expected-incoming. (`groupBy _sum` would get this wrong.)
3. **NOT gated on `PurchaseOrder.waiting`** — a **5th** distinct "Ожидание"-named concept the design
   doc's table of 4 missed: `waiting` is a manual «Поставить в ожидание» on-hold UI marker
   (`purchase-order.service.ts:602-610`, defaults false, no FSM side-effects). Gating in-transit on
   it would make «Ожидание» vacuously 0. (The supplier-list money «Ожидание» = `waitSumMinor`,
   concept #3, also distinct.)
4. **§6 split (the correctness landmine) holds** — the report's displayed «Доступно» adds in-transit;
   `StockService.assertAvailable` (posting sufficiency) stays physical. These are already separate
   inline computations in separate files, so the split is structural; the comment clarification
   prevents a future "fix" from adding in-transit to the posting block (which would let a Demand ship
   unarrived stock).

## Gate

api tc 0 · biome 0 (changed) · **api Vitest 2922 (+8, 0 regress)** (was 2914) · web/ds/db untouched.

## Phase-2 live verification — `verify-in-transit-stock-balance-smoke.mjs` 14/14 (api :4000 + real Postgres)

Isolated + self-cleaning: a throwaway store (`allowNegativeStock=false`) + product + Enter (physical
stock), referencing only existing org/counterparty. **Mutates zero real product stock.**

| # | Claim | Result |
|---|---|---|
| A | Enter 5 posted → row qty=5, Ожидание=0, Доступно=5 | ✓ |
| B | confirm PO(100) → Ожидание=100, Доступно=105 (query-time join works on real DB) | ✓ |
| **C** | **§6 HEADLINE: Demand(15 > physical 5, < displayed 105) post → 400 InsufficientStock** | ✓ |
| C2 | blocked Demand left physical qty=5 (no partial deduction) | ✓ |
| D | negative control: Demand(3 ≤ physical 5) posts (201) — not blocking valid shipments | ✓ |
| D2 | after ship 3 → qty=2, Ожидание=100, Доступно=102 (Остаток down, Ожидание steady) | ✓ |
| D3 | unpost restored physical qty=5 | ✓ |
| E | draft PO(50) excluded → Ожидание still 100 | ✓ |
| F | confirm PO2 → Ожидание=150 (multi-PO sum) | ✓ |
| G | cancel PO1 → Ожидание=50 (cancelled excluded) | ✓ |
| H | flat per-store isolated → S1 Ожидание=50 | ✓ |
| H2 | S2 flat row ABSENT (documented limitation — in-transit-only, no Stock row) | ✓ |
| H3 | grouped sums across stores → Ожидание=57 (50+7), Доступно=62 (5 − 0 + 57) | ✓ |
| **I** | **partial receipt 20/50 via Supply → PO2 `partially_received`, Ожидание=30, Остаток=25, Доступно=55** | ✓ |

**Adversarial finding (smoke surfaced it):** store **"Asosiy ombor" has `allowNegativeStock=true`**
→ `assertAvailable` returns early and Demands post freely (qty went −10 on the first run). The §6
block only engages when the store **disallows** negative stock — correct, and consistent with
`assertAvailable`'s existing contract. The smoke now uses a fresh `allowNegativeStock=false` store.

## Documented limitations (bounded, honest)

1. **In-transit-only product (no Stock row) not surfaced in flat-by-store** — a confirmed PO for a
   never-stocked product creates no Stock row, so it has no flat row (proven by claim H2). The
   **grouped** view shows it iff the product has *any* Stock row (in-transit is summed across stores
   from PO positions, claim H3). Surfacing in-transit-only products would require unioning Stock keys
   with PO-position keys (changes pagination/total semantics) — out of this slice's scope.
2. **`hideEmpty=true` is physical-based** — it filters on the DB `Stock.{qty,reserved,inTransitQty}`
   columns (in-transit column always 0), so a zero-physical row with computed in-transit would be
   hidden. `hideEmpty` defaults **off**; bounded, opt-in.
3. **Source scope = supplier orders only** (design §7) — Move is atomic (no transit limbo), production
   has no awaiting-flag → documented bounded under-count vs full moysklad.
4. **Report snapshot consistency** — flat mode reads Stock then PO positions as two queries (not one
   transaction); a receipt landing between them can make a single report momentarily off by the
   in-flight amount. Self-correcting on next read; **not** a posting/integrity bug (posting uses
   locked physical reads). Acceptable for a report.
5. **Column label** kept as the existing `in_transit` i18n key («В пути») — §4 capture-gated
   (no local capture); «Ожидание» flagged as the likely-correct name (design §8.6).

## Follow-ups (clean, deferred)

- **DROP `Stock.inTransitQty` + `PurchaseOrderPosition.inTransitQty`** — now provably vestigial
  (report reads the computed value, never the column). Same class as the 11s Product denorm drop.
- **stock-lookup endpoint** (`stock.controller.ts:35`) + **products-list «Ожидание» column** (11i) —
  optional consumers, deferred (the report is the primary surface; both light up the same map).
- **Pre-existing, out of scope:** `DELETE /admin/stores/:id` raw-500s when the store has stock
  (should be a friendly 409 — same class as the 11u employee fix). Observed via smoke cleanup.

## Honest status

**Phase-2 VERIFIED** (api + live DB, 14/14 incl. the §6 split and a real partial-receipt cascade).
The displayed-availability change is on the read/report path only; the posting path is byte-unchanged.
Browser pixel-smoke of the FE column was **not** run this session — the FE already maps
`inTransitQty`/`available`/totals ([reports/stock-balance/page.tsx:108-109,216-217](../../apps/web/src/app/(app)/reports/stock-balance/page.tsx)),
so the column lights up from the verified API, but a live RU/UZ browser confirmation remains QA-backlog.
