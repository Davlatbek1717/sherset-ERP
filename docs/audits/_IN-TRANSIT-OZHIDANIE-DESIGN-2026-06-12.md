# «Ожидание» / in-transit (`Stock.inTransitQty`) — DESIGN & GROUNDING (2026-06-12, 11v)

> **✅ IMPLEMENTED 2026-06-12 (11w), commit `cdaa4190` — Phase-2 VERIFIED (api + live DB, 14/14).**
> §8 of this design shipped query-time, the §6 split holds (assertAvailable untouched), and a 5th
> `waiting`-flag concept (not enumerated in §1) was grounded and correctly excluded. Implementation
> report + live evidence: [`_IN-TRANSIT-OZHIDANIE-IMPL-2026-06-12.md`](./_IN-TRANSIT-OZHIDANIE-IMPL-2026-06-12.md).
> The Phase-0 grounding below is preserved as the design rationale.

> **STATUS (Phase-0, as written 11v): DESIGN/GROUNDING — NO code change, NO runtime feature, NOT verified.**
> This document unblocks backlog **(B)** (the recommended next flagship, deferred for grounding
> across 11s/11t/11u). It resolves the architecture + semantic-scope decisions so a *later*
> session can implement a well-scoped slice with TDD + concurrency QA. It is **design only** —
> no `Stock.inTransitQty` value changes as a result of this doc.
>
> **Method:** exhaustive codebase grounding (read by Opus, file:line below) + adversarially-verified
> web research of moysklad semantics (`wf_3dbed23d-6ee`: 2 researchers + 1 refute-default verifier;
> the verifier **refuted** the first definition as source-incomplete and corrected it — see §3).

---

## 0. TL;DR — the decision

1. **«Ожидание» and «В пути» are the SAME single quantity** (moysklad API field `inTransit`). Not two
   columns. Our `Stock.inTransitQty` IS this quantity. Do **not** build a second one. (high confidence —
   official dev.moysklad API reference + support article.)
2. **Architecture: compute it QUERY-TIME, do NOT denormalize.** In-transit for `(store, product)` =
   `Σ (quantity − receivedQty)` over **active supplier-order positions**. This mirrors the codebase's own
   established pattern (11h below-minimum, 11i stock columns, 11s denorm-drop) and **dissolves the
   multi-hook concurrency feature the handoff feared** — there are no write-hooks to maintain.
3. **🔴 Landmine — the availability formula changes.** moysklad: `Доступно = Остаток − Резерв + Ожидание`
   (official, worked example 27−1+55=81). Our `available = qty − reserved` is correct *only because*
   `inTransit ≡ 0` today. Wiring in-transit nonzero **requires** updating the **displayed** «Доступно»
   to `qty − reserved + inTransit` — but **must NOT** change the posting-sufficiency check
   `StockService.assertAvailable` (you cannot ship goods that have not physically arrived). Conflating
   the two would let a Demand ship unarrived stock. **This split is the single most important
   implementation correctness point.**
4. **Source scope for our clone = supplier orders only** (the one source whose data structure exists).
   Production tasks + order-scheme transfers also feed moysklad's «Ожидание», but our Move is **atomic**
   (no transit limbo) and production has **no awaiting-flag** — so they cannot contribute today. Document
   this as a known, bounded under-count vs. full moysklad; revisit if/when those modules grow the concept.
5. **Label («В пути» vs «Ожидание») is §4 capture-gated** — keep the current label until DOM-role grounded.
6. **`Stock.inTransitQty` + `PurchaseOrderPosition.inTransitQty` become drop candidates** once the
   query-time path lands (vestigial materialized columns, same class as the 11s Product denorm drop).

---

## 1. The four distinct "in-transit / Ожидание" concepts (disambiguation)

Four similarly-named things exist; conflating them is the main trap. Grounded, all four below:

| # | Field / concept | Meaning | Live? | Surface |
|---|---|---|---|---|
| 1 | **`Stock.inTransitQty`** (`in_transit_qty`, Decimal) | per-`(store,product)` **expected incoming** = moysklad `inTransit` / «Ожидание» | **❌ never written ≠ 0** | stock-balance report col, labeled "В пути"; stock-lookup endpoint |
| 2 | `PurchaseOrderPosition.inTransitQty` (`in_transit_qty`, default 0) | position-level "reserved expected stock" (scaffold comment) | **❌ never written ≠ 0** | none |
| 3 | `PurchaseOrder.waitSumMinor` (`wait_sum_minor`, BigInt) | **value of pending PaymentOut** — a **money/payment** concept, NOT stock | partly wired | supplier-orders money column |
| 4 | Move / Перемещение "В пути" | goods physically moving between **own** stores | **atomic** — no limbo | n/a (no in-transit state) |

