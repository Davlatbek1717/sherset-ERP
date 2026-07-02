# settings/tax-rates/[id] — detail page parity audit

- **Module:** `settings/tax-rates` (Ставки налогов — tax-rate CONFIG: name + percent) (`[id]` + `/new`)
- **Date:** 2026-06-04 (Cohort K — Settings-finance)
- **Protocol:** Cohort batch audit (`wf_d0f91419-ace`). Premise: simple CONFIG field-form; the percent field is INTRINSIC
  (verify directly, no sibling). Operator ground-truthed.
- **Reference:** `settings/expense-items` (twin) + own `/new`.

## Verdict

A correctly-scoped tax-rate config (name + percent). User strings are `t()`-wired (no Latin-uz leak). One LOW
error-handling gap (deferred).

## A. Structural / field deltas

(none — i18n clean; percent field intrinsic and present.)

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| K-TX1 | duplicate-rate conflict on Save | a localized message | the BE 409 conflict surfaces as a raw/generic error (BE can't localize) | delta | low | **DEFERRED** — FE-side conflict mapping (the api-client already exposes `err.status`); map 409 → a localized «такая ставка уже есть» message. Low, error-handling only. |

## Confirmed mirrors (NOT deltas)

- No counterparty/money/positions/DocumentTabs — correct config entity.

## Deferred

- 🟡 K-TX1 conflict-error localization (FE map of the 409).

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.**
