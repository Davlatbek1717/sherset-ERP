# ecommerce/channels/[id] — detail page parity audit

- **Module:** `ecommerce/channels` (Каналы продаж / интернет-магазины — sales-channel / online-shop CONFIG) detail page
  (`apps/web/src/app/(app)/ecommerce/channels/[id]/page.tsx` + `/new`)
- **Date:** 2026-06-04 (Cohort H — e-commerce/pricing)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_48fd9e45-543`). Premise classified
  channels as a CONFIG entity (no counterparty/money/positions/posting-FSM/DocumentTabs) and demoted every money-document
  reference. Operator ground-truthed each delta.
- **Reference:** config field-form shell + GOLD captures `09-module/online-shops` + `00-module/saleschannel`.

## Verdict

ecommerce/channels is a correctly-scoped sales-channel config (name + kind + externalRef/externalCode + a JSON settings
editor). No money/counterparty/History — correct for a config entity. Two real save bugs, FIXED.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| H-CH2 | externalRef / externalCode on edit | emptying a set field persists the clear | PATCH sent `externalRef \|\| undefined` → an emptied field was omitted → never cleared | delta | low | **FIXED** ([id]) → send the values directly (`externalRef,`/`externalCode,`). |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| H-CH1 | invalid `settings` JSON on Save | block the request + show the error | the mutation checked the `settingsError` STATE (stale mid-callback) → invalid JSON was silently dropped and the channel saved without settings (`/new` + `/[id]`) | delta | med | **FIXED** → `parseSettings()` now THROWS synchronously on invalid JSON (still sets the inline error), so the request is never sent. |

## Confirmed mirrors (correct config-entity specifics — NOT deltas)

- No counterparty / money / positions / DetailTotalsSidebar / posting-FSM / DocumentTabs-History / org-account picker —
  correct for a config entity (`createMenuItems` absence is by design).

## Deferred

- 🟢 None.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.** Live smokes owed: paste invalid settings JSON → Save is blocked with the error;
clear externalRef → it persists empty on reload.
