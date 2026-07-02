# counterparty-adjustments/[id] — detail page parity audit

- **Module:** `counterparty-adjustments` (Корректировка взаиморасчётов — manual mutual-settlement balance delta)
  detail page (`apps/web/src/app/(app)/counterparty-adjustments/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03g — Cohort D: Money / returns)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_b388323a-101`, 12-agent:
  premise → diff + completeness critic → blind refute-default verify). **Premise auto-corrected the reference** to
  `cash-in/[id]` (the page's own header: *"Mirrors cash-in/[id] minus operations"*) and immunized the family of false
  "missing account / positions / store / split / customerOrder" deltas (this doc legitimately lacks all of them).
  **Operator (Opus) re-verified the one candidate + the clean-mirror claims.**
- **Reference:** `cash-in/[id]` (cash-order base, single balance delta) + `prepayments/[id]` for the shared
  adjustment-base FSM/locking. `payments-in/[id]` = feature-source only (account/allocation scaffolding this doc lacks).

## Verdict

counterparty-adjustments is a correct standalone single-delta balance correction: the INCREASE/DECREASE direction
radio (enum matches the backend), the `±sumMinor` rendering, the `applicable`-driven lock, the post/unpost/cancel FSM,
and the deliberate absence of any cash/bank account, positions table, store, retail split, source link, or
print-of-payment are all right. **No structural or interactive delta to fix.** The only finding is the cohort-wide
empty History tab (deferred — backend feature). The two money/currency/split bugs found on the prepayment(-return)
twins do **not** apply here (this doc has no retail split and no source-currency relationship — its currency is its
own).

## A. Structural / field deltas

(none — clean)

## B. Interactive deltas

(none — clean; the History-tab item below is cohort-wide and deferred)

## Confirmed mirrors (correct adjustment specifics — NOT deltas)

- **NO cash/bank account, NO positions/PositionEditor, NO store, NO retail split, NO `customerOrderId`, NO source
  link, NO print-of-payment** — all legitimate doc-type absences (it directly debits/credits the counterparty balance;
  the "positions" tab slot is reused as a summary card, `positionsLabel={t('direction')}`, to keep the tab strip
  consistent — correct).
- INCREASE/DECREASE direction radio (`data-test-id` direction-increase/decrease) with `direction`/`direction_*_hint`
  i18n keys; the saved enum (`form.direction` ∈ {INCREASE, DECREASE}) matches the backend `direction` column and the
  posted-view branch renders the same mapping. `±sumMinor` glyph driven by direction. `applicable`-driven lock on
  direction/sum/agent. `auditEntity="CounterpartyAdjustment"` correct PascalCase. doc-date `moment` sent on `/new`
  (already correct). Clone present (unlike prepayment-returns). All correct.

## Deferred (documented for Phase-2 / backend backlog)

- 🟡 **History (Tarix) tab permanently empty — cohort-wide** (prepayments · prepayment-returns ·
  counterparty-adjustments). The service writes no `auditLog.create`; the History tab fetches
  `/audit-logs?entity="CounterpartyAdjustment"` (exact match) and gets nothing. Same money-doc parity gap as the
  twins; the fix is the cross-cutting backend feature (thread `userId` through `update`/`transition`/`softDelete` +
  controllers, add `logAudit`, mirror `cash-in.service.ts`). → Phase-2 backend (see `prepayments-detail.audit.md`
  deferred §). NOT part of the org-account scope bug-class — this doc has no account picker.

**Gates:** web tc 0 · api tc 0 · biome 0 (changed) · web Vitest 1264 pass/1 skip · api Vitest 2599 pass/2 skip ·
i18n ru+uz + no-hardcoded (no new keys). **HONEST: Phase-1 — NOT browser-smoked.** No code change on this page this
session; the empty-History smoke is Phase-2 QA (after the backend audit-log feature lands).