**(B) targets concept #1 only.** #3 is money (already its own thing); #4 is a transfer concept our
codebase implements atomically (so it never produces in-transit stock).

Grounding:
- #1 column: [schema.prisma Stock model `inTransitQty`](../../packages/db/prisma/schema.prisma) ·
  read at [stock.service.ts:163](../../apps/api/src/modules/stock/stock.service.ts#L163),
  [stock.service.ts:297](../../apps/api/src/modules/stock/stock.service.ts#L297),
  [stock-balance.service.ts:147](../../apps/api/src/modules/report/stock-balance.service.ts#L147),
  [stock-balance.service.ts:208](../../apps/api/src/modules/report/stock-balance.service.ts#L208),
  [stock.controller.ts:42](../../apps/api/src/modules/stock/stock.controller.ts#L42).
- #2 column: `PurchaseOrderPosition.inTransitQty` — declared, default 0, **zero writes** repo-wide.
- #3: [schema.prisma PurchaseOrder `waitSumMinor`] — comment: *"waitSum — value of pending PaymentOut
  operations"*. Distinct money axis.
- #4: [move.service.ts:534-560](../../apps/api/src/modules/move/move.service.ts#L534) — `post()` writes
  `-qty` at source + `+qty` at destination **immediately** (one transaction); state machine is
  `draft → posted → cancelled` ([move.schema.ts:3](../../apps/api/src/modules/move/move.schema.ts#L3)).
  No order-scheme / no "В пути" limbo.

---

## 2. Current dead state (grounded)

`Stock.inTransitQty` is written by **nothing** and is **always 0**:
- Created `0` in every `Stock` upsert: [stock.service.ts:229](../../apps/api/src/modules/stock/stock.service.ts#L229)
  (`applyDeltas`), [stock.service.ts:408](../../apps/api/src/modules/stock/stock.service.ts#L408)
  (`applyReservationDeltas`).
- **No `inTransitQty: { increment | decrement }` anywhere** in `apps/api/src` (grep-proven).
- The PO receipt cascade increments `PurchaseOrderPosition.receivedQty` + `PurchaseOrder.receivedSumMinor`
  ([purchase-order.service.ts:978 `applyReceipt`](../../apps/api/src/modules/purchase-order/purchase-order.service.ts#L978))
  — it never touches `Stock.inTransitQty` or `PurchaseOrderPosition.inTransitQty`.

**Consequence today:** the stock-balance report's "В пути" column and "Всего в пути" summary always show
**0**; the products list deliberately omits the «Ожидание» column entirely
([products/page.tsx:50-52](../../apps/web/src/app/(app)/products/page.tsx#L50): *"«Ожидание» (in-transit)
is intentionally absent — not yet [wired]"*, deferred in 11i). So the only surface that would change when
this lands is the stock-balance report (+ optionally the deferred products-list column).

**Stock architecture (the pattern in-transit would have to fit if denormalized):** two append-only ledgers
— `StockOperation` (qty axis) + `StockReservation` (reservedQty axis) — each dual-written under a pessimistic
`SELECT … FOR UPDATE` lock to a materialized `Stock` column ([stock.service.ts](../../apps/api/src/modules/stock/stock.service.ts)).
The in-transit axis has the materialized column but **no ledger and no writes**. A denormalized in-transit
would need a third ledger + dual-write hooks on PO confirm/unconfirm/cancel + Supply post/unpost + position
edits, each under the same lock discipline — i.e. the multi-hook feature the handoff feared. §4 (architecture)
below argues we should **not** do that.

---

## 3. moysklad semantics (adversarially-verified — `wf_3dbed23d-6ee`)

The verifier **refuted** the first researcher's definition as source-incomplete; the corrected, cited
definition below is what we build against.

**HIGH confidence (official dev.moysklad API reference + support article + 2 mirrors):**
- **One quantity, two names.** API field = `inTransit`; report column (user-facing) = «Ожидание»; «В пути»
  is the literal name. `Stock.inTransitQty` ↔ `inTransit` ↔ «Ожидание». **Not two columns.**
  > dev.moysklad.ru: *"…fields `stock, reserve, inTransit, quantity` … stock — Остаток; inTransit —
  > Ожидание; reserve — Резерв; quantity — Доступно."*
- **Availability formula:** `Доступно = Остаток − Резерв + Ожидание`.
  > dev.moysklad.ru: *"The Available (quantity) value is calculated using the formula: Stock − Reserve +
  > In Transit."* · support 203325603: *"Доступные товары = Остатки − Резервы + Ожидания"* (worked example
  > 27 − 1 + 55 = 81).
- **Supplier orders feed it; receipt clears it.** Set/cleared via the supplier-order «Ожидание» flag;
  removed automatically on Приёмка (receipt).
- **Customer orders → Резерв, NOT Ожидание** (do not include them).

**MEDIUM confidence (snippet-grounded; full article bodies are JS-rendered, not fetched):**
- The full source set is governed by «Способ снабжения» (supply method): **Заказ поставщику, Заказ на
  производство, Производственное задание (own «Ожидание» flag), Перемещение (order-scheme)**. So a
  supplier-order-only computation **under-counts** for accounts using production/transfers. *(This is the
  refutation — it determines whether the clone's number matches moysklad for those account types.)*
- **Per-store:** `inTransit` is attributable per store (`report/stock/bystore?stockType=inTransit`);
  `storeId=null` is possible for a supplier order with no warehouse, but **our `PurchaseOrder.storeId` is
  required (non-null)** → no null-store case for us.

**Residual (capture-gated — unresolvable without a live moysklad UI/API capture; the clone has none):**
1. Exact lifecycle/status at which a production task or order-scheme transfer increments `inTransit`.
2. Whether production-sourced «Ожидание» is module-gated (likely — moot for us until we model it).
3. The precise Остатки-report **column label** in the current moysklad version (§4 DOM-role grounding needed,
   not a search snippet).
4. Rounding/aggregation of `storeId=null` in-transit into a product total (moot for us — store is required).

Citations (full list in §10).

---

## 4. Architecture decision — QUERY-TIME, not denormalized

**Recommendation: compute in-transit at read time. Do not maintain a denormalized counter.**

Rationale:
1. **moysklad itself derives it** — «Ожидание» is not a user-set value; it is computed from the
   supply-method documents. A derived read matches the source semantics exactly.
2. **Codebase precedent is unanimous.** 11h wired below-minimum as a query-time `SUM` (not a denorm column);
   11i wired the products-list Остаток/Резерв/Доступно as a query-time `groupBy` across stores; 11s **dropped**
   the vestigial `Product.{stock,reserve,inTransit}_minor` denorm columns precisely because the live ledger /
   source-of-truth is authoritative. A denormalized in-transit would re-introduce the exact drift-trap 11s
   removed.
3. **It dissolves the feared concurrency surface.** Query-time = **no write-hooks** on PO confirm / unconfirm /
   cancel / Supply post / unpost / position-edit. There is nothing to lock, nothing to keep in sync, no
   dual-write race. The handoff framed (B) as *"PO-state → `Stock.inTransitQty` increment + linked-supply
   decrement"* (a denormalized, multi-hook design); the central contribution of this doc is to show that
   reframing it as query-time removes most of that work and all of that risk.
4. **Always correct** — derived from `PurchaseOrderPosition.{quantity,receivedQty}` + `PurchaseOrder.state`,
   which the receipt cascade already maintains atomically.

Trade-off: `Stock.inTransitQty` (and `PurchaseOrderPosition.inTransitQty`) become **vestigial** — the report
reads the computed value, not the column. → Both are **drop candidates** (a clean follow-up mirroring 11s),
or kept as always-0 dead columns. Recommend dropping after the query-time path is verified.

---

## 5. The computation spec (exact)

For a set of `(store, product)` pairs, in-transit (expected incoming) is:

```
inTransit(store, assortment) =
  Σ over PurchaseOrderPosition p JOIN PurchaseOrder po
    WHERE po.accountId   = :accountId
      AND po.deletedAt   IS NULL
      AND po.storeId     = store
      AND p.assortmentId = assortment
      AND po.state IN ('confirmed', 'partially_received')
    of  MAX(0, p.quantity − p.receivedQty)
```

Decisions, each grounded:
- **States included = `confirmed`, `partially_received`.** These are exactly the states where goods are
  ordered-and-committed but not fully received. `draft`/`sent` = not yet committed (and `sent` is unreachable
  via the manual FSM — [purchase-order.schema.ts:28](../../apps/api/src/modules/purchase-order/purchase-order.schema.ts#L28)
  only allows confirm/unconfirm/cancel). `fully_received` contributes 0 by construction (all positions
  received). `closed`/`cancelled` excluded. *(State list grounded against the receipt cascade transitions at
  [purchase-order.service.ts:1039-1055](../../apps/api/src/modules/purchase-order/purchase-order.service.ts#L1039).)*
- **`MAX(0, quantity − receivedQty)`** clamps per position — a position can never contribute negative
  in-transit even if over-received.
- **Store = `PurchaseOrder.storeId`** (required, non-null). One PO targets one store; all its positions land
  there. No `storeId=null` case (unlike moysklad's optional-warehouse supplier order).
- **assortment = `PurchaseOrderPosition.assortmentId`** (+ `assortmentKind`, currently only `'product'`).

Implementation shape (BE): a `StockService` (or report) helper
`getInTransitMap(accountId, storeId?, assortmentIds?) → Map<assortmentId, Decimal>` built from one grouped
query, merged into the stock-balance report rows + the products-list stock cluster. Mirror the existing
`groupBy` pattern at [stock-balance.service.ts:168](../../apps/api/src/modules/report/stock-balance.service.ts#L168).

---

## 6. 🔴 The availability-formula consequence (DO NOT skip)

Today `available = qty − reserved` is used in **two semantically-different** places that happen to share the
formula only because `inTransit ≡ 0`:

| Use | Where | Today | After in-transit lands |
|---|---|---|---|
| **Display «Доступно»** (report / list) | [stock-balance.service.ts:136](../../apps/api/src/modules/report/stock-balance.service.ts#L136),[:209](../../apps/api/src/modules/report/stock-balance.service.ts#L209),[:251](../../apps/api/src/modules/report/stock-balance.service.ts#L251) · products-list `stock.available` (11i) | `qty − reserved` | **`qty − reserved + inTransit`** (moysklad-correct) |
| **Posting sufficiency** (can this Demand ship?) | [stock.service.ts:328 `assertAvailable`](../../apps/api/src/modules/stock/stock.service.ts#L328) | `qty − reserved` | **UNCHANGED — stays `qty − reserved`** |

**Why the split:** moysklad's «Доступно» is *available-to-promise* (how much you can commit/reserve against
future stock), so it includes expected incoming. But a physical shipment (Demand/Отгрузка) must not ship goods
that have not arrived — that block uses physical `qty − reserved` (modulo `store.allowNegativeStock`). If the
implementation naively reuses one helper for both, it would let a Demand ship unarrived stock — a silent
inventory-integrity bug (the exact CLAUDE.md adversarial class). **Keep them separate.**

> ⚠️ Residual to confirm in QA (capture-gated): moysklad's exact shipment-block basis (physical vs. available).
> The safe default — leave `assertAvailable` physical — is both the conservative choice and the current
> behavior, so the in-transit slice should **not touch it**. Confirm against moysklad before any change there.

---

## 7. Source scope for our clone

| Source | moysklad feeds Ожидание? | Our codebase has the data? | In scope? |
|---|---|---|---|
| Заказ поставщику (supplier order) | ✅ yes (primary) | ✅ `PurchaseOrderPosition.{quantity,receivedQty}` + `PO.state`/`storeId` | **✅ YES** |
| Перемещение (order-scheme transfer) | ✅ yes (receiving store) | ❌ Move is **atomic**, no transit limbo ([move.service.ts:534](../../apps/api/src/modules/move/move.service.ts#L534)) | ❌ cannot contribute |
| Заказ на производство / Производственное задание | ✅ yes («Ожидание» flag) | ❌ no awaiting-flag modeled | ❌ out of scope |
| Заказ покупателя (customer order) | ❌ no — feeds **Резерв** | (drives reservedQty) | ❌ correctly excluded |

**Conclusion:** supplier-order in-transit is the **complete** source for our current feature surface, and it is
the only one with a query-able data structure. Production/transfer sources are a **documented, bounded
under-count vs. full moysklad** — relevant only for accounts using those modules, which our clone does not yet
model with an awaiting concept. Revisit when/if Move gains an order-scheme or production gains an awaiting flag.

---

## 8. Proposed implementation slice (for the NEXT session — not this one)

**BE (api):**
1. `getInTransitMap()` helper (§5) — TDD: pure-ish grouped query, unit-tested against seeded POs in various
   states (draft=0, confirmed=full, partially_received=remainder, fully_received=0, cancelled=0, deleted=0,
   over-received clamps to 0).
2. Wire it into both `StockBalanceService` modes (flat + grouped) — replace the always-0 `inTransitQty` read
   with the computed map; update display «Доступно» to `qty − reserved + inTransit`; update summaries
   (`totalInTransit`, `totalAvailable`).
3. Optionally the stock-lookup endpoint ([stock.controller.ts:35](../../apps/api/src/modules/stock/stock.controller.ts#L35))
   if document forms should show live «Ожидание».
4. **Do NOT touch** `assertAvailable` (§6).

**FE (web):**
5. Optionally un-defer the products-list «Ожидание» column (11i) — read the new computed field.
6. Keep the stock-balance "В пути" label **as-is** until §4-DOM-grounded (capture). Flag «Ожидание» as the
   likely-correct column name.

**Schema (follow-up, after verify):**
7. Drop `Stock.inTransitQty` + `PurchaseOrderPosition.inTransitQty` (vestigial; mirror 11s migration pattern)
   — or leave as documented dead columns.

**Out of scope (explicit):** any denormalized counter / ledger / write-hooks; production & transfer sources;
the availability **posting** formula; the column relabel.

---

## 9. Concurrency / adversarial QA plan (Phase-2, when implemented)

Query-time has a **small** concurrency surface (no write-hooks), but a report read can still race a receipt:
- **Read vs. concurrent receipt:** a Supply posting against a PO (which bumps `receivedQty`) can interleave
  with the report query. Acceptable — the report is a snapshot; the next read reflects the receipt. No
  lost-update (we write nothing). Confirm no torn read across the join (single grouped query is atomic enough
  for a report).
- **Over-receipt / revert:** `MAX(0, …)` clamp must hold when `receivedQty > quantity` (over-receipt) and after
  a Supply unpost/cancel reverts `receivedQty`.
- **Display «Доступно» vs posting block divergence:** assert (test) that a Demand whose qty ≤ displayed
  «Доступно» but > physical `qty − reserved` is **still blocked** by `assertAvailable` (the §6 split holds).
- **Multi-store / multi-PO:** product on 2 POs to 2 stores → per-store rows correct; grouped-by-product sums
  both; one PO partially received → only the remainder counts.
- **State transitions:** draft (0) → confirm (full) → partial receipt (remainder) → full receipt (0) →
  reopen via revert (back to remainder); cancel (0); soft-delete (0).
- **Real-data smoke:** seed POs in every state and verify the report «Ожидание» + «Доступно» numbers by hand.

---

## 10. Citations (moysklad)

- **dev.moysklad.ru/doc/api/remap/1.2/reports/** (official API reference): `stock/reserve/inTransit/quantity`
  ↔ `Остаток/Резерв/Ожидание/Доступно`; *"Available = Stock − Reserve + In Transit."*
- **support.moysklad.ru/hc/ru/articles/203325603** «Резервы и ожидания»: *"Ожидания — товары, которых ещё нет
  на складе, но поступление которых уже согласовано с поставщиком … Доступные = Остатки − Резервы + Ожидания"*
  (example 27−1+55=81).
- **support.moysklad.ru/hc/ru/articles/360000122627** «Перемещения»: order-scheme transfer creates ожидание on
  the receiving store («товар в пути»).
- **ctrlf5.by/blog/moysklad-ostatki**: *"ожидание — товар в пути от поставщиков."*
- **masterkassa.com/…/rezervy-i-ozhidaniya** (mirror): same definition + formula.

> Verifier residual: primary article *bodies* are JS-rendered and were not fetched; confirmations are
> search-snippet + mirror + the (authoritative, primary) dev API reference. Confidence: **high** on
> one-quantity + formula + supplier-order source; **medium** on the full production/transfer source set.

---

## 11. Why this is the right next step (not a bigger one)

This converts (B) from *"vague large feature, capture-blocked, 3× deferred"* into a **decision-resolved,
well-scoped, query-time slice** with a named correctness landmine (§6) surfaced *before* code. Implementing it
this session was deliberately **not** done because: (a) the «Доступно» change touches a correctness-sensitive
shared formula and deserves its own TDD + concurrency QA pass; (b) the column label needs §4 DOM-role grounding
(no local capture); (c) the production/transfer source scope is a product decision now documented but worth a
glance before code. The next `davom et` can implement §8 cleanly against this spec.
