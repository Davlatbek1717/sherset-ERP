# prepayment-returns/[id] — detail page parity audit

- **Module:** `prepayment-returns` (Возврат предоплаты — refund of a previously-taken advance) detail page
  (`apps/web/src/app/(app)/prepayment-returns/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03g — Cohort D: Money / returns)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_b388323a-101`, 12-agent:
  premise → diff + completeness critic → blind refute-default verify). **Premise auto-corrected the reference** to
  `prepayments/[id]` (the page's own header documents the four intentional deltas vs prepayments) and demoted
  `payments-out` to feature-source only. **Operator (Opus) re-verified every confirmed delta against the backend
  (cap aggregate, balance currency-partitioning, strict-schema null contract) before applying.**
- **Reference:** `prepayments/[id]` (true twin — same cash-order/retail-split base; the four documented deltas are
  EXPECTED: required read-only `prepaymentId`, agent/org read-only inherited from source, no `customerOrderId`, no
  clone, source sub-card, `+sumMinor` increase). `payments-out/[id]` = feature-source only.

## Verdict

prepayment-returns correctly inverts prepayments (`+sumMinor` increase, warning colour, source-prepayment link, the
documented read-only fields, no clone). The over-return cap is hard-enforced server-side in the transaction. **Two
real bugs fixed: (P1) the same wholesale-save `null`-split 400 as prepayments; (P2 money-integrity) the refund
currency was freely editable while the over-return cap is currency-blind → a refund booked in a different currency
(or simply the default `UZS` against a non-UZS advance) bypasses the cap and credits a different balance bucket →
over-refund in value. One low display defect (P3 «remaining to return» showed the full source sum) fixed.** History
tab + org-account scope deferred (cohort-wide).

## A. Structural / field deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| P1 | retail-split save payload (page.tsx:178-180 PATCH) | clear a split by sending `'0'` (string), never `null` | sent `null` for `'0'` splits → `UpdatePrepaymentReturnSchema` (`.strict()`, `bigintMinor.optional()`) **rejects null → 400 on every non-retail save** (same class as prepayments P1) | delta | high | **FIXED** → `form.cashSumMinor \|\| '0'` (+ twins). |
| P2 | refund `currency` (detail `disabled={locked}` editable; `/new` defaults `UZS`, not derived from source) | a refund is ALWAYS booked in the **source advance's currency** (agent/org are already read-only-inherited; currency must be too) | currency was editable on a draft + sent in the PATCH (`update` accepted it); `/new` defaulted `currency='UZS'` and did **not** set it from the selected source. The cap (`assertWithinPrepaymentCap`) compares **raw minor units, currency-blind**, while `applyDelta` credits the counterparty balance bucket **keyed by the return's own currency** → a USD refund against a UZS advance passes the nominal cap yet credits the USD bucket = real over-refund. For a non-UZS business this is the **default** path, not a deliberate edge case. | delta | medium (money-integrity) | **FIXED** → BE `create` forces `currency = source.currency` (ignores client value); `currency` removed from `UpdatePrepaymentReturnSchema` (`.strict()` now rejects a change) + from the update write; FE detail currency read-only (`data.currency`) + dropped from PATCH; FE `/new` inherits currency from the picked source (read-only, like agent/org). |
| P3 | «remaining to return» sub-card value (`remaining_refundable`, page.tsx:545-548) | source.sumMinor MINUS prior applicable returns (the cap headroom) | rendered the **full** `source.sumMinor` (inline comment: *"v1 … no precomputed cap field yet"*) → contradicts its own label «Остаток к возврату» / «Qoldiq qaytarish» once any partial return exists | delta | low | **FIXED** → BE `findById` computes `prepaymentRemainingMinor = source.sumMinor − Σ(other applicable, non-deleted returns, excluding this row)` (reuses the cap aggregate; BigInt→string via the global `toJSON`); FE renders it (falls back to source sum). |

## B. Interactive deltas

(no page-unique interactive deltas — History-tab + org-account-picker items below are cohort-wide and deferred)

## Confirmed mirrors (correct prepayment-return specifics — NOT deltas)

- The four documented deltas vs prepayments are all CORRECT-by-design, not bugs: required read-only `prepaymentId`,
  agent/org read-only inherited from source, no `customerOrderId`, **no clone** (`onClone` intentionally omitted —
  each refund is one-off), source-prepayment sub-card, `+sumMinor` increase (warning colour).
- Over-return cap is hard-enforced inside the transaction on create + post (`assertWithinPrepaymentCap`, excludes
  self) — money-safe; the `/new` client-side cap check is a UX pre-check, not the guard. `auditEntity="PrepaymentReturn"`
  correct. Retail split BigInt math correct. doc-date `moment` sent on `/new` (already correct).

## Deferred (documented for Phase-2 / backend backlog)

- 🟡 **History (Tarix) tab permanently empty — cohort-wide** (same as prepayments; backend writes no audit log; needs
  the cross-cutting `userId`-threading backend feature — see `prepayments-detail.audit.md` deferred §). Phase-2 backend.
- 🔴 **org-account picker SCOPE bug-class** — `organizationAccountFetcher` (page.tsx:206-215) calls
  `/organization-accounts` without `organizationId`; prepayment-returns is one of the ~13 pages already in the Phase-2
  QA backlog (cohort-wide sweep + capture).

**Gates:** web tc 0 · api tc 0 · biome 0 (changed) · web Vitest 1264 pass/1 skip · api Vitest 2599 pass/2 skip
(+ currency-force, findById-remaining, strict-schema null/currency contract tests) · i18n ru+uz + no-hardcoded (no new
keys). **HONEST: Phase-1 — NOT browser-smoked.** P2 is backend-traced + unit-tested (create forces source currency;
update schema rejects currency); a live "post a foreign-currency refund is impossible" smoke is Phase-2 QA.
