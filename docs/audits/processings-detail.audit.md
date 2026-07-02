# processings/[id] — detail page parity audit

- **Module:** `processings` (Переработка / processing operation) detail page.
- **Date:** 2026-06-03d
- **Method:** **cohort batch audit** (`scripts/wf-cohort-detail-audit.js`, run `wf_b0d5474e-6de`) — production family
  vs **moves/[id]** scaffolding sibling. Premise auto-corrected the reference + immunised bias; diff → critic →
  blind direction-aware verify.
- **Reference:** sibling-parity (no fresh capture). Scaffolding ← moves; two-editor/two-store/BOM intrinsic.

## Verdict

Correct, and the **in-family BOM-math reference** for the cohort: renders TWO `PositionEditor` blocks (materials
consumed + products produced), TWO stores (`materialsStoreId`/`productsStoreId`), editable BOM card / processingPlan,
and the cost `DetailTotalsSidebar`. **No real deltas** — its `recipeRuns = qtyWhole / outputQty` material math is the
CORRECT formula that the processing-orders sibling was fixed to match (see processing-orders audit PO1).

## A. Structural / field deltas

**No structural / field deltas.** processings was the CORRECT in-family BOM-math reference. Doc-correct (no fix,
confirmed by premise bias-immunisation): no agent/counterparty/contract/accounts/salesChannel; no sale-price/VAT
(internal cost only); no email; the second PositionEditor (products) + the second store are intrinsic, not "extra";
`states.processing` / `pages.processing` namespaces (distinct from the processing_order pair) are intentional.

## B. Interactive deltas

**No interactive deltas.** The two-editor / two-store layout, editable BOM card / processingPlan, FSM transitions,
clone, and delete are all wired and doc-correct; **no createMenu** by design (confirmed by premise). No dead/unwired
buttons.

## Gates
web typecheck 0 · biome 0 · web Vitest 1262/1263 pass (no regress).
**HONEST: Phase-1** — structural pass, NOT browser-smoked. No code change on this page (it was the correct reference).
