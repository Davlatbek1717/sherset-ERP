# settings/cash-desks/[id] — detail page parity audit

- **Module:** `settings/cash-desks` (Кассы — cash-desk/till CONFIG) (`[id]` + `/new`)
- **Date:** 2026-06-04 (Cohort K — Settings-finance)
- **Protocol:** Cohort batch audit (`wf_d0f91419-ace`). Premise: a CONFIG field-form, NOT a document. Operator ground-truthed.
- **Reference:** `settings/bank-accounts` (twin) + own `/new`.

## Verdict

A correctly-scoped cash-desk config (name + currency + read-only balance + archive/delete). One real i18n leak FIXED. The
balance is correctly `formatMoney(BigInt(balanceMinor), currency)` read-only (server-computed) — NOT a money bug.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| K-CD1 | thrown validation (`[id]`+`/new`) | i18n via t() | `throw new Error('Nom majburiy')` (Latin-uz; Cyrillic-only gate misses it) | delta | high | **FIXED** → `tCommon('field_required',{field:tFields('name')})`. |
| K-CD2 | balance money render | BigInt-safe + currency | already `formatMoney(BigInt(balanceMinor), data.currency)`, read-only | mirror | — | **CORRECT** — not changed (server-computed, read-only by design). |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| K-CD3 | currency change on a used till | blocked | editable | delta | med | **DEFERRED (BE)** — block currency change once the till is used (BE guard). |

## Confirmed mirrors (NOT deltas)

- No DocumentTabs/History, no counterparty, no positions/posting-FSM — correct. archive/active Badge ≠ posting state.

## Deferred

- 🟡 K-CD3 currency-change guard (BE). Whether moysklad shows an organization field on a till = label-grounding DEFER (no capture).

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (route registered).
**HONEST: Phase-1 — NOT browser-smoked.**
