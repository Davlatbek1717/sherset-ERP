# settings/expense-items/[id] — detail page parity audit

- **Module:** `settings/expense-items` (Статьи расходов — expense-item CONFIG: name+code+description) (`[id]` + `/new`)
- **Date:** 2026-06-04 (Cohort K — Settings-finance)
- **Protocol:** Cohort batch audit (`wf_d0f91419-ace`). Premise: a name-only CONFIG field-form. Operator ground-truthed.
- **Reference:** `settings/projects`/`uoms` (simplest config twins) + own `/new`.

## Verdict

The cleanest config in the cohort — name+code+description, **fully t()-routed** (it is the correct-i18n control that
exposed the bank-accounts/cash-desks `'Nom majburiy'` leak). **No confirmed delta.**

## A. Structural / field deltas

(none — validation uses the correct `t('name_required')`; all labels/placeholders are `t()`-wired uz+ru.)

## B. Interactive deltas

(none — save/archive/delete correctly wired; no money/positions/FSM/History.)

## Confirmed mirrors (NOT deltas)

- No counterparty/money/positions/DocumentTabs — correct for a name-only config entity.

## Deferred

- 🟢 None.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.**
