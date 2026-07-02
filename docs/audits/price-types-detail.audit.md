# settings/price-types/[id] — detail page parity audit

- **Module:** `settings/price-types` (Типы цен — price-type CONFIG: name + color + default flag) (`[id]` + `/new`)
- **Date:** 2026-06-04 (Cohort K — Settings-finance)
- **Protocol:** Cohort batch audit (`wf_d0f91419-ace`). Premise: CONFIG field-form; color + isDefault are INTRINSIC
  (verify directly). Operator ground-truthed; `04-module/pricetype` capture = label-grounding source only.
- **Reference:** own `/new` (field parity) + `settings/expense-items` scaffold.

## Verdict

A correctly-scoped price-type config (name + color swatch + default flag). User strings are `t()`-wired (no Latin-uz
leak). **No confirmed delta.**

## A. Structural / field deltas

(none — i18n clean; name/color/isDefault present and intrinsic.)

## B. Interactive deltas

(none — save/archive/delete wired; color input + default flag correct; no money/positions/FSM/History.)

## Confirmed mirrors (NOT deltas)

- No counterparty/money/positions/DocumentTabs — correct config entity. color/isDefault are intrinsic price-type fields.

## Deferred

- 🟢 None.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.**
