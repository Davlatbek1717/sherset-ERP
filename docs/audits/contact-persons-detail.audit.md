# contact-persons/[id] — detail page parity audit

- **Module:** `contact-persons` (Контактные лица / contact person — sub-entity of a counterparty) detail page
  (`apps/web/src/app/(app)/contact-persons/[id]/page.tsx` + `/new`)
- **Date:** 2026-06-04 (Cohort G — CRM)
- **Protocol:** Cohort batch audit (`wf_85fba5eb-9ba`). Premise classified contact-persons as a SUB-ENTITY of a
  counterparty and demoted `counterparties/[id]` (the parent) to feature-source only — it legitimately lacks the parent's
  org/bank/contracts/balance scaffolding. Operator ground-truthed each delta.
- **Reference:** CRM detail shell (`tasks`/`opportunities`) + GOLD capture `05-module/contactperson`.

## Verdict

contact-persons is a correctly-scoped sub-entity form (name/position/phone/email/description + a required read-only
parent-counterparty link). `auditEntity="ContactPerson"` matches the backend (verified — NOT changed). Real issue:
hardcoded Latin-uz throws + header — FIXED. Counterparty label = «Контрагент» (correct value, verified).

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| C1 | thrown validation + header (`[id]`+`/new`) | i18n via t() | `'Nom majburiy'` (`[id]`+`/new`), `'Kontragent tanlang'` (`/new`), `titlePrefix="Kontakt shaxs"`, `stateLabel="Yangi"`, `customTitle="Yangi kontakt shaxs"` | delta | medium | **FIXED** → `tCommon('field_required',{field:t('full_name')})`, `t('select_counterparty')`, `titlePrefix=""`, `tCommon('new_state')`, `t('new_title')`. |
| C2 | `auditEntity` | match backend | `"ContactPerson"` == `contactperson.service` entity | mirror | — | **CORRECT** — not changed. |
| C3 | counterparty field label | «Контрагент» | `t('counterparty')` = «Контрагент» (page namespace) | mirror | — | **CORRECT** (value right). |

## B. Interactive deltas

(none — the parent-counterparty link is correctly required + read-only on the detail page [navigates to the parent];
save/delete wired; no money/positions/FSM. A sub-entity has no document interactions.)

## Confirmed mirrors (correct sub-entity specifics — NOT deltas)

- Legitimately has ONLY {full_name, position, phone, email, description} + a read-only parent-counterparty link + owner —
  the parent's org/legal/bank/contracts/balance/price-type scaffolding belongs to `counterparties/[id]`, not here.

## Deferred

- 🟢 None.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (contact-persons route
registered). **HONEST: Phase-1 — NOT browser-smoked.** Live smoke owed: RU locale → all labels Russian.
