# Per-product «Остаток»/«Резерв»/«Доступно» list columns — 2026-06-11 (11i)

**Status: Phase-2 (runtime-verified).** Live API smoke 8/8 + browser (UZ) render
confirmed. RU labels capture-grounded + test-locked. BE-only data path; FE is a
pure presentation add reusing the proven 11h Stock-aggregation approach.

## What & why

moysklad's assortment (Товары) list prints a stock cluster — **Остаток · Резерв ·
Ожидание · Доступно** — captured DOM-grounded in
`docs/moysklad-reference/visual-captures/04-module/product/dom/01-default.html`
as column headers (`<div class="gwt-Label header">Остаток</div>` inside
`<td class="cell numeric stock|reserve|inTransit|available">`). Our products list
had **none** of them — a real parity gap (filter coverage map, 11g:
`products 8/19`). This wires the three that are backed by live, maintained data.

## Grounding (DOM-role, not grep-count — CLAUDE.md §4)

| moysklad header | cell class | our column | source |
|---|---|---|---|
| Остаток | `cell numeric stock` | `stockOnHand` (default-on) | `SUM(Stock.qty)` |
| Резерв | `cell numeric reserve` | `reserved` (⚙ gear) | `SUM(Stock.reservedQty)` |
| Доступно | `cell numeric available` | `available` (default-on) | on-hand − reserved |
| Ожидание | `cell numeric inTransit` | **DEFERRED (dead column)** | `Stock.inTransitQty` never written |

i18n is grounded against the existing stock-balance report namespace
(`pages.report_stock_balance`): ru `Остаток/Резерв/Доступно`, uz
`Qoldiq/Rezervda/Mavjud`. New keys live in `fields.{stock_on_hand,reserved,available}`
(NOT the pre-existing `fields.balance="Остаток"`, which is a money-remaining
total — same string, different meaning; reusing it would be a §4 mis-ground).

## The adversarial check that shaped the scope (11h dead-column lesson)

11h fixed a bug where the re-order filter compared the **never-written**
`Product.stock_minor` column (`0 < min` ⇒ every product flagged "below"). Before
displaying any stock column I verified each underlying field is actually
*maintained* (`grep` for writes across `apps/api/src`):

- **`qty` (Остаток)** — written by `StockService.applyDeltas` on every posting.
  Live-proven by the 11h below-minimum battery. ✅ safe to show.
- **`reservedQty` (Резерв)** — written by `applyReservationDeltas` (Production
  reservations). `0` means *genuinely nothing reserved* (correct), not dead. ✅
- **`available`** — derived: `qty − reservedQty`. Formula grounded in the code
  itself (`stock.service.ts:323` "§2c — AVAILABLE = on-hand − reserved (moysklad
  «Доступно»)"; `stock-balance.service.ts:136` computes the same). NOT
  `+ inTransit`. ✅
- **`inTransitQty` (Ожидание)** — **never incremented anywhere** (only ever
  `create: { inTransitQty: 0 }`). Showing it would be a permanently-0 column —
  the exact 11h trap. **DEFERRED** until purchase-order → in-transit wiring
  lands. Not blind-shown.

So the disciplined scope = the **3 live-maintained columns**, Ожидание documented
as deferred-because-dead.

## Implementation

**BE** — `apps/api/src/modules/product/product.repository.ts` `attachStock()`:
after the page is fetched, ONE `stock.groupBy({ by:['assortmentId'], where:{
accountId, assortmentKind:'product', assortmentId:{ in: pageIds } }, _sum:{ qty,
reservedQty } })` (mirrors `stock-balance.service`). Attaches `stock:{ onHand,
reserved, available }` as whole-unit Decimal strings; `available =
onHand.minus(reserved)`. ≤100 ids/page, covered by
`@@index([accountId, assortmentKind, assortmentId])`.

**Architecture decision — query-time aggregation, NOT denormalisation.** The
`Stock` ledger is already a lock-maintained materialisation; summing it at query
time is always live-correct (no backfill, no concurrency surface, no drift) —
the same call 11h made for the filter. The vestigial
`Product.stock_minor/reserve_minor/in_transit_minor` denorm columns are
deliberately **not** used; their schema comment was updated to record that the
list column now exists and uses live aggregation (they are retained only to
avoid migration churn — candidates for a future drop). `index.d.ts` unchanged
after regen ⇒ no type impact (only `inlineSchemaHash` moved).

**FE** — `apps/web/src/app/(app)/products/page.tsx`: 3 `DataTableColumn`s
(`stockOnHand`, `available`, `reserved`) after Цена; `fmtQty` mirrors the
stock-balance report (ru-RU, ≤3 decimals). **Остаток + Доступно default-visible**
(`useColumnVisibility` defaults), **Резерв ⚙ gear-only** (0 unless a Production
reservation holds the SKU). Non-stocked kinds (service / bundle) render **«—»**
via a `STOCKED_KIND='product'` guard — bundles' computed min-of-components stock
is a separate follow-on, services have no stock (so a `0` would be misleading).

## Verification

- **api** tc0 · biome0 · **Vitest 2857 (+6, 0 regress)** — guard
  `product-stock-columns.test.ts`: source-scans the live groupBy + the
  `onHand.minus(reserved)` formula + NEGATIVE locks (no `stockMinor/reserveMinor`
  read, no `inTransitQty` exposed). Non-vacuous.
- **web** tc0 · biome0 · **Vitest 2068 (+8, 0 regress)** — guard
  `product-stock-columns.test.ts`: column keys, i18n field keys, `p.stock.*`
  wiring, default-visibility (stockOnHand+available IN, reserved OUT), kind-guard,
  no-Ожидание, + both-locale value assertions. i18n-key-existence suite covers
  the new keys.
- **Runtime smoke 8/8** (`tools/scripts/verify-product-stock-columns-smoke.mjs`,
  self-reverting DB probe): A on-hand = cross-store SUM (4+6→10, not 4 or 6);
  B available = 8−3→5 (not 8); C reserved→3; D no-rows→0/0/0 (no crash); E
  service→shape with 0 on-hand; F shape on every item.
- **Browser (UZ, :3100):** headers **Qoldiq** + **Mavjud** default-visible after
  Narx, **Rezervda** correctly gear-only; product rows show numeric stock
  (`0` when unstocked); console clean (favicon 404 only). RU header render not
  re-clicked (locale-switch is a pre-existing controlled-select behavior) — RU
  values capture-grounded + test-locked.

## Deferred / backlog (documented, not blind-built)

1. **«Ожидание» (in-transit) column** — needs purchase-order → `Stock.inTransitQty`
   wiring first (today permanently 0). Then add the column + extend `available`
   only if moysklad's definition includes it (it does **not** today: Доступно =
   on-hand − reserved).
2. **Bundle computed stock** — moysklad shows min(component_stock / component_qty);
   we render «—». Separate feature (join to BundleComponent + their Stock).
3. **Sort by a stock column** — moysklad allows it; would push the aggregate into
   ORDER BY. Additive; the columns display-only for now.
4. **Drop the vestigial `Product.stock_minor/reserve_minor/in_transit_minor`
   columns** — now provably unused (both consumers aggregate live). Migration +
   regen, separate low-risk cleanup.
