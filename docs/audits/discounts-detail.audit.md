# discounts/[id] — detail page parity audit

- **Module:** `discounts` (Скидки — discount-rule config: auto/manual, %/sum) detail page
  (`apps/web/src/app/(app)/discounts/[id]/page.tsx` + `/new`)
- **Date:** 2026-06-04 (Cohort H — e-commerce/pricing)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_48fd9e45-543`). Premise classified
  discounts as a CONFIG-rule entity (no counterparty/positions/money-sidebar/posting-FSM) and used `ecommerce/channels`
  as the structural sibling + the intrinsic critic for discount-unique meta. Operator ground-truthed.
- **Reference:** config field-form sibling (`ecommerce/channels`); no gold capture → sibling-parity + critic only.

## Verdict

discounts is a correctly-scoped discount-rule config form (name + type [auto/manual] + value-kind [%/sum] + value +
active toggle). All user-facing strings already route through `t()` (uz+ru); the settings-JSON parse already throws
synchronously (the correct pattern that channels was fixed to mirror). **No confirmed delta** — config-entity absences
(no counterparty/positions/money/DocumentTabs) are all legitimate.

## A. Structural / field deltas

(none — every candidate doc-scaffolding "gap" [counterparty, positions, money sidebar, posting-FSM, History] is a
legitimate absence for a config-rule entity; refuted by direction-aware verify.)

## B. Interactive deltas

(none — save/validation are correctly wired; invalid settings JSON throws synchronously inside the mutation [the correct
pattern]; no money/FSM interactions.)

## Confirmed mirrors (correct config-entity specifics — NOT deltas)

- No counterparty / positions / money sidebar / posting-FSM / DocumentTabs — correct for a discount-rule config.
- i18n: all labels/placeholders/errors are `t()`-wired (uz+ru) — clean (registered in the no-hardcoded gate).

## Deferred

- 🟢 None.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked** (no gold capture; structural sibling-parity + critic only — a config capture
would upgrade this to capture-grounded).
