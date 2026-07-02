# settings/bank-accounts/[id] — detail page parity audit

- **Module:** `settings/bank-accounts` (Банковские счета — bank-account CONFIG) (`[id]` + `/new`)
- **Date:** 2026-06-04 (Cohort K — Settings-finance)
- **Protocol:** Cohort batch audit (`wf-cohort-detail-audit.js`, run `wf_d0f91419-ace`). Premise: a CONFIG field-form
  (EditForm), NOT a document — demoted organizations/money-docs as references (false "missing field" deltas). Operator
  ground-truthed each delta.
- **Reference:** `settings/cash-desks` (twin) + own `/new`; `expense-items` = correct-i18n control.

## Verdict

A correctly-scoped bank-account config (org + name + bank/bic/account fields + archive/delete). One real i18n leak FIXED.
No counterparty/positions/money-sidebar/History — all legitimate for a config entity.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| K-BA1 | thrown validation + name placeholder (`[id]`+`/new`) | i18n via t() | `'Nom majburiy'`, `'Tashkilot majburiy'`, `placeholder="Asosiy hisob"` (Latin-uz; Cyrillic-only gate misses it) | delta | high | **FIXED** → `tCommon('field_required',{field:tFields('name')/('organization')})`, `t('name_placeholder')` (+key ru+uz). |
| K-BA2 | `bankLocation` / `correspondentAccount` | shown if moysklad shows them | persisted by BE, absent from form | delta | med | **DEFERRED** — feature-add (2 inputs + state + payload); needs a populated capture to confirm moysklad shows them. No guess. |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| K-BA3 | currency change on a used account | blocked (mirror delete-guard) | editable | delta | med | **DEFERRED (BE)** — needs a BE guard (block currency change once funded), like the delete-path guard. |

## Confirmed mirrors (NOT deltas)

- No DocumentTabs/History/auditEntity, no counterparty, no positions/money-sidebar/posting-FSM — correct for a config form.

## Deferred

- 🟡 K-BA2 missing fields (capture+feature) · K-BA3 currency-change guard (BE).

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.**
