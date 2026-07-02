# processing-orders/[id] — detail page parity audit

- **Module:** `processing-orders` (Заказ на производство/переработку) detail page.
- **Date:** 2026-06-03d
- **Method:** **cohort batch audit** (`scripts/wf-cohort-detail-audit.js`, run `wf_b0d5474e-6de`) — production family
  vs **moves/[id]** scaffolding sibling + **processings/[id]** as in-family BOM reference. Premise auto-corrected
  the reference + immunised bias; diff → critic → blind-verify; confirmed delta re-verified by hand.
- **Reference:** sibling-parity (no fresh capture). Scaffolding ← moves; BOM/fulfilment widgets intrinsic.

## Verdict

Correct planning/Заказ doc: read-only BOM components card + `FulfilmentProgress` + `ProcessingOpsList` + cost
`DetailTotalsSidebar`. Doc-correct absences (no counterparty/price/VAT/email; its createMenu for child Processing
is doc-correct). **One real bug found + FIXED** (structural/display — see A below).

## A. Structural / field deltas

**One real bug found + FIXED:**

| # | Element | expected | ours | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| PO1 | BOM materials card «total_qty» | `component.qty × recipeRuns`, `recipeRuns = orderQty / BOM.outputQty` (the documented consumption formula + the processings sibling at :471-477) | `Number(c.qty) × qtyWhole` — multiplied by the whole order qty WITHOUT dividing by `outputQty` → over-counts material whenever `outputQty ≠ 1` | delta | med | **FIXED** → added `outputQty`/`recipeRuns`, `totalQty = qty × recipeRuns` (mirror processings) |

Doc-correct (no fix): no agent/contract/accounts/salesChannel/price/VAT/email; `FulfilmentProgress`+`ProcessingOpsList`
are intrinsic to the Заказ doc; `states.processing_order`/`pages.processing_order` namespaces shared with productions.

## B. Interactive deltas

**No interactive deltas.** «Создать документ» (child Processing) menu, FSM post/unpost transitions, clone, and
delete are all doc-correct and wired (confirmed by the cohort premise bias-immunisation + blind direction-aware
verify). No dead/unwired buttons.

## Gates
web typecheck 0 · biome 0 · web Vitest 1262/1263 pass (no regress).
**HONEST: Phase-1** — NOT browser-smoked (the BOM math fix is runtime-unverified; grounded on the backend formula
`runs=(qty/1000)/outputQty` + the processings sibling which already divides by outputQty).
