# inventories/[id] — detail page parity audit

- **Module:** `inventories` (Инвентаризация — stock count) detail/edit page
  (`apps/web/src/app/(app)/inventories/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03e — Cohort B: Stock + internal)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_9832a633-948`, 23-agent:
  premise → diff → critic → blind refute-default verify). Operator re-verified against code + the clean capture.
- **Reference:** ✅ **CLEAN CAPTURE** — `docs/moysklad-reference/visual-captures/06-module/inventory/dom/
  24-edit-default.html` (+`34-edit-default.html`, `08/13-positions`) has `<title>Инвентаризации</title>` and renders
  the real Инвентаризация form (no counterparty contamination). **This is the only trustworthy capture in the cohort**
  (enter/loss/internalorder captures are contaminated). Capture-grounded for inventories.

## Verdict

**Structurally correct; one missing FEATURE (deferred).** Inventory is a counterparty-less stock-count doc: org +
store + project + derived surplus/shortage counts, a draft→posted **terminal** FSM, and a draft editable-actualQty
editor vs a posted read-only expected/actual/variance table. All field/FSM dimensions match the clean capture. The
one real gap is a **missing position-population feature** present in the captured moysklad count-sheet — dispositioned
as a feature task (not a parity bug), so no code change this session.

## A. Structural / field deltas

**No structural / field deltas.** Confirmed against the clean capture + premise bias-immunisation:

- No reason field (a count is not reason-coded), no agent/currency/discount — correct.
- `surplus_count` / `shortage_count` derived read-only counters (variance > 0 / < 0); posted table shows
  expected/actual/variance with sign+colour. Draft editor = qty-only `actualQty` (`labels.quantity = t('actual_qty')`).
  ⚠️ **Corrected 2026-06-04 (label-grounding audit):** these surplus/shortage meta-counters and the posted
  expected/actual/variance table are **NOT present in any inventory capture** — the captured doc is draft/list only,
  so the earlier "All match the capture" claim was false. They are clone-introduced UI counters; the labels «Излишки»/
  «Недостачи» are plausible Russian but **ungrounded** (no moysklad capture confirms them). Separately, the posted
  `expected_qty` column label «Ожидаемое» disagrees with the official API term «расчётный остаток» (`_inventory.md`
  `calculatedQuantity`) → see DEFER below. NOT capture-confirmed.
- First tab «Главная»; `externalCode` editable (sibling-consistent). `formatMoney` not needed (count, not money).

## B. Interactive deltas

**FSM correct + one feature-gap (DEFERRED):**

- ✅ FSM is **terminal**: `buildDocStateMenu(['posted','cancelled'])`, `onToggleApplicable` fires `post` only from
  draft, **no unpost** — correct (do NOT flag missing unpost). clone + delete wired.
- 🟡 **FEATURE GAP (DEFERRED, med):** the captured Инвентаризация draft editor exposes THREE position-population
  actions in `.b-delivery-actionbar` (capture `08-edit-default.html`/`13-edit-tab-positions.html` L188): «Добавить из
  справочника», **«Дополнить из остатков»** (auto-fill count lines from current stock balances for the selected
  store), **«Дополнить из номенклатуры»** (bulk-add from nomenclature). Ours has only «Добавить из справочника» (the
  single `PositionEditor` add path). This is **cohort-invisible** (only Инвентаризация has these) and a genuine
  moysklad feature, but it needs a stock-balance integration (`/reports/stock-balance?storeId=`) + a bulk multi-select
  picker → **deferred to a feature task**, not a Phase-1 spot-fix. Tracked in NEXT.md.

## Confirmed mirrors (correct count-doc specifics — NOT deltas)

- Terminal FSM, draft-vs-posted conditional layout, qty-only actualQty editor — doc-correct (FSM/layout capture-grounded).
  ⚠️ surplus/shortage derived counters are a UI addition (NOT in any capture) — see the corrected note above; do not cite
  them as capture-confirmed.

## Deferred

- 🟡 **«Дополнить из остатков» / «Дополнить из номенклатуры» count-sheet population** (feature; needs stock-balance
  report wiring + bulk picker + 2 new i18n keys). Capture-confirmed present in moysklad. Tracked in NEXT.md backlog.
- 🟡 **`expected_qty` posted-column label «Ожидаемое» → likely «Расчётное»/«Расчётный остаток»** (official API
  `calculatedQuantity` = «расчётный остаток», `_inventory.md`). MEDIUM confidence — the posted variance table is in NO
  capture, so the exact UI header string is unconfirmed; needs a Phase-2 browser smoke of a posted inventory before
  changing. Left as-is for now (no guess). Tracked in NEXT.md.

**Gates:** web typecheck 0 · biome 0 · web Vitest 1262 pass/1 skip (no regress) · i18n key-existence ru+uz +
no-hardcoded. **HONEST: Phase-1** — structural pass, NOT browser-smoked. No code change on this page (feature deferred).
