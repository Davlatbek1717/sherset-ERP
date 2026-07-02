# Products-list «Ожидание» + Display «Доступно» in-transit parity (2026-06-12, 11z)

> **✅ Phase-2 VERIFIED** — API live smoke 7/7 (incl. cross-page consistency) +
> browser pixel-proof (seeded in-transit product renders Остаток=5 / Ожидание=100 /
> Доступно=105 under the «Ожидание» header; no new console errors). Completes the
> 11w/11v in-transit design at the products-list site (design §6/§211), which 11w
> had implemented on the report only.

## What & why (self-grounded, not a one-off)

11w made «Ожидание» / in-transit live (query-time) and set the stock-balance
**report's** displayed «Доступно» = Остаток − Резерв + Ожидание (moysklad's
available-to-promise formula). But the **products list** (`product.repository.
attachStock`, 11i) was left at `available = onHand − reserved` — so after 11w the
two pages **silently disagreed** on «Доступно» for any product with an active
supplier order (the list under-reported by the in-transit amount). The 11v design
table **explicitly named** `products-list stock.available (11i)` as a "Display
«Доступно»" site that must change to `qty − reserved + inTransit` (§6/§211) — 11w
just hadn't reached it. This slice closes that documented half-finished gap and
adds the «Ожидание» column moysklad's assortment list offers.

The 11i guard claimed «Доступно» = on-hand − reserved citing "StockService §2c" —
that §2c is the **posting-sufficiency** check (`assertAvailable`), NOT the display
formula. The design §6 warns precisely against conflating them. At 11i time
in-transit ≡ 0 so the bug was latent; 11w surfaced it.

## Change

1. **Extracted `StockInTransitService`** (stock module) = single source of truth
   for the in-transit query (`IN_TRANSIT_PO_STATES`, per-position `MAX(0, qty −
   received)` clamp, `getInTransitMap` / `getInTransitByAssortment`, key helpers),
   moved out of `StockBalanceService`. Both `ReportModule` and `ProductModule`
   import `StockModule` (no cycle — StockModule → AuthModule only; correct
   dependency direction, vs. coupling product → the 17-service ReportModule). One
   place owns `['confirmed','partially_received']` + the clamp, so the two
   consumers can't drift (the silent-wrong-number class).
2. **Products list** (`product.repository.attachStock`): runs the in-transit
   query (summed across stores, mirroring the cross-store Stock aggregate) in
   parallel with the Stock `groupBy`; adds `stock.inTransit`; sets
   `available = onHand − reserved + inTransit`.
3. **FE** (`products/page.tsx`): adds the «Ожидание» column (⚙ gear-optional, like
   Резерв; Остаток + Доступно stay default-on); `stock.inTransit` added to the type.
4. **§4 label correction:** the in-transit column label is **«Ожидание»** —
   DOM-grounded as a grid header (`gwt-Label header">Ожидание`) in the stock-report
   capture (`06-module/stock-report/dom/01-default.html`) and a column-customizer
   option in the products capture. «В пути» appears **nowhere** as a header/cell —
   the report's `in_transit: "В пути"` was a mis-ground (the §4 bug-class); corrected
   to «Ожидание» (RU) / «Kutilmoqda» (UZ) on both the products list and the report,
   incl. `totals_in_transit`.

## §6 invariant (NOT touched)

`StockService.assertAvailable` stays **physical** `qty − reserved` (you cannot ship
goods that have not physically arrived). Only the **displayed** «Доступно» folds in
in-transit. Confirmed: `grep inTransit stock.service.ts` = no match. 11w's §6 smoke
(Demand > physical < displayed → still blocked) is unaffected (stock.service untouched).

## Tests / guards

- New `stock-in-transit.service.test.ts` (3): clamp + cross-store sum + state/tenant
  scoping (moved from the report test, now testing the shared service directly).
- `stock-balance.service.test.ts`: `makeService` wires a real `StockInTransitService`
  over the same mocked client; the §6 display-«Доступно» cases (incl. worked example
  27 − 1 + 55 = 81) still pass via delegation.
- BE `product-stock-columns.test.ts`: **flipped** — `available = onHand.minus(reserved).
  plus(inTransit)`, derives «Ожидание» via `getInTransitByAssortment`, emits 4 columns,
  never reads the dropped `inTransitQty` column. Doc-comment cites design §6/§211.
- FE `product-stock-columns.test.ts`: **flipped** — 4 columns, `p.stock.inTransit`,
  Ожидание gear-only (not default), RU «Ожидание» + UZ «Kutilmoqda».
- `label-grounding.test.ts`: +GROUNDING (stock-report cluster Остаток/Резерв/Ожидание/
  Доступно as grid headers; products «Ожидание») +VALUE_LOCKS (`fields.in_transit` and
  `report_stock_balance.in_transit` = «Ожидание»; pins the «В пути» mis-ground out).

## Gate

api tc0 · web tc0 · biome0 (source; `.mjs` smoke not in the lint-staged glob, like
existing verify-*) · **api Vitest 2935 (0 regress)** · **web Vitest 2185 (+1 skip, 0
regress)**.

## Verify (Phase-2)

`scripts/verify-products-list-in-transit-smoke.mjs` live api:4000+DB **7/7**:
A fresh product → all-zero · B Enter(5) → Остаток5/Ожидание0/Доступно5 (zero-regress)
· **C HEADLINE: confirm PO(100) → Ожидание100/Доступно105 (5 − 0 + 100)** · **D
CROSS-PAGE: products-list == stock-balance report (Ожидание 100=100, Доступно 105=105
— the inconsistency is gone)** · E draft PO excluded → Ожидание still 100 · F partial
receipt 20/50 via Supply → Остаток25/Ожидание130/Доступно155.

**Browser (Playwright, RU):** «Ожидание» toggleable via the ⚙ "Настроить колонки"
gear; header renders «Ожидание»; a seeded in-transit product renders **Остаток=5,
Ожидание=100, Доступно=105** (formula visibly folds in-transit); only console error
is a pre-existing favicon 404. UZ label «Kutilmoqda» value-locked (i18n parity + unit;
identical `tFields('in_transit')` render path as the pixel-proven RU).

## Notes / bounded scope

- Products list is product-centric, so it correctly shows in-transit-only products
  (Остаток=0, Ожидание>0) — slightly richer than the report's flat-by-store mode
  (which needs a Stock row); the grouped report agrees with the list (smoke D).
- `totals_in_transit` «Всего ожидание» mirrors the existing «Всего <noun>» summary
  pattern (the prior «Всего в пути» was equally un-grounded — no footer capture —
  just now consistent with the corrected column).
- Source scope = supplier orders only (same bounded under-count vs. full moysklad as
  11w; Move is atomic, production has no awaiting-flag).
