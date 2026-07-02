# opportunities/[id] — detail page parity audit

- **Module:** `opportunities` (Сделки / CRM deal — pipeline-stage progression + budget) detail page
  (`apps/web/src/app/(app)/opportunities/[id]/page.tsx` + `/new`)
- **Date:** 2026-06-04 (Cohort G — CRM)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_85fba5eb-9ba`, 24-agent). Premise
  corrected the reference to `tasks/[id]` (true CRM sibling) and demoted `customer-orders/[id]` to feature-source only
  (it is a money-document; opportunities legitimately lacks its sidebar/positions/VAT/print/posting-FSM/org-account).
  Operator (Opus) ground-truthed every confirmed delta (DOM element-role for labels; backend for the slug).
- **Reference:** `tasks/[id]` (CRM detail shell) + GOLD capture `03-module/sales-funnel` (board — stage labels only).

## Verdict

opportunities is a correctly-scoped CRM deal form (stage-FSM pills + budget/probability + counterparty/contact-person +
lost-reason). Three real bugs, FIXED: (1) **History tab permanently empty** — `auditEntity="opportunity"` ≠ backend
`entity:'Opportunity'`; (2) **contact-person wiped on load (data-loss)**; (3) **a11y** label-without-control (the
deferred-since-cohort-C commit blocker). Plus i18n leaks. Counterparty label = «Контрагент» (page namespace, correct
value — verified, NOT changed).

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| O1 | `DocumentTabs auditEntity` (L642) — History/Tarix tab | must equal the backend service entity string; `opportunity.service.ts:456` writes `entity:'Opportunity'` | `auditEntity="opportunity"` (lowercase) → `?entity=opportunity` matched zero rows → History tab permanently empty | delta | high | **FIXED** → `auditEntity="Opportunity"` (work_order→WorkOrder bug-class). |
| O4 | thrown error + `titlePrefix` Latin-uz (`[id]`+`/new`) | i18n via t() | `'Nom majburiy'`, `'Bosqich tanlang'`, `titlePrefix="Imkoniyat"`, `stateLabel="Yangi"`, `customTitle="Yangi imkoniyat"` | delta | medium | **FIXED** → `tCommon('field_required',{field:t('name')})`, `t('select_stage')`, `titlePrefix=""`, `tCommon('new_state')`, `t('new_title')`. |
| O5 | counterparty field label | «Контрагент» (gold capture; universal field label) | `t('counterparty')` resolves to «Контрагент» (page namespace) | mirror | — | **CORRECT** — the value is right; namespace ≠ bug (engine bias-warning confirmed). Not changed. |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| O2 | contact-person field on load | the saved contact person renders + persists | a reactive `[counterpartyId]` effect fired during hydration (which sets counterpartyId) → wiped the just-loaded `contactPersonId` → field empty AND Save sent `contactPersonId:null` | delta | high | **FIXED (data-loss)** → removed the effect; clear the contact person only in the counterparty picker `onSelect`/`onClear` (user change). Also resolves the exhaustive-deps warning. |
| O3 | lost-reason `<label>` | associated with its `<input>` | bare `<label>` (noLabelWithoutControl biome error — blocked commits since cohort C) | delta | med | **FIXED** → `id`/`htmlFor="lost-reason-input"`. |

## Confirmed mirrors (correct CRM specifics — NOT deltas)

- No DetailTotalsSidebar / positions / VAT / print / email / createMenu / posting-FSM / org-account — correct (CRM entity,
  not a money document). `createMenuItems={[]}` is by design.
- The stage progression (prev/next/won/lost via `/opportunities/:id/transition`) is a CRM stage FSM, not a doc-posting FSM.
- Budget uses `BigInt(Math.round(...*100))` for STORAGE; the display-side `Number(BigInt)` is formatting only (not a precision bug).

## Deferred (Phase-2 / feature)

- 🟡 **Reopen control for won/lost deals** — moysklad lets a closed deal move back into the funnel and the backend supports
  it (`opportunity.service.ts:341-344` clears closedAt+lostReason on transition to an open stage), but the FE renders stage
  pills only while `status==='open'`. Adding a reopen control is a feature — DEFER.

**Gates:** web tc 0 · biome 0 (1 pre-existing exhaustive-deps warning resolved by the O2 fix) · web Vitest no-regress ·
i18n key-existence ru+uz + no-hardcoded (opportunities route registered). **HONEST: Phase-1 — NOT browser-smoked.** Live
smokes owed: edit+Save → History rows; open a deal with a contact person → it renders + persists; RU locale → all labels Russian.
